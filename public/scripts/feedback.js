// тест
/* global analytics */
(function(global){
  'use strict';

  const doc = global.document;
  if (!doc) return;

  const STORAGE_KEY = 'feedbackQueue';
  const SUPPORT_EMAIL = 'blackswanlabs8@gmail.com';
  const MAIL_SUBJECTS = {
    typo: 'Ошибка в тексте — KrokoMim',
    difficulty: 'Несоответствие сложности — KrokoMim',
    other: 'Другая проблема — KrokoMim'
  };
  const CATEGORY_LABELS = {
    typo: 'Ошибка в тексте',
    difficulty: 'Не соответствует уровню сложности',
    other: 'Другая проблема/предложение'
  };
  const MODE_LABELS = {
    quick: 'Быстрый режим',
    team: 'Командный режим',
    home: 'Главное меню'
  };
  const DIFFICULTY_LABELS = {
    easy: 'Лёгкий',
    medium: 'Средний',
    hard: 'Сложный',
    mix: 'Микс'
  };
  const FOCUSABLE_SELECTOR = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const state = {
    initialized: false,
    modal: null,
    panel: null,
    form: null,
    submitButton: null,
    cancelButton: null,
    messageField: null,
    messageCounter: null,
    emailField: null,
    consentField: null,
    categoryInputs: [],
    statusBox: null,
    statusMessage: null,
    mailtoButton: null,
    contextFields: new Map(),
    contextResolver: null,
    currentContext: null,
    open: false,
    lastActiveElement: null,
    queue: [],
    processingQueue: false,
    toastContainer: null
  };

  function ensureRuntimeConfig(){
    const ready = global.RUNTIME_CONFIG_READY;
    if (ready && typeof ready.then === 'function'){
      return ready
        .catch(err => {
          console.warn('Runtime-конфигурация недоступна', err);
          return global.RUNTIME_CONFIG;
        })
        .then(() => {
          const cfg = global.RUNTIME_CONFIG;
          return cfg && typeof cfg === 'object' ? cfg : {};
        });
    }
    const cfg = global.RUNTIME_CONFIG;
    return Promise.resolve(cfg && typeof cfg === 'object' ? cfg : {});
  }

  function resolveApiUrl(path, config){
    if (!config || typeof config !== 'object') return path;
    const base = typeof config.publicApiBaseUrl === 'string' ? config.publicApiBaseUrl.trim() : '';
    if (!base) return path;
    try{
      const url = new URL(path, base);
      return url.toString();
    }catch(err){
      console.warn('Некорректный publicApiBaseUrl в runtime-конфигурации', err);
      return path;
    }
  }

  function init(){
    if (state.initialized) return;
    state.initialized = true;
    buildModal();
    state.queue = readQueue();
    if (global.navigator && global.navigator.onLine !== false){
      processQueue();
    }
    global.addEventListener('online', () => {
      processQueue();
    });
    doc.addEventListener('keydown', handleGlobalKeydown, true);
  }

  function buildModal(){
    const modal = doc.createElement('div');
    modal.className = 'feedback-modal';
    modal.id = 'feedbackModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'feedbackTitle');
    modal.setAttribute('aria-hidden', 'true');

    const backdrop = doc.createElement('div');
    backdrop.className = 'feedback-modal__backdrop';

    const panel = doc.createElement('div');
    panel.className = 'feedback-modal__panel';
    panel.setAttribute('role', 'document');
    panel.setAttribute('tabindex', '-1');

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'feedback-modal__close';
    closeBtn.setAttribute('aria-label', 'Закрыть форму обратной связи');
    closeBtn.innerHTML = '<span aria-hidden="true">✕</span>';

    const form = doc.createElement('form');
    form.className = 'feedback-form';
    form.setAttribute('novalidate', 'novalidate');

    const title = doc.createElement('h2');
    title.className = 'feedback-title';
    title.id = 'feedbackTitle';
    title.textContent = 'Обратная связь';

    const intro = doc.createElement('p');
    intro.className = 'muted';
    intro.textContent = 'Сообщите о проблеме со словом или предложите улучшение.';

    const fieldset = doc.createElement('fieldset');
    fieldset.className = 'feedback-fieldset';
    const legend = doc.createElement('legend');
    legend.textContent = 'Что случилось?';
    fieldset.appendChild(legend);

    ['typo', 'difficulty', 'other'].forEach((value, index) => {
      const label = doc.createElement('label');
      label.className = 'feedback-radio';
      const input = doc.createElement('input');
      input.type = 'radio';
      input.name = 'category';
      input.value = value;
      if (index === 0){
        input.required = true;
      }
      const span = doc.createElement('span');
      span.textContent = CATEGORY_LABELS[value] || value;
      label.appendChild(input);
      label.appendChild(span);
      fieldset.appendChild(label);
      state.categoryInputs.push(input);
    });

    const messageLabel = doc.createElement('label');
    messageLabel.className = 'feedback-label';
    messageLabel.setAttribute('for', 'feedbackMessage');
    messageLabel.textContent = 'Описание';
    const messageHint = doc.createElement('span');
    messageHint.textContent = 'Мин. 10 символов';
    messageLabel.appendChild(messageHint);

    const messageField = doc.createElement('textarea');
    messageField.id = 'feedbackMessage';
    messageField.name = 'message';
    messageField.className = 'feedback-textarea';
    messageField.placeholder = 'Опишите проблему/предложение…';
    messageField.required = true;
    messageField.minLength = 10;
    messageField.maxLength = 2000;
    messageField.rows = 2;
    messageLabel.appendChild(messageField);

    const messageCounter = doc.createElement('div');
    messageCounter.className = 'feedback-counter';
    messageCounter.textContent = '0 / 2000';
    messageLabel.appendChild(messageCounter);

    const emailLabel = doc.createElement('label');
    emailLabel.className = 'feedback-label';
    emailLabel.setAttribute('for', 'feedbackEmail');
    emailLabel.textContent = 'Email (опционально)';
    const emailHint = doc.createElement('span');
    emailHint.textContent = 'Оставьте контакт для ответа.';
    emailLabel.appendChild(emailHint);

    const emailField = doc.createElement('input');
    emailField.id = 'feedbackEmail';
    emailField.name = 'email';
    emailField.type = 'email';
    emailField.className = 'feedback-input';
    emailField.placeholder = 'example@mail.com';
    emailLabel.appendChild(emailField);

    const consentLabel = doc.createElement('label');
    consentLabel.className = 'feedback-consent';
    consentLabel.setAttribute('for', 'feedbackConsent');

    const consentInput = doc.createElement('input');
    consentInput.type = 'checkbox';
    consentInput.id = 'feedbackConsent';
    consentInput.name = 'consent';
    consentInput.required = true;

    const consentText = doc.createElement('span');
    consentText.innerHTML = 'Согласен на обработку данных. <a href="https://yourdomain.tld/privacy" target="_blank" rel="noopener">Политика конфиденциальности</a>';

    consentLabel.appendChild(consentInput);
    consentLabel.appendChild(consentText);

    const contextBox = doc.createElement('div');
    contextBox.className = 'feedback-context';

    const contextFields = [
      ['mode', 'Режим'],
      ['termText', 'Слово'],
      ['termId', 'ID слова'],
      ['difficulty', 'Сложность'],
      ['appVersion', 'Версия приложения'],
      ['language', 'Язык'],
      ['timestamp', 'Время']
    ];
    contextFields.forEach(([key, label]) => {
      const row = doc.createElement('div');
      row.className = 'feedback-context__row';
      const labelEl = doc.createElement('span');
      labelEl.className = 'feedback-context__label';
      labelEl.textContent = label;
      const valueEl = doc.createElement('span');
      valueEl.className = 'feedback-context__value';
      valueEl.dataset.field = key;
      valueEl.textContent = '—';
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      contextBox.appendChild(row);
      state.contextFields.set(key, valueEl);
    });

    const statusBox = doc.createElement('div');
    statusBox.className = 'feedback-status';
    statusBox.hidden = true;
    const statusMessage = doc.createElement('div');
    statusMessage.className = 'feedback-status__message';
    statusBox.appendChild(statusMessage);
    const mailtoButton = doc.createElement('a');
    mailtoButton.className = 'btn ghost feedback-mailto-btn';
    mailtoButton.textContent = 'Отправить через почту';
    mailtoButton.target = '_blank';
    mailtoButton.rel = 'noopener noreferrer';
    mailtoButton.href = '#';
    statusBox.appendChild(mailtoButton);

    const actions = doc.createElement('div');
    actions.className = 'feedback-actions';

    const submitButton = doc.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'btn';
    submitButton.textContent = 'Отправить';

    const cancelButton = doc.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn ghost';
    cancelButton.textContent = 'Отмена';

    actions.appendChild(cancelButton);
    actions.appendChild(submitButton);

    form.appendChild(title);
    form.appendChild(intro);
    form.appendChild(fieldset);
    form.appendChild(messageLabel);
    form.appendChild(emailLabel);
    form.appendChild(consentLabel);
    form.appendChild(actions);
    form.appendChild(contextBox);
    form.appendChild(statusBox);

    panel.appendChild(closeBtn);
    panel.appendChild(form);
    modal.appendChild(backdrop);
    modal.appendChild(panel);
    doc.body.appendChild(modal);

    backdrop.addEventListener('click', () => closeModal());
    closeBtn.addEventListener('click', () => closeModal());
    cancelButton.addEventListener('click', () => closeModal());
    modal.addEventListener('keydown', handleModalKeydown);
    form.addEventListener('submit', handleSubmit);
    messageField.addEventListener('input', updateMessageCounter);

    state.modal = modal;
    state.panel = panel;
    state.form = form;
    state.submitButton = submitButton;
    state.cancelButton = cancelButton;
    state.messageField = messageField;
    state.messageCounter = messageCounter;
    state.emailField = emailField;
    state.consentField = consentInput;
    state.statusBox = statusBox;
    state.statusMessage = statusMessage;
    state.mailtoButton = mailtoButton;

    updateMessageCounter();
  }

  function handleGlobalKeydown(event){
    if (state.open){
      if (event.key === 'Escape'){
        event.preventDefault();
        event.stopPropagation();
        closeModal();
      }
      return;
    }
    if (event.defaultPrevented) return;
    if (event.key && event.key.toLowerCase() === 'f' && !event.altKey && !event.ctrlKey && !event.metaKey){
      const target = event.target;
      if (target && (target.isContentEditable || /input|textarea|select/i.test(target.tagName))){
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      open();
    }
  }

  function handleModalKeydown(event){
    if (!state.open) return;
    if (event.key === 'Tab'){
      trapFocus(event);
    }
  }

  function trapFocus(event){
    const focusable = getFocusableElements();
    if (!focusable.length){
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = doc.activeElement;
    if (event.shiftKey){
      if (active === first || !focusable.includes(active)){
        event.preventDefault();
        last.focus();
      }
    }else if (active === last){
      event.preventDefault();
      first.focus();
    }
  }

  function getFocusableElements(){
    if (!state.panel) return [];
    const elements = Array.from(state.panel.querySelectorAll(FOCUSABLE_SELECTOR));
    return elements.filter(el => isVisible(el));
  }

  function isVisible(el){
    if (!el) return false;
    if (el.hasAttribute('disabled')) return false;
    let current = el;
    while (current && current !== doc.body){
      if (current.hidden) return false;
      const style = global.getComputedStyle ? global.getComputedStyle(current) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')){
        return false;
      }
      current = current.parentElement;
    }
    return true;
  }

  function updateMessageCounter(){
    if (!state.messageField || !state.messageCounter) return;
    const length = state.messageField.value.length;
    state.messageCounter.textContent = `${length} / ${state.messageField.maxLength}`;
  }

  function normalizeContext(raw){
    const appVersion = doc.querySelector('meta[name="app-version"]')?.content || 'unknown';
    const language = doc.documentElement?.lang || 'ru';
    const now = new Date().toISOString();
    const context = {
      mode: 'home',
      termId: null,
      termText: null,
      difficulty: null,
      timestamp: now,
      appVersion,
      language
    };
    if (raw && typeof raw === 'object'){
      if (raw.mode === 'quick' || raw.mode === 'team' || raw.mode === 'home'){
        context.mode = raw.mode;
      }
      if (raw.termId){
        context.termId = String(raw.termId).trim() || null;
      }
      if (typeof raw.termText === 'string' && raw.termText.trim()){
        context.termText = raw.termText.trim();
      }
      if (typeof raw.difficulty === 'string' && raw.difficulty.trim()){
        context.difficulty = raw.difficulty.trim();
      }
      if (typeof raw.timestamp === 'string' && raw.timestamp.trim()){
        context.timestamp = raw.timestamp.trim();
      }
      if (typeof raw.appVersion === 'string' && raw.appVersion.trim()){
        context.appVersion = raw.appVersion.trim();
      }
      if (typeof raw.language === 'string' && raw.language.trim()){
        context.language = raw.language.trim();
      }
    }
    return context;
  }

  function updateContextUI(context){
    state.contextFields.forEach((el, key) => {
      if (!el) return;
      let value = context[key] || '—';
      if (key === 'mode'){
        value = MODE_LABELS[context.mode] || context.mode || '—';
      }else if (key === 'difficulty' && context.difficulty){
        value = DIFFICULTY_LABELS[context.difficulty] || context.difficulty;
      }else if (key === 'timestamp' && context.timestamp){
        const date = new Date(context.timestamp);
        value = Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU') : context.timestamp;
      }
      el.textContent = value || '—';
    });
  }

  function open(contextOverride){
    init();
    const resolved = normalizeContext(contextOverride || (typeof state.contextResolver === 'function' ? state.contextResolver() : null));
    state.currentContext = resolved;
    clearStatus();
    if (state.form){
      state.form.reset();
    }
    updateMessageCounter();
    updateContextUI(resolved);
    state.modal.setAttribute('aria-hidden', 'false');
    doc.body.classList.add('feedback-modal-open');
    state.open = true;
    state.lastActiveElement = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const focusTarget = state.categoryInputs[0] || state.messageField || state.panel;
    global.requestAnimationFrame(() => {
      if (focusTarget && typeof focusTarget.focus === 'function'){
        focusTarget.focus();
      }
    });
    if (global.analytics && typeof global.analytics.track === 'function'){
      try{
        global.analytics.track('feedback_open', resolved);
      }catch(err){
        console.warn('feedback_open analytics error', err);
      }
    }
  }

  function closeModal(){
    if (!state.open) return;
    state.modal.setAttribute('aria-hidden', 'true');
    state.open = false;
    doc.body.classList.remove('feedback-modal-open');
    if (state.form){
      state.form.reset();
    }
    updateMessageCounter();
    clearStatus();
    const target = state.lastActiveElement;
    state.lastActiveElement = null;
    state.currentContext = null;
    if (target && typeof target.focus === 'function'){
      target.focus();
    }
  }

  function clearStatus(){
    if (!state.statusBox) return;
    state.statusBox.hidden = true;
    if (state.statusMessage) state.statusMessage.textContent = '';
    if (state.mailtoButton){
      state.mailtoButton.href = '#';
    }
  }

  function handleSubmit(event){
    event.preventDefault();
    if (!state.form) return;
    clearStatus();
    if (typeof state.form.reportValidity === 'function'){
      if (!state.form.reportValidity()){
        return;
      }
    }else if (!state.form.checkValidity()){
      return;
    }
    const categoryInput = state.categoryInputs.find(input => input.checked);
    if (!categoryInput){
      if (state.categoryInputs[0]) state.categoryInputs[0].focus();
      return;
    }
    const message = state.messageField.value.trim();
    if (message.length < 10){
      state.messageField.focus();
      return;
    }
    const emailRaw = state.emailField.value.trim();
    const context = normalizeContext(state.currentContext);
    const timestamp = new Date().toISOString();
    context.timestamp = timestamp;
    const draft = {
      id: generateId(),
      category: categoryInput.value,
      message,
      email: emailRaw ? emailRaw : undefined,
      consent: true,
      context,
      client: {
        userAgent: global.navigator?.userAgent || '',
        platform: global.navigator?.platform || ''
      },
      createdAt: timestamp,
      status: 'queued'
    };
    setSubmitting(true);
    const trackPayload = { category: draft.category, length: draft.message.length, mode: draft.context.mode };
    const attemptOnline = global.navigator ? global.navigator.onLine !== false : true;
    if (attemptOnline){
      sendDraft(draft)
        .then(() => {
          draft.status = 'sent';
          showToast('Спасибо! Мы получили вашу обратную связь.');
          if (global.analytics && typeof global.analytics.track === 'function'){
            try{ global.analytics.track('feedback_submit', { ...trackPayload, status: 'sent' }); }catch(err){ console.warn('feedback_submit analytics error', err); }
          }
          closeModal();
          setSubmitting(false);
          processQueue();
        })
        .catch(() => {
          enqueueDraft(draft);
          showOfflineStatus(draft);
          showToast('Сохранено офлайн, отправим при подключении.');
          if (global.analytics && typeof global.analytics.track === 'function'){
            try{ global.analytics.track('feedback_submit', { ...trackPayload, status: 'queued' }); }catch(err){ console.warn('feedback_submit analytics error', err); }
          }
          setSubmitting(false);
          processQueue();
        });
    }else{
      enqueueDraft(draft);
      showOfflineStatus(draft);
      showToast('Сохранено офлайн, отправим при подключении.');
      if (global.analytics && typeof global.analytics.track === 'function'){
        try{ global.analytics.track('feedback_submit', { ...trackPayload, status: 'queued' }); }catch(err){ console.warn('feedback_submit analytics error', err); }
      }
      setSubmitting(false);
    }
  }

  function setSubmitting(submitting){
    if (state.submitButton){
      state.submitButton.disabled = submitting;
      state.submitButton.setAttribute('aria-busy', submitting ? 'true' : 'false');
    }
    if (state.cancelButton){
      state.cancelButton.disabled = submitting;
    }
  }

  function showOfflineStatus(draft){
    if (!state.statusBox) return;
    state.statusBox.hidden = false;
    if (state.statusMessage){
      state.statusMessage.textContent = 'Не удалось связаться с сервером. Сохранено офлайн, отправим при подключении или воспользуйтесь почтой.';
    }
    if (state.mailtoButton){
      state.mailtoButton.href = buildMailtoLink(draft);
    }
  }

  function buildMailtoLink(draft){
    const lines = [
      `Категория: ${CATEGORY_LABELS[draft.category] || draft.category}`,
      `Сообщение:\n${draft.message}`,
      `Email: ${draft.email || '—'}`,
      '---',
      `Режим: ${MODE_LABELS[draft.context.mode] || draft.context.mode}`,
      `Слово: ${draft.context.termText || '—'}`,
      `ID слова: ${draft.context.termId || '—'}`,
      `Сложность: ${draft.context.difficulty ? (DIFFICULTY_LABELS[draft.context.difficulty] || draft.context.difficulty) : '—'}`,
      `Время: ${draft.context.timestamp}`,
      `Версия: ${draft.context.appVersion || '—'}`,
      `Язык: ${draft.context.language || '—'}`,
      `Платформа: ${draft.client.platform || '—'}`,
      `User-Agent: ${draft.client.userAgent || '—'}`
    ];
    const body = encodeURIComponent(lines.join('\n'));
    const subjectKey = draft.category;
    const subject = encodeURIComponent(MAIL_SUBJECTS[subjectKey] || 'Feedback KrokoMim');
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  async function sendDraft(draft){
    const payload = {
      category: draft.category,
      message: draft.message,
      email: draft.email || null,
      consent: true,
      context: draft.context,
      client: draft.client
    };
    const config = await ensureRuntimeConfig();
    const endpoint = resolveApiUrl('/api/feedback', config);
    let responseMeta = null;
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(response => {
      responseMeta = { status: response.status, ok: response.ok };
      if (!response.ok){
        return response.text()
          .catch(() => '')
          .then(body => {
            const err = new Error(`HTTP ${response.status}`);
            err.responseBody = body;
            throw err;
          });
      }
      return response.json().catch(() => ({}));
    }).then(data => {
      if (data && data.ok === false){
        const err = new Error('Server returned error');
        err.responseData = data;
        throw err;
      }
      console.info('Feedback API response', { endpoint, status: responseMeta?.status, data });
      return data;
    }).catch(err => {
      console.error('Feedback API request failed', {
        endpoint,
        status: responseMeta?.status,
        error: err?.message,
        responseBody: err?.responseBody,
        responseData: err?.responseData
      });
      throw err;
    });
  }

  function enqueueDraft(draft){
    state.queue.push(draft);
    state.queue = dedupeQueue(state.queue);
    persistQueue();
  }

  function readQueue(){
    try{
      const raw = global.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return dedupeQueue(parsed);
    }catch(err){
      console.warn('Не удалось прочитать очередь обратной связи', err);
      return [];
    }
  }

  function persistQueue(){
    try{
      const serialized = JSON.stringify(state.queue);
      global.localStorage?.setItem(STORAGE_KEY, serialized);
    }catch(err){
      console.warn('Не удалось сохранить очередь обратной связи', err);
    }
  }

  function dedupeQueue(list){
    const map = new Map();
    list.forEach(item => {
      if (!item || !item.id) return;
      const existing = map.get(item.id);
      if (!existing){
        map.set(item.id, item);
        return;
      }
      const currentDate = new Date(existing.createdAt || 0).getTime();
      const nextDate = new Date(item.createdAt || 0).getTime();
      if (nextDate < currentDate){
        map.set(item.id, item);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return aTime - bTime;
    });
  }

  function processQueue(){
    if (state.processingQueue) return;
    if (!state.queue.length) return;
    if (global.navigator && global.navigator.onLine === false) return;
    state.processingQueue = true;
    const queueSnapshot = [...state.queue];
    let sentCount = 0;
    const next = () => {
      if (!queueSnapshot.length){
        if (sentCount){
          showToast('Отправили сохранённую обратную связь.');
        }
        state.processingQueue = false;
        return;
      }
      const draft = queueSnapshot.shift();
      sendDraft(draft)
        .then(() => {
          state.queue = state.queue.filter(item => item.id !== draft.id);
          persistQueue();
          sentCount++;
          next();
        })
        .catch(() => {
          // keep draft in queue, stop processing to retry later
          state.processingQueue = false;
        });
    };
    next();
  }

  function showToast(message){
    if (!state.toastContainer){
      const container = doc.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      doc.body.appendChild(container);
      state.toastContainer = container;
    }
    const toast = doc.createElement('div');
    toast.className = 'toast';
    const text = doc.createElement('div');
    text.className = 'toast__message';
    text.textContent = message;
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast__close';
    closeBtn.setAttribute('aria-label', 'Закрыть уведомление');
    closeBtn.textContent = '×';
    const remove = () => {
      if (toast.parentElement){
        toast.parentElement.removeChild(toast);
      }
    };
    closeBtn.addEventListener('click', remove);
    toast.appendChild(text);
    toast.appendChild(closeBtn);
    state.toastContainer.appendChild(toast);
    global.setTimeout(remove, 6000);
  }

  function generateId(){
    if (global.crypto?.randomUUID){
      return global.crypto.randomUUID();
    }
    return 'feedback-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  init();

  global.Feedback = {
    open,
    setContextResolver(resolver){
      state.contextResolver = typeof resolver === 'function' ? resolver : null;
    },
    registerTrigger(element, resolver){
      if (!element) return;
      element.addEventListener('click', () => {
        const ctx = typeof resolver === 'function' ? resolver() : resolver;
        open(ctx);
      });
    },
    processQueue
  };

})(typeof window !== 'undefined' ? window : this);
