// test
// тест
const dictionaryService = (typeof globalThis !== 'undefined' && globalThis.DictionaryService)
  ? globalThis.DictionaryService
  : null;

if (!dictionaryService){
  console.error('Не удалось найти сервис словарей. Проверьте подключение public/scripts/dicts.js.');
}

const dictionaryState = {
  ready: false,
  list: [],
  map: new Map(),
  promise: null
};
const dictionarySelectors = new Set();
const DIFFICULTY_ORDER = ['easy','medium','hard'];
const ALL_DIFFICULTIES = [...DIFFICULTY_ORDER, 'mix'];
const DIFFICULTY_LABELS = {
  easy: 'Лёгкий',
  medium: 'Средний',
  hard: 'Сложный',
  mix: 'Микс'
};
const CUSTOM_DICTIONARY_META = {
  id: 'custom',
  title: 'Свой словарь',
  description: 'Вставьте слова ниже',
  icon: 'edit'
};

const ICON_SANITIZE_RE = /[^A-Za-zА-Яа-яЁё0-9]/g;

function getDictionaryIconText(meta){
  if (!meta) return '';
  const explicit = typeof meta.iconText === 'string' ? meta.iconText.trim() : '';
  if (explicit) return explicit;
  const source = typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : (meta.id || '');
  if (!source) return '';
  const words = source
    .split(/\s+/)
    .map(word => word.replace(ICON_SANITIZE_RE, ''))
    .filter(Boolean);
  let label = '';
  if (words.length === 1){
    label = words[0].slice(0, 2);
  }else if (words.length > 1){
    label = words.slice(0, 2).map(word => word[0]).join('');
    if (label.length < 2){
      label = words.join('').slice(0, 2);
    }
  }
  if (!label){
    const fallback = (meta.id || '').replace(ICON_SANITIZE_RE, '');
    label = fallback.slice(0, 2);
  }
  return label ? label.toLocaleUpperCase('ru-RU') : '';
}

