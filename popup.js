const $ = (selector) => document.querySelector(selector);
let tab;
let currentState;
let eventsPaused = false;
let copyMessageTimer;
let eventFilter = 'all';
let experimentPanelState = {};

function matchesEventFilter(event) {
  if (eventFilter === 'all') return true;
  if (eventFilter === 'Optimizely') return event.source === 'Optimizely' || event.source === 'Optimizely queue';
  if (eventFilter === 'Network') return event.source === 'Optimizely network';
  return event.source === eventFilter;
}

const sendToPage = (message) => chrome.scripting.executeScript({target: {tabId: tab.id}, func: (payload) => window.postMessage(payload, '*'), args: [message]});
const isWebTab = () => {
  if (!tab?.id || !tab.url) return false;
  try { return /^https?:$/.test(new URL(tab.url).protocol); } catch (_) { return false; }
};
const setMessage = (text) => {
  $('#message').textContent = text;
  clearTimeout(copyMessageTimer);
  copyMessageTimer = setTimeout(() => { $('#message').textContent = ''; }, 2500);
};
let cookieNames = [];
let configuredCookies = [];

async function readCookieState() {
  if (!tab?.url || !/^https?:/.test(tab.url)) return;
  let values;
  try {
    values = await Promise.all(cookieNames.map((name) => chrome.cookies.get({url: tab.url, name})));
  } catch (_) {
    values = [];
  }
  document.querySelectorAll('.cookie-toggle').forEach((toggle, index) => { toggle.checked = Boolean(values[index]?.value === '1'); });
}

async function updateCookie(toggle) {
  if (!isWebTab()) {
    toggle.checked = false;
    setMessage('Cookies are only available on web pages.');
    return;
  }
  const url = new URL(tab.url).origin;
  let verified = false;
  try {
    if (toggle.checked) {
      await chrome.cookies.set({url, name: toggle.dataset.cookie, value: '1', path: '/', secure: new URL(tab.url).protocol === 'https:'});
      const cookie = await chrome.cookies.get({url, name: toggle.dataset.cookie});
      verified = cookie?.value === '1';
      setMessage(verified ? 'Cookie set' : 'Cookie could not be verified');
    } else {
      await chrome.cookies.remove({url, name: toggle.dataset.cookie});
      const cookie = await chrome.cookies.get({url, name: toggle.dataset.cookie});
      verified = !cookie;
      setMessage(verified ? 'Cookie deleted' : 'Cookie could not be deleted');
    }
  } catch (error) {
    setMessage(`Cookie error: ${error.message}`);
  }
  await readCookieState();
  if (verified) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await chrome.tabs.reload(tab.id);
  }
}

async function getState() {
  if (!isWebTab()) {
    const state = {experiments: [], events: [], optimizelyLoaded: false, runtimePending: false, apiPending: false, apiSkipped: true};
    render(state);
    return;
  }
  let state = {experiments: [], events: [], optimizelyLoaded: false, runtimePending: true, apiPending: true};
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const [{result: pageState}] = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        world: 'MAIN',
        func: () => window.__bfOptimizelyToolGetState?.() || {
          experiments: [],
          events: [],
          optimizelyLoaded: Boolean(window.optimizely),
        },
      });
      state = pageState ? {...state, ...pageState} : state;
    } catch (_) {
      const fallbackState = await chrome.runtime.sendMessage({type: 'getPageState', tabId: tab.id});
      state = fallbackState ? {...state, ...fallbackState} : state;
    }
    if (state.experiments.length || (state.optimizelyLoaded && attempt >= 3) || attempt === 11) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  state.runtimePending = false;
  render(state);
  if (!state.optimizelyLoaded || !state.experiments.length || !state.metadata?.projectId) {
    state.apiPending = false;
    state.apiSkipped = true;
    render(state);
    return;
  }
  await enrichWithApi(state);
}

