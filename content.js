(function () {
  if (window.__bfOptimizelyToolLoaded) return;
  window.__bfOptimizelyToolLoaded = true;

  const state = {experiments: [], events: [], optimizelyLoaded: false, runtimePending: true, metadata: {}, startedAt: Date.now()};
  const seenQueueEntries = new Set();
  let lastStateSignature = '';
  let eventsPaused = false;
  let loggingDisabled = false;
  let lastLogSignature = '';
  const originalConsoleMethods = {};
  const optimizelyLogPattern = /optimizely|active pages|active campaigns|performance edge|snippet revision|project id|account id|custom event was fired|there are no active/i;
  const publishState = () => document.dispatchEvent(new CustomEvent('bf-optimizely-state', {detail: safeJson(state)}));
  window.__bfOptimizelyToolGetState = () => safeJson(state);
  window.__bfOptimizelyToolClearEvents = () => {
    state.events = [];
    publishState();
    return safeJson(state);
  };
  window.__bfOptimizelyToolSetEventsPaused = (paused) => { eventsPaused = Boolean(paused); return eventsPaused; };
  const emit = (event) => {
    if (eventsPaused) return;
    const relatedExperiments = state.experiments.map((experiment) => ({id: experiment.id, name: experiment.name, variationId: experiment.variationId}));
    state.events.unshift({...event, relatedExperiments, timestamp: new Date().toISOString()});
    state.events = state.events.slice(0, 100);
    publishState();
    window.postMessage({source: 'bf-optimizely-tool', type: 'event', event}, '*');
  };

  const publishIfChanged = () => {
    const snapshot = safeJson({experiments: state.experiments, optimizelyLoaded: state.optimizelyLoaded, runtimePending: state.runtimePending, metadata: state.metadata});
    if (snapshot === lastStateSignature) return;
    lastStateSignature = snapshot;
    publishState();
  };

  const describeCall = (args, source) => {
    const payload = args?.[0];
    const event = {source, method: 'unknown', payload: safeJson(payload)};
    if (Array.isArray(payload)) {
      event.method = String(payload[0] ?? 'unknown');
      event.experimentId = payload[1];
      event.variationId = payload[2];
      if (event.method === 'trackEvent' || event.method === 'event') {
        event.eventName = payload[1];
        event.apiName = payload[1];
      }
    } else if (payload && typeof payload === 'object') {
      event.method = payload.type || payload.event || payload.name || 'object';
      event.eventName = payload.eventName || payload.event_name || payload.name || payload.event;
      event.apiName = payload.apiName || payload.api_name || payload.eventApiName || payload.event_api_name || event.eventName;
    }
    return event;
  };

  const safeJson = (value) => {
    try {
      const serialized = JSON.stringify(value);
      return serialized.length > 20000 ? `${serialized.slice(0, 20000)} …` : JSON.parse(serialized);
    } catch { return String(value).slice(0, 20000); }
  };

  const isOptimizelyLog = (args) => args.some((value) => optimizelyLogPattern.test(typeof value === 'string' ? value : safeJson(value)));
  const updateConsoleLogging = (disabled) => {
    if (disabled === loggingDisabled && Object.keys(originalConsoleMethods).length) return;
    loggingDisabled = Boolean(disabled);
    const methods = ['log', 'info', 'debug', 'warn', 'group', 'groupCollapsed', 'groupEnd'];
    if (loggingDisabled) {
      methods.forEach((method) => {
        if (!originalConsoleMethods[method]) originalConsoleMethods[method] = console[method];
        console[method] = (...args) => {
          if (!isOptimizelyLog(args)) originalConsoleMethods[method].apply(console, args);
        };
      });
    } else if (Object.keys(originalConsoleMethods).length) {
      methods.forEach((method) => {
        if (originalConsoleMethods[method]) console[method] = originalConsoleMethods[method];
      });
    }
  };

  const readValue = (value, keys = []) => {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'object') return String(value);
    for (const key of keys) {
      if (value[key] !== undefined && value[key] !== null) return String(value[key]);
    }
    return '';
  };

  const readMapValue = (map, id) => map?.[id] || map?.get?.(id) || '';

  const readAudienceEntries = (value) => {
    if (!value || typeof value !== 'object') return [];
    const source = value.audiences || value.audienceStates || value.audience_states || value.evaluatedAudiences || value.matchedAudiences || value;
    const entries = Array.isArray(source) ? source : Object.entries(source).map(([id, item]) => ({id, ...(item && typeof item === 'object' ? item : {value: item})}));
    return entries.map((audience) => {
      const status = String(audience.status || audience.state || '').toLowerCase();
      const fulfilled = [audience.isQualified, audience.isEligible, audience.isMatched, audience.isFulfilled, audience.qualified, audience.matched]
        .find((value) => typeof value === 'boolean');
      return {
        id: String(audience.id || audience.audienceId || audience.audience_id || ''),
        name: audience.name || audience.audienceName || audience.audience_name || String(audience.id || audience.audienceId || ''),
        fulfilled: typeof fulfilled === 'boolean' ? fulfilled : ['qualified', 'eligible', 'matched', 'fulfilled'].includes(status) ? true : undefined,
      };
    }).filter((audience) => audience.id || audience.name);
  };

  const readMetadata = (data, stateData, activePages) => ({
    snippetRevision: readValue(data, ['revision', 'snippetRevision', 'snippet_revision', 'version']) || readValue(stateData, ['snippetRevision', 'snippet_revision', 'revision', 'version']),
    projectId: readValue(data, ['projectId', 'project_id']) || readValue(stateData, ['projectId', 'project_id']),
    activePages,
  });

  const printOptimizelyInfo = (optimizely, stateData, data, experiments, activePages, activePageDetails) => {
    if (loggingDisabled || !optimizely?.get || !data) return;
    const campaignStates = stateData?.getCampaignStates?.({isActive: true}) || {};

    console.groupCollapsed('Optimizely');
    console.log('The snippet is in the <head>');
    console.log(`Project ID: ${data.projectId ?? 'Unavailable'}`);
    console.log(`Account ID: ${data.accountId ?? 'Unavailable'}`);
    console.log(`Snippet revision: ${data.revision ?? 'Unavailable'}`);
    console.groupCollapsed('Active Pages');
    if (activePageDetails.length) activePageDetails.forEach((page) => {
      console.groupCollapsed(`'${page.name}' (${page.id})`);
      if (data.projectId && page.id) console.log(`https://app.optimizely.com/v2/projects/${data.projectId}/implementation/pages/${page.id}`);
      if (page.metadata && Object.keys(page.metadata).length) console.table(page.metadata);
      console.groupEnd();
    });
    else console.log('There are no Active Pages');
    console.groupEnd();
    console.groupCollapsed('Active Campaigns');
    const campaigns = Object.values(campaignStates).filter(Boolean);
    if (campaigns.length) campaigns.forEach((campaign) => {
      const experiment = campaign.experiment || {};
      const variation = campaign.variation || {};
      console.groupCollapsed(`'${campaign.campaignName || '<hidden>'}' (${campaign.id || 'unknown'}) / '${experiment.name || '<hidden>'}' (${experiment.id || 'unknown'}) / '${variation.name || '<hidden>'}' (${variation.id || 'unknown'})`);
      console.log(`Campaign: ${campaign.campaignName || '<hidden>'} (${campaign.id || 'unknown'})`);
      console.log(`Experience: ${experiment.name || '<hidden>'} (${experiment.id || 'unknown'})`);
      console.log(`Variation: ${variation.name || '<hidden>'} (${variation.id || 'unknown'})`);
      console.log(`isInCampaignHoldback: ${Boolean(campaign.isInCampaignHoldback)}`);
      console.groupEnd();
    });
    else console.log('There are no Active Campaigns');
    console.groupEnd();
    console.groupCollapsed('Optimizely Performance Edge');
    const edge = window.optimizelyEdge;
    if (edge?.get) {
      const edgeState = edge.get('state');
      const edgePages = edgeState?.getActivePages?.() || {};
      const edgeExperiments = edgeState?.getActiveExperiments?.() || {};
      console.groupCollapsed('Active Performance Edge Pages');
      const pageValues = Object.values(edgePages).filter(Boolean);
      if (pageValues.length) pageValues.forEach((page) => console.log(`${page.apiName || page.name || '<hidden>'} (${page.id || 'unknown'})`));
      else console.log('There are no Active Performance Edge Pages');
      console.groupEnd();
      console.groupCollapsed('Active Performance Edge Experiments');
      const experimentValues = Object.values(edgeExperiments).filter(Boolean);
      if (experimentValues.length) experimentValues.forEach((experiment) => console.log(`${experiment.name || '<hidden>'} (${experiment.id || 'unknown'}) / ${experiment.variation?.name || '<hidden>'} (${experiment.variation?.id || 'unknown'})`));
      else console.log('There are no Active Performance Edge Experiments');
      console.groupEnd();
    } else {
      console.log('Optimizely Performance Edge is not setup on this page');
    }
    console.groupEnd();
    console.groupEnd();
  };

  const logOptimizelyInfo = (optimizely, stateData, data, experiments, activePages, activePageDetails) => {
    if (loggingDisabled || !optimizely?.get || !data) return;
    const campaignStates = stateData?.getCampaignStates?.({isActive: true}) || {};
    const signature = JSON.stringify({
      revision: data.revision,
      experiments,
      activePages,
      campaigns: Object.values(campaignStates).map((campaign) => ({
        id: campaign?.id,
        experimentId: campaign?.experiment?.id,
        variationId: campaign?.variation?.id,
      })),
    });
    if (signature === lastLogSignature) return;
    lastLogSignature = signature;
    printOptimizelyInfo(optimizely, stateData, data, experiments, activePages, activePageDetails);
  };

  const registerOptimizelyListeners = (optimizely) => {
    if (!optimizely?.push || optimizely.__bfListenersRegistered) return;
    optimizely.__bfListenersRegistered = true;
    optimizely.push({type: 'addListener', filter: {type: 'lifecycle', name: 'pageActivated'}, handler: (event) => {
      const page = event?.data?.page || event?.page || {};
      if (loggingDisabled) return;
      console.groupCollapsed('Optimizely page was activated');
      console.log(`'${page.name || '<hidden>'}' (${page.id || 'unknown'})`);
      if (page.tags && Object.keys(page.tags).length) console.table(page.tags);
      console.groupEnd();
    }});
    optimizely.push({type: 'addListener', filter: {type: 'analytics', name: 'trackEvent'}, handler: (event) => {
      const data = event?.data || {};
      if (loggingDisabled || data.type === 'pageview') return;
      console.groupCollapsed(`Optimizely '${data.name || '<hidden>'}' ${data.type || 'custom'} event was fired`);
      console.log(`API name: '${data.apiName || '<hidden>'}'`);
      if (data.metrics?.revenue !== undefined) console.log(`revenue: ${data.metrics.revenue} cents`);
      if (data.tags?.value !== undefined) console.log(`value: ${data.tags.value}`);
      console.groupEnd();
    }});
  };

  const readPageName = (page, id) => readValue(page, ['name', 'title', 'url', 'pageName']) || String(id || page);

  const readVariations = (data, id) => {
    const experiment = data?.experiments?.[id] || data?.experiments?.get?.(id) || data?.[id];
    if (Array.isArray(experiment?.variation_ids)) {
      const names = experiment.variationNames || experiment.variation_names || {};
      return experiment.variation_ids.map((variationId, index) => ({
        id: String(variationId),
        name: names[variationId] || names[String(variationId)] || (index === 0 ? 'Original' : `Variant ${index}`),
        index,
      }));
    }
    const variations = experiment?.variations || experiment?.variationMap || experiment?.variationsById;
    if (!variations) return [];
    return Object.entries(variations).map(([variationId, variation], index) => ({
      id: readValue(variation, ['id', 'variationId']) || variationId,
      name: readValue(variation, ['name', 'variationName', 'title']) || variationId,
      index,
    }));
  };

  const hook = (object, property, source) => {
    const original = object[property];
    if (typeof original !== 'function' || original.__bfWrapped) return;
    const wrapped = function (...args) {
      const event = describeCall(args, source);
      emit(event);
      if (source === 'Optimizely' && (event.method === 'trackEvent' || event.method === 'event') && !loggingDisabled) {
        const payload = event.payload || {};
        const eventName = payload.name || payload.eventName || payload.event_name || event.eventName || '<hidden>';
        console.groupCollapsed(`Optimizely '${eventName}' custom event was fired`);
        console.log(`API name: '${payload.apiName || payload.api_name || payload.eventApiName || event.apiName || '<hidden>'}'`);
        if (payload.metrics?.revenue !== undefined) console.log(`revenue: ${payload.metrics.revenue} cents`);
        if (payload.tags?.value !== undefined) console.log(`value: ${payload.tags.value}`);
        console.groupEnd();
      }
      return original.apply(this, args);
    };
    wrapped.__bfWrapped = true;
    object[property] = wrapped;
  };

  const scan = () => {
    try {
      const optimizely = window.optimizely;
      state.optimizelyLoaded = Boolean(optimizely && (typeof optimizely.get === 'function' || typeof optimizely.push === 'function'));
      state.runtimePending = !state.optimizelyLoaded && Date.now() - state.startedAt < 2000;
      if (optimizely) {
      if (Array.isArray(optimizely)) {
        optimizely.forEach((entry) => {
          const key = safeJson(entry);
          if (Array.isArray(entry) && entry[0] === 'activate' && !seenQueueEntries.has(key)) {
            seenQueueEntries.add(key);
            emit({source: 'Optimizely queue', method: 'activate', payload: safeJson(entry)});
          }
        });
      }
      ['push', 'trackEvent'].forEach((method) => hook(optimizely, method, 'Optimizely'));
      const stateData = optimizely.get?.('state');
      const optimizelyData = optimizely.get?.('data');
      registerOptimizelyListeners(optimizely);
      const active = stateData?.getActiveExperimentIds?.() || stateData?.get?.('activeExperimentIds');
      const variations = stateData?.getVariationMap?.() || stateData?.get?.('variationMap');
      const variationIds = stateData?.getVariationIds?.() || stateData?.get?.('variationIds');
       const experimentStates = stateData?.getExperimentStates?.() || stateData?.get?.('experimentStates') || {};
       const campaignStates = stateData?.getCampaignStates?.({isActive: true}) || {};
      let activePages = [];
      let activePageDetails = [];
      try {
        const pageStates = stateData?.getPageStates?.({isActive: true}) || {};
        activePageDetails = Object.entries(pageStates).map(([id, page]) => ({id: page?.id || id, name: readPageName(page, id), metadata: page?.metadata || page?.tags || {}}));
        activePages = activePageDetails.map((page) => page.name);
      } catch (_) {
        activePages = [];
      }
      state.metadata = readMetadata(optimizelyData, stateData, activePages);
      if (active || variations) {
        state.experiments = (active || Object.keys(variations || {})).map((id) => {
          const experimentId = String(id);
            const experiment = readMapValue(experimentStates, id);
            const campaign = Object.values(campaignStates).find((item) => String(item?.experiment?.id || item?.experimentId || '') === experimentId);
           const currentVariation = readMapValue(variations, id);
           const knownVariationIds = readMapValue(variationIds, id);
           const currentVariationId = readValue(currentVariation, ['id', 'variationId']) || String(currentVariation || '');
           const currentVariationName = readValue(currentVariation, ['name', 'variationName', 'title']);
           const variationList = Array.isArray(knownVariationIds) ? knownVariationIds : [];
           const dataVariations = readVariations(optimizelyData, id);
           // `getVariationIds()` can contain only the currently assigned
           // variation. The canonical order for force links is the snippet's
           // data.experiments[id].variation_ids array.
           const normalizedVariations = (dataVariations.length ? dataVariations : variationList.map((variation, index) => ({
             id: readValue(variation, ['id', 'variationId']) || String(variation),
             name: readValue(variation, ['name', 'variationName', 'title']) || String(variation),
             index,
           }))).map((variation, index) => ({...variation, index: variation.index ?? index}));
           for (const variation of dataVariations) {
            if (!normalizedVariations.some((known) => known.id === variation.id)) normalizedVariations.push(variation);
          }
          if (currentVariationId && !normalizedVariations.some((variation) => variation.id === currentVariationId)) {
             normalizedVariations.unshift({id: currentVariationId, name: currentVariationName || currentVariationId, index: 0});
          }
          return {
            id: experimentId,
            name: readValue(experiment, ['name', 'experimentName', 'title']) || 'Unbenanntes Experiment',
            variationId: currentVariationId,
             variationName: currentVariationName,
             variations: normalizedVariations,
             audiences: readAudienceEntries(campaign || experiment),
            // Optimizely Web/X force-links use the variation ID as the value
            // of `optimizely_x`; classic experiments use experiment + index.
            forceByVariationId: Boolean(optimizelyData?.experiments?.[id]?.variation_ids || optimizelyData?.experiments?.[id]?.variations),
          };
        });
        publishIfChanged();
      } else {
        state.experiments = [];
      }
      logOptimizelyInfo(optimizely, stateData, optimizelyData, state.experiments.map((experiment) => experiment.id), activePages, activePageDetails);
      }
    } catch (_) {
      state.optimizelyLoaded = false;
      state.experiments = [];
    }
    // Also publish the negative state. Otherwise the bridge can keep showing
    // the previous page state after Optimizely was removed or blocked.
    publishIfChanged();
  };

  const originalFetch = window.fetch;
  if (originalFetch) window.fetch = function (...args) {
    const url = String(args[0]?.url || args[0] || '');
    if (/optimizely/i.test(url)) emit({source: 'Optimizely network', method: 'fetch', url});
    return originalFetch.apply(this, args);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (/optimizely/i.test(String(url))) emit({source: 'Optimizely network', method, url: String(url)});
    return originalOpen.call(this, method, url, ...rest);
  };

  publishState();
  setInterval(scan, 500);
  scan();
  window.addEventListener('message', (message) => {
    if (message.source !== window || message.data?.source !== 'bf-optimizely-tool') return;
    if (message.data.type === 'getState') publishState();
    if (message.data.type === 'bucketVisitor') window.optimizely?.push?.(['bucketVisitor', message.data.experimentId, message.data.variationId]);
    if (message.data.type === 'assistantSettings') updateConsoleLogging(message.data.settings?.disableConsoleLoggingCheckbox);
  });
  window.postMessage({source: 'bf-optimizely-tool', type: 'getAssistantSettings'}, '*');
})();
