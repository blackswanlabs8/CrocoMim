const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'runtime-config.json');
let cachedConfig = null;
let cachedPath = null;

function readString(config, keys){
  if (!config || typeof config !== 'object'){ return ''; }
  for (const key of keys){
    const raw = config[key];
    if (typeof raw === 'string'){
      const trimmed = raw.trim();
      if (trimmed){
        return trimmed;
      }
    }
  }
  return '';
}

function resolveConfigPath(){
  const explicit = process.env.RUNTIME_CONFIG_PATH;
  if (explicit && explicit.trim()){
    return path.resolve(explicit.trim());
  }
  return DEFAULT_CONFIG_PATH;
}

function readRuntimeConfig(filePath){
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err){
    console.warn(`Не удалось загрузить runtime-конфигурацию из ${filePath}: ${err.message}`);
    return {};
  }
}

function getRuntimeConfig(){
  const filePath = resolveConfigPath();
  if (!cachedConfig || cachedPath !== filePath){
    cachedPath = filePath;
    cachedConfig = readRuntimeConfig(filePath);
  }
  return cachedConfig;
}

function reloadRuntimeConfig(){
  cachedConfig = null;
  cachedPath = null;
  return getRuntimeConfig();
}

function getBackendApiBaseUrl(){
  const config = getRuntimeConfig();
  const raw = readString(config, ['backendApiBaseUrl', 'publicApiBaseUrl']);
  return raw || null;
}

function getPublicApiBaseUrl(){
  return getBackendApiBaseUrl();
}

function getBackendBaseUrl(){
  return getBackendApiBaseUrl();
}

function getFrontendBaseUrl(){
  const config = getRuntimeConfig();
  const raw = readString(config, ['frontendBaseUrl', 'publicSiteBaseUrl', 'siteBaseUrl', 'backendBaseUrl']);
  return raw || null;
}

module.exports = {
  getRuntimeConfig,
  reloadRuntimeConfig,
  getPublicApiBaseUrl,
  getBackendBaseUrl,
  getBackendApiBaseUrl,
  getFrontendBaseUrl,
  resolveConfigPath
};
