const http = require('node:http');
const { URL } = require('node:url');
const { randomUUID } = require('node:crypto');

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';
const BODY_LIMIT = 1024 * 100; // 100KB

function readRequestBody(req){
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > BODY_LIMIT){
        reject(Object.assign(new Error('Payload too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve(raw);
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload){
  res.statusCode = statusCode;
  res.setHeader('Content-Type', JSON_CONTENT_TYPE);
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message){
  res.statusCode = statusCode;
  res.setHeader('Content-Type', TEXT_CONTENT_TYPE);
  res.end(message);
}

function normalizeTopic(value){
  if (typeof value !== 'string') return '';
  const sanitized = value.replace(/\s+/g, ' ').trim();
  return sanitized.slice(0, 200);
}

function buildPrompt({ topic, language, source }){
  const lang = typeof language === 'string' && language.trim() ? language.trim().toLowerCase() : 'ru';
  const languageLabel = lang.startsWith('en') ? 'English' : 'Russian';
  const sourceLabel = typeof source === 'string' && source.trim() ? `Источник: ${source.trim()}.` : '';
  const safeTopic = topic.replace(/"/g, '\"');
  return [
    'Ты — генератор словарей для настольной игры «Крокодил» (показывать слова пантомимой).',
    'Нужно придумать по 10 уникальных слов для трёх уровней сложности: easy, medium, hard.',
    'Формат ответа — строго JSON без текста до и после.',
    'Каждое слово — короткая фраза на указанном языке.',
    `Тема: "${safeTopic}".`,
    `Язык слов: ${languageLabel}.`,
    sourceLabel,
    'Структура JSON: {"easy": string[], "medium": string[], "hard": string[]}.',
    'Минимум 5 слов на уровень, не повторяй слова между уровнями.',
    'Не используй комментарии, Markdown или кодовые блоки.'
  ].filter(Boolean).join('\n');
}

function extractJsonPayload(text){
  if (!text) throw new Error('Пустой ответ модели.');
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch ? fencedMatch[1] : trimmed;
  try{
    return JSON.parse(jsonText);
  }catch(err){
    const parsingError = new Error('Ответ модели не является корректным JSON.');
    parsingError.cause = err;
    throw parsingError;
  }
}

function normalizeWordList(value){
  if (!value) return [];
  if (Array.isArray(value)){
    return value
      .map(item => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object'){
          if (typeof item.term === 'string') return item.term.trim();
          if (typeof item.word === 'string') return item.word.trim();
          if (typeof item.title === 'string') return item.title.trim();
        }
        return '';
      })
      .map(item => item.replace(/\s+/g, ' ').trim())
      .filter((item, idx, arr) => item && arr.indexOf(item) === idx);
  }
  if (typeof value === 'string'){
    return value
      .split(/[\n,;]+/)
      .map(part => part.replace(/\s+/g, ' ').trim())
      .filter((item, idx, arr) => item && arr.indexOf(item) === idx);
  }
  if (value && typeof value === 'object'){
    if (Array.isArray(value.words)) return normalizeWordList(value.words);
    if (Array.isArray(value.items)) return normalizeWordList(value.items);
    if (typeof value.text === 'string') return normalizeWordList(value.text);
  }
  return [];
}

function normalizeDictionaryStructure(raw){
  const dictionary = raw && typeof raw === 'object' ? raw : {};
  const result = {
    easy: normalizeWordList(dictionary.easy),
    medium: normalizeWordList(dictionary.medium),
    hard: normalizeWordList(dictionary.hard)
  };
  const total = result.easy.length + result.medium.length + result.hard.length;
  if (!total){
    throw new Error('Модель вернула пустой словарь.');
  }
  return result;
}

async function requestYandexAssistantApi({ apiKey, folderId, model, apiUrl, topic, language, source }){
  const systemPrompt = 'Отвечай только в формате JSON без дополнительных комментариев.';
  const userPrompt = buildPrompt({ topic, language, source });
  const body = {
    model: `gpt://${folderId}/${model}`,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    maxTokens: 1500
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Api-Key ${apiKey}`,
    'x-folder-id': folderId
  };
  if (process.env.YANDEX_LOGGING_ENABLED){
    headers['x-data-logging-enabled'] = String(process.env.YANDEX_LOGGING_ENABLED).toLowerCase() === 'true' ? 'true' : 'false';
  }
  headers['x-client-request-id'] = randomUUID();
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const rawText = await response.text();
  let payload;
  try{
    payload = rawText ? JSON.parse(rawText) : null;
  }catch(parseErr){
    const error = new Error('Не удалось разобрать ответ от Yandex GPT.');
    error.statusCode = 502;
    error.details = rawText;
    error.cause = parseErr;
    throw error;
  }
  if (!response.ok){
    const message = payload?.message || payload?.error?.message || `Ошибка Yandex GPT (${response.status}).`;
    const error = new Error(message);
    error.statusCode = response.status >= 500 ? 502 : 400;
    error.details = payload;
    throw error;
  }
  const segments = Array.isArray(payload?.output) ? payload.output : [];
  const collected = [];
  for (const segment of segments){
    const contentItems = Array.isArray(segment?.content) ? segment.content : [];
    for (const item of contentItems){
      if (typeof item?.text === 'string' && item.text.trim()){
        collected.push(item.text.trim());
      }
    }
  }
  const combinedText = collected.join('\n');
  if (!combinedText){
    const error = new Error('Yandex GPT вернул пустой ответ.');
    error.statusCode = 502;
    error.details = payload;
    throw error;
  }
  const parsed = extractJsonPayload(combinedText);
  return normalizeDictionaryStructure(parsed);
}

async function requestYandexCompletionApi({ apiKey, folderId, model, apiUrl, topic, language, source }){
  const body = {
    modelUri: `gpt://${folderId}/${model}`,
    completionOptions: {
      stream: false,
      temperature: 0.2,
      maxTokens: 1500
    },
    messages: [
      { role: 'system', text: 'Отвечай только в формате JSON без дополнительных комментариев.' },
      { role: 'user', text: buildPrompt({ topic, language, source }) }
    ]
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Api-Key ${apiKey}`
  };
  if (process.env.YANDEX_LOGGING_ENABLED){
    headers['x-data-logging-enabled'] = String(process.env.YANDEX_LOGGING_ENABLED).toLowerCase() === 'true' ? 'true' : 'false';
  }
  headers['x-client-request-id'] = randomUUID();
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const rawText = await response.text();
  let payload;
  try{
    payload = rawText ? JSON.parse(rawText) : null;
  }catch(parseErr){
    const error = new Error('Не удалось разобрать ответ от Yandex GPT.');
    error.statusCode = 502;
    error.details = rawText;
    error.cause = parseErr;
    throw error;
  }
  if (!response.ok){
    const message = payload?.message || payload?.error?.message || `Ошибка Yandex GPT (${response.status}).`;
    const error = new Error(message);
    error.statusCode = response.status >= 500 ? 502 : 400;
    error.details = payload;
    throw error;
  }
  const alternatives = payload?.result?.alternatives;
  const firstText = Array.isArray(alternatives)
    ? alternatives.map(item => item?.message?.text).find(Boolean)
    : null;
  if (!firstText){
    const error = new Error('Yandex GPT вернул пустой ответ.');
    error.statusCode = 502;
    error.details = payload;
    throw error;
  }
  const parsed = extractJsonPayload(firstText);
  return normalizeDictionaryStructure(parsed);
}

async function requestYandexGpt({ topic, language, source }){
  const apiKey = process.env.YANDEX_GPT_API_KEY || process.env.YANDEX_API_KEY || '';
  const folderId = process.env.YANDEX_GPT_FOLDER_ID || process.env.YANDEX_FOLDER_ID || '';
  const model = process.env.YANDEX_GPT_MODEL || 'yandexgpt-lite';
  const apiType = (process.env.YANDEX_GPT_API_TYPE || '').toLowerCase();
  const defaultAssistantUrl = 'https://rest-assistant.api.cloud.yandex.net/v1/responses';
  const defaultCompletionUrl = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';
  const apiUrlEnv = process.env.YANDEX_GPT_API_URL || '';
  const useAssistant = apiType === 'assistant' || apiType === 'rest-assistant' || apiUrlEnv.includes('rest-assistant.api.cloud.yandex.net');
  const apiUrl = apiUrlEnv || (useAssistant ? defaultAssistantUrl : defaultCompletionUrl);
  if (!apiKey || !folderId){
    const error = new Error('Сервис генерации не настроен. Обратитесь к администратору.');
    error.statusCode = 503;
    throw error;
  }
  const payload = { apiKey, folderId, model, apiUrl, topic, language, source };
  if (useAssistant){
    return requestYandexAssistantApi(payload);
  }
  return requestYandexCompletionApi(payload);
}

async function handleGenerateDictionary(req, res){
  if (req.method === 'OPTIONS'){
    res.statusCode = 204;
    res.setHeader('Allow', 'POST, OPTIONS');
    res.end();
    return;
  }
  if (req.method !== 'POST'){
    res.setHeader('Allow', 'POST, OPTIONS');
    sendText(res, 405, 'Method Not Allowed');
    return;
  }
  let data;
  try{
    const rawBody = await readRequestBody(req);
    data = rawBody ? JSON.parse(rawBody) : {};
  }catch(err){
    console.error('[generate-dictionary] Ошибка чтения тела запроса:', err);
    const status = err.statusCode === 413 ? 413 : 400;
    sendJson(res, status, { error: 'Некорректное тело запроса.' });
    return;
  }
  const topic = normalizeTopic(data?.topic);
  const language = typeof data?.language === 'string' ? data.language : '';
  const source = typeof data?.source === 'string' ? data.source : '';
  if (!topic){
    sendJson(res, 400, { error: 'Укажите тему словаря в поле "topic".' });
    return;
  }
  try{
    const dictionary = await requestYandexGpt({ topic, language, source });
    sendJson(res, 200, dictionary);
  }catch(err){
    const statusCode = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    console.error('[generate-dictionary] Ошибка генерации:', err);
    sendJson(res, statusCode, { error: err.message || 'Не удалось сгенерировать словарь.' });
  }
}

function requestListener(req, res){
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/generate-dictionary'){
    handleGenerateDictionary(req, res);
    return;
  }
  sendText(res, 404, 'Not Found');
}

function createServer(){
  return http.createServer(requestListener);
}

if (require.main === module){
  const port = Number.parseInt(process.env.PORT, 10) || 3000;
  createServer().listen(port, () => {
    console.log(`CrocoMim API server listening on port ${port}`);
  });
}

module.exports = {
  createServer,
  handleGenerateDictionary,
  requestYandexGpt,
  normalizeDictionaryStructure,
  normalizeWordList,
  extractJsonPayload,
  buildPrompt,
  requestListener,
  requestYandexAssistantApi,
  requestYandexCompletionApi
};
