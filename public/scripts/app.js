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
const CUSTOM_DICTIONARY_META = {
  id: 'custom',
  title: 'Свой словарь',
  description: 'Вставьте слова ниже'
};

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
let screen = 'viewMenu';
let qTimerId = null;
let qTimerRunning = false;
let tTimerId = null;
const WORD_PLACEHOLDER = '—';
const WORD_SECRET_PLACEHOLDER = '•••';
const WORD_DESCRIPTION_FALLBACK = 'Описание недоступно';
const WORD_DESCRIPTION_HIDDEN = 'Слово скрыто';
const WORD_HELP_FALLBACK = 'Подсказка недоступна';

function updateWordView(view, { entry, hidden, helpState }){
  const hasEntry = !!entry && typeof entry.term === 'string' && entry.term.trim().length;
  const isHidden = !!hidden;
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
    chip.textContent = meta.title || meta.id;
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
const HELP_TEXT = [
  '🐊 CrocoMim — игра в объяснение слов мимикой и жестами.',
  '',
  'Режимы:',
  '⚡ Быстрый — один ведущий, счётчик угаданных и пропущенных слов, опционально таймер и цель по очкам.',
  '👥 Команда — команды ходят по очереди, ведите счёт очков и отслеживайте результат каждого раунда.',
  '',
  'Настройки:',
  '• Словарь — выберите готовую подборку слов или переключитесь на «Свой словарь».',
  '• Свой словарь — вставьте свои слова через запятую или перенос строки, чтобы играть с ними.',
  '• Таймер — активируйте галочку и задайте продолжительность раунда шагом 30 секунд.',
  '• Очки до победы — задайте цель по очкам; в командном режиме счёт виден в таблице.',
  '• Тема — на главном экране переключайте светлую и тёмную темы для удобства.',
  '',
  'Новая справка:',
  '• Обновлённая памятка всегда под рукой — нажмите «?» в шапке, чтобы открыть её снова.'
].join('\n');
const THEME_KEY = 'croc-theme';
const SCREEN_KEY = 'croc-screen';
const QUICK_STATS_KEY = 'croc-quick-stats';
const TEAM_STATS_KEY = 'croc-team-stats';

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
};

// Header buttons
backBtn.onclick = () => {
  if (screen==='viewQuickGame' || screen==='viewTeamGame'){
    if (!confirm('Выйти в меню? Текущая партия будет завершена.')) return;
  }
  stopQuickTimer();
  if (typeof tTimerId !== 'undefined'){ clearInterval(tTimerId); tTimerId=null; }
  show('viewMenu');
};
helpBtn.onclick = () => {
  alert(HELP_TEXT);
};

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
initDifficultyControls(qs);
qs.onDifficultyChange = level => {
  qs.difficulty = level;
};
const upQuickTime = () => qs.timeLabel.textContent = qs.time+' с';
const upQuickPts = () => qs.ptsLabel.textContent = qs.pts;
upQuickTime();
upQuickPts();
qs.timerToggle.checked = false;
qs.ptsToggle.checked = false;
const updateQuickTimerUI = () => {
  if (!qs.timerToggle) return;
  const enabled = qs.timerToggle.checked;
  [qs.timeMinus, qs.timePlus].forEach(btn=>{ if (btn) btn.disabled = !enabled; });
  if (qs.timeLabel) qs.timeLabel.classList.toggle('disabled', !enabled);
  updateQuickTimerButton();
};
qs.timeMinus.onclick = () => { qs.time = Math.max(30, qs.time-30); upQuickTime(); };
qs.timePlus.onclick = () => { qs.time += 30; upQuickTime(); };
qs.ptsMinus.onclick = () => { qs.pts = Math.max(1, qs.pts-1); upQuickPts(); };
qs.ptsPlus.onclick = () => { qs.pts += 1; upQuickPts(); };
const updateQuickPts = () => {
  if (!qs.ptsControls) return;
  const enabled = qs.ptsToggle.checked;
  qs.ptsControls.classList.toggle('is-disabled', !enabled);
  qs.ptsControls.setAttribute('aria-disabled', String(!enabled));
  [qs.ptsMinus, qs.ptsPlus].forEach(btn=>{ if (btn) btn.disabled = !enabled; });
  if (qs.ptsLabel) qs.ptsLabel.classList.toggle('disabled', !enabled);
};
if (qs.timerToggle) qs.timerToggle.onchange = updateQuickTimerUI;
updateQuickTimerUI();
qs.ptsToggle.onchange = updateQuickPts;
updateQuickPts();
updateCustomBoxVisibility(qs);

