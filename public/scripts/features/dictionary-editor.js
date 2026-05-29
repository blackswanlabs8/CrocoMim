(function(global){
  'use strict';

  let state = null;

  function h(tag, className, text){
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function normalizeItem(item, idx, dictionary){
    const idPrefix = dictionary?.id || 'item';
    return {
      id: String(item?.id || `${idPrefix}_${idx + 1}`),
      term: String(item?.term || item?.word || '').trim(),
      description: String(item?.description || item?.meaning || item?.definition || '').trim(),
      about: String(item?.about || item?.hint || item?.notes || '').trim()
    };
  }

  function setStatus(text, mode){
    if (!state?.statusEl) return;
    state.statusEl.textContent = text || '';
    state.statusEl.classList.remove('is-error', 'is-success');
    if (mode) state.statusEl.classList.add(mode);
  }

  function renderRows(items){
    state.itemsEl.textContent = '';
    const rows = items.length ? items : [{ id: 'new_1', term: '', description: '', about: '' }];
    rows.forEach((item, idx) => {
      const row = h('div', 'dictionary-editor__row');
      row.dataset.itemIndex = String(idx);
      [['term', 'Слово'], ['description', 'Описание'], ['about', 'Как показать']].forEach(([key, labelText]) => {
        const label = h('label', 'dictionary-editor__field');
        label.appendChild(h('span', 'muted', labelText));
        const input = key === 'about' ? h('textarea', 'input') : h('input', 'input');
        input.name = key;
        input.value = item[key] || '';
        if (key === 'about') input.rows = 2;
        label.appendChild(input);
        row.appendChild(label);
      });
      const remove = h('button', 'btn ghost dictionary-editor__remove', 'Удалить строку');
      remove.type = 'button';
      remove.addEventListener('click', () => row.remove());
      row.appendChild(remove);
      state.itemsEl.appendChild(row);
    });
  }

  function collectItems(){
    return Array.from(state.itemsEl.querySelectorAll('.dictionary-editor__row'))
      .map((row, idx) => {
        const term = row.querySelector('[name="term"]')?.value.trim() || '';
        const description = row.querySelector('[name="description"]')?.value.trim() || '';
        const about = row.querySelector('[name="about"]')?.value.trim() || '';
        return { id: `${state.currentId}_${idx + 1}`, term, description, about };
      })
      .filter(item => item.term);
  }

  async function open(id){
    if (!state?.root || !id) return;
    state.currentId = String(id);
    state.root.hidden = false;
    setStatus('Загрузка словаря…');
    state.form.hidden = true;
    try{
      const dictionary = await state.api.getUserDictionary(id);
      state.currentDictionary = dictionary;
      state.titleEl.value = dictionary?.title || '';
      state.topicEl.value = dictionary?.topic || '';
      state.difficultyEl.value = dictionary?.difficulty || 'medium';
      renderRows((Array.isArray(dictionary?.items) ? dictionary.items : []).map((item, idx) => normalizeItem(item, idx, dictionary)));
      state.form.hidden = false;
      setStatus('');
      state.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }catch(err){
      if (err?.status === 401 && state.onAuthRequired) state.onAuthRequired(err);
      setStatus(err?.message || 'Не удалось загрузить словарь', 'is-error');
    }
  }

  async function save(){
    const items = collectItems();
    if (!items.length){
      setStatus('Добавьте хотя бы одно слово', 'is-error');
      return;
    }
    const payload = {
      ...(state.currentDictionary || {}),
      title: state.titleEl.value.trim() || 'Мой словарь',
      topic: state.topicEl.value.trim(),
      difficulty: state.difficultyEl.value,
      items
    };
    try{
      setStatus('Сохраняем словарь…');
      await state.api.updateUserDictionary(state.currentId, payload);
      setStatus('Словарь сохранён', 'is-success');
      if (state.onChanged) await state.onChanged();
    }catch(err){
      if (err?.status === 401 && state.onAuthRequired) state.onAuthRequired(err);
      setStatus(err?.message || 'Не удалось сохранить словарь', 'is-error');
    }
  }

  async function remove(){
    if (!state.currentId) return;
    if (!global.confirm('Удалить этот словарь?')) return;
    try{
      setStatus('Удаляем словарь…');
      await state.api.deleteUserDictionary(state.currentId);
      setStatus('Словарь удалён', 'is-success');
      state.form.hidden = true;
      if (state.onChanged) await state.onChanged();
    }catch(err){
      if (err?.status === 401 && state.onAuthRequired) state.onAuthRequired(err);
      setStatus(err?.message || 'Не удалось удалить словарь', 'is-error');
    }
  }

  function init(options = {}){
    const root = document.getElementById(options.rootId || 'dictionaryEditor');
    if (!root) return null;
    const api = options.api || global.DictionaryApi;
    root.textContent = '';
    const title = h('div', 'menu-block-title', 'Редактор словаря');
    const status = h('div', 'custom-gen-status');
    status.setAttribute('aria-live', 'polite');
    const form = h('div', 'dictionary-editor stack');
    form.hidden = true;

    const meta = h('div', 'dictionary-editor__meta');
    const titleField = h('input', 'input');
    titleField.placeholder = 'Название';
    const topicField = h('input', 'input');
    topicField.placeholder = 'Тема';
    const difficultyField = h('select', 'input');
    [['easy', 'Лёгкий'], ['medium', 'Средний'], ['hard', 'Сложный']].forEach(([value, label]) => {
      const option = h('option', '', label);
      option.value = value;
      difficultyField.appendChild(option);
    });
    meta.append(titleField, topicField, difficultyField);

    const items = h('div', 'dictionary-editor__items stack');
    const actions = h('div', 'dictionary-actions');
    const addBtn = h('button', 'btn ghost', 'Добавить слово');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      const rows = collectItems();
      rows.push({ id: `new_${rows.length + 1}`, term: '', description: '', about: '' });
      renderRows(rows);
    });
    const saveBtn = h('button', 'btn', 'Сохранить');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', save);
    const deleteBtn = h('button', 'btn warn', 'Удалить словарь');
    deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', remove);
    actions.append(addBtn, saveBtn, deleteBtn);
    form.append(meta, items, actions);
    root.append(title, status, form);

    state = {
      root,
      api,
      form,
      statusEl: status,
      titleEl: titleField,
      topicEl: topicField,
      difficultyEl: difficultyField,
      itemsEl: items,
      onChanged: options.onChanged,
      onAuthRequired: options.onAuthRequired,
      currentId: null,
      currentDictionary: null
    };
    root.hidden = true;
    return { open, save, remove };
  }

  global.DictionaryEditorFeature = { init, open };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