async function enrichWithApi(state) {
  const ids = state.experiments.map((experiment) => experiment.id);
  let result;
  try {
    result = await chrome.runtime.sendMessage({
      type: 'fetchOptimizelyMetadata',
      projectId: state.metadata?.projectId,
      experimentIds: ids,
      forceRefresh: false,
    });
  } catch (error) {
    state.apiPending = false;
    render(state);
    $('#api-status').textContent = `API error: ${error.message}`;
    return;
  }
  if (!result?.ok) {
    state.apiConfigured = false;
    state.apiPending = false;
    render(state);
    $('#api-status').textContent = result?.error === 'No API token configured'
      ? 'API: Token not configured'
      : `API: ${result?.error || 'unavailable'}`;
    return;
  }
  const records = new Map(result.experiments.map((record) => [String(record.id || record.experiment_id || record.experimentId), normalizeExperiment(record)]));
  state.experiments = state.experiments.map((experiment) => mergeExperiment(experiment, records.get(experiment.id)));
  const apiDates = state.experiments.map((experiment) => experiment.lastUpdated).filter(Boolean).sort();
  if (apiDates.length) state.metadata.lastUpdateTime = apiDates[apiDates.length - 1];
  state.metadata.apiLoaded = true;
  state.apiConfigured = true;
  state.apiPending = false;
  render(state);
  $('#api-status').textContent = result.experiments.length ? `API: Metadata loaded (${result.experiments.length})` : 'API: reachable, but no active experiment found';
}

async function refreshApi() {
  if (!currentState) return;
  currentState.apiPending = true;
  render(currentState);
  let result;
  try {
    const ids = currentState.experiments.map((experiment) => experiment.id);
    result = await chrome.runtime.sendMessage({type: 'fetchOptimizelyMetadata', projectId: currentState.metadata?.projectId, experimentIds: ids, forceRefresh: true});
  } catch (error) {
    currentState.apiPending = false;
    render(currentState);
    $('#api-status').textContent = `API error: ${error.message}`;
    return;
  }
  if (!result?.ok) {
    currentState.apiConfigured = false;
    currentState.apiPending = false;
    render(currentState);
    $('#api-status').textContent = result?.error || 'API unavailable';
    return;
  }
  const records = new Map(result.experiments.map((record) => [String(record.id || record.experiment_id || record.experimentId), normalizeExperiment(record)]));
  currentState.experiments = currentState.experiments.map((experiment) => mergeExperiment(experiment, records.get(experiment.id)));
  currentState.metadata.apiLoaded = true;
  currentState.apiPending = false;
  render(currentState);
}

function mergeExperiment(runtime, api) {
  if (!api) return runtime;
  const variations = api.variations || api.variation || api.variationsById || [];
  const apiVariations = (Array.isArray(variations) ? variations : Object.entries(variations).map(([id, value]) => ({id, ...value}))).map((variation, index) => ({
    ...variation,
    index: variation.index ?? index,
    shareLink: variation.shareLink || variation.share_link || variation.actions?.find((action) => action.share_link)?.share_link || variation.actions?.find((action) => action.shareLink)?.shareLink || '',
  }));
  const apiById = new Map(apiVariations.map((variation) => [String(variation.id || variation.variation_id || variation.variationId), variation]));
  const runtimeVariations = (runtime.variations || []).map((variation, index) => ({
    ...variation,
    index: variation.index ?? index,
    name: apiById.get(String(variation.id))?.name || variation.name,
    shareLink: apiById.get(String(variation.id))?.shareLink || variation.shareLink || '',
  }));
  const apiAudiences = api.audiences || [];
  const runtimeAudiences = runtime.audiences || [];
  const audiences = (runtimeAudiences.length ? runtimeAudiences : apiAudiences).map((audience) => ({
    ...audience,
    name: apiAudiences.find((item) => String(item.id) === String(audience.id))?.name || audience.name,
  }));
  return {
    ...runtime,
    name: api.name || runtime.name,
    lastUpdated: api.lastUpdated || runtime.lastUpdated,
    status: api.status || runtime.status,
    audiences,
    // Keep the runtime order: Optimizely force-links use this index, not the
    // variation ID. API data enriches names but must not reorder variants.
    variations: runtimeVariations.length ? runtimeVariations : apiVariations,
  };
}

