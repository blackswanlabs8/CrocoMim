(function(global){
  'use strict';

  const client = global.CrocoApiClient;
  if (!client){
    console.error('CrocoApiClient не найден. Проверьте порядок подключения scripts/api/client.js.');
    return;
  }

  const encodeId = id => encodeURIComponent(String(id));

  function normalizeDictionaryItems(rawItems, fallback = {}){
    const items = Array.isArray(rawItems) ? rawItems : [];
    const dictionaryId = fallback.dictionaryId || fallback.id || '';
    const difficulty = fallback.difficulty || '';
    return items.map((item, idx) => {
      const source = item && typeof item === 'object' ? item : { term: item };
      return {
        dictionaryId: String(source.dictionaryId || dictionaryId),
        difficulty: String(source.difficulty || difficulty),
        id: String(source.id || `${dictionaryId || 'dictionary'}_${idx + 1}`),
        term: String(source.term || source.word || '').trim(),
        description: String(source.description || source.meaning || source.definition || '').trim(),
        about: String(source.about || source.hint || source.notes || '').trim()
      };
    }).filter(item => item.term);
  }

  function pickDictionary(payload){
    return payload?.dictionary || payload?.saved_dictionary || payload?.data || payload || {};
  }

  async function generateDictionary({ topic, difficulty, words }){
    return client.request('generate-dictionary', {
      method: 'POST',
      body: { topic, difficulty, words }
    });
  }

  async function listUserDictionaries(){
    const payload = await client.request('user/dictionaries', {
      method: 'GET',
      cache: 'no-store'
    });
    if (Array.isArray(payload?.dictionaries)) return payload.dictionaries;
    if (Array.isArray(payload?.data)) return payload.data;
    return Array.isArray(payload) ? payload : [];
  }

  async function createUserDictionary(dictionary){
    return client.request('user/dictionaries', {
      method: 'POST',
      body: dictionary
    });
  }

  async function getUserDictionary(id){
    const payload = await client.request(`user/dictionaries/${encodeId(id)}`, {
      method: 'GET',
      cache: 'no-store'
    });
    return pickDictionary(payload);
  }

  async function updateUserDictionary(id, dictionary){
    return client.request(`user/dictionaries/${encodeId(id)}`, {
      method: 'PUT',
      body: dictionary
    });
  }

  async function deleteUserDictionary(id){
    return client.request(`user/dictionaries/${encodeId(id)}`, {
      method: 'DELETE'
    });
  }

  global.DictionaryApi = {
    normalizeDictionaryItems,
    generateDictionary,
    listUserDictionaries,
    createUserDictionary,
    getUserDictionary,
    updateUserDictionary,
    deleteUserDictionary
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
