const API_BASE = 'https://api.optimizely.com/v2';
const apiCache = new Map();
const API_TIMEOUT_MS = 5000;
const badgeTimers = new Map();
const badgeCounts = new Map();
let preserveEventLog = false;
const ASSISTANT_SETTINGS = {
  useS3snippetCheckbox: false,
  optimizelyUseNonCacheSnippetCheckbox: false,
  disableOptimizelyCheckbox: false,
};
const DYNAMIC_RULE_IDS = [1, 3, 4];
const SNIPPET_FILTER = '([a-zA-Z\\-]+\\.optimizely)\\.com\\/(js\\/(\\d+)|public\\/(\\d+)\\/s\\/[^/]+)\\.js|.*\\/optimizelyjs\\/(\\d+)\\.js';
const PCI_SNIPPET_FILTER = '([a-zA-Z\\-]+\\.cdn-pci.optimizely)\\.com\\/(js\\/(\\d+)|public\\/(\\d+)\\/s\\/[^/]+)\\.js|.*\\/optimizelyjs\\/(\\d+)\\.js';

function addNoCacheTransform(transform = {}) {
  return {
    ...transform,
    queryTransform: {
      addOrReplaceParams: [{key: 'OPTIMIZELY_NOCACHE', value: '1'}],
    },
  };
}

async function updateAssistantRules() {
  const settings = await chrome.storage.sync.get(ASSISTANT_SETTINGS);
  const rules = [];

  if (settings.disableOptimizelyCheckbox) {
    rules.push({id: 1, priority: 10, action: {type: 'block'}, condition: {regexFilter: SNIPPET_FILTER, resourceTypes: ['script', 'sub_frame']}});
  } else if (settings.useS3snippetCheckbox) {
    const transform = settings.optimizelyUseNonCacheSnippetCheckbox ? addNoCacheTransform : (value) => value;
    rules.push({id: 3, priority: 8, action: {type: 'redirect', redirect: {transform: transform({host: 'optimizely.s3.amazonaws.com'})}}, condition: {regexFilter: SNIPPET_FILTER, resourceTypes: ['script', 'sub_frame']}});
    rules.push({id: 4, priority: 8, action: {type: 'redirect', redirect: {transform: transform({host: 'cdn-assets-prod.s3.amazonaws.com'})}}, condition: {regexFilter: PCI_SNIPPET_FILTER, resourceTypes: ['script', 'sub_frame']}});
  } else if (settings.optimizelyUseNonCacheSnippetCheckbox) {
    rules.push({id: 1, priority: 5, action: {type: 'redirect', redirect: {transform: addNoCacheTransform()}}, condition: {regexFilter: SNIPPET_FILTER, resourceTypes: ['script', 'sub_frame']}});
  }

  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: DYNAMIC_RULE_IDS, addRules: rules});
}

function updateExperimentBadge(tabId, state) {
  const count = state?.experiments?.length || 0;
  clearTimeout(badgeTimers.get(tabId));
  badgeTimers.set(tabId, setTimeout(() => {
    badgeTimers.delete(tabId);
    if (badgeCounts.get(tabId) === count) return;
    badgeCounts.set(tabId, count);
    chrome.action.setBadgeText({tabId, text: count ? String(count) : ''}).catch(() => {});
    if (count) chrome.action.setBadgeBackgroundColor({tabId, color: '#17834b'}).catch(() => {});
  }, 300));
}

async function restoreExperimentBadge(tabId) {
  try {
    const stored = await chrome.storage.session.get(`state:${tabId}`);
    const state = stored[`state:${tabId}`];
    if (state) updateExperimentBadge(tabId, state);
  } catch (_) {
    // The tab may have been closed while the service worker was waking up.
  }
}

async function validateOptimizelyToken(token) {
  if (!token) return {ok: false, error: 'Please enter an API token.'};
  const headers = {Authorization: `Bearer ${token}`, Accept: 'application/json'};
  const urls = [`${API_BASE}/projects`];
  let lastStatus = '';
  for (const url of urls) {
    try {
      const result = await fetchJson(url, headers);
      if (result.ok) return {ok: true};
      lastStatus = result.status === 'timeout' ? 'Timeout' : `HTTP ${result.status}`;
    } catch (error) {
      lastStatus = error.message;
    }
  }
  if (lastStatus === 'HTTP 401') return {ok: false, error: 'The API token is invalid.'};
  if (lastStatus === 'HTTP 403') return {ok: false, error: 'The API token has no access to this Optimizely account or project.'};
  return {ok: false, error: `The API token could not be validated (${lastStatus || 'unknown error'}).`};
}

function asRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const collection = payload.experiments || payload.items || payload.results || payload.data;
  if (Array.isArray(collection)) return collection;
  if (collection && typeof collection === 'object') return Object.values(collection);
  return payload.id || payload.experiment_id || payload.experimentId ? [payload] : [];
}