function normalizeExperiment(record) {
  const source = record?.experiment || record?.data || record || {};
  const findNested = (value, keys, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 4) return '';
    for (const key of keys) if (value[key]) return value[key];
    for (const child of Object.values(value)) {
      const found = findNested(child, keys, depth + 1);
      if (found) return found;
    }
    return '';
  };
  const date = (keys) => {
    const containers = [source, source.schedule, source.timeline, source.dates, source.execution, source.lifecycle].filter(Boolean);
    return containers.flatMap((container) => keys.map((key) => container[key])).find(Boolean) || findNested(source, keys);
  };
  const status = formatStatus(source.status || source.state || source.lifecycle_status || source.lifecycleStatus || source.schedule?.status || '');
  const variationsSource = source.variations || source.variation || source.variationsById || source.variation_map || [];
  const variationEntries = Array.isArray(variationsSource)
    ? variationsSource
    : Object.entries(variationsSource).map(([id, value]) => ({id, ...(value && typeof value === 'object' ? value : {name: value})}));
  return {
    id: String(source.id || source.experiment_id || source.experimentId || ''),
    name: source.name || source.experiment_name || source.experimentName || '',
    status,
    audiences: readAudienceEntries(source.audiences || source.audience || source.targeting?.audiences || source.targeting_audiences),
    lastUpdated: date(['last_modified', 'last_modified_time', 'lastModified', 'last_updated', 'last_updated_at', 'updated_at', 'updatedAt', 'modified_at']),
    variations: variationEntries.map((variation, index) => ({
      id: String(variation.id || variation.variation_id || variation.variationId || ''),
      name: variation.name || variation.variation_name || variation.variationName || String(variation.id || ''),
      index,
      shareLink: variation.shareLink || variation.share_link || variation.actions?.find((action) => action.share_link)?.share_link || variation.actions?.find((action) => action.shareLink)?.shareLink || '',
    })).filter((variation) => variation.id),
  };
}

function readAudienceEntries(value) {
  if (!value) return [];
  const entries = Array.isArray(value) ? value : Object.entries(value).map(([id, item]) => ({id, ...(item && typeof item === 'object' ? item : {name: item})}));
  return entries.map((audience) => ({
    id: String(audience.id || audience.audienceId || audience.audience_id || ''),
    name: audience.name || audience.audienceName || audience.audience_name || String(audience.id || ''),
  })).filter((audience) => audience.id || audience.name);
}

function formatStatus(value) {
  const normalized = String(value || '').toLowerCase();
  return ({running: 'Running', active: 'Active', paused: 'Paused', draft: 'Draft', archived: 'Archived', completed: 'Completed'}[normalized] || value);
}

function buildForceLink(variation) {
  return variation?.shareLink || '';
}

function showCopied(button, originalText) {
  if (!button) return;
  button.textContent = 'Kopiert';
  button.classList.add('copied');
  clearTimeout(button._copiedTimer);
  button._copiedTimer = setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('copied');
  }, 1800);
}

async function copyText(text, successMessage, button, originalText = 'Kopieren') {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  showCopied(button, originalText);
  setMessage(successMessage);
}

async function renderQrCode(url) {
  const canvas = document.createElement('canvas');
  await QRCodeLib.toCanvas(canvas, url, {width: 220, margin: 2, errorCorrectionLevel: 'L'});
  return canvas;
}