function createDictionaryIconElement(meta, className){
  if (!meta) return null;
  const iconName = typeof meta.icon === 'string' ? meta.icon.trim() : '';
  const baseClasses = typeof className === 'string' ? className.split(/\s+/).filter(Boolean) : [];
  if (iconName){
    const span = document.createElement('span');
    span.classList.add(...baseClasses, 'material-symbols-rounded');
    span.textContent = iconName;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  const text = getDictionaryIconText(meta);
  if (!text) return null;
  const span = document.createElement('span');
  span.classList.add(...baseClasses, 'dict-icon--text');
  span.textContent = text;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function ensureDictionaryIndex(){
  if (!dictionaryService){
    dictionaryState.ready = true;
    dictionaryState.list = [];
    dictionaryState.map = new Map();
    if (!dictionaryState.promise){
      dictionaryState.promise = Promise.resolve([]);
    }
    return dictionaryState.promise;
  }
  if (!dictionaryState.promise){
    dictionaryState.promise = Promise.resolve()
      .then(()=> dictionaryService.getDictionaries())
      .then(list => {
        dictionaryState.list = Array.isArray(list) ? list : [];
        dictionaryState.map = new Map(dictionaryState.list.map(item => [item.id, item]));
        dictionaryState.ready = true;
        return dictionaryState.list;
      })
      .catch(err => {
        console.error('Не удалось получить список словарей:', err);
        dictionaryState.list = [];
        dictionaryState.map = new Map();
        dictionaryState.ready = true;
        return [];
      });
  }
  return dictionaryState.promise;
}

function getDictionaryMeta(id){
  return dictionaryState.map.get(id) || null;
}

async function loadDictionaryEntries(dictId, difficulty){
  if (!dictionaryService) throw new Error('Сервис словарей недоступен.');
  await ensureDictionaryIndex();
  const normalizedDifficulty = difficulty || 'easy';
  try{
    const entries = await dictionaryService.getWords(dictId, normalizedDifficulty);
    return Array.isArray(entries) ? entries : [];
  }catch(err){
    console.error(`Не удалось загрузить словарь ${dictId}/${normalizedDifficulty}:`, err);
    throw err;
  }
}

// --- Utilities & state ---
const $ = sel => document.querySelector(sel);
const VIEWS = ['viewMenu','viewQuickGame','viewTeamSetup','viewTeamGame'];
const menuFeedbackBtn = $('#menuFeedbackBtn');
let screen = 'viewMenu';
let qBreadcrumbContext = null;
let tBreadcrumbContext = null;
let qTimerId = null;
let qTimerRunning = false;
let tTimerId = null;
const WORD_PLACEHOLDER = '—';
const WORD_SECRET_PLACEHOLDER = '•••';
const WORD_DESCRIPTION_FALLBACK = 'Описание недоступно';
const WORD_DESCRIPTION_HIDDEN = 'Слово скрыто';
const WORD_HELP_FALLBACK = 'Подсказка недоступна';
// Версия приложения обновлена до 0.5.3, синхронизирована с бекендом.
const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content || 'unknown';
const APP_LANGUAGE = document.documentElement?.lang || 'ru';
const versionBadgeEl = document.getElementById('versionBadge');
const BACKEND_VERSION_URL = 'https://crocomim.ru/test/api/version';

function updateVersionBadge(text, options = {}){
  if (!versionBadgeEl) return;
  const safeText = typeof text === 'string' && text.trim() ? text.trim() : '';
  versionBadgeEl.textContent = safeText || 'Версия недоступна';
  if (options.title){
    versionBadgeEl.title = options.title;
  }
}

async function fetchBackendVersion(){
  if (!versionBadgeEl) return;
  try{
    updateVersionBadge('Версия загружается…');
    const response = await fetch(BACKEND_VERSION_URL, { cache: 'no-store' });
    if (!response.ok){
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const version = typeof payload?.version === 'string' ? payload.version.trim() : '';
    if (version){
      updateVersionBadge(`v${version}`, { title: `Версия: ${version}` });
    }else{
      updateVersionBadge('Версия недоступна');
    }
  }catch(err){
    console.error('Не удалось получить версию бэкенда', err);
    updateVersionBadge('Версия недоступна');
  }
}

function updateWordView(view, { entry, hidden, helpState }){
  const hasEntry = !!entry && typeof entry.term === 'string' && entry.term.trim().length;
  const isHidden = !!hidden;
  if (view.feedbackBtn){
    const canSend = hasEntry;
    view.feedbackBtn.disabled = !canSend;
    view.feedbackBtn.setAttribute('aria-disabled', canSend ? 'false' : 'true');
  }
  if (view.word){
    if (!hasEntry){
      view.word.textContent = WORD_PLACEHOLDER;
    }else{
      view.word.textContent = isHidden ? WORD_SECRET_PLACEHOLDER : entry.term;
    }
  }
  if (view.description){
    if (!hasEntry){
      view.description.textContent = WORD_PLACEHOLDER;
      view.description.classList.add('is-empty');
    }else if (isHidden){
      view.description.textContent = WORD_DESCRIPTION_HIDDEN;
      view.description.classList.add('is-empty');
    }else{
      const text = entry.description && entry.description.trim() ? entry.description.trim() : WORD_DESCRIPTION_FALLBACK;
      view.description.textContent = text;
      view.description.classList.toggle('is-empty', !entry.description || !entry.description.trim());
    }
  }
  const hasHelp = hasEntry && !isHidden && entry?.about && entry.about.trim().length;
  if (view.helpBtn){
    view.helpBtn.disabled = !hasHelp;
    view.helpBtn.classList.toggle('is-disabled', !hasHelp);
    const expanded = hasHelp && helpState?.open;
    view.helpBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    view.helpBtn.setAttribute('title', hasHelp ? 'Помочь' : WORD_HELP_FALLBACK);
    if (!hasHelp && helpState){
      helpState.open = false;
    }
  }
  if (view.helpBox){
    const shouldShow = hasHelp && helpState?.open;
    if (shouldShow){
      view.helpBox.textContent = entry.about.trim();
      view.helpBox.hidden = false;
    }else{
      view.helpBox.hidden = true;
      view.helpBox.textContent = hasHelp ? entry.about.trim() : '';
    }
  }
}

function initDifficultyControls(state){
  if (!state) return;
  const container = state.difficultyContainer;
  if (!container) return;
  const buttons = {};
  container.querySelectorAll('.difficulty-btn').forEach(btn => {
    const level = btn.dataset.level;
    if (!level) return;
    buttons[level] = btn;
  });
  state.difficultyButtons = buttons;

  const apply = (level) => {
    if (!buttons[level]) return;
    state.difficulty = level;
    Object.entries(buttons).forEach(([key, button]) => {
      const isActive = key === level;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  state.setDifficulty = (level, opts = {}) => {
    if (!buttons[level]) return;
    apply(level);
    if (!opts.silent && typeof state.onDifficultyChange === 'function'){
      state.onDifficultyChange(level);
    }
  };

  Object.entries(buttons).forEach(([level, btn]) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      state.setDifficulty(level);
    });
  });

  const defaultLevel = buttons.easy ? 'easy'
    : buttons.medium ? 'medium'
    : buttons.hard ? 'hard'
    : buttons.mix ? 'mix'
    : null;
  if (defaultLevel){
    state.setDifficulty(defaultLevel, { silent:true });
  }
}

function getOrderedDifficulties(meta){
  if (!meta) return [];
  const keys = Object.keys(meta.difficulties || {});
  const ordered = DIFFICULTY_ORDER.filter(level => keys.includes(level));
  const extras = keys.filter(level => !DIFFICULTY_ORDER.includes(level));
  return [...ordered, ...extras];
}

function sanitizeWordNames(list){
  if (!Array.isArray(list)) return [];
  return list
    .map(item => typeof item === 'string' ? item : (item && typeof item.term === 'string' ? item.term : ''))
    .filter(Boolean);
}

function sanitizeSessionWord(entry){
  if (!entry || typeof entry.term !== 'string') return null;
  const term = entry.term.trim();
  if (!term) return null;
  return {
    term,
    description: typeof entry.description === 'string' ? entry.description : '',
    about: typeof entry.about === 'string' ? entry.about : '',
    dictionaryId: typeof entry.dictionaryId === 'string' ? entry.dictionaryId : '',
    id: typeof entry.id === 'string' ? entry.id : '',
    difficulty: typeof entry.difficulty === 'string' ? entry.difficulty : ''
  };
}

function sanitizeBreadcrumbContext(context){
  if (!context || typeof context !== 'object') return null;
  const selectedIds = Array.isArray(context.selectedIds)
    ? context.selectedIds.filter(id => typeof id === 'string')
    : [];
  const includeCustom = !!context.includeCustom;
  const difficulty = typeof context.difficulty === 'string' ? context.difficulty : '';
  if (!selectedIds.length && !includeCustom && !difficulty) return null;
  return {
    selectedIds,
    includeCustom,
    difficulty
  };
}

function sanitizeQuickSession(raw){
  if (!raw || typeof raw !== 'object') return null;
  const words = Array.isArray(raw.words)
    ? raw.words.map(sanitizeSessionWord).filter(Boolean)
    : [];
  if (!words.length) return null;
  const indexRaw = Number(raw.index);
  let index = Number.isFinite(indexRaw) ? Math.trunc(indexRaw) : 0;
  index = Math.min(Math.max(index, 0), words.length - 1);
  const hit = Number.isFinite(Number(raw.hit)) ? Math.max(0, Math.trunc(Number(raw.hit))) : 0;
  const miss = Number.isFinite(Number(raw.miss)) ? Math.max(0, Math.trunc(Number(raw.miss))) : 0;
  const targetRaw = raw.target;
  let target = null;
  if (targetRaw !== null && targetRaw !== undefined){
    const numeric = Number(targetRaw);
    if (Number.isFinite(numeric) && numeric >= 0){
      target = Math.trunc(numeric);
    }
  }
  const timerRemaining = Number.isFinite(Number(raw.timerRemaining))
    ? Math.max(0, Math.trunc(Number(raw.timerRemaining)))
    : 0;
  const timerSetting = Number.isFinite(Number(raw.timerSetting)) && Number(raw.timerSetting) > 0
    ? Math.trunc(Number(raw.timerSetting))
    : 0;
  return {
    words,
    index,
    hide: !!raw.hide,
    helpOpen: !!raw.helpOpen,
    hit,
    miss,
    hitWords: sanitizeWordNames(raw.hitWords),
    missWords: sanitizeWordNames(raw.missWords),
    target,
    timerEnabled: !!raw.timerEnabled,
    timerRunning: !!raw.timerRunning,
    timerRemaining,
    breadcrumbContext: sanitizeBreadcrumbContext(raw.breadcrumbContext),
    timerSetting,
    difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : '',
    customSelected: !!raw.customSelected,
    selectedDictionaries: Array.isArray(raw.selectedDictionaries)
      ? raw.selectedDictionaries.filter(id => typeof id === 'string')
      : [],
    customText: typeof raw.customText === 'string' ? raw.customText : ''
  };
}

function sanitizeTeamSession(raw){
  if (!raw || typeof raw !== 'object') return null;
  const words = Array.isArray(raw.words)
    ? raw.words.map(sanitizeSessionWord).filter(Boolean)
    : [];
  if (!words.length) return null;
  const indexRaw = Number(raw.index);
  let index = Number.isFinite(indexRaw) ? Math.trunc(indexRaw) : -1;
  if (index < -1) index = -1;
  if (words.length && index >= words.length) index = words.length - 1;
  const turnRaw = Number(raw.turn);
  const turn = Number.isFinite(turnRaw) && turnRaw >= 0 ? Math.trunc(turnRaw) : 0;
  const timerRemaining = Number.isFinite(Number(raw.timerRemaining))
    ? Math.max(0, Math.trunc(Number(raw.timerRemaining)))
    : 0;
  const timerSetting = Number.isFinite(Number(raw.timerSetting)) && Number(raw.timerSetting) > 0
    ? Math.trunc(Number(raw.timerSetting))
    : 0;
  const pointGoalRaw = Number(raw.teamPointGoal);
  const teamPointGoal = Number.isFinite(pointGoalRaw) && pointGoalRaw >= 0
    ? Math.trunc(pointGoalRaw)
    : 0;
  return {
    words,
    index,
    hide: !!raw.hide,
    helpOpen: !!raw.helpOpen,
    turn,
    roundActive: !!raw.roundActive,
    timerExpired: !!raw.timerExpired,
    timerEnabled: !!raw.timerEnabled,
    timerRunning: !!raw.timerRunning,
    timerRemaining,
    teamPointsEnabled: !!raw.teamPointsEnabled,
    teamPointGoal,
    breadcrumbContext: sanitizeBreadcrumbContext(raw.breadcrumbContext),
    statusText: typeof raw.statusText === 'string' ? raw.statusText : '',
    timerSetting,
    difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : '',
    customSelected: !!raw.customSelected,
    selectedDictionaries: Array.isArray(raw.selectedDictionaries)
      ? raw.selectedDictionaries.filter(id => typeof id === 'string')
      : [],
    customText: typeof raw.customText === 'string' ? raw.customText : ''
  };
}

function ensureDictionarySummaryStructure(state){
  if (!state?.dictSummary) return null;
  const summary = state.dictSummary;
  if (!summary.dataset.summaryReady){
    summary.dataset.summaryReady = '1';
  }
  if (!state.dictToggleButton){
    let toggle = summary.querySelector('.dict-summary-toggle');
    if (!toggle){
      toggle = document.createElement('button');
      summary.insertBefore(toggle, summary.firstChild || null);
    }
    toggle.type = 'button';
    toggle.classList.add('dict-summary-toggle');
    toggle.textContent = 'Выбрать';
    toggle.setAttribute('aria-haspopup', 'true');
    if (!toggle.dataset.boundToggle){
      toggle.addEventListener('click', () => {
        setDictionarySelectorOpen(state, !state.isSelectorOpen);
      });
      toggle.dataset.boundToggle = '1';
    }
    state.dictToggleButton = toggle;
  }
  const controlsTarget = state.dictPanel?.id || state.dictGrid?.id;
  if (state.dictToggleButton && controlsTarget){
    state.dictToggleButton.setAttribute('aria-controls', controlsTarget);
    state.dictToggleButton.setAttribute('aria-expanded', state.isSelectorOpen ? 'true' : 'false');
  }
  if (!state.dictSummaryBody){
    let body = summary.querySelector('.dict-summary-body');
    if (!body){
      body = document.createElement('div');
      body.className = 'dict-summary-body';
      summary.appendChild(body);
    }
    state.dictSummaryBody = body;
  }
  return state.dictSummaryBody;
}

function ensureDictionaryActions(state){
  if (!state?.dictPanel) return null;
  if (!state.dictActions){
    let actions = state.dictPanel.querySelector('.dict-actions');
    if (!actions){
      actions = document.createElement('div');
      actions.className = 'dict-actions';
      state.dictPanel.appendChild(actions);
    }
    let okButton = actions.querySelector('.dict-ok-btn');
    if (!okButton){
      okButton = document.createElement('button');
      okButton.type = 'button';
      okButton.className = 'btn ghost dict-ok-btn';
      okButton.textContent = 'Ок';
      actions.appendChild(okButton);
    }
    if (!okButton.dataset.boundOk){
      okButton.addEventListener('click', () => {
        setDictionarySelectorOpen(state, false);
        if (state.dictToggleButton){
          state.dictToggleButton.focus();
        }
      });
      okButton.dataset.boundOk = '1';
    }
    state.dictActions = actions;
    state.dictOkButton = okButton;
  }
  return state.dictActions;
}

function setDictionarySelectorOpen(state, open){
  if (!state?.dictContainer) return;
  const isOpen = !!open;
  if (isOpen){
    dictionarySelectors.forEach(other => {
      if (!other || other === state) return;
      if (other.isSelectorOpen){
        setDictionarySelectorOpen(other, false);
      }
    });
  }
  state.isSelectorOpen = isOpen;
  state.dictContainer.classList.toggle('is-open', isOpen);
  if (state.dictPanel){
    state.dictPanel.hidden = !isOpen;
    state.dictPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }
  if (state.dictGrid){
    state.dictGrid.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }
  if (state.dictActions){
    state.dictActions.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }
  if (state.dictToggleButton){
    state.dictToggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    state.dictToggleButton.classList.toggle('is-active', isOpen);
  }
}

function renderDictionarySummary(state){
  if (!state?.dictSummary) return;
  const body = ensureDictionarySummaryStructure(state);
  if (!body) return;
  body.innerHTML = '';
  const summary = state.dictSummary;
  const selectedMeta = [];
  if (state?.selectedDictionaries){
    state.selectedDictionaries.forEach(id => {
      const meta = getDictionaryMeta(id);
      if (meta) selectedMeta.push(meta);
    });
  }
  if (state?.customSelected){
    selectedMeta.push(CUSTOM_DICTIONARY_META);
  }
  const hasSelection = selectedMeta.length > 0;
  summary.classList.toggle('has-selection', hasSelection);
  body.hidden = !hasSelection;
  body.setAttribute('aria-hidden', hasSelection ? 'false' : 'true');
  if (!hasSelection){
    return;
  }
  const chips = document.createElement('div');
  chips.className = 'dict-chips';
  selectedMeta.forEach(meta => {
    const chip = document.createElement('div');
    chip.className = 'dict-chip';
    const iconEl = createDictionaryIconElement(meta, 'dict-chip-icon');
    if (iconEl) chip.appendChild(iconEl);
    const label = document.createElement('span');
    label.className = 'dict-chip-label';
    label.textContent = meta.title || meta.id;
    chip.appendChild(label);
    chips.appendChild(chip);
  });
  body.appendChild(chips);
}

function updateCustomBoxVisibility(state){
  if (!state?.customBox) return;
  state.customBox.style.display = state.customSelected ? 'block' : 'none';
}

function computeDictionaryAvailability(dictIds){
  const ids = Array.isArray(dictIds) ? dictIds : [];
  const availableSet = new Set();
  let mixAvailable = false;
  ids.forEach(id => {
    const meta = getDictionaryMeta(id);
    if (!meta) return;
    const diffs = getOrderedDifficulties(meta);
    diffs.forEach(level => availableSet.add(level));
    if (Object.keys(meta.difficulties || {}).length > 0){
      mixAvailable = true;
    }
  });
  const ordered = DIFFICULTY_ORDER.filter(level => availableSet.has(level));
  const extras = [...availableSet].filter(level => !DIFFICULTY_ORDER.includes(level));
  return { available: [...ordered, ...extras], mix: mixAvailable && ids.length > 0 };
}

function updateDifficultyAvailabilityForSelection(state){
  if (!state?.difficultyContainer) return;
  const selectedIds = Array.from(state.selectedDictionaries || []);
  if (!selectedIds.length){
    state.difficultyContainer.style.display = 'none';
    return;
  }
  state.difficultyContainer.style.display = '';
  const { available, mix } = computeDictionaryAvailability(selectedIds);
  if (!state.difficultyButtons) state.difficultyButtons = {};
  Object.entries(state.difficultyButtons).forEach(([level, btn]) => {
    if (!btn) return;
    const allowed = level === 'mix' ? mix : available.includes(level);
    btn.disabled = !allowed;
    btn.classList.toggle('is-disabled', !allowed);
    if (!allowed){
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('is-active');
    }
  });
  let target = state.difficulty || 'easy';
  if (target === 'mix' && !mix){
    target = available[0] || null;
  }else if (target !== 'mix' && !available.includes(target)){
    target = available[0] || (mix ? 'mix' : null);
  }
  if (!target){
    const fallback = ['easy','medium','hard','mix'];
    target = fallback.find(level => state.difficultyButtons?.[level] && !state.difficultyButtons[level].disabled) || state.difficulty;
  }
  if (target && state.setDifficulty){
    state.setDifficulty(target, { silent:true });
  }
}

function applyDictionarySelectionChange(state, opts = {}){
  if (!state) return;
  if (!state.selectedDictionaries) state.selectedDictionaries = new Set();
  if (!state.dictElements) state.dictElements = new Map();
  state.dictElements.forEach(({ label, checkbox }) => {
    if (!label || !checkbox) return;
    const selected = state.selectedDictionaries.has(checkbox.value);
    label.classList.toggle('is-selected', selected);
    checkbox.checked = selected;
  });
  if (state.customLabel && state.customToggle){
    state.customLabel.classList.toggle('is-selected', !!state.customSelected);
    state.customToggle.checked = !!state.customSelected;
  }
  renderDictionarySummary(state);
  updateDifficultyAvailabilityForSelection(state);
  updateCustomBoxVisibility(state);
  if (typeof state.onDictionaryChange === 'function' && opts.emit !== false){
    const payload = [...state.selectedDictionaries];
    if (state.customSelected) payload.push(CUSTOM_DICTIONARY_META.id);
    state.onDictionaryChange(payload);
  }
  if (!opts.skipPersist){
    if (state === qs){
      persistQuickSettings();
    }else if (state === ts){
      persistTeamSettings();
    }
  }
}

function setDictionarySelection(state, ids, opts = {}){
  if (!state) return;
  const next = new Set(Array.isArray(ids) ? ids.filter(id => state.dictElements?.has(id)) : []);
  state.selectedDictionaries = next;
  applyDictionarySelectionChange(state, opts);
}

function setCustomSelection(state, selected, opts = {}){
  if (!state) return;
  state.customSelected = !!selected;
  if (state.customToggle) state.customToggle.checked = state.customSelected;
  applyDictionarySelectionChange(state, opts);
}

function createDictionaryCard(meta, state){
  const label = document.createElement('label');
  label.className = 'dict-card';
  label.setAttribute('data-dict-id', meta.id);
  if (meta.description){
    label.title = meta.description;
  }
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = meta.id;
  checkbox.className = 'dict-card-input';
  checkbox.setAttribute('aria-label', meta.title || meta.id);
  label.appendChild(checkbox);

  const check = document.createElement('span');
  check.className = 'dict-card-check';
  check.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 10.5l3.5 3.5L15 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  label.appendChild(check);

  const iconEl = createDictionaryIconElement(meta, 'dict-card-icon');
  if (iconEl) label.appendChild(iconEl);

  const titleEl = document.createElement('span');
  titleEl.className = 'dict-card-title';
  titleEl.textContent = meta.title || meta.id;
  label.appendChild(titleEl);

  checkbox.addEventListener('change', () => {
    if (checkbox.checked){
      state.selectedDictionaries.add(meta.id);
    }else{
      state.selectedDictionaries.delete(meta.id);
    }
    applyDictionarySelectionChange(state);
  });

  if (!state.dictElements) state.dictElements = new Map();
  state.dictElements.set(meta.id, { meta, label, checkbox });
  return label;
}

function createCustomDictionaryCard(state){
  const meta = CUSTOM_DICTIONARY_META;
  const label = document.createElement('label');
  label.className = 'dict-card dict-card-custom';
  label.setAttribute('data-dict-id', meta.id);
  if (meta.description){
    label.title = meta.description;
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = meta.id;
  checkbox.className = 'dict-card-input';
  checkbox.setAttribute('aria-label', meta.title);
  label.appendChild(checkbox);

  const check = document.createElement('span');
  check.className = 'dict-card-check';
  check.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 10.5l3.5 3.5L15 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  label.appendChild(check);

  const iconEl = createDictionaryIconElement(meta, 'dict-card-icon');
  if (iconEl) label.appendChild(iconEl);

  const titleEl = document.createElement('span');
  titleEl.className = 'dict-card-title';
  titleEl.textContent = meta.title;
  label.appendChild(titleEl);

  checkbox.addEventListener('change', () => {
    state.customSelected = checkbox.checked;
    applyDictionarySelectionChange(state);
  });

  state.customToggle = checkbox;
  state.customLabel = label;
  return label;
}

function setupDictionarySelector(state){
  if (!state || !state.dictGrid) return;
  if (!state.dictPanel && state.dictContainer){
    state.dictPanel = state.dictContainer.querySelector('.dict-dropdown-panel');
  }
  dictionarySelectors.add(state);
  state.dictElements = new Map();
  state.selectedDictionaries = state.selectedDictionaries || new Set();
  const grid = state.dictGrid;
  grid.innerHTML = '';
  if (dictionaryState.list.length){
    dictionaryState.list.forEach(meta => {
      grid.appendChild(createDictionaryCard(meta, state));
    });
  }else{
    const empty = document.createElement('div');
    empty.className = 'dict-empty muted';
    empty.textContent = 'Словари недоступны';
    grid.appendChild(empty);
  }
  grid.appendChild(createCustomDictionaryCard(state));
  ensureDictionaryActions(state);
  ensureDictionarySummaryStructure(state);
  applyDictionarySelectionChange(state, { emit:false });
  setDictionarySelectorOpen(state, false);
  if (state.dictPanel){
    state.dictPanel.setAttribute('aria-hidden', 'true');
  }
}
const backBtn = $('#btnBack');
const helpBtn = $('#btnHelp');
const modeQuickBtn = $('#modeQuick');
const themeSlider = $('#themeSlider');
const themeSunBtn = $('#themeSun');
const themeMoonBtn = $('#themeMoon');
const themeContainer = $('#themeContainer');
const headerTitle = $('.title');
const bodyEl = document.body;
const helpOverlay = $('#helpOverlay');
const helpDialog = helpOverlay ? helpOverlay.querySelector('.help-overlay__dialog') : null;
const HELP_FALLBACK_TEXT = [
  '🐊 CrocoMim — игра, где показываешь слова с помощью жестов и мимики, без слов! Крокодил и Пантомима.',
  '',
  '🎮 Режимы',
  '• ⚡ Быстрый — один ведущий, счёт + таймер (опционально).',
  '• 👥 Команда — по очереди, добавьте команды (игроки или другие названия) с таблицей очков.',
  '',
  '📚 Слова',
  '• 📖 Выбери словари → слова перемешаются в одну колоду.',
  '• 🔁 Сложность: Лёгкий / Средний / Сложный / Микс (все уровни сложности смешаются).',
  '• ✏️ Свой словарь — вставь слова через запятую или с новой строки.',
  '',
  '🛠 Во время игры',
  '• 💡 Подсказка — подсказка, как можно показать (если есть).',
  '• 🌐 Значение — откроет Википедию с этим словом (если есть).',
  '',
  '⚙ Настройки',
  '• ⏱ Таймер: 30/60/90… сек.',
  '• 🎯 Очки до победы.',
  '• 🌗 Тема: светлая / тёмная.',
  '',
  '❓ Справка',
  'Нажми «?» в шапке — инструкция всегда рядом!',
  '',
  '🎭 Жестикулируй! Угадывай! Получай удовольствие!'
].join('\n');
const helpState = { lastFocused:null, bodyOverflow:'' };
const isHelpOpen = () => !!(helpOverlay && !helpOverlay.hidden);
const openHelp = () => {
  if (!helpOverlay){
    alert(HELP_FALLBACK_TEXT);
    return;
  }
  if (isHelpOpen()) return;
  helpState.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  helpState.bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  helpOverlay.hidden = false;
  requestAnimationFrame(() => {
    if (helpDialog && typeof helpDialog.focus === 'function'){
      helpDialog.focus();
    }
  });
};
const closeHelp = () => {
  if (!helpOverlay || helpOverlay.hidden) return;
  helpOverlay.hidden = true;
  document.body.style.overflow = helpState.bodyOverflow || '';
  const target = helpState.lastFocused && typeof helpState.lastFocused.focus === 'function'
    ? helpState.lastFocused
    : helpBtn;
  if (target && typeof target.focus === 'function'){
    target.focus();
  }
};
if (helpOverlay){
  helpOverlay.addEventListener('click', event => {
    const el = event.target instanceof Element ? event.target.closest('[data-help-close]') : null;
    if (el){
      event.preventDefault();
      closeHelp();
    }
  });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && isHelpOpen()){
    event.preventDefault();
    closeHelp();
  }
});
const THEME_KEY = 'croc-theme';
const SCREEN_KEY = 'croc-screen';
const QUICK_STATS_KEY = 'croc-quick-stats';
const TEAM_STATS_KEY = 'croc-team-stats';
const QUICK_SETTINGS_KEY = 'croc-quick-settings';
const TEAM_SETTINGS_KEY = 'croc-team-settings';
const QUICK_SESSION_KEY = 'croc-quick-session';
const TEAM_SESSION_KEY = 'croc-team-session';

let quickSavedProfile = null;
let teamSavedProfile = null;
let quickInitialSelectedIds = [];
let quickInitialCustomSelected = false;
let quickInitialDifficulty = null;
let quickInitialTimerEnabled = false;
let quickInitialPtsEnabled = false;
let teamInitialSelectedIds = [];
let teamInitialCustomSelected = false;
let teamInitialDifficulty = null;
let teamInitialTimerEnabled = false;
let teamInitialPtsEnabled = false;
let quickPendingSession = null;
let teamPendingSession = null;

const syncThemeControls = mode => {
  if (themeSlider) themeSlider.value = mode === 'dark' ? '1' : '0';
  const isDark = mode === 'dark';
  if (themeSunBtn){
    themeSunBtn.classList.toggle('is-active', !isDark);
    themeSunBtn.setAttribute('aria-pressed', (!isDark).toString());
  }
  if (themeMoonBtn){
    themeMoonBtn.classList.toggle('is-active', isDark);
    themeMoonBtn.setAttribute('aria-pressed', isDark.toString());
  }
};
const applyTheme = mode => {
  const themeClass = mode === 'dark' ? 'theme-dark' : 'theme-light';
  bodyEl.classList.remove('theme-light','theme-dark');
  bodyEl.classList.add(themeClass);
  syncThemeControls(mode);
};
const readThemePref = () => {
  try{ return localStorage.getItem(THEME_KEY); }
  catch{ return null; }
};
const writeThemePref = mode => {
  try{ localStorage.setItem(THEME_KEY, mode); }
  catch{}
};
const readScreenPref = () => {
  try{ return localStorage.getItem(SCREEN_KEY); }
  catch{ return null; }
};
const writeScreenPref = value => {
  try{ localStorage.setItem(SCREEN_KEY, value); }
  catch{}
};
const readJson = (key, fallback) => {
  try{
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  }
  catch{ return fallback; }
};
const writeJson = (key, value) => {
  try{ localStorage.setItem(key, JSON.stringify(value)); }
  catch{}
};
const removeStorageItem = key => {
  try{ localStorage.removeItem(key); }
  catch{}
};

function collectQuickSettings(){
  if (!qs) return null;
  const selected = Array.from(qs.selectedDictionaries || [])
    .filter(id => typeof id === 'string' && id !== CUSTOM_DICTIONARY_META.id);
  const difficulty = typeof qs.difficulty === 'string' && ALL_DIFFICULTIES.includes(qs.difficulty)
    ? qs.difficulty
    : 'easy';
  const time = Number(qs.time);
  const pts = Number(qs.pts);
  const profile = {
    selectedDictionaries: selected,
    customSelected: !!qs.customSelected,
    difficulty,
    timerEnabled: !!(qs.timerToggle && qs.timerToggle.checked),
    time: Number.isFinite(time) && time > 0 ? time : 0,
    ptsEnabled: !!(qs.ptsToggle && qs.ptsToggle.checked),
    pts: Number.isFinite(pts) && pts > 0 ? pts : 0,
    customText: typeof qs.customText?.value === 'string' ? qs.customText.value : ''
  };
  return profile;
}

function persistQuickSettings(){
  const profile = collectQuickSettings();
  if (!profile) return;
  quickSavedProfile = { ...profile };
  writeJson(QUICK_SETTINGS_KEY, profile);
}

function collectTeamSettings(){
  if (!ts) return null;
  const selected = Array.from(ts.selectedDictionaries || [])
    .filter(id => typeof id === 'string' && id !== CUSTOM_DICTIONARY_META.id);
  const difficulty = typeof ts.difficulty === 'string' && ALL_DIFFICULTIES.includes(ts.difficulty)
    ? ts.difficulty
    : 'easy';
  const time = Number(ts.time);
  const pts = Number(ts.pts);
  const profile = {
    selectedDictionaries: selected,
    customSelected: !!ts.customSelected,
    difficulty,
    timerEnabled: !!(ts.timerToggle && ts.timerToggle.checked),
    time: Number.isFinite(time) && time > 0 ? time : 0,
    ptsEnabled: !!(ts.ptsToggle && ts.ptsToggle.checked),
    pts: Number.isFinite(pts) && pts > 0 ? pts : 0,
    customText: typeof ts.customText?.value === 'string' ? ts.customText.value : ''
  };
  return profile;
}

function persistTeamSettings(){
  const profile = collectTeamSettings();
  if (!profile) return;
  teamSavedProfile = { ...profile };
  writeJson(TEAM_SETTINGS_KEY, profile);
}
const initialTheme = readThemePref();
applyTheme(initialTheme === 'dark' ? 'dark' : 'light');
if (themeSlider){
  themeSlider.addEventListener('input', e => {
    const mode = e.target.value === '1' ? 'dark' : 'light';
    applyTheme(mode);
    writeThemePref(mode);
  });
}
if (themeSunBtn){
  themeSunBtn.addEventListener('click', ()=>{
    applyTheme('light');
    writeThemePref('light');
  });
}
if (themeMoonBtn){
  themeMoonBtn.addEventListener('click', ()=>{
    applyTheme('dark');
    writeThemePref('dark');
  });
}

const TEAM_ICONS = [
  {id:'sun', emoji:'🌞', bg:'linear-gradient(135deg,#fde047,#f97316)', color:'#1f2937'},
  {id:'rocket', emoji:'🚀', bg:'linear-gradient(135deg,#60a5fa,#2563eb)', color:'#0f172a'},
  {id:'leaf', emoji:'🍀', bg:'linear-gradient(135deg,#86efac,#22c55e)', color:'#052e16'},
  {id:'wave', emoji:'🐬', bg:'linear-gradient(135deg,#67e8f9,#0ea5e9)', color:'#0f172a'},
  {id:'crown', emoji:'👑', bg:'linear-gradient(135deg,#fcd34d,#a855f7)', color:'#312e81'},
  {id:'gamepad', emoji:'🎮', bg:'linear-gradient(135deg,#f472b6,#a855f7)', color:'#1e1b4b'},
  {id:'bolt', emoji:'⚡', bg:'linear-gradient(135deg,#f97316,#ef4444)', color:'#111827'},
  {id:'snow', emoji:'❄️', bg:'linear-gradient(135deg,#bfdbfe,#60a5fa)', color:'#1e3a8a'}
];
const defaultTeamName = idx => `Команда ${idx+1}`;
const makeTeam = (name, icon) => ({name, icon, points:0, hit:0, miss:0, hitWords:[], missWords:[]});
const getTeamIcon = id => TEAM_ICONS.find(icon=>icon.id===id) || TEAM_ICONS[0];
function sanitizeTeam(team, idx){
  const base = makeTeam(defaultTeamName(idx), TEAM_ICONS[idx % TEAM_ICONS.length].id);
  const name = typeof team?.name === 'string' && team.name.trim() ? team.name.trim() : base.name;
  const iconId = TEAM_ICONS.some(icon=>icon.id === team?.icon) ? team.icon : base.icon;
  const toCount = value => Number.isFinite(value) ? Math.trunc(value) : 0;
  return {
    name,
    icon: iconId,
    points: toCount(team?.points),
    hit: toCount(team?.hit),
    miss: toCount(team?.miss),
    hitWords: sanitizeWordNames(team?.hitWords),
    missWords: sanitizeWordNames(team?.missWords)
  };
}
let teams = [];
const storedTeams = readJson(TEAM_STATS_KEY, null);
if (Array.isArray(storedTeams) && storedTeams.length){
  teams = storedTeams.map((team, idx)=>sanitizeTeam(team, idx));
}
const persistTeams = () => {
  teams = teams.map((team, idx)=>sanitizeTeam(team, idx));
  writeJson(TEAM_STATS_KEY, teams);
};
let audioCtx = null;
function ensureAudioCtx(){
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }catch{
    return null;
  }
}
function playAlarm(){
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [0, 0.35, 0.7].forEach((offset, idx)=>{
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const startFreq = idx === 0 ? 880 : 660;
    const endFreq = idx === 0 ? 660 : 520;
    osc.frequency.setValueAtTime(startFreq, now + offset);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + offset + 0.28);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.36);
  });
}
function playTick(){
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(700, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

// Navigation
const show = v => {
  VIEWS.forEach(id=>{
    const el = $('#'+id);
    if (el) el.style.display='none';
  });
  $('#'+v).style.display='flex';
  screen = v;
  writeScreenPref(v);
  window.scrollTo(0, 0);
  if (themeContainer) themeContainer.style.display = v === 'viewMenu' ? 'flex' : 'none';
  if (headerTitle) headerTitle.style.display = v === 'viewMenu' ? 'flex' : 'none';
  if (v==='viewMenu'){
    backBtn.style.visibility = 'hidden';
    backBtn.style.pointerEvents = 'none';
    if (modeQuickBtn) modeQuickBtn.classList.add('active');
  }else{
    backBtn.style.visibility = 'visible';
    backBtn.style.pointerEvents = 'auto';
    if (modeQuickBtn) modeQuickBtn.classList.remove('active');
  }
  if (v === 'viewQuickGame'){
    refreshQuickBreadcrumbs();
    maybeShowQuickResumePrompt();
  }else{
    hideQuickResumePrompt();
  }
  if (v === 'viewTeamGame'){
    refreshTeamBreadcrumbs();
    maybeShowTeamResumePrompt();
  }else{
    hideTeamResumePrompt();
  }
};

// Header buttons
backBtn.onclick = () => {
  const leavingQuick = screen==='viewQuickGame';
  const leavingTeam = screen==='viewTeamGame';
  if (leavingQuick || leavingTeam){
    if (!confirm('Выйти в меню? Текущая партия будет завершена.')) return;
  }
  stopQuickTimer();
  if (typeof tTimerId !== 'undefined'){ clearInterval(tTimerId); tTimerId=null; }
  if (leavingQuick){
    clearQuickSession();
  }
  if (leavingTeam){
    clearTeamSession();
  }
  show('viewMenu');
};
if (helpBtn){
  helpBtn.addEventListener('click', event => {
    event.preventDefault();
    openHelp();
  });
}

$('#goTeam').onclick = () => {
  ensureTeamsSeed();
  renderTeams();
  syncTeamSettingsFromMenu();
  show('viewTeamSetup');
};

// Quick setup
const qs = {
  dictContainer: $('#quickDictSelector'),
  dictGrid: $('#quickDictGrid'),
  dictPanel: $('#quickDictDropdown'),
  dictSummary: $('#quickDictSummary'),
  difficultyContainer: $('#quickDifficultyBlock'),
  difficultyButtons: {},
  selectedDictionaries: new Set(),
  dictElements: new Map(),
  customSelected: false,
  difficulty: 'easy',
  customBox: $('#quickCustomBox'),
  customText: $('#quickCustomWords'),
  timerToggle: $('#quickTimerToggle'),
  time: 60,
  timeMinus: $('#quickTimeMinus'),
  timePlus: $('#quickTimePlus'),
  timeLabel: $('#quickTimeLabel'),
  ptsToggle: $('#quickPtsToggle'),
  ptsControls: $('#quickPtsControls'),
  pts: 10,
  ptsMinus: $('#quickPtsMinus'),
  ptsPlus: $('#quickPtsPlus'),
  ptsLabel: $('#quickPtsLabel'),
  start: $('#startQuick')
};

const storedQuickSettingsRaw = readJson(QUICK_SETTINGS_KEY, null);
if (storedQuickSettingsRaw && typeof storedQuickSettingsRaw === 'object'){
  const selected = Array.isArray(storedQuickSettingsRaw.selectedDictionaries)
    ? storedQuickSettingsRaw.selectedDictionaries.filter(id => typeof id === 'string' && id !== CUSTOM_DICTIONARY_META.id)
    : [];
  quickInitialSelectedIds = selected;
  qs.selectedDictionaries = new Set(selected);
  quickInitialCustomSelected = !!storedQuickSettingsRaw.customSelected;
  qs.customSelected = quickInitialCustomSelected;
  const storedDifficulty = typeof storedQuickSettingsRaw.difficulty === 'string' && ALL_DIFFICULTIES.includes(storedQuickSettingsRaw.difficulty)
    ? storedQuickSettingsRaw.difficulty
    : null;
  if (storedDifficulty){
    quickInitialDifficulty = storedDifficulty;
    qs.difficulty = storedDifficulty;
  }
  const timerEnabled = !!storedQuickSettingsRaw.timerEnabled;
  quickInitialTimerEnabled = timerEnabled;
  if (qs.timerToggle){
    qs.timerToggle.checked = timerEnabled;
  }
  const storedTime = Number(storedQuickSettingsRaw.time);
  if (Number.isFinite(storedTime) && storedTime > 0){
    qs.time = storedTime;
  }
  const ptsEnabled = !!storedQuickSettingsRaw.ptsEnabled;
  quickInitialPtsEnabled = ptsEnabled;
  if (qs.ptsToggle){
    qs.ptsToggle.checked = ptsEnabled;
  }
  const storedPts = Number(storedQuickSettingsRaw.pts);
  if (Number.isFinite(storedPts) && storedPts > 0){
    qs.pts = storedPts;
  }
  if (qs.customText && typeof storedQuickSettingsRaw.customText === 'string'){
    qs.customText.value = storedQuickSettingsRaw.customText;
  }
  quickSavedProfile = {
    selectedDictionaries: [...selected],
    customSelected: quickInitialCustomSelected,
    difficulty: storedDifficulty || 'easy',
    timerEnabled,
    time: Number.isFinite(storedTime) && storedTime > 0 ? storedTime : 0,
    ptsEnabled,
    pts: Number.isFinite(storedPts) && storedPts > 0 ? storedPts : 0,
    customText: typeof storedQuickSettingsRaw.customText === 'string' ? storedQuickSettingsRaw.customText : ''
  };
}else{
  quickInitialSelectedIds = Array.from(qs.selectedDictionaries || []);
  quickInitialCustomSelected = !!qs.customSelected;
  quickInitialDifficulty = typeof qs.difficulty === 'string' && ALL_DIFFICULTIES.includes(qs.difficulty)
    ? qs.difficulty
    : null;
  quickInitialTimerEnabled = !!(qs.timerToggle && qs.timerToggle.checked);
  quickInitialPtsEnabled = !!(qs.ptsToggle && qs.ptsToggle.checked);
}
quickPendingSession = sanitizeQuickSession(readJson(QUICK_SESSION_KEY, null));
initDifficultyControls(qs);
qs.onDifficultyChange = level => {
  qs.difficulty = level;
  persistQuickSettings();
};
const upQuickTime = () => qs.timeLabel.textContent = qs.time+' с';
const upQuickPts = () => qs.ptsLabel.textContent = qs.pts;
upQuickTime();
upQuickPts();
if (qs.timerToggle){
  qs.timerToggle.checked = quickInitialTimerEnabled;
}
if (qs.ptsToggle){
  qs.ptsToggle.checked = quickInitialPtsEnabled;
}
const updateQuickTimerUI = () => {
  if (!qs.timerToggle) return;
  const enabled = qs.timerToggle.checked;
  [qs.timeMinus, qs.timePlus].forEach(btn=>{ if (btn) btn.disabled = !enabled; });
  if (qs.timeLabel) qs.timeLabel.classList.toggle('disabled', !enabled);
  updateQuickTimerButton();
};
qs.timeMinus.onclick = () => {
  qs.time = Math.max(30, qs.time-30);
  upQuickTime();
  persistQuickSettings();
};
qs.timePlus.onclick = () => {
  qs.time += 30;
  upQuickTime();
  persistQuickSettings();
};
qs.ptsMinus.onclick = () => {
  qs.pts = Math.max(1, qs.pts-1);
  upQuickPts();
  persistQuickSettings();
};
qs.ptsPlus.onclick = () => {
  qs.pts += 1;
  upQuickPts();
  persistQuickSettings();
};
const updateQuickPts = () => {
  if (!qs.ptsControls) return;
  const enabled = qs.ptsToggle.checked;
  qs.ptsControls.classList.toggle('is-disabled', !enabled);
  qs.ptsControls.setAttribute('aria-disabled', String(!enabled));
  [qs.ptsMinus, qs.ptsPlus].forEach(btn=>{ if (btn) btn.disabled = !enabled; });
  if (qs.ptsLabel) qs.ptsLabel.classList.toggle('disabled', !enabled);
};
if (qs.timerToggle){
  qs.timerToggle.onchange = () => {
    updateQuickTimerUI();
    persistQuickSettings();
  };
}
updateQuickTimerUI();
if (qs.ptsToggle){
  qs.ptsToggle.onchange = () => {
    updateQuickPts();
    persistQuickSettings();
  };
}
updateQuickPts();
updateCustomBoxVisibility(qs);
if (qs.customText){
  qs.customText.addEventListener('input', () => {
    persistQuickSettings();
  });
}

// Quick game state
const initialQuickStats = readJson(QUICK_STATS_KEY, {hitWords:[], missWords:[]}) || {hitWords:[], missWords:[]};
let qHitWords = sanitizeWordNames(initialQuickStats.hitWords);
let qMissWords = sanitizeWordNames(initialQuickStats.missWords);
let qWords=[], qIndex=0, qHide=false, qRemain=0, qHit=qHitWords.length, qMiss=qMissWords.length, qTarget=null;

const qUI = {
  word: $('#qWord'),
  feedbackBtn: $('#qFeedbackBtn'),
  description: $('#qDescription'),
  helpBtn: $('#qHelpBtn'),
  helpBox: $('#qHelpBox'),
  breadcrumbsWrap: $('#qBreadcrumbSection'),
  breadcrumbs: $('#qBreadcrumbs'),
  hit: $('#qHit'), miss: $('#qMiss'),
  next: $('#qNext'), hitBtn: $('#qHitBtn'), skipBtn: $('#qSkipBtn'),
  hideBtn: $('#qHideBtn'), meaningBtn: $('#qMeaningBtn'),
  tBox: $('#qTimerBox'), tLabel: $('#qTimer'),
  restartTimerBtn: $('#qRestartTimer'),
  statsBtn: $('#qStatsBtn'),
  resumeNotice: $('#quickResumeNotice'),
  resumeBtn: $('#quickResumeBtn')
};
const qHelpState = { open:false };

function setQuickControlsEnabled(enabled){
  [qUI.hitBtn, qUI.skipBtn, qUI.next, qUI.hideBtn, qUI.meaningBtn, qUI.helpBtn].forEach(btn => {
    if (btn) btn.disabled = !enabled;
  });
}

function updateQuickWordView(){
  updateWordView(qUI, { entry: qWords[qIndex] || null, hidden: qHide, helpState: qHelpState });
  refreshQuickBreadcrumbs();
}

function collectQuickSession(){
  if (!Array.isArray(qWords) || !qWords.length) return null;
  const words = qWords.map(sanitizeSessionWord).filter(Boolean);
  if (!words.length) return null;
  const clampedIndex = Math.min(Math.max(Number.isFinite(qIndex) ? Math.trunc(qIndex) : 0, 0), words.length - 1);
  const target = qTarget === null || qTarget === undefined
    ? null
    : (Number.isFinite(Number(qTarget)) ? Math.max(0, Math.trunc(Number(qTarget))) : null);
  const timerRemaining = Number.isFinite(Number(qRemain)) ? Math.max(0, Math.trunc(Number(qRemain))) : 0;
  const timerSetting = Number.isFinite(Number(qs.time)) && Number(qs.time) > 0 ? Math.trunc(Number(qs.time)) : 0;
  return {
    words,
    index: clampedIndex,
    hide: !!qHide,
    helpOpen: !!qHelpState.open,
    hit: Math.max(0, Math.trunc(Number.isFinite(qHit) ? qHit : 0)),
    miss: Math.max(0, Math.trunc(Number.isFinite(qMiss) ? qMiss : 0)),
    hitWords: sanitizeWordNames(qHitWords),
    missWords: sanitizeWordNames(qMissWords),
    target,
    timerEnabled: !!(qs.timerToggle && qs.timerToggle.checked),
    timerRunning: !!qTimerRunning,
    timerRemaining,
    breadcrumbContext: sanitizeBreadcrumbContext(qBreadcrumbContext),
    timerSetting,
    difficulty: typeof qs.difficulty === 'string' ? qs.difficulty : '',
    customSelected: !!qs.customSelected,
    selectedDictionaries: Array.from(qs.selectedDictionaries || []).filter(id => typeof id === 'string'),
    customText: typeof qs.customText?.value === 'string' ? qs.customText.value : ''
  };
}

function persistQuickSession(){
  const session = collectQuickSession();
  if (session){
    writeJson(QUICK_SESSION_KEY, session);
    return;
  }
  if (quickPendingSession){
    return;
  }
  clearQuickSession();
}

function clearQuickSession(){
  quickPendingSession = null;
  removeStorageItem(QUICK_SESSION_KEY);
}

function showQuickResumePrompt(){
  if (qUI.resumeNotice) qUI.resumeNotice.hidden = false;
  setQuickControlsEnabled(false);
  if (qUI.tBox) qUI.tBox.style.display = 'none';
  if (qUI.restartTimerBtn) qUI.restartTimerBtn.style.display = 'none';
}

function hideQuickResumePrompt(){
  if (qUI.resumeNotice) qUI.resumeNotice.hidden = true;
}

function maybeShowQuickResumePrompt(){
  if (quickPendingSession){
    showQuickResumePrompt();
  }else{
    hideQuickResumePrompt();
    if (Array.isArray(qWords) && qWords.length){
      setQuickControlsEnabled(true);
    }
  }
}

function applyQuickSession(session){
  const data = sanitizeQuickSession(session);
  if (!data) return;
  quickPendingSession = null;
  qBreadcrumbContext = data.breadcrumbContext || null;
  qWords = data.words.map(word => ({ ...word }));
  qIndex = Math.min(Math.max(data.index, 0), qWords.length ? qWords.length - 1 : 0);
  qHide = !!data.hide;
  qHelpState.open = !!data.helpOpen;
  qHit = Math.max(0, data.hit || 0);
  qMiss = Math.max(0, data.miss || 0);
  qHitWords = Array.isArray(data.hitWords) ? data.hitWords.slice() : [];
  qMissWords = Array.isArray(data.missWords) ? data.missWords.slice() : [];
  qTarget = data.target === null ? null : data.target;
  if (qs.ptsToggle){
    qs.ptsToggle.checked = data.target !== null;
  }
  if (data.target !== null && Number.isFinite(data.target) && data.target > 0){
    qs.pts = data.target;
  }
  upQuickPts();
  if (qs.timerToggle){
    qs.timerToggle.checked = data.timerEnabled;
  }
  if (data.timerSetting > 0){
    qs.time = data.timerSetting;
  }
  upQuickTime();
  updateQuickTimerUI();
  updateQuickPts();
  if (typeof qs.customSelected === 'boolean'){
    qs.customSelected = !!data.customSelected;
  }
  if (qs.customText && typeof data.customText === 'string'){
    qs.customText.value = data.customText;
  }
  updateCustomBoxVisibility(qs);
  updateQuickCounters();
  updateQuickWordView();
  if (qUI.hideBtn) qUI.hideBtn.textContent = qHide ? 'Показать слово' : 'Скрыть слово';
  if (qTimerId){
    clearInterval(qTimerId);
    qTimerId = null;
  }
  qTimerRunning = false;
  const baseRemain = data.timerRemaining > 0
    ? data.timerRemaining
    : (data.timerSetting > 0 ? data.timerSetting : qs.time);
  qRemain = Math.max(0, Math.trunc(Number(baseRemain) || 0));
  if (data.timerEnabled){
    if (qUI.tBox) qUI.tBox.style.display = 'inline-flex';
    if (qUI.tLabel){
      qUI.tLabel.textContent = `${pad(Math.floor(qRemain/60))}:${pad(qRemain%60)}`;
    }
    if (data.timerRunning && qRemain > 0){
      startQuickTimerCountdown(qRemain);
    }else{
      qTimerRunning = false;
      updateQuickTimerButton();
      persistQuickSession();
    }
  }else{
    if (qUI.tBox) qUI.tBox.style.display = 'none';
    qRemain = 0;
    qTimerRunning = false;
    updateQuickTimerButton();
    persistQuickSession();
  }
  setQuickControlsEnabled(true);
  hideQuickResumePrompt();
}
if (qUI.helpBtn){
  qUI.helpBtn.addEventListener('click', () => {
    if (qUI.helpBtn.disabled) return;
    qHelpState.open = !qHelpState.open;
    updateQuickWordView();
    persistQuickSession();
  });
}
if (qUI.resumeBtn){
  qUI.resumeBtn.addEventListener('click', () => {
    if (!quickPendingSession) return;
    qUI.resumeBtn.disabled = true;
    applyQuickSession(quickPendingSession);
    qUI.resumeBtn.disabled = false;
  });
}

const updateQuickCounters = () => {
  if (qUI.hit) qUI.hit.textContent = String(qHit);
  if (qUI.miss) qUI.miss.textContent = String(qMiss);
};
const persistQuickStats = () => {
  writeJson(QUICK_STATS_KEY, {
    hitWords: qHitWords,
    missWords: qMissWords
  });
};
updateQuickCounters();
updateQuickWordView();

const pad = n => String(n).padStart(2,'0');
const formatWordList = list => {
  if (!Array.isArray(list) || !list.length) return '—';
  const items = list.map(item => typeof item === 'string' ? item : (item && typeof item.term === 'string' ? item.term : ''))
    .filter(Boolean);
  return items.length ? items.join(', ') : '—';
};
const parseCustomWords = (raw, options = {}) => {
  const input = typeof raw === 'string' ? raw : '';
  const rawDifficulty = typeof options.difficulty === 'string' ? options.difficulty.trim().toLowerCase() : '';
  const normalizedDifficulty = ALL_DIFFICULTIES.includes(rawDifficulty) ? rawDifficulty : '';
  return input
    .split(/[,\n\r]+/)
    .map(s=>s.trim())
    .filter(Boolean)
    .map((term, idx) => {
      const entry = {
        id: `custom_${idx+1}`,
        dictionaryId: CUSTOM_DICTIONARY_META.id,
        term,
        description: '',
        about: ''
      };
      if (normalizedDifficulty && normalizedDifficulty !== 'mix'){
        entry.difficulty = normalizedDifficulty;
      }
      return entry;
    });
};

function updateQuickTimerButton(){
  const restartBtn = document.getElementById('qRestartTimer');
  if (!restartBtn) return;
  if (!qs.timerToggle.checked){
    restartBtn.style.display = 'none';
    return;
  }
  restartBtn.style.display = '';
  restartBtn.textContent = qTimerRunning ? 'Перезапустить таймер' : 'Запустить таймер';
}

function stopQuickTimer(){
  if (qTimerId){
    clearInterval(qTimerId);
  }
  qTimerId = null;
  qTimerRunning = false;
  updateQuickTimerButton();
  if (Array.isArray(qWords) && qWords.length){
    persistQuickSession();
  }
}

function startQuickTimerCountdown(remaining){
  if (!qs.timerToggle || !qs.timerToggle.checked){
    if (qUI.tBox) qUI.tBox.style.display = 'none';
    qRemain = 0;
    stopQuickTimer();
    return;
  }
  if (!qUI.tLabel) return;
  if (qUI.tBox) qUI.tBox.style.display = 'inline-flex';
  if (qUI.restartTimerBtn) qUI.restartTimerBtn.style.display = '';
  if (qTimerId){
    clearInterval(qTimerId);
  }
  qRemain = Math.max(0, Math.trunc(Number(remaining) || 0));
  qUI.tLabel.textContent = `${pad(Math.floor(qRemain/60))}:${pad(qRemain%60)}`;
  qTimerRunning = qRemain > 0;
  updateQuickTimerButton();
  persistQuickSession();
  if (!qTimerRunning){
    return;
  }
  qTimerId = setInterval(()=>{
    qRemain = Math.max(0, qRemain - 1);
    if (qUI.tLabel){
      qUI.tLabel.textContent = `${pad(Math.floor(qRemain/60))}:${pad(qRemain%60)}`;
    }
    if (qRemain <= 0){
      if (qUI.tLabel) qUI.tLabel.textContent = '00:00';
      stopQuickTimer();
      playAlarm();
      persistQuickSession();
      nextWord();
    }else{
      if (qRemain <= 10){
        playTick();
      }
      persistQuickSession();
    }
  },1000);
}

function restartQuickTimer(){
  startQuickTimerCountdown(qs.time);
}

function showWordStats(title, hitList, missList){
  alert(`${title}\n\nУгаданные (${hitList.length}):\n${formatWordList(hitList)}\n\nПропущенные (${missList.length}):\n${formatWordList(missList)}`);
}

async function startQuickGame(){
  if (qs.start) qs.start.disabled = true;
  try{
    await ensureDictionaryIndex();
    const selectedIds = Array.from(qs.selectedDictionaries || []);
    const includeCustom = !!qs.customSelected;
    if (!selectedIds.length && !includeCustom){
      alert('Выберите хотя бы один словарь');
      return;
    }
    const difficulty = qs.difficulty || 'easy';
    let entries = [];
    let dictionaryEntriesCount = 0;
    let customEntriesCount = 0;
    if (includeCustom){
      const customEntries = parseCustomWords(qs.customText?.value, { difficulty });
      customEntriesCount = customEntries.length;
      entries = entries.concat(customEntries);
    }
    if (selectedIds.length){
      const batches = await Promise.all(selectedIds.map(async dictId => {
        const meta = getDictionaryMeta(dictId);
        const available = getOrderedDifficulties(meta);
        if (difficulty !== 'mix' && !available.includes(difficulty)){
          return [];
        }
        try{
          const list = await loadDictionaryEntries(dictId, difficulty);
          return list.map((entry, idx) => ({
            ...entry,
            id: entry.id || `${dictId}_${difficulty}_${idx+1}`
          }));
        }catch(err){
          console.error(`Не удалось загрузить словарь ${dictId}/${difficulty}:`, err);
          return [];
        }
      }));
      batches.forEach(list => {
        dictionaryEntriesCount += list.length;
        entries = entries.concat(list);
      });
    }
    entries = entries.filter(entry => entry && typeof entry.term === 'string' && entry.term.trim().length);
    if (!entries.length){
      if (!includeCustom && selectedIds.length && dictionaryEntriesCount === 0){
        alert('Для выбранных словарей на этом уровне сложности нет слов. Попробуйте изменить сложность или набор словарей.');
      }else if (includeCustom && customEntriesCount === 0 && dictionaryEntriesCount === 0){
        alert('Добавьте хотя бы одно слово');
      }else{
        alert('Добавьте хотя бы одно слово');
      }
      return;
    }
    qBreadcrumbContext = { selectedIds, includeCustom, difficulty };
    qWords = entries.map(entry => ({ ...entry }));
    shuffle(qWords);
    qIndex=0; qHide=false; qHelpState.open=false;
    qHit=0; qMiss=0; qTarget = qs.ptsToggle.checked ? qs.pts : null;
    qHitWords = [];
    qMissWords = [];
    persistQuickStats();
    updateQuickCounters();
    updateQuickWordView();
    if (qUI.hideBtn) qUI.hideBtn.textContent = 'Скрыть слово';

    // timer
    stopQuickTimer();
    if (qs.timerToggle.checked){
      restartQuickTimer();
    }else if (qUI.tBox){
      qUI.tBox.style.display='none';
      qRemain = 0;
    }
    updateQuickTimerButton();
    quickPendingSession = null;
    persistQuickSession();
    show('viewQuickGame');
  }finally{
    if (qs.start) qs.start.disabled = false;
  }
}
if (qs.start){
  qs.start.onclick = () => { startQuickGame().catch(err => console.error(err)); };
}
if (modeQuickBtn){
  modeQuickBtn.onclick = () => { startQuickGame().catch(err => console.error(err)); };
}

function nextWord(){
  if (!qWords.length) return;
  qIndex = (qIndex+1) % qWords.length;
  qHide=false;
  qHelpState.open = false;
  updateQuickWordView();
  if (qUI.hideBtn) qUI.hideBtn.textContent = 'Скрыть слово';
  persistQuickSession();
}

qUI.next.onclick = nextWord;
qUI.hitBtn.onclick = ()=>{
  qHit++;
  const current = qWords[qIndex];
  if (current?.term) qHitWords.push(current.term);
  persistQuickStats();
  updateQuickCounters();
  if (qTarget!==null && qHit>=qTarget){
    stopQuickTimer();
    playAlarm();
    alert('Вы достигли цели!');
    clearQuickSession();
    show('viewMenu');
    return;
  }
  nextWord();
};
qUI.skipBtn.onclick = ()=>{
  const current = qWords[qIndex];
  if (current?.term) qMissWords.push(current.term);
  qMiss++;
  persistQuickStats();
  updateQuickCounters();
  nextWord();
};
qUI.hideBtn.onclick = ()=>{
  qHide = !qHide;
  if (qHide){
    qHelpState.open = false;
  }
  updateQuickWordView();
  qUI.hideBtn.textContent = qHide ? 'Показать слово' : 'Скрыть слово';
  persistQuickSession();
};
if (qUI.restartTimerBtn){
  qUI.restartTimerBtn.onclick = restartQuickTimer;
}
qUI.meaningBtn.onclick = ()=>{
  const current = qWords[qIndex];
  if (!current?.term) return;
  window.open('https://ru.wikipedia.org/wiki/'+encodeURIComponent(current.term), '_blank');
};
if (qUI.statsBtn){
  qUI.statsBtn.onclick = ()=>{
    showWordStats('Быстрый режим', qHitWords, qMissWords);
  };
}

// Team setup & game
function ensureTeamsSeed(){
  if (teams.length===0){
    teams = [
      makeTeam(defaultTeamName(0), TEAM_ICONS[0].id),
      makeTeam(defaultTeamName(1), TEAM_ICONS[1].id)
    ];
  } else {
    teams = teams.map((team, idx)=>sanitizeTeam(team, idx));
  }
  persistTeams();
}
const teamList = $('#teamList');
function renderTeams(){
  teamList.innerHTML='';
  teams.forEach((team, index)=>{
    if (!team.name) team.name = defaultTeamName(index);
    if (!team.icon) team.icon = TEAM_ICONS[index % TEAM_ICONS.length].id;
    const iconDef = getTeamIcon(team.icon);
    const card=document.createElement('div');
    card.className='section team-card';
    card.innerHTML = `
      <div class="team-card-top">
        <button class="team-avatar-btn" type="button" style="background:${iconDef.bg};color:${iconDef.color}" data-index="${index}">
          <span>${iconDef.emoji}</span>
        </button>
      </div>
      <div class="team-body">
        <div class="team-name"></div>
        <form class="team-edit" data-team-form>
          <label class="visually-hidden" for="teamName-${index}">Название команды</label>
          <input class="input team-edit-input" id="teamName-${index}" name="teamName" type="text" maxlength="40" autocomplete="off">
          <div class="team-edit-actions">
            <button class="btn btn-small" type="submit">Сохранить</button>
            <button class="btn ghost btn-small" type="button" data-cancel>Отмена</button>
          </div>
        </form>
        <button class="team-delete" type="button" title="Удалить команду" data-index="${index}">🗑️</button>
      </div>`;
    const nameLabel = card.querySelector('.team-name');
    const editForm = card.querySelector('[data-team-form]');
    const input = card.querySelector('.team-edit-input');
    const avatarBtn = card.querySelector('.team-avatar-btn');
    const getCurrentName = () => teams[index]?.name || defaultTeamName(index);
    const syncDisplayName = () => {
      const currentName = getCurrentName();
      if (nameLabel){
        nameLabel.textContent = currentName;
        nameLabel.dataset.editable = 'true';
        nameLabel.setAttribute('role', 'button');
        nameLabel.setAttribute('tabindex', '0');
        nameLabel.setAttribute('title', `Редактировать название команды «${currentName}»`);
      }
      if (avatarBtn){
        avatarBtn.setAttribute('aria-label', `Редактировать название команды «${currentName}»`);
      }
    };
    const exitEditMode = focusTarget => {
      card.classList.remove('is-editing');
      if (input) input.value = getCurrentName();
      syncDisplayName();
      if (focusTarget === 'name' && nameLabel){
        requestAnimationFrame(()=> nameLabel.focus());
      }
    };
    const enterEditMode = () => {
      if (input) input.value = getCurrentName();
      card.classList.add('is-editing');
      requestAnimationFrame(()=>{
        if (input){
          input.focus();
          input.select();
        }
      });
    };
    const toggleEditMode = source => {
      if (card.classList.contains('is-editing')){
        exitEditMode(source === 'name' ? 'name' : undefined);
      } else {
        enterEditMode();
      }
    };
    syncDisplayName();
    if (input) input.value = getCurrentName();
    if (avatarBtn){
      avatarBtn.onclick = () => toggleEditMode('avatar');
    }
    if (nameLabel){
      nameLabel.addEventListener('click', () => toggleEditMode('name'));
      nameLabel.addEventListener('keydown', evt => {
        if (evt.key === 'Enter' || evt.key === ' ' || evt.key === 'Spacebar'){
          evt.preventDefault();
          toggleEditMode('name');
        }
      });
    }
    if (editForm && input){
      editForm.onsubmit = evt => {
        evt.preventDefault();
        const next = input.value.trim();
        teams[index].name = next || defaultTeamName(index);
        renderTeams();
        persistTeams();
      };
      input.addEventListener('keydown', evt => {
        if (evt.key === 'Escape'){
          evt.preventDefault();
          exitEditMode('name');
        }
      });
      const cancelBtn = editForm.querySelector('[data-cancel]');
      if (cancelBtn){
        cancelBtn.onclick = () => {
          exitEditMode('name');
        };
      }
    }
    const deleteBtn = card.querySelector('.team-delete');
    if (deleteBtn){
      deleteBtn.setAttribute('aria-label', `Удалить команду «${team.name || defaultTeamName(index)}»`);
      deleteBtn.onclick = () => {
        if (!confirm(`Удалить команду «${team.name || defaultTeamName(index)}»?`)) return;
        teams.splice(index, 1);
        renderTeams();
        persistTeams();
      };
    }
    teamList.appendChild(card);
  });
}
$('#teamAdd').onclick = ()=>{
  const icon = TEAM_ICONS[teams.length % TEAM_ICONS.length].id;
  teams.push(makeTeam(defaultTeamName(teams.length), icon));
  renderTeams();
  persistTeams();
};

const ts = {
  dictContainer: $('#teamDictSelector'),
  dictGrid: $('#teamDictGrid'),
  dictPanel: $('#teamDictDropdown'),
  dictSummary: $('#teamDictSummary'),
  difficultyContainer: $('#teamDifficultyBlock'),
  difficultyButtons: {},
  selectedDictionaries: new Set(),
  dictElements: new Map(),
  customSelected: false,
  difficulty: 'easy',
  customBox: $('#teamCustomBox'),
  customText: $('#teamCustomWords'),
  timerToggle: $('#teamTimerToggle'),
  time: 60,
  timeMinus: $('#teamTimeMinus'),
  timePlus: $('#teamTimePlus'),
  timeLabel: $('#teamTimeLabel'),
  ptsToggle: $('#teamPtsToggle'),
  ptsControls: $('#ptsControls'),
  pts: 10, ptsMinus: $('#ptsMinus'), ptsPlus: $('#ptsPlus'), ptsLabel: $('#ptsLabel'),
  start: $('#startTeam')
};

const storedTeamSettingsRaw = readJson(TEAM_SETTINGS_KEY, null);
if (storedTeamSettingsRaw && typeof storedTeamSettingsRaw === 'object'){
  const selected = Array.isArray(storedTeamSettingsRaw.selectedDictionaries)
    ? storedTeamSettingsRaw.selectedDictionaries.filter(id => typeof id === 'string' && id !== CUSTOM_DICTIONARY_META.id)
    : [];
  teamInitialSelectedIds = selected;
  ts.selectedDictionaries = new Set(selected);
  teamInitialCustomSelected = !!storedTeamSettingsRaw.customSelected;
  ts.customSelected = teamInitialCustomSelected;
  const storedDifficulty = typeof storedTeamSettingsRaw.difficulty === 'string' && ALL_DIFFICULTIES.includes(storedTeamSettingsRaw.difficulty)
    ? storedTeamSettingsRaw.difficulty
    : null;
  if (storedDifficulty){
    teamInitialDifficulty = storedDifficulty;
    ts.difficulty = storedDifficulty;
  }
  const timerEnabled = !!storedTeamSettingsRaw.timerEnabled;
  teamInitialTimerEnabled = timerEnabled;
  if (ts.timerToggle){
    ts.timerToggle.checked = timerEnabled;
  }
  const storedTime = Number(storedTeamSettingsRaw.time);
  if (Number.isFinite(storedTime) && storedTime > 0){
    ts.time = storedTime;
  }
  const ptsEnabled = !!storedTeamSettingsRaw.ptsEnabled;
  teamInitialPtsEnabled = ptsEnabled;
  if (ts.ptsToggle){
    ts.ptsToggle.checked = ptsEnabled;
  }
  const storedPts = Number(storedTeamSettingsRaw.pts);
  if (Number.isFinite(storedPts) && storedPts > 0){
    ts.pts = storedPts;
  }
  if (ts.customText && typeof storedTeamSettingsRaw.customText === 'string'){
    ts.customText.value = storedTeamSettingsRaw.customText;
  }
  teamSavedProfile = {
    selectedDictionaries: [...selected],
    customSelected: teamInitialCustomSelected,
    difficulty: storedDifficulty || 'easy',
    timerEnabled,
    time: Number.isFinite(storedTime) && storedTime > 0 ? storedTime : 0,
    ptsEnabled,
    pts: Number.isFinite(storedPts) && storedPts > 0 ? storedPts : 0,
    customText: typeof storedTeamSettingsRaw.customText === 'string' ? storedTeamSettingsRaw.customText : ''
  };
}else{
  teamInitialSelectedIds = Array.from(ts.selectedDictionaries || []);
  teamInitialCustomSelected = !!ts.customSelected;
  teamInitialDifficulty = typeof ts.difficulty === 'string' && ALL_DIFFICULTIES.includes(ts.difficulty)
    ? ts.difficulty
    : null;
  teamInitialTimerEnabled = !!(ts.timerToggle && ts.timerToggle.checked);
  teamInitialPtsEnabled = !!(ts.ptsToggle && ts.ptsToggle.checked);
}
teamPendingSession = sanitizeTeamSession(readJson(TEAM_SESSION_KEY, null));
initDifficultyControls(ts);
ts.onDifficultyChange = level => {
  ts.difficulty = level;
  persistTeamSettings();
};
const upTeamTime = () => ts.timeLabel.textContent = ts.time+' с';
const upPts = () => ts.ptsLabel.textContent = ts.pts;
upTeamTime(); upPts();
if (ts.timerToggle){
  ts.timerToggle.checked = teamInitialTimerEnabled;
}
if (ts.ptsToggle){
  ts.ptsToggle.checked = teamInitialPtsEnabled;
}
ts.timeMinus.onclick = ()=>{
  ts.time = Math.max(30, ts.time-30);
  upTeamTime();
  persistTeamSettings();
};
ts.timePlus.onclick = ()=>{
  ts.time += 30;
  upTeamTime();
  persistTeamSettings();
};
ts.ptsMinus.onclick = ()=>{
  ts.pts = Math.max(1, ts.pts-1);
  upPts();
  persistTeamSettings();
};
ts.ptsPlus.onclick = ()=>{
  ts.pts += 1;
  upPts();
  persistTeamSettings();
};
updateCustomBoxVisibility(ts);
const updateTeamTimerUI = ()=>{
  if (!ts.timerToggle) return;
  const enabled = ts.timerToggle.checked;
  [ts.timeMinus, ts.timePlus].forEach(btn=>{ if (btn) btn.disabled = !enabled; });
  if (ts.timeLabel) ts.timeLabel.classList.toggle('disabled', !enabled);
};
const updatePtsUI = ()=>{
  const enabled = ts.ptsToggle.checked;
  if (ts.ptsControls){
    ts.ptsControls.classList.toggle('is-disabled', !enabled);
    ts.ptsControls.setAttribute('aria-disabled', String(!enabled));
  }
  [ts.ptsMinus, ts.ptsPlus].forEach(btn=>{ if (btn) btn.disabled = !enabled; });
  if (ts.ptsLabel) ts.ptsLabel.classList.toggle('disabled', !enabled);
};
if (ts.timerToggle){
  ts.timerToggle.onchange = () => {
    updateTeamTimerUI();
    persistTeamSettings();
  };
}
updateTeamTimerUI();
if (ts.ptsToggle){
  ts.ptsToggle.onchange = () => {
    updatePtsUI();
    persistTeamSettings();
  };
}
updatePtsUI();
if (ts.customText){
  ts.customText.addEventListener('input', () => {
    persistTeamSettings();
  });
}

ensureDictionaryIndex().then(() => {
  setupDictionarySelector(qs);
  setupDictionarySelector(ts);

  const hasQuickSavedSelection = Array.isArray(quickInitialSelectedIds) && quickInitialSelectedIds.length > 0;
  if (hasQuickSavedSelection){
    setDictionarySelection(qs, quickInitialSelectedIds, { emit:false, skipPersist:true });
  }
  setCustomSelection(qs, quickInitialCustomSelected, { emit:false, skipPersist:true });
  if (quickInitialDifficulty && qs.difficultyButtons?.[quickInitialDifficulty] && !qs.difficultyButtons[quickInitialDifficulty].disabled){
    qs.setDifficulty(quickInitialDifficulty, { silent:true });
  }
  if (!hasQuickSavedSelection && dictionaryState.list.length && !qs.selectedDictionaries.size){
    const firstId = dictionaryState.list[0].id;
    setDictionarySelection(qs, [firstId], { emit:false });
  }else{
    applyDictionarySelectionChange(qs, { emit:false, skipPersist:true });
  }

  if (Array.isArray(teamInitialSelectedIds) && teamInitialSelectedIds.length){
    setDictionarySelection(ts, teamInitialSelectedIds, { emit:false, skipPersist:true });
  }
  setCustomSelection(ts, teamInitialCustomSelected, { emit:false, skipPersist:true });
  if (teamInitialDifficulty && ts.difficultyButtons?.[teamInitialDifficulty] && !ts.difficultyButtons[teamInitialDifficulty].disabled){
    ts.setDifficulty(teamInitialDifficulty, { silent:true });
  }
  applyDictionarySelectionChange(ts, { emit:false, skipPersist:true });
});

document.addEventListener('click', (event) => {
  dictionarySelectors.forEach(state => {
    if (!state?.isSelectorOpen) return;
    if (state.dictContainer && state.dictContainer.contains(event.target)) return;
    setDictionarySelectorOpen(state, false);
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  dictionarySelectors.forEach(state => {
    if (!state?.isSelectorOpen) return;
    setDictionarySelectorOpen(state, false);
    if (state.dictToggleButton){
      state.dictToggleButton.focus();
    }
  });
});

function syncTeamSettingsFromMenu(){
  if (!qs || !ts) return;
  const applySelection = () => {
    const quickSelection = Array.from(qs.selectedDictionaries || [])
      .filter(id => typeof id === 'string' && id !== CUSTOM_DICTIONARY_META.id);
    const quickCustomSelected = !!qs.customSelected;
    const quickDifficulty = typeof qs.difficulty === 'string' && ALL_DIFFICULTIES.includes(qs.difficulty)
      ? qs.difficulty
      : null;
    const quickCustomText = typeof qs.customText?.value === 'string' ? qs.customText.value : '';
    const quickTimerEnabled = !!(qs.timerToggle && qs.timerToggle.checked);
    const quickTimeValue = Number(qs.time);
    const quickPtsEnabled = !!(qs.ptsToggle && qs.ptsToggle.checked);
    const quickPtsValue = Number(qs.pts);
    const savedProfile = teamSavedProfile;
    const finalSelection = savedProfile && Array.isArray(savedProfile.selectedDictionaries) && savedProfile.selectedDictionaries.length
      ? savedProfile.selectedDictionaries
      : quickSelection;
    const finalCustomSelected = savedProfile && typeof savedProfile.customSelected === 'boolean'
      ? savedProfile.customSelected
      : quickCustomSelected;
    const preferredDifficulty = savedProfile && typeof savedProfile.difficulty === 'string' && ALL_DIFFICULTIES.includes(savedProfile.difficulty)
      ? savedProfile.difficulty
      : quickDifficulty;
    const finalCustomText = savedProfile && Object.prototype.hasOwnProperty.call(savedProfile || {}, 'customText')
      ? String(savedProfile.customText ?? '')
      : quickCustomText;
    const finalTimerEnabled = savedProfile && Object.prototype.hasOwnProperty.call(savedProfile || {}, 'timerEnabled')
      ? !!savedProfile.timerEnabled
      : quickTimerEnabled;
    const savedTime = savedProfile && Object.prototype.hasOwnProperty.call(savedProfile || {}, 'time')
      ? Number(savedProfile.time)
      : NaN;
    const finalTime = Number.isFinite(savedTime) && savedTime > 0
      ? savedTime
      : (Number.isFinite(quickTimeValue) && quickTimeValue > 0 ? quickTimeValue : ts.time);
    const finalPtsEnabled = savedProfile && Object.prototype.hasOwnProperty.call(savedProfile || {}, 'ptsEnabled')
      ? !!savedProfile.ptsEnabled
      : quickPtsEnabled;
    const savedPts = savedProfile && Object.prototype.hasOwnProperty.call(savedProfile || {}, 'pts')
      ? Number(savedProfile.pts)
      : NaN;
    const finalPts = Number.isFinite(savedPts) && savedPts > 0
      ? savedPts
      : (Number.isFinite(quickPtsValue) && quickPtsValue > 0 ? quickPtsValue : ts.pts);

    if (ts.dictGrid){
      if (!ts.dictElements || !ts.dictElements.size){
        setupDictionarySelector(ts);
      }
      setDictionarySelection(ts, finalSelection, { emit:false, skipPersist:true });
      setCustomSelection(ts, finalCustomSelected, { emit:false, skipPersist:true });
      updateDifficultyAvailabilityForSelection(ts);
      if (preferredDifficulty && ts.difficultyButtons?.[preferredDifficulty] && !ts.difficultyButtons[preferredDifficulty].disabled){
        ts.setDifficulty(preferredDifficulty, { silent:true });
      }
      applyDictionarySelectionChange(ts, { emit:false, skipPersist:true });
    }
    if (ts.customText){
      ts.customText.value = finalCustomText;
    }
    if (typeof finalTime === 'number' && Number.isFinite(finalTime) && finalTime > 0){
      ts.time = finalTime;
      upTeamTime();
    }
    if (ts.timerToggle){
      ts.timerToggle.checked = finalTimerEnabled;
      updateTeamTimerUI();
    }
    if (typeof finalPts === 'number' && Number.isFinite(finalPts) && finalPts > 0){
      ts.pts = finalPts;
      upPts();
    }
    if (ts.ptsToggle){
      ts.ptsToggle.checked = finalPtsEnabled;
    }
    updatePtsUI();
    persistTeamSettings();
  };
  if (!dictionaryState.ready){
    ensureDictionaryIndex().then(() => {
      applySelection();
    });
    return;
  }
  applySelection();
}

// Team game state
let tWords=[], tIndex=-1, tHide=false, tRemain=0, turn=0, roundActive=false, timerExpired=false;
let teamTimerEnabled = false;
let teamPointsEnabled = false;
let teamPointGoal = 10;

const tUI = {
  word: $('#tWord'),
  feedbackBtn: $('#tFeedbackBtn'),
  description: $('#tDescription'),
  helpBtn: $('#tHelpBtn'),
  helpBox: $('#tHelpBox'),
  breadcrumbsWrap: $('#tBreadcrumbSection'),
  breadcrumbs: $('#tBreadcrumbs'),
  turnName: $('#turnTeamName'),
  tBox: $('#tTimerBox'), tLabel: $('#tTimer'),
  table: $('#scoreTable'),
  next: $('#tNext'), hit: $('#tHitBtn'), skip: $('#tSkipBtn'),
  hideBtn: $('#tHideBtn'), meaning: $('#tMeaningBtn'),
  startRound: $('#tStartRound'), endRound: $('#tEndRound'),
  status: $('#tRoundStatus'),
  statsBtn: $('#tStatsBtn'),
  resumeNotice: $('#teamResumeNotice'),
  resumeBtn: $('#teamResumeBtn')
};
const tHelpState = { open:false };

function updateTeamWordView(){
  updateWordView(tUI, { entry: tWords[tIndex] || null, hidden: tHide, helpState: tHelpState });
  refreshTeamBreadcrumbs();
}
if (tUI.helpBtn){
  tUI.helpBtn.addEventListener('click', () => {
    if (tUI.helpBtn.disabled) return;
    tHelpState.open = !tHelpState.open;
    updateTeamWordView();
  });
}
updateTeamWordView();
if (tUI.resumeBtn){
  tUI.resumeBtn.addEventListener('click', () => {
    if (!teamPendingSession) return;
    tUI.resumeBtn.disabled = true;
    applyTeamSession(teamPendingSession);
    tUI.resumeBtn.disabled = false;
  });
}

function collectTeamSession(){
  if (!Array.isArray(tWords) || !tWords.length) return null;
  const words = tWords.map(sanitizeSessionWord).filter(Boolean);
  if (!words.length) return null;
  let index = Number.isFinite(tIndex) ? Math.trunc(tIndex) : -1;
  if (index < -1) index = -1;
  if (words.length && index >= words.length) index = words.length - 1;
  const turnIndex = Number.isFinite(turn) && turn >= 0 ? Math.trunc(turn) : 0;
  const timerRemaining = Number.isFinite(Number(tRemain)) ? Math.max(0, Math.trunc(Number(tRemain))) : 0;
  const timerSetting = Number.isFinite(Number(ts.time)) && Number(ts.time) > 0 ? Math.trunc(Number(ts.time)) : 0;
  const goal = Number.isFinite(Number(teamPointGoal)) && Number(teamPointGoal) >= 0
    ? Math.trunc(Number(teamPointGoal))
    : 0;
  const statusText = typeof tUI.status?.textContent === 'string' ? tUI.status.textContent : '';
  return {
    words,
    index,
    hide: !!tHide,
    helpOpen: !!tHelpState.open,
    turn: turnIndex,
    roundActive: !!roundActive,
    timerExpired: !!timerExpired,
    timerEnabled: !!teamTimerEnabled,
    timerRunning: !!(teamTimerEnabled && roundActive && !timerExpired && tTimerId),
    timerRemaining,
    teamPointsEnabled: !!teamPointsEnabled,
    teamPointGoal: goal,
    breadcrumbContext: sanitizeBreadcrumbContext(tBreadcrumbContext),
    statusText,
    timerSetting,
    difficulty: typeof ts.difficulty === 'string' ? ts.difficulty : '',
    customSelected: !!ts.customSelected,
    selectedDictionaries: Array.from(ts.selectedDictionaries || []).filter(id => typeof id === 'string'),
    customText: typeof ts.customText?.value === 'string' ? ts.customText.value : ''
  };
}

function persistTeamSession(){
  const session = collectTeamSession();
  if (session){
    writeJson(TEAM_SESSION_KEY, session);
    return;
  }
  if (teamPendingSession){
    return;
  }
  clearTeamSession();
}

function clearTeamSession(){
  teamPendingSession = null;
  removeStorageItem(TEAM_SESSION_KEY);
}

function showTeamResumePrompt(){
  if (tUI.resumeNotice) tUI.resumeNotice.hidden = false;
  setRoundControlsEnabled(false);
  if (tUI.startRound){
    tUI.startRound.disabled = true;
  }
  if (tUI.endRound){
    tUI.endRound.disabled = true;
    tUI.endRound.style.display = 'none';
  }
  if (tUI.status){
    tUI.status.textContent = 'Игра была приостановлена. Нажмите «Продолжить игру».';
  }
}

function hideTeamResumePrompt(){
  if (tUI.resumeNotice) tUI.resumeNotice.hidden = true;
  if (tUI.startRound){
    tUI.startRound.disabled = false;
  }
}

function maybeShowTeamResumePrompt(){
  if (teamPendingSession){
    showTeamResumePrompt();
  }else{
    hideTeamResumePrompt();
  }
}

function applyTeamSession(session){
  const data = sanitizeTeamSession(session);
  if (!data) return;
  teamPendingSession = null;
  tBreadcrumbContext = data.breadcrumbContext || null;
  tWords = data.words.map(word => ({ ...word }));
  tIndex = Math.max(-1, Math.min(data.index, tWords.length ? tWords.length - 1 : -1));
  tHide = !!data.hide;
  tHelpState.open = !!data.helpOpen;
  turn = Math.max(0, Math.trunc(data.turn || 0));
  if (teams.length && turn >= teams.length){
    turn = teams.length - 1;
  }
  roundActive = !!data.roundActive;
  timerExpired = !!data.timerExpired;
  teamTimerEnabled = !!data.timerEnabled;
  teamPointsEnabled = !!data.teamPointsEnabled;
  teamPointGoal = Number.isFinite(data.teamPointGoal) ? Math.max(0, data.teamPointGoal) : teamPointGoal;
  if (ts.timerToggle){
    ts.timerToggle.checked = teamTimerEnabled;
  }
  if (data.timerSetting > 0){
    ts.time = data.timerSetting;
  }
  if (ts.ptsToggle){
    ts.ptsToggle.checked = teamPointsEnabled;
  }
  if (teamPointsEnabled && data.teamPointGoal > 0){
    ts.pts = data.teamPointGoal;
  }
  upTeamTime();
  upPts();
  updateTeamTimerUI();
  updatePtsUI();
  if (typeof ts.customSelected === 'boolean'){
    ts.customSelected = !!data.customSelected;
  }
  if (ts.customText && typeof data.customText === 'string'){
    ts.customText.value = data.customText;
  }
  updateCustomBoxVisibility(ts);
  renderScore();
  updateTurnHeader();
  updateTeamWordView();
  if (tUI.hideBtn) tUI.hideBtn.textContent = tHide ? 'Показать слово' : 'Скрыть слово';
  if (tTimerId){
    clearInterval(tTimerId);
    tTimerId = null;
  }
  const baseRemain = data.timerRemaining > 0
    ? data.timerRemaining
    : (data.timerSetting > 0 ? data.timerSetting : ts.time);
  tRemain = Math.max(0, Math.trunc(Number(baseRemain) || 0));
  if (teamTimerEnabled){
    if (tUI.tBox) tUI.tBox.style.display = 'inline-flex';
    if (tUI.tLabel){
      tUI.tLabel.textContent = `${pad(Math.floor(tRemain/60))}:${pad(tRemain%60)}`;
    }
    if (roundActive && data.timerRunning && !timerExpired && tRemain > 0){
      startTeamTimerCountdown(tRemain);
    }
  }else if (tUI.tBox){
    tUI.tBox.style.display = 'none';
  }
  if (roundActive){
    setRoundControlsEnabled(true);
    if (tUI.startRound){
      tUI.startRound.style.display = 'none';
    }
    if (tUI.endRound){
      tUI.endRound.style.display = 'inline-flex';
      tUI.endRound.disabled = false;
    }
    if (timerExpired){
      if (tUI.next) tUI.next.disabled = true;
      lockFinalActions();
    }else if (tUI.next){
      tUI.next.disabled = false;
    }
  }else{
    setRoundControlsEnabled(false);
    if (tUI.endRound){
      tUI.endRound.style.display = 'none';
    }
    if (tUI.startRound){
      tUI.startRound.style.display = 'inline-flex';
      tUI.startRound.disabled = false;
    }
  }
  if (data.statusText){
    setStatus(data.statusText);
  }
  hideTeamResumePrompt();
  persistTeamSession();
}
function updateTurnHeader(){
  if (!teams[turn]) return;
  const current = teams[turn];
  const iconDef = getTeamIcon(current.icon);
  tUI.turnName.innerHTML = `<span class="team-chip-icon">${iconDef.emoji}</span>${escapeHtml(current.name || defaultTeamName(turn))}`;
}

function renderScore(){
  tUI.table.innerHTML='';
  teams.forEach((team, idx)=>{
    const iconDef = getTeamIcon(team.icon);
    const row=document.createElement('div');
    row.className='row';
    row.innerHTML = `
      <div class="chip team-chip" style="min-width:160px">
        <span class="team-chip-icon">${iconDef.emoji}</span>
        ${escapeHtml(team.name || defaultTeamName(idx))}
      </div>
      <div class="chip">Угадано: ${team.hit}</div>
      <div class="chip">Пропущено: ${team.miss}</div>
      ${teamPointsEnabled ? `<div class="chip">Очки: ${team.points}</div>` : ''}`;
    tUI.table.appendChild(row);
  });
}

function startTeamTimerCountdown(remaining){
  if (!teamTimerEnabled){
    if (tUI.tBox) tUI.tBox.style.display = 'none';
    return;
  }
  if (!tUI.tLabel) return;
  if (tUI.tBox) tUI.tBox.style.display = 'inline-flex';
  if (tTimerId){
    clearInterval(tTimerId);
  }
  tRemain = Math.max(0, Math.trunc(Number(remaining) || 0));
  tUI.tLabel.textContent = `${pad(Math.floor(tRemain/60))}:${pad(tRemain%60)}`;
  if (tRemain <= 0){
    clearInterval(tTimerId); tTimerId = null;
    handleTimerEnd();
    persistTeamSession();
    return;
  }
  tTimerId = setInterval(()=>{
    tRemain = Math.max(0, tRemain - 1);
    if (tUI.tLabel){
      tUI.tLabel.textContent = `${pad(Math.floor(tRemain/60))}:${pad(tRemain%60)}`;
    }
    if (tRemain <= 0){
      clearInterval(tTimerId); tTimerId = null;
      handleTimerEnd();
      persistTeamSession();
    }else{
      if (tRemain <= 10){
        playTick();
      }
      persistTeamSession();
    }
  },1000);
  persistTeamSession();
}

function setRoundControlsEnabled(enabled){
  [tUI.next, tUI.hit, tUI.skip, tUI.hideBtn, tUI.meaning, tUI.helpBtn].forEach(btn=>{
    if (btn){
      btn.disabled = !enabled;
    }
  });
}

function resetWordView(){
  tHide = false;
  tIndex = Math.min(tIndex, tWords.length ? tWords.length - 1 : -1);
  tHelpState.open = false;
  updateTeamWordView();
  if (tUI.hideBtn) tUI.hideBtn.textContent = 'Скрыть слово';
}

function advanceWord(){
  if (!tWords.length) return;
  tIndex = (tIndex + 1) % tWords.length;
  tHide = false;
  tHelpState.open = false;
  updateTeamWordView();
  if (tUI.hideBtn) tUI.hideBtn.textContent = 'Скрыть слово';
  persistTeamSession();
}

function setStatus(text){
  if (tUI.status) tUI.status.textContent = text;
}

function preRoundMessage(name, initial){
  if (!name) return;
  if (initial){
    setStatus(`Команда «${name}», приготовьтесь и нажмите «Начать раунд».`);
  }else{
    setStatus(`Ход завершён. Передайте устройство команде «${name}» и нажмите «Начать раунд».`);
  }
}

async function startTeamGame(){
  if (teams.length<2){ alert('Нужно минимум 2 команды'); return; }
  if (ts.start) ts.start.disabled = true;
  try{
    await ensureDictionaryIndex();
    const selectedIds = Array.from(ts.selectedDictionaries || []);
    const includeCustom = !!ts.customSelected;
    if (!selectedIds.length && !includeCustom){
      alert('Выберите хотя бы один словарь');
      return;
    }
    const difficulty = ts.difficulty || 'easy';
    let entries = [];
    let dictionaryEntriesCount = 0;
    let customEntriesCount = 0;
    if (includeCustom){
      const customEntries = parseCustomWords(ts.customText?.value, { difficulty });
      customEntriesCount = customEntries.length;
      entries = entries.concat(customEntries);
    }
    if (selectedIds.length){
      const batches = await Promise.all(selectedIds.map(async dictId => {
        const meta = getDictionaryMeta(dictId);
        const available = getOrderedDifficulties(meta);
        if (difficulty !== 'mix' && !available.includes(difficulty)){
          return [];
        }
        try{
          const list = await loadDictionaryEntries(dictId, difficulty);
          return list.map((entry, idx) => ({
            ...entry,
            id: entry.id || `${dictId}_${difficulty}_${idx+1}`
          }));
        }catch(err){
          console.error(`Не удалось загрузить словарь ${dictId}/${difficulty}:`, err);
          return [];
        }
      }));
      batches.forEach(list => {
        dictionaryEntriesCount += list.length;
        entries = entries.concat(list);
      });
    }
    entries = entries.filter(entry => entry && typeof entry.term === 'string' && entry.term.trim().length);
    if (!entries.length){
      if (!includeCustom && selectedIds.length && dictionaryEntriesCount === 0){
        alert('Для выбранных словарей на этом уровне сложности нет слов. Попробуйте изменить сложность или набор словарей.');
      }else if (includeCustom && customEntriesCount === 0 && dictionaryEntriesCount === 0){
        alert('Добавьте хотя бы одно слово');
      }else{
        alert('Добавьте хотя бы одно слово');
      }
      return;
    }
    tBreadcrumbContext = { selectedIds, includeCustom, difficulty };
    tWords = entries.map(entry => ({ ...entry }));
    shuffle(tWords);
    teams = teams.map((t, idx)=>(
      {
        name: t.name || defaultTeamName(idx),
        icon: t.icon || TEAM_ICONS[idx % TEAM_ICONS.length].id,
        points:0,
        hit:0,
        miss:0,
        hitWords:[],
        missWords:[]
      }
    ));
    persistTeams();
    tIndex=-1; tHide=false; tHelpState.open=false; turn=0; roundActive=false; timerExpired=false;
    teamTimerEnabled = !!ts.timerToggle?.checked;
    teamPointsEnabled = !!ts.ptsToggle?.checked;
    teamPointGoal = ts.pts;
    renderScore();
    updateTurnHeader();
    resetWordView();
    setRoundControlsEnabled(false);
    clearInterval(tTimerId); tTimerId=null;
    if (teamTimerEnabled){
      tUI.tBox.style.display='inline-flex';
      tRemain = ts.time;
      tUI.tLabel.textContent = `${pad(Math.floor(tRemain/60))}:${pad(tRemain%60)}`;
    }else{
      tUI.tBox.style.display='none';
    }
    if (tUI.startRound){
      tUI.startRound.style.display='inline-flex';
      tUI.startRound.disabled=false;
    }
    if (tUI.endRound){
      tUI.endRound.style.display='none';
    }
    const currentName = teams[turn]?.name || defaultTeamName(turn);
    preRoundMessage(currentName, true);
    teamPendingSession = null;
    persistTeamSession();
    show('viewTeamGame');
  }finally{
    if (ts.start) ts.start.disabled = false;
  }
}
if (ts.start){
  ts.start.onclick = () => { startTeamGame().catch(err => console.error(err)); };
}

function beginRound(){
  if (roundActive) return;
  roundActive=true;
  timerExpired=false;
  setRoundControlsEnabled(true);
  if (tUI.startRound){
    tUI.startRound.style.display='none';
  }
  if (tUI.endRound){
    tUI.endRound.style.display='inline-flex';
    tUI.endRound.disabled=false;
  }
  const currentName = teams[turn]?.name || defaultTeamName(turn);
  setStatus(`Ход команды «${currentName}»`);
  clearInterval(tTimerId); tTimerId=null;
  if (teamTimerEnabled){
    startTeamTimerCountdown(ts.time);
  }else{
    if (tUI.tBox) tUI.tBox.style.display='none';
    tRemain = ts.time;
  }
  advanceWord();
}

function handleTimerEnd(){
  if (!roundActive || timerExpired) return;
  timerExpired=true;
  playAlarm();
  setStatus('Время вышло! Завершите объяснение и нажмите «Закончить».');
  if (tUI.next) tUI.next.disabled = true;
  persistTeamSession();
}

function lockFinalActions(){
  if (tUI.hit) tUI.hit.disabled = true;
  if (tUI.skip) tUI.skip.disabled = true;
}

function finishRound(){
  if (!roundActive) return;
  clearInterval(tTimerId); tTimerId=null;
  roundActive=false;
  timerExpired=false;
  setRoundControlsEnabled(false);
  if (tUI.endRound){
    tUI.endRound.style.display='none';
  }
  if (tUI.startRound){
    tUI.startRound.style.display='inline-flex';
    tUI.startRound.disabled=false;
  }
  const nextIndex = (turn + 1) % teams.length;
  const nextName = teams[nextIndex]?.name || defaultTeamName(nextIndex);
  turn = nextIndex;
  updateTurnHeader();
  preRoundMessage(nextName, false);
  resetWordView();
  if (teamTimerEnabled){
    tUI.tBox.style.display='inline-flex';
    tRemain = ts.time;
    tUI.tLabel.textContent = `${pad(Math.floor(tRemain/60))}:${pad(tRemain%60)}`;
  }else{
    tUI.tBox.style.display='none';
  }
  persistTeamSession();
}

function declareWinner(team){
  clearInterval(tTimerId); tTimerId=null;
  roundActive=false;
  timerExpired=false;
  alert('Победа: ' + team.name);
  clearTeamSession();
  show('viewMenu');
}

if (tUI.startRound){
  tUI.startRound.onclick = beginRound;
}
if (tUI.endRound){
  tUI.endRound.onclick = finishRound;
}

tUI.next.onclick = ()=>{
  if (!roundActive || timerExpired) return;
  advanceWord();
};
tUI.hideBtn.onclick = ()=>{
  if (!roundActive || tIndex<0) return;
  tHide = !tHide;
  if (tHide){
    tHelpState.open = false;
  }
  updateTeamWordView();
  tUI.hideBtn.textContent = tHide ? 'Показать слово' : 'Скрыть слово';
  persistTeamSession();
};
tUI.meaning.onclick = ()=>{
  if (!roundActive || tIndex<0) return;
  const current = tWords[tIndex];
  if (!current?.term) return;
  window.open('https://ru.wikipedia.org/wiki/'+encodeURIComponent(current.term), '_blank');
};

if (tUI.statsBtn){
  tUI.statsBtn.onclick = ()=>{
    if (!teams.length){
      alert('Статистика пока пуста');
      return;
    }
    const blocks = teams.map((team, idx)=>{
      const name = team.name || defaultTeamName(idx);
      const hitList = Array.isArray(team.hitWords) ? team.hitWords : [];
      const missList = Array.isArray(team.missWords) ? team.missWords : [];
      return `Команда «${name}»\nУгаданные (${hitList.length}):\n${formatWordList(hitList)}\n\nПропущенные (${missList.length}):\n${formatWordList(missList)}`;
    });
    alert(`Статистика команд\n\n${blocks.join('\n\n')}`);
  };
}

tUI.hit.onclick = ()=>{
  if (!roundActive) return;
  const current = tWords[tIndex];
  if (current?.term) teams[turn].hitWords.push(current.term);
  teams[turn].hit++;
  if (teamPointsEnabled) teams[turn].points++;
  renderScore();
  persistTeams();
  persistTeamSession();
  if (teamPointsEnabled && teams[turn].points >= teamPointGoal){
    declareWinner(teams[turn]);
    return;
  }
  if (timerExpired){
    lockFinalActions();
    return;
  }
  advanceWord();
};
tUI.skip.onclick = ()=>{
  if (!roundActive) return;
  const current = tWords[tIndex];
  if (current?.term) teams[turn].missWords.push(current.term);
  teams[turn].miss++;
  if (teamPointsEnabled) teams[turn].points--;
  renderScore();
  persistTeams();
  persistTeamSession();
  if (timerExpired){
    lockFinalActions();
    return;
  }
  advanceWord();
};


// Helpers
const escapeHtml = str => str
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#39;');
function getDifficultyLabel(level){
  if (!level) return '';
  const normalized = String(level).toLowerCase();
  if (DIFFICULTY_LABELS[normalized]) return DIFFICULTY_LABELS[normalized];
  return level;
}
function getDictionaryLabelById(dictId){
  if (!dictId) return '';
  if (dictId === CUSTOM_DICTIONARY_META.id){
    const customTitle = typeof CUSTOM_DICTIONARY_META?.title === 'string' && CUSTOM_DICTIONARY_META.title.trim()
      ? CUSTOM_DICTIONARY_META.title.trim()
      : 'Свой словарь';
    return customTitle;
  }
  const meta = getDictionaryMeta(dictId);
  if (!meta) return dictId;
  const title = typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : '';
  return title || meta.id || dictId;
}
function buildWordBreadcrumb(entry, context){
  if (!entry) return null;
  const contextIds = Array.isArray(context?.selectedIds) ? context.selectedIds : [];
  const entryDict = typeof entry.dictionaryId === 'string' ? entry.dictionaryId : '';
  let dictionaryText = getDictionaryLabelById(entryDict);
  if (!dictionaryText){
    if (entryDict){
      dictionaryText = entryDict;
    }else if (contextIds.length === 1){
      dictionaryText = getDictionaryLabelById(contextIds[0]);
    }else if (!contextIds.length && context?.includeCustom){
      dictionaryText = getDictionaryLabelById(CUSTOM_DICTIONARY_META.id);
    }
  }
  const dictionaryPrefix = dictionaryText ? 'Словарь' : '';

  const entryDiff = typeof entry.difficulty === 'string' ? entry.difficulty.trim().toLowerCase() : '';
  const contextDiff = typeof context?.difficulty === 'string' ? context.difficulty.trim().toLowerCase() : '';
  let difficultyKey = entryDiff;
  if (!difficultyKey && contextDiff && contextDiff !== 'mix'){
    difficultyKey = contextDiff;
  }
  const difficultyText = difficultyKey ? getDifficultyLabel(difficultyKey) : '';

  if (!dictionaryText && !difficultyText){
    return null;
  }
  return {
    dictionaryText,
    dictionaryPrefix,
    difficultyText,
    difficultyPrefix: difficultyText ? 'Сложность' : ''
  };
}
function refreshQuickBreadcrumbs(){
  const entry = qWords[qIndex] || null;
  const data = buildWordBreadcrumb(entry, qBreadcrumbContext);
  applyWordBreadcrumbs(qUI, data);
}
function refreshTeamBreadcrumbs(){
  const entry = tWords[tIndex] || null;
  const data = buildWordBreadcrumb(entry, tBreadcrumbContext);
  applyWordBreadcrumbs(tUI, data);
}
function applyWordBreadcrumbs(ui, data){
  if (!ui || !ui.breadcrumbs) return;
  const wrap = ui.breadcrumbsWrap || ui.breadcrumbs.parentElement || null;
  if (!data || (!data.dictionaryText && !data.difficultyText)){
    if (ui.breadcrumbs) ui.breadcrumbs.innerHTML = '';
    if (wrap) wrap.hidden = true;
    return;
  }
  const parts = [];
  if (data.dictionaryText){
    const label = data.dictionaryPrefix || 'Словарь';
    parts.push(`
      <span class="crumb">
        <span class="crumb-label">${escapeHtml(label)}:</span>
        <span class="crumb-value">${escapeHtml(data.dictionaryText)}</span>
      </span>`);
  }
  if (data.difficultyText){
    const label = data.difficultyPrefix || 'Сложность';
    parts.push(`
      <span class="crumb">
        <span class="crumb-label">${escapeHtml(label)}:</span>
        <span class="crumb-value">${escapeHtml(data.difficultyText)}</span>
      </span>`);
  }
  const separator = '<span class="crumb-separator">•</span>';
  ui.breadcrumbs.innerHTML = parts.join(separator);
  if (wrap) wrap.hidden = false;
}

function deriveQuickDifficulty(entry){
  if (entry && typeof entry.difficulty === 'string' && entry.difficulty.trim()){
    return entry.difficulty.trim();
  }
  const raw = typeof qs?.difficulty === 'string' ? qs.difficulty.trim() : '';
  if (!raw || raw === 'mix') return null;
  return raw;
}

function deriveTeamDifficulty(entry){
  if (entry && typeof entry.difficulty === 'string' && entry.difficulty.trim()){
    return entry.difficulty.trim();
  }
  const raw = typeof ts?.difficulty === 'string' ? ts.difficulty.trim() : '';
  if (!raw || raw === 'mix') return null;
  return raw;
}

function normalizeTermId(entry){
  if (!entry) return null;
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  const dict = typeof entry.dictionaryId === 'string' ? entry.dictionaryId.trim() : '';
  const term = typeof entry.term === 'string' ? entry.term.trim() : '';
  if (id && dict) return `${dict}:${id}`;
  if (id) return id;
  if (dict && term) return `${dict}:${term}`;
  return term || null;
}

function buildFeedbackContext(mode){
  const normalizedMode = mode === 'quick' || mode === 'team' ? mode : 'home';
  const timestamp = new Date().toISOString();
  const context = {
    mode: normalizedMode,
    termId: null,
    termText: null,
    difficulty: null,
    timestamp,
    appVersion: APP_VERSION,
    language: APP_LANGUAGE || 'ru'
  };
  if (normalizedMode === 'quick'){
    const entry = qWords[qIndex] || null;
    context.termId = normalizeTermId(entry);
    context.termText = entry && typeof entry.term === 'string' ? entry.term : null;
    context.difficulty = deriveQuickDifficulty(entry);
  }else if (normalizedMode === 'team'){
    const entry = tWords[tIndex] || null;
    context.termId = normalizeTermId(entry);
    context.termText = entry && typeof entry.term === 'string' ? entry.term : null;
    context.difficulty = deriveTeamDifficulty(entry);
  }else{
    const entry = qWords[qIndex] || null;
    context.termText = entry && typeof entry.term === 'string' ? entry.term : null;
    context.termId = normalizeTermId(entry);
    context.difficulty = deriveQuickDifficulty(entry);
  }
  return context;
}

function getActiveFeedbackMode(){
  if (screen === 'viewQuickGame') return 'quick';
  if (screen === 'viewTeamGame') return 'team';
  return 'home';
}

function setupFeedbackIntegration(){
  const api = window.Feedback;
  if (!api || typeof api.open !== 'function') return;
  const resolver = () => buildFeedbackContext(getActiveFeedbackMode());
  if (typeof api.setContextResolver === 'function'){
    api.setContextResolver(resolver);
  }
  const register = typeof api.registerTrigger === 'function'
    ? (el, fn) => api.registerTrigger(el, fn)
    : (el, fn) => {
        if (!el) return;
        el.addEventListener('click', () => {
          const ctx = typeof fn === 'function' ? fn() : fn;
          api.open(ctx);
        });
      };
  if (menuFeedbackBtn){
    register(menuFeedbackBtn, () => buildFeedbackContext('home'));
  }
  if (qUI.feedbackBtn){
    register(qUI.feedbackBtn, () => buildFeedbackContext('quick'));
  }
  if (tUI.feedbackBtn){
    register(tUI.feedbackBtn, () => buildFeedbackContext('team'));
  }
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }

// initial
setupFeedbackIntegration();
fetchBackendVersion();

function restoreInitialView(){
  const stored = readScreenPref();
  if (stored && VIEWS.includes(stored)){
    if (stored === 'viewTeamSetup'){
      ensureTeamsSeed();
      renderTeams();
      syncTeamSettingsFromMenu();
    }
    if (stored === 'viewTeamGame'){
      ensureTeamsSeed();
      renderTeams();
      syncTeamSettingsFromMenu();
      renderScore();
      updateTurnHeader();
      resetWordView();
      setRoundControlsEnabled(false);
      if (tUI.endRound) tUI.endRound.style.display='none';
      if (tUI.startRound){
        tUI.startRound.style.display='inline-flex';
        tUI.startRound.disabled=false;
      }
      if (tUI.tBox) tUI.tBox.style.display = teamTimerEnabled ? 'inline-flex' : 'none';
      setStatus('Нажмите «Начать раунд», чтобы начать игру.');
    }
    show(stored);
    return;
  }
  show('viewMenu');
}
restoreInitialView();

if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(err => {
      console.warn('Service worker registration failed', err);
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    window.location.reload();
  });
}
