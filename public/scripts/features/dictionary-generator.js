(function(global){
  'use strict';

  const DIFFICULTIES = ['easy', 'medium', 'hard'];
  const DEFAULT_WORDS_COUNT = 30;

  function setStatus(statusEl, text, mode){
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.remove('is-error', 'is-success');
    if (mode) statusEl.classList.add(mode);
  }

  function wordsFromPayload(payload){
    const generatedItems = Array.isArray(payload?.dictionary)
      ? payload.dictionary
      : (Array.isArray(payload?.items)
        ? payload.items
        : (Array.isArray(payload?.saved_dictionary?.items) ? payload.saved_dictionary.items : []));
    if (Array.isArray(payload?.words)){
      return payload.words.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim());
    }
    return generatedItems
      .map(item => typeof item === 'string' ? item : item?.term)
      .filter(item => typeof item === 'string' && item.trim())
      .map(item => item.trim());
  }

  function setupCustomGenerator(state, options = {}){
    const api = options.api || global.DictionaryApi;
    const topicInput = options.topicInput;
    const wordsInput = options.wordsInput;
    const statusEl = options.statusEl;
    const trigger = options.trigger;
    const persist = typeof options.persist === 'function' ? options.persist : null;
    const onSavedDictionary = typeof options.onSavedDictionary === 'function' ? options.onSavedDictionary : null;
    const onAuthRequired = typeof options.onAuthRequired === 'function' ? options.onAuthRequired : null;
    const generatedWordsCount = Number.isFinite(Number(options.wordsCount)) ? Number(options.wordsCount) : DEFAULT_WORDS_COUNT;

    const getDifficulty = () => {
      const level = typeof state?.difficulty === 'string' ? state.difficulty.toLowerCase() : '';
      return DIFFICULTIES.includes(level) ? level : 'medium';
    };

    const handleGenerate = async () => {
      const topic = typeof topicInput?.value === 'string' ? topicInput.value.trim() : '';
      setStatus(statusEl, '');
      if (!api || typeof api.generateDictionary !== 'function'){
        setStatus(statusEl, 'API генерации недоступен', 'is-error');
        return;
      }
      if (!topic){
        setStatus(statusEl, 'Введите тему словаря', 'is-error');
        if (topicInput) topicInput.focus();
        return;
      }

      const difficulty = getDifficulty();
      if (trigger) trigger.disabled = true;
      setStatus(statusEl, 'Генерация словаря…');

      try{
        const payload = await api.generateDictionary({
          topic,
          difficulty,
          words: generatedWordsCount
        });
        const words = wordsFromPayload(payload);
        if (!words.length){
          throw new Error('Сервис вернул пустой список слов');
        }

        if (wordsInput) wordsInput.value = words.join('\n');
        if (typeof options.setCustomSelection === 'function') options.setCustomSelection(state, true);
        if (state?.setDifficulty) state.setDifficulty(difficulty);

        const savedId = payload?.saved_dictionary?.id;
        if (savedId !== undefined && savedId !== null && savedId !== ''){
          if (onSavedDictionary) await onSavedDictionary(savedId, payload);
          setStatus(statusEl, `Сгенерировано и сохранено слов: ${words.length}`, 'is-success');
        }else{
          setStatus(statusEl, `Сгенерировано слов: ${words.length}`, 'is-success');
        }
        if (persist) persist();
      }catch(err){
        if (err?.status === 401 && onAuthRequired) onAuthRequired(err);
        setStatus(statusEl, err?.message || 'Не удалось сгенерировать словарь', 'is-error');
      }finally{
        if (trigger) trigger.disabled = false;
      }
    };

    if (trigger) trigger.addEventListener('click', handleGenerate);
    if (topicInput){
      topicInput.addEventListener('keydown', evt => {
        if (evt.key === 'Enter'){
          evt.preventDefault();
          handleGenerate();
        }
      });
      topicInput.addEventListener('input', () => {
        setStatus(statusEl, '');
        if (persist) persist();
      });
    }

    return { generate: handleGenerate, setStatus: (text, mode) => setStatus(statusEl, text, mode) };
  }

  global.DictionaryGeneratorFeature = { setupCustomGenerator };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