function render(state) {
  currentState = state;
  // Do not show the missing-runtime warning while the initial page check is
  // still running; the first-run token dialog should remain in front.
  $('#optimizely-overlay').hidden = state.runtimePending || state.optimizelyLoaded;
  $('#status').textContent = state.experiments.length ? `${state.experiments.length} detected` : 'None detected';
  $('#runtime-status').textContent = state.runtimePending ? 'Loading ...' : state.optimizelyLoaded ? 'Runtime active' : 'Runtime not loaded';
  $('#experiment-status').textContent = state.runtimePending ? 'Experiments: Loading ...' : `Experiments: ${state.experiments.length ? `${state.experiments.length} active` : 'None active'}`;
  $('#api-status').textContent = state.apiPending ? 'API: Loading ...' : state.apiSkipped ? 'API: not required' : state.metadata.apiLoaded ? 'API: Metadata loaded' : 'API: not connected';
  $('#api-status').setAttribute('title', state.apiConfigured === true ? 'API token validated' : 'API token not configured or unavailable');
  $('#retry-api').disabled = state.apiSkipped || state.apiConfigured === false;
  $('#retry-api').title = state.apiSkipped ? 'No active experiments on this page' : state.apiConfigured === false ? 'Add an API token in Settings' : 'Refresh API metadata';
  const metadata = state.metadata || {};
  const activePages = metadata.activePages || [];
  const valueOrUnavailable = (value) => value || 'Unavailable';
  const apiValue = (value) => state.apiPending ? 'Loading ...' : valueOrUnavailable(value);
  $('#metadata').innerHTML = [['Snippet revision', valueOrUnavailable(metadata.snippetRevision)], ['Last updated', apiValue(formatDate(metadata.lastUpdateTime))], ['Project ID', valueOrUnavailable(metadata.projectId)], ['Active pages on this page', valueOrUnavailable(activePages.length ? activePages.join(', ') : '')]].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  if (state.apiConfigured === false && !state.apiPending) {
    if (!document.querySelector('.api-hint')) $('#metadata').insertAdjacentHTML('afterend', '<p class="api-hint">API metadata is disabled. Add a token in Settings.</p>');
  } else {
    document.querySelector('.api-hint')?.remove();
  }
  $('#experiments').innerHTML = state.experiments.length ? state.experiments.map((experiment) => {
    const variants = experiment.variations?.length ? experiment.variations : [{id: experiment.variationId || '', name: experiment.variationName || 'Unknown variant'}];
    const options = variants.map((variant) => `<option value="${escapeHtml(variant.id)}" ${variant.id === experiment.variationId ? 'selected' : ''}>${variant.id === experiment.variationId ? 'Aktuell: ' : ''}${escapeHtml(variant.name)}</option>`).join('');
    const experimentUrl = metadata.projectId ? `https://app.optimizely.com/v2/projects/${encodeURIComponent(metadata.projectId)}/experiments/${encodeURIComponent(experiment.id)}` : '';
    const experimentTitle = experimentUrl ? `<a class="experiment-link" href="${experimentUrl}" target="_blank" rel="noopener">${escapeHtml(experiment.name)} <span class="external-link-icon" aria-label="Open experiment in Optimizely" title="Open in Optimizely">↗</span></a>` : escapeHtml(experiment.name);
    const forceLink = buildForceLink(variants.find((variant) => variant.id === experiment.variationId) || variants[0]);
    const apiDetails = state.apiConfigured === false ? ' api-unavailable' : '';
    const audienceBadges = experiment.audiences?.length ? `<div class="audience-section"><strong class="audience-title">Audiences</strong><div class="audience-badges" aria-label="Audiences">${experiment.audiences.map((audience) => `<span class="audience-badge">${escapeHtml(audience.name || audience.id)}</span>`).join('')}</div></div>` : '';
    const linkDisabled = !forceLink;
    const linkHint = linkDisabled ? 'Share links are provided through API metadata.' : 'Opens this variant directly without the extension.';
    const isOpen = experimentPanelState[String(experiment.id)] !== false;
    return `<details class="experiment" data-experiment-panel="${escapeHtml(experiment.id)}"${isOpen ? ' open' : ''}><summary class="experiment-summary"><span class="experiment-name">${experimentTitle}<small class="experiment-id">Experiment ID: ${escapeHtml(experiment.id)}</small></span><span class="experiment-chevron" aria-hidden="true">⌄</span></summary><div class="experiment-body">${audienceBadges}<small class="experiment-status${apiDetails}">Status: ${escapeHtml(experiment.status || 'Available with API')}</small><div class="variant-row"><select data-experiment="${escapeHtml(experiment.id)}">${options}</select><button class="copy" data-copy="${escapeHtml(experiment.id)}" title="Copy JavaScript snippet for the selected variant">Copy variant snippet</button></div><small class="variant-id">Variant ID: ${escapeHtml(experiment.variationId || 'unknown')}</small><small class="experiment-updated${apiDetails}">Last updated: ${escapeHtml(formatDate(experiment.lastUpdated) || 'Available with API')}</small><div class="force-link-card${linkDisabled ? ' api-disabled' : ''}"><strong>Variant share link</strong><small>${linkHint}</small><div class="force-link-actions"><button class="copy-force-link" data-force-link-copy="${escapeHtml(experiment.id)}" ${linkDisabled ? 'disabled' : ''}>Copy link</button><button class="show-qr" data-qr="${escapeHtml(experiment.id)}" ${linkDisabled ? 'disabled' : ''}>QR code</button></div><input type="hidden" value="${escapeHtml(forceLink)}" data-force-link="${escapeHtml(experiment.id)}"><img class="force-qr" data-qr-image="${escapeHtml(experiment.id)}" alt="QR code for the variant" hidden></div></div></details>`;
  }).join('') : '<p class="empty">No experiments detected.</p>';
  document.querySelectorAll('[data-experiment-panel]').forEach((panel) => panel.addEventListener('toggle', () => {
    experimentPanelState[panel.dataset.experimentPanel] = panel.open;
    chrome.storage.local.set({experimentPanelState}).catch(() => {});
  }));
  const visibleEvents = state.events.filter(matchesEventFilter);
  $('#event-count').textContent = eventFilter === 'all' ? state.events.length : `${visibleEvents.length}/${state.events.length}`;
  $('#events').innerHTML = visibleEvents.length ? renderEventGroups(visibleEvents) : '<p class="empty">No matching events.</p>';
  document.querySelectorAll('[data-experiment]').forEach((select) => select.addEventListener('change', async () => {
      const experiment = state.experiments.find((item) => item.id === select.dataset.experiment);
      const selectedVariation = experiment?.variations?.find((variation) => variation.id === select.value);
      const forceLink = buildForceLink(selectedVariation);
      const linkInput = select.closest('.experiment').querySelector('[data-force-link]');
      if (linkInput) linkInput.value = forceLink;
      const qrImage = select.closest('.experiment').querySelector('[data-qr-image]');
      if (qrImage) { qrImage.hidden = true; qrImage.removeAttribute('src'); }
      await sendToPage({source: 'bf-optimizely-tool', type: 'bucketVisitor', experimentId: select.dataset.experiment, variationId: select.value});
      setMessage('Variant set. Reloading page.');
      await new Promise((resolve) => setTimeout(resolve, 150));
      await chrome.tabs.reload(tab.id);
    }));
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    const id = button.dataset.copy;
    const variation = button.closest('.experiment').querySelector('select').value;
    const command = `window.optimizely.push(["bucketVisitor", ${id}, ${variation}]);`;
    await copyText(command, 'Variant snippet copied', button, 'Copy variant snippet');
  }));
  document.querySelectorAll('[data-force-link-copy]').forEach((button) => button.addEventListener('click', async () => {
    await copyText(button.closest('.experiment').querySelector('[data-force-link]').value, 'Variant share link copied', button, 'Copy link');
  }));
  document.querySelectorAll('[data-qr]').forEach((button) => button.addEventListener('click', async () => {
    try {
      const image = button.closest('.experiment').querySelector('[data-qr-image]');
      const link = button.closest('.experiment').querySelector('[data-force-link]').value;
      const canvas = await renderQrCode(link);
      image.replaceWith(canvas);
      canvas.className = 'force-qr';
      canvas.dataset.qrImage = button.dataset.qr;
      canvas.setAttribute('aria-label', 'QR code for the variant');
      canvas.hidden = false;
      showCopied(button, 'QR-Code');
    } catch (error) {
      setMessage(`Could not generate QR code: ${error.message}`);
    }
  }));
}