async function fetchJson(url, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {headers, signal: controller.signal});
    if (!response.ok) return {ok: false, status: response.status};
    return {ok: true, data: await response.json()};
  } catch (_) {
    return {ok: false, status: 'timeout'};
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOptimizelyMetadata(projectId, experimentIds, forceRefresh = false) {
  const {apiToken} = await chrome.storage.local.get({apiToken: ''});
  if (!apiToken) return {ok: false, error: 'No API token configured'};
  if (!projectId || !experimentIds?.length) return {ok: true, experiments: []};

  const cacheKey = `${projectId}:${experimentIds.slice().sort().join(',')}`;
  const cached = apiCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.createdAt < 5 * 60 * 1000) return cached.value;

  const headers = {Authorization: `Bearer ${apiToken}`, Accept: 'application/json'};
  const uniqueExperimentIds = [...new Set(experimentIds.map(String))];
  const attemptedUrls = [];
  const details = await Promise.all(uniqueExperimentIds.map(async (experimentId) => {
    const urls = [
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}`,
      `${API_BASE}/experiments/${encodeURIComponent(experimentId)}`,
    ];
    for (const url of urls) {
      attemptedUrls.push(url);
      const result = await fetchJson(url, headers);
      if (result.ok) return result.data.experiment || result.data.data || result.data;
    }
    return null;
  }));

  const byId = new Map(details.filter(Boolean).map((record) => [String(record.id || record.experiment_id || record.experimentId), record]));
  const missingIds = uniqueExperimentIds.filter((id) => !byId.has(id));
  if (missingIds.length) {
    const listUrls = [
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/experiments`,
      `${API_BASE}/experiments?project_id=${encodeURIComponent(projectId)}`,
    ];
    for (const url of listUrls) {
      attemptedUrls.push(url);
      const result = await fetchJson(url, headers);
      if (!result.ok) continue;
      asRecords(result.data).filter((record) => missingIds.includes(String(record.id || record.experiment_id || record.experimentId)))
        .forEach((record) => byId.set(String(record.id || record.experiment_id || record.experimentId), record));
      if (missingIds.every((id) => byId.has(id))) break;
    }
  }
  const value = {ok: true, experiments: [...byId.values()], diagnostics: {projectId, attemptedUrls}};
  apiCache.set(cacheKey, {createdAt: Date.now(), value});
  return value;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'pageState' && sender.tab?.id) {
    chrome.storage.session.get(`state:${sender.tab.id}`).then((stored) => {
      const previous = stored[`state:${sender.tab.id}`];
      const state = preserveEventLog && previous ? {...message.state, events: mergeEvents(message.state.events, previous.events)} : message.state;
      return chrome.storage.session.set({[`state:${sender.tab.id}`]: state}).then(() => updateExperimentBadge(sender.tab.id, state));
    }).catch(() => {});
    return;
  }
  if (message.type === 'getPageState') {
    chrome.storage.session.get(`state:${message.tabId}`).then((result) => {
      sendResponse(result[`state:${message.tabId}`] || {experiments: [], events: []});
    }).catch(() => sendResponse({experiments: [], events: []}));
    return true;
  }
  if (message.type === 'fetchOptimizelyMetadata') {
    fetchOptimizelyMetadata(message.projectId, message.experimentIds, message.forceRefresh)
      .then(sendResponse)
      .catch((error) => sendResponse({ok: false, error: publicError(error)}));
    return true;
  }
  if (message.type === 'validateOptimizelyToken') {
    validateOptimizelyToken(message.token)
      .then(sendResponse)
      .catch((error) => sendResponse({ok: false, error: publicError(error)}));
    return true;
  }
});

function mergeEvents(current = [], previous = []) {
  const events = [...current, ...previous];
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.timestamp}:${event.source}:${event.method}:${JSON.stringify(event.payload)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 100);
}

function publicError(error) {
  return String(error?.message || error || 'Unknown error')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/([?&]token=)[^&\s]+/gi, '$1[redacted]');
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.apiToken) apiCache.clear();
  if (area === 'sync' && changes.preserveEventLog) preserveEventLog = Boolean(changes.preserveEventLog.newValue);
  if (area !== 'sync') return;
  if (Object.keys(changes).some((key) => key in ASSISTANT_SETTINGS)) updateAssistantRules().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({apiToken: ''});
  chrome.storage.sync.get({preserveEventLog: false}).then(({preserveEventLog: value}) => { preserveEventLog = value; }).catch(() => {});
  updateAssistantRules().catch(() => {});
});

chrome.storage.sync.get({preserveEventLog: false}).then(({preserveEventLog: value}) => { preserveEventLog = value; }).catch(() => {});
updateAssistantRules().catch(() => {});

chrome.tabs.onActivated.addListener(({tabId}) => {
  restoreExperimentBadge(tabId);
});

chrome.tabs.query({}).then((tabs) => {
  tabs.forEach((tab) => {
    if (tab.id !== undefined) restoreExperimentBadge(tab.id);
  });
}).catch(() => {});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimeout(badgeTimers.get(tabId));
  badgeTimers.delete(tabId);
  badgeCounts.delete(tabId);
  chrome.storage.session.remove(`state:${tabId}`).catch(() => {});
});