// Quick game state
const initialQuickStats = readJson(QUICK_STATS_KEY, {hitWords:[], missWords:[]}) || {hitWords:[], missWords:[]};
let qHitWords = sanitizeWordNames(initialQuickStats.hitWords);
let qMissWords = sanitizeWordNames(initialQuickStats.missWords);
let qWords=[], qIndex=0, qHide=false, qRemain=0, qHit=qHitWords.length, qMiss=qMissWords.length, qTarget=null;

const qUI = {
  word: $('#qWord'),
  description: $('#qDescription'),
  helpBtn: $('#qHelpBtn'),
  helpBox: $('#qHelpBox'),
  hit: $('#qHit'), miss: $('#qMiss'),
  next: $('#qNext'), hitBtn: $('#qHitBtn'), skipBtn: $('#qSkipBtn'),
  hideBtn: $('#qHideBtn'), meaningBtn: $('#qMeaningBtn'),
  tBox: $('#qTimerBox'), tLabel: $('#qTimer'),
  restartTimerBtn: $('#qRestartTimer'),
  statsBtn: $('#qStatsBtn')
};
const qHelpState = { open:false };

function updateQuickWordView(){
  updateWordView(qUI, { entry: qWords[qIndex] || null, hidden: qHide, helpState: qHelpState });
}
if (qUI.helpBtn){
  qUI.helpBtn.addEventListener('click', () => {
    if (qUI.helpBtn.disabled) return;
    qHelpState.open = !qHelpState.open;
    updateQuickWordView();
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
const parseCustomWords = raw => (raw || '')
  .split(/[,\n\r]+/)
  .map(s=>s.trim())
  .filter(Boolean)
  .map((term, idx) => ({
    id: `custom_${idx+1}`,
    dictionaryId: 'custom',
    term,
    description: '',
    about: ''
  }));

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
}

function restartQuickTimer(){
  if (!qs.timerToggle.checked){
    if (qUI.tBox) qUI.tBox.style.display = 'none';
    stopQuickTimer();
    return;
  }
  if (!qUI.tLabel) return;
  if (qUI.tBox) qUI.tBox.style.display = 'inline-flex';
  if (qUI.restartTimerBtn) qUI.restartTimerBtn.style.display = '';
  if (qTimerId){
    clearInterval(qTimerId);
  }
  qRemain = qs.time;
  qUI.tLabel.textContent = `${pad(Math.floor(qRemain/60))}:${pad(qRemain%60)}`;
  qTimerRunning = true;
  updateQuickTimerButton();
  qTimerId = setInterval(()=>{
    qRemain--;
    if (qRemain <= 0){
      qUI.tLabel.textContent = '00:00';
      stopQuickTimer();
      playAlarm();
      nextWord();
    }else{
      qUI.tLabel.textContent = `${pad(Math.floor(qRemain/60))}:${pad(qRemain%60)}`;
      if (qRemain <= 10){
        playTick();
      }
    }
  },1000);
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
      const customEntries = parseCustomWords(qs.customText?.value);
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
initDifficultyControls(ts);
ts.onDifficultyChange = level => {
  ts.difficulty = level;
};
const upTeamTime = () => ts.timeLabel.textContent = ts.time+' с';
const upPts = () => ts.ptsLabel.textContent = ts.pts;
upTeamTime(); upPts();
ts.timeMinus.onclick = ()=>{ ts.time = Math.max(30, ts.time-30); upTeamTime(); };
ts.timePlus.onclick = ()=>{ ts.time += 30; upTeamTime(); };
ts.ptsMinus.onclick = ()=>{ ts.pts = Math.max(1, ts.pts-1); upPts(); };
ts.ptsPlus.onclick = ()=>{ ts.pts += 1; upPts(); };
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
if (ts.timerToggle) ts.timerToggle.onchange = updateTeamTimerUI;
updateTeamTimerUI();
ts.ptsToggle.onchange = updatePtsUI;
updatePtsUI();

ensureDictionaryIndex().then(() => {
  setupDictionarySelector(qs);
  setupDictionarySelector(ts);
  if (dictionaryState.list.length && !qs.selectedDictionaries.size){
    const firstId = dictionaryState.list[0].id;
    setDictionarySelection(qs, [firstId], { emit:false });
    updateDifficultyAvailabilityForSelection(qs);
  }
  if (ts.dictElements){
    setDictionarySelection(ts, Array.from(qs.selectedDictionaries || []), { emit:false });
    setCustomSelection(ts, qs.customSelected, { emit:false });
    updateDifficultyAvailabilityForSelection(ts);
  }
  applyDictionarySelectionChange(qs, { emit:false });
  applyDictionarySelectionChange(ts, { emit:false });
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
    if (ts.dictGrid){
      if (!ts.dictElements || !ts.dictElements.size){
        setupDictionarySelector(ts);
      }
      setDictionarySelection(ts, Array.from(qs.selectedDictionaries || []), { emit:false });
      setCustomSelection(ts, qs.customSelected, { emit:false });
      updateDifficultyAvailabilityForSelection(ts);
      if (qs.selectedDictionaries?.size){
        const targetDifficulty = qs.difficulty;
        if (ts.difficultyButtons?.[targetDifficulty] && !ts.difficultyButtons[targetDifficulty].disabled){
          ts.setDifficulty(targetDifficulty, { silent:true });
        }
      }
      applyDictionarySelectionChange(ts, { emit:false });
    }
    if (ts.customText && qs.customText){
      ts.customText.value = qs.customText.value;
    }
    if (typeof qs.time === 'number'){
      ts.time = qs.time;
      upTeamTime();
    }
    if (ts.timerToggle && qs.timerToggle){
      ts.timerToggle.checked = qs.timerToggle.checked;
      updateTeamTimerUI();
    }
    if (typeof qs.pts === 'number'){
      ts.pts = qs.pts;
      upPts();
    }
    if (ts.ptsToggle && qs.ptsToggle){
      ts.ptsToggle.checked = qs.ptsToggle.checked;
    }
    updatePtsUI();
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
  description: $('#tDescription'),
  helpBtn: $('#tHelpBtn'),
  helpBox: $('#tHelpBox'),
  turnName: $('#turnTeamName'),
  tBox: $('#tTimerBox'), tLabel: $('#tTimer'),
  table: $('#scoreTable'),
  next: $('#tNext'), hit: $('#tHitBtn'), skip: $('#tSkipBtn'),
  hideBtn: $('#tHideBtn'), meaning: $('#tMeaningBtn'),
  startRound: $('#tStartRound'), endRound: $('#tEndRound'),
  status: $('#tRoundStatus'),
  statsBtn: $('#tStatsBtn')
};
const tHelpState = { open:false };

function updateTeamWordView(){
  updateWordView(tUI, { entry: tWords[tIndex] || null, hidden: tHide, helpState: tHelpState });
}
if (tUI.helpBtn){
  tUI.helpBtn.addEventListener('click', () => {
    if (tUI.helpBtn.disabled) return;
    tHelpState.open = !tHelpState.open;
    updateTeamWordView();
  });
}
updateTeamWordView();

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
      const customEntries = parseCustomWords(ts.customText?.value);
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
    tUI.tBox.style.display='inline-flex';
    tRemain = ts.time;
    tUI.tLabel.textContent = `${pad(Math.floor(tRemain/60))}:${pad(tRemain%60)}`;
    tTimerId = setInterval(()=>{
      tRemain--;
      if (tRemain <= 0){
        clearInterval(tTimerId); tTimerId=null;
        tUI.tLabel.textContent = '00:00';
        handleTimerEnd();
      }else{
        tUI.tLabel.textContent = `${pad(Math.floor(tRemain/60))}:${pad(tRemain%60)}`;
        if (tRemain <= 10){
          playTick();
        }
      }
    },1000);
  }else{
    tUI.tBox.style.display='none';
  }
  advanceWord();
}

function handleTimerEnd(){
  if (!roundActive || timerExpired) return;
  timerExpired=true;
  playAlarm();
  setStatus('Время вышло! Завершите объяснение и нажмите «Закончить».');
  if (tUI.next) tUI.next.disabled = true;
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
}

function declareWinner(team){
  clearInterval(tTimerId); tTimerId=null;
  roundActive=false;
  timerExpired=false;
  alert('Победа: ' + team.name);
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
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }

// initial
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