function renderEventGroups(events) {
  const groups = new Map();
  for (const event of events) {
    const key = JSON.stringify([event.source, event.method, event.eventName, event.apiName, event.experimentId, event.variationId, event.url]);
    const group = groups.get(key) || {event, events: []};
    group.events.push(event);
    groups.set(key, group);
  }
  return [...groups.values()].map(({event, events: groupedEvents}) => {
    const isCustomEvent = event.source === 'Optimizely' && ['trackEvent', 'event'].includes(event.method);
    const eventLabel = isCustomEvent ? 'Optimizely Custom Event' : event.eventName ? 'Optimizely-Event' : '';
    const title = `${escapeHtml(event.source)} · ${escapeHtml(event.method)}`;
    const labels = [
      event.eventName && `${eventLabel}: ${escapeHtml(event.eventName)}`,
      event.apiName && event.apiName !== event.eventName && `Metric API Name: ${escapeHtml(event.apiName)}`,
      event.experimentId && `Experiment: ${escapeHtml(event.experimentId)}`,
      event.variationId && `Variant: ${escapeHtml(event.variationId)}`,
    ].filter(Boolean).join(' · ');
    const payloads = groupedEvents.map((item) => `<div class="event-occurrence"><time>${escapeHtml(formatDate(item.timestamp) || item.timestamp || '')}</time><pre>${escapeHtml(JSON.stringify(item.payload || item.url || '', null, 2))}</pre></div>`).join('');
    return `<details class="event-group"><summary><span><strong>${title}</strong>${labels ? ` · ${labels}` : ''}</span><span class="event-count">${groupedEvents.length}×</span></summary><div class="event-group-body">${payloads}</div></details>`;
  }).join('');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('de-DE');
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])); }

