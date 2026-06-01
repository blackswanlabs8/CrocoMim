(function(global){
  'use strict';

  let state = null;

  function h(tag, className, text){
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function setStatus(text, mode){
    if (!state?.statusEl) return;
    state.statusEl.textContent = text || '';
    state.statusEl.classList.remove('is-error', 'is-success');
    if (mode) state.statusEl.classList.add(mode);
  }

  function metaLine(dict){
    const parts = [
      dict.topic ? `Тема: ${dict.topic}` : '',
      dict.difficulty ? `Сложность: ${dict.difficulty}` : '',
      Number.isFinite(Number(dict.items_count)) ? `Слов: ${dict.items_count}` : '',
      dict.source ? `Источник: ${dict.source}` : '',
      dict.status ? `Статус: ${dict.status}` : ''
    ].filter(Boolean);
    return parts.join(' · ');
  }

  function renderList(list){
    state.listEl.textContent = '';
    if (!list.length){
      const empty = h('div', 'dict-empty muted', 'Пока нет сохранённых словарей. Сгенерируйте или сохраните свой первый словарь.');
      state.listEl.appendChild(empty);
      return;
    }

    list.forEach(dict => {
      const card = h('article', 'user-dictionary-card');
      const head = h('div', 'user-dictionary-card__head');
      const title = h('strong', 'user-dictionary-card__title', dict.title || `Словарь #${dict.id}`);
      const status = h('span', 'user-dictionary-card__status', dict.status || 'draft');
      head.append(title, status);
      const meta = h('div', 'muted user-dictionary-card__meta', metaLine(dict));
      const actions = h('div', 'dictionary-actions');

      const playBtn = h('button', 'btn', 'Играть');
      playBtn.type = 'button';
      playBtn.addEventListener('click', () => state.onPlay && state.onPlay(dict));
      const openBtn = h('button', 'btn ghost', 'Открыть');
      openBtn.type = 'button';
      openBtn.addEventListener('click', () => state.onOpen && state.onOpen(dict));
      const editBtn = h('button', 'btn ghost', 'Редактировать');
      editBtn.type = 'button';
      editBtn.addEventListener('click', () => state.onEdit && state.onEdit(dict));
      const deleteBtn = h('button', 'btn warn', 'Удалить');
      deleteBtn.type = 'button';
      deleteBtn.addEventListener('click', () => deleteDictionary(dict));

      actions.append(playBtn, openBtn, editBtn, deleteBtn);
      card.append(head, meta, actions);
      state.listEl.appendChild(card);
    });
  }

  async function load(){
    if (!state?.api) return;
    setStatus('Загрузка словарей…');
    try{
      const list = await state.api.listUserDictionaries();
      state.dictionaries = Array.isArray(list) ? list : [];
      renderList(state.dictionaries);
      setStatus('');
    }catch(err){
      state.dictionaries = [];
      renderList([]);
      if (err?.status === 401){
        setStatus('Войдите или зарегистрируйтесь, чтобы увидеть «Мои словари».', 'is-error');
        return;
      }
      setStatus(err?.message || 'Не удалось загрузить словари', 'is-error');
    }
  }

  async function deleteDictionary(dict){
    if (!dict?.id) return;
    if (!global.confirm(`Удалить словарь «${dict.title || dict.id}»?`)) return;
    try{
      setStatus('Удаляем словарь…');
      await state.api.deleteUserDictionary(dict.id);
      if (state.onChanged) await state.onChanged();
      await load();
      setStatus('Словарь удалён', 'is-success');
    }catch(err){
      if (err?.status === 401 && state.onAuthRequired) state.onAuthRequired(err);
      setStatus(err?.message || 'Не удалось удалить словарь', 'is-error');
    }
  }

  function init(options = {}){
    const root = document.getElementById(options.rootId || 'userDictionaries');
    if (!root) return null;
    const api = options.api || global.DictionaryApi;
    const statusEl = root.querySelector('[data-user-dictionaries-status]');
    const listEl = root.querySelector('[data-user-dictionaries-list]');
    if (!listEl) return null;
    state = {
      root,
      api,
      statusEl,
      listEl,
      dictionaries: [],
      onPlay: options.onPlay,
      onOpen: options.onOpen,
      onEdit: options.onEdit,
      onChanged: options.onChanged,
      onAuthRequired: options.onAuthRequired
    };
    const refresh = root.querySelector('[data-user-dictionaries-refresh]');
    if (refresh) refresh.addEventListener('click', load);
    load();
    return { load, renderList };
  }

  global.UserDictionariesFeature = { init, load };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
