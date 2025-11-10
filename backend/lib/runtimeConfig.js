const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'runtime.json');
let cachedConfig = null;
let cachedPath = null;

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

function getPublicApiBaseUrl(){
  const config = getRuntimeConfig();
  const raw = typeof config.publicApiBaseUrl === 'string' ? config.publicApiBaseUrl.trim() : '';
  return raw || null;
}

function getBackendBaseUrl(){
  const config = getRuntimeConfig();
  const raw = typeof config.backendBaseUrl === 'string' ? config.backendBaseUrl.trim() : '';
  return raw || null;
}

module.exports = {
  getRuntimeConfig,
  reloadRuntimeConfig,
  getPublicApiBaseUrl,
  getBackendBaseUrl,
  resolveConfigPath
};