function renderCookieModes() {
  const card = $('#cookie-modes-card');
  const container = $('#cookie-modes');
  card.hidden = configuredCookies.length === 0;
  container.innerHTML = configuredCookies.map((cookie, index) => `<div class="toggle-row"><label class="toggle-control"><span><strong>${escapeHtml(cookie.label || cookie.name)}</strong><small class="cookie-name">${escapeHtml(cookie.name)}</small></span><input class="cookie-toggle" type="checkbox" data-cookie="${escapeHtml(cookie.name)}"><span class="switch" aria-hidden="true"></span></label><button class="copy-cookie" data-copy-cookie="${index}" title="Copy cookie command">Copy command</button></div>`).join('');
  container.querySelectorAll('.cookie-toggle').forEach((toggle) => toggle.addEventListener('change', () => updateCookie(toggle)));
  container.querySelectorAll('[data-copy-cookie]').forEach((button) => button.addEventListener('click', () => {
    const cookie = configuredCookies[Number(button.dataset.copyCookie)];
    copyCookieCommand(cookie.name, cookie.label || 'Cookie', button);
  }));
}

document.addEventListener('DOMContentLoaded', async () => {
  const sourceTabId = Number(new URLSearchParams(window.location.search).get('tabId'));
  if (Number.isInteger(sourceTabId) && sourceTabId > 0) {
    try { tab = await chrome.tabs.get(sourceTabId); } catch (_) { tab = null; }
  }
  if (!tab) [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  $('#page-host').textContent = tab?.url ? new URL(tab.url).hostname : 'Unavailable';
  const cookies = await chrome.storage.local.get({testingCookies: []});
  configuredCookies = Array.isArray(cookies.testingCookies) ? cookies.testingCookies.filter((cookie) => cookie.name) : [];
  cookieNames = configuredCookies.map((cookie) => cookie.name);
  const storedApi = await chrome.storage.local.get({apiToken: '', apiTokenValidated: false, apiSetupSkipped: false});
  const storedPanelState = await chrome.storage.local.get({experimentPanelState: {}});
  experimentPanelState = storedPanelState.experimentPanelState || {};
  $('#api-token').value = storedApi.apiToken;
  if (!storedApi.apiToken && !storedApi.apiSetupSkipped) $('#api-setup-overlay').hidden = false;
  $('#api-status').setAttribute('title', storedApi.apiTokenValidated ? 'API token validated' : 'API token not configured');
  renderCookieModes();
  await readCookieState();
  $('#runtime-status').textContent = 'Loading ...';
  $('#api-status').textContent = 'API metadata loading ...';
  // Cookie state is independent from Optimizely and the API. Load it first so
  // the toggles reflect the browser immediately while the page is inspected.
    getState().catch((error) => setMessage(`Page check failed: ${error.message}`));
  $('#clear-events').addEventListener('click', async () => {
    if (!isWebTab()) return;
    try {
      await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        world: 'MAIN',
        func: () => window.__bfOptimizelyToolClearEvents?.(),
      });
      if (currentState) {
        currentState.events = [];
        render(currentState);
      }
    } catch (error) {
      setMessage(`Could not clear event log: ${error.message}`);
    }
  });
  $('#pause-events').addEventListener('click', () => {
    if (!isWebTab()) return;
    eventsPaused = !eventsPaused;
    $('#pause-events').textContent = eventsPaused ? 'Resume' : 'Pause';
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      world: 'MAIN',
      func: (paused) => window.__bfOptimizelyToolSetEventsPaused?.(paused),
      args: [eventsPaused],
    }).catch(() => {});
  });
  $('#export-events').addEventListener('click', () => exportEvents(currentState?.events || []));
  $('#event-filter').addEventListener('change', (event) => {
    eventFilter = event.target.value;
    if (currentState) render(currentState);
  });
  $('#retry-api').addEventListener('click', refreshApi);
  $('#skip-api-setup').addEventListener('click', async () => {
    await chrome.storage.local.set({apiSetupSkipped: true});
    $('#api-setup-overlay').hidden = true;
  });
  $('#save-token').addEventListener('click', async () => {
    const token = $('#api-token').value.trim();
    if (!token) {
      $('#setup-error').textContent = 'Enter a token or skip this dialog.';
      return;
    }
    $('#save-token').disabled = true;
    $('#setup-error').textContent = 'Validating token ...';
    const result = await chrome.runtime.sendMessage({type: 'validateOptimizelyToken', token});
    if (!result?.ok) {
      $('#setup-error').textContent = result?.error || 'Token could not be validated.';
      $('#save-token').disabled = false;
      return;
    }
    await chrome.storage.local.set({apiToken: token, apiTokenValidated: true, apiTokenValidationScope: 'account', apiSetupSkipped: false});
    if (currentState) {
      currentState.apiConfigured = true;
      currentState.apiPending = true;
      currentState.apiSkipped = false;
      render(currentState);
      enrichWithApi(currentState).catch(() => {});
    }
    $('#api-setup-overlay').hidden = true;
    $('#save-token').disabled = false;
    setMessage('API token saved');
  });
  $('#api-token').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('#save-token').click();
    }
  });
  const debugSettings = await chrome.storage.sync.get({disableConsoleLoggingCheckbox: false, disableOptimizelyCheckbox: false});
  $('#disable-console-logging').checked = debugSettings.disableConsoleLoggingCheckbox;
  $('#disable-optimizely').checked = debugSettings.disableOptimizelyCheckbox;
  document.querySelectorAll('.popup-setting input').forEach((input) => input.addEventListener('change', async () => {
    const key = input.id === 'disable-console-logging' ? 'disableConsoleLoggingCheckbox' : 'disableOptimizelyCheckbox';
    await chrome.storage.sync.set({[key]: input.checked});
    setMessage('Setting saved. Reloading page.');
    await new Promise((resolve) => setTimeout(resolve, 150));
    await chrome.tabs.reload(tab.id);
  }));
  $('#open-popout').addEventListener('click', async () => {
    const tabId = tab?.id ? `?tabId=${encodeURIComponent(tab.id)}` : '';
    await chrome.windows.create({url: chrome.runtime.getURL(`popup.html${tabId}`), type: 'popup', width: 470, height: 760});
    window.close();
  });
  $('#reload-page').addEventListener('click', () => chrome.tabs.reload(tab.id));
  $('#refresh').addEventListener('click', () => chrome.tabs.reload(tab.id));
  $('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
});

function exportEvents(events) {
  const fields = ['timestamp', 'source', 'method', 'eventName', 'apiName', 'experimentId', 'variationId', 'url', 'payload'];
  const csv = [fields.join(','), ...events.map((event) => fields.map((field) => csvValue(field === 'payload' ? JSON.stringify(event.payload || '') : event[field] || '')).join(','))].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  link.download = `optimizely-events-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvValue(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function copyCookieCommand(cookieName, label, button) {
  if (!cookieName) {
    setMessage('Cookie name unavailable');
    return;
  }

  const command = `document.cookie = ${JSON.stringify(`${cookieName}=1; path=/`)};`;
  try {
    await navigator.clipboard.writeText(command);
  } catch (_) {
    const textarea = document.createElement('textarea');
    textarea.value = command;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) {
      setMessage('Copy failed');
      return;
    }
  }
  showCopied(button, 'Copy command');
  setMessage(`${label} command copied`);
}
