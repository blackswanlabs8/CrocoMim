(function(global){
  const target = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {});
  const API_ENDPOINT = '/api/generate-dictionary';
  const DIFFICULTY_KEYS = ['easy', 'medium', 'hard'];

  function normalizeTopic(topic){
    if (typeof topic !== 'string') return '';
    return topic.replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  function toWordArray(value){
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
      if (Array.isArray(value.words)) return toWordArray(value.words);
      if (Array.isArray(value.items)) return toWordArray(value.items);
      if (typeof value.text === 'string') return toWordArray(value.text);
    }
    return [];
  }

  function normalizeDictionaryPayload(payload){
    const result = { easy: [], medium: [], hard: [] };
    if (!payload || typeof payload !== 'object'){
      return result;
    }
    DIFFICULTY_KEYS.forEach(key => {
      if (key in payload){
        const words = toWordArray(payload[key]);
        result[key] = words;
      }
    });
    return result;
  }

  async function parseErrorResponse(response){
    const contentType = response.headers?.get('content-type') || '';
    if (contentType.includes('application/json')){
      try{
        const data = await response.json();
        if (data && typeof data.error === 'string'){
          return data.error;
        }
        if (data && typeof data.message === 'string'){
          return data.message;
        }
      }catch{
        // ignore parsing issues
      }
    }
    try{
      const text = await response.text();
      if (text && text.trim()){
        return text.trim();
      }
    }catch{
      // ignore
    }
    return `Ошибка запроса (${response.status})`;
  }

  async function generateDictionary(options = {}){
    const topic = normalizeTopic(options.topic);
    if (!topic){
      throw new Error('Укажите тему словаря.');
    }
    const payload = { topic };
    if (typeof options.language === 'string' && options.language.trim()){
      payload.language = options.language.trim();
    }
    if (typeof options.source === 'string' && options.source.trim()){
      payload.source = options.source.trim();
    }
    const fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    };
    if (options.signal) fetchOptions.signal = options.signal;
    let response;
    try{
      response = await fetch(API_ENDPOINT, fetchOptions);
    }catch(err){
      throw new Error('Не удалось выполнить запрос генерации. Проверьте подключение к сети.');
    }
    if (!response.ok){
      const message = await parseErrorResponse(response);
      throw new Error(message || 'Сервис генерации временно недоступен.');
    }
    let data;
    try{
      data = await response.json();
    }catch{
      throw new Error('Сервер вернул некорректный ответ.');
    }
    const normalized = normalizeDictionaryPayload(data);
    const total = DIFFICULTY_KEYS.reduce((sum, key) => sum + normalized[key].length, 0);
    if (!total){
      throw new Error('Не удалось получить слова для этой темы.');
    }
    return normalized;
  }

  async function generateCustomDictionary(options){
    const dictionary = await generateDictionary(options || {});
    return DIFFICULTY_KEYS.flatMap(key => dictionary[key]);
  }

  const api = { generateDictionary };

  if (target){
    target.AIGenerator = api;
    if (target.DictionaryService && typeof target.DictionaryService === 'object'){
      target.DictionaryService.generateCustomDictionary = generateCustomDictionary;
      target.DictionaryService.generateDictionaryByTopic = generateDictionary;
    }
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
