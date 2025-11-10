const { URL } = require('url');

const {
  getPublicApiBaseUrl,
  getBackendBaseUrl
} = require('./runtimeConfig');

function resolveDefaultBaseUrl(){
  const publicApi = getPublicApiBaseUrl();
  if (publicApi) return publicApi;
  const backendBase = getBackendBaseUrl();
  if (backendBase) return backendBase;
  return 'http://localhost:3000';
}

async function checkHealth(baseUrl = resolveDefaultBaseUrl()){
  const endpoint = new URL('/healthz', baseUrl);
  const response = await fetchJson(endpoint, { method: 'GET' });
  return response.ok === true;
}

async function sendTestFeedback(baseUrl = resolveDefaultBaseUrl(), overrides = {}){
  const endpoint = new URL('/api/feedback', baseUrl);
  const payload = buildFeedbackPayload(overrides);
  const response = await fetchJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response;
}

function buildFeedbackPayload(overrides){
  const basePayload = {
    category: 'other',
    message: 'Тестовое сообщение для проверки работы сервера',
    consent: true,
    email: null,
    context: {
      source: 'serverChecks',
      timestamp: new Date().toISOString()
    },
    client: {
      agent: 'serverChecks',
      version: 1
    }
  };
  const merged = { ...basePayload, ...overrides };
  merged.context = { ...basePayload.context, ...(overrides.context || {}) };
  merged.client = { ...basePayload.client, ...(overrides.client || {}) };
  return merged;
}

async function fetchJson(url, init){
  const fetchImpl = await resolveFetch();
  const response = await fetchImpl(url, init);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err){
    throw new Error(`Unexpected response from ${url}: ${text}`);
  }
  if (!response.ok){
    const error = new Error(`Request to ${url} failed with status ${response.status}`);
    error.response = response;
    error.body = json;
    throw error;
  }
  return json;
}

async function resolveFetch(){
  if (typeof fetch === 'function'){ return fetch; }
  try {
    const mod = await import('node-fetch');
    return mod.default;
  } catch (err){
    throw new Error('Fetch API is not available in this environment. Please upgrade to Node.js 18+ or install node-fetch.');
  }
}

module.exports = {
  checkHealth,
  sendTestFeedback
};
