// --- Utilities & state ---
const $ = sel => document.querySelector(sel);
const VIEWS = ['viewMenu','viewQuickGame','viewTeamSetup','viewTeamGame'];
let screen = 'viewMenu';
let qTimerId = null;
let tTimerId = null;
const backBtn = $('#btnBack');
const helpBtn = $('#btnHelp');
const modeQuickBtn = $('#modeQuick');
const themeSlider = $('#themeSlider');
const themeSection = $('#themeSection');
const bodyEl = document.body;
const THEME_KEY = 'croc-theme';
const SCREEN_KEY = 'croc-screen';
const QUICK_STATS_KEY = 'croc-quick-stats';
const TEAM_STATS_KEY = 'croc-team-stats';

const applyTheme = mode => {
  const themeClass = mode === 'dark' ? 'theme-dark' : 'theme-light';
  bodyEl.classList.remove('theme-light','theme-dark');
  bodyEl.classList.add(themeClass);
  if (themeSlider) themeSlider.value = mode === 'dark' ? '1' : '0';
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

const DICTS = {
  easy:["дом","кот","собака","мяч","стол","стул","окно","дверь","машина","ручка","карандаш","тетрадь","лампа","книга","телефон","чашка","тарелка","ложка","вилка","нож","яблоко","банан","хлеб","сыр","молоко","чай","кофе","сок","вода","рыба","соль","сахар","масло","яйцо","ботинки","шапка","куртка","зонт","очки","часы","футбол","велосипед","рюкзак","карта","ключ","замок","мост","улица","парк","пальто","свитер","носки","перчатки","шарф","поезд","автобус","самолёт","корабль","дерево","цветок","трава","река","море","гора","облако","солнце","луна","звезда","дождь","снег","ветер","гром","молния","песок","пляж","печенье","торт","конфета","шоколад","мороз","тепло","холод","лето","осень","зима","весна","сумка","кресло","диван","кровать","подушка","одеяло","ковёр","полка","доска","дверца"],
  medium:["музыкант","танцор","художник","актёр","режиссёр","библиотека","музей","театр","кино","концерт","оркестр","скрипка","труба","барабан","пианино","клавиатура","компьютер","принтер","интернет","браузер","переводчик","инженер","архитектор","строитель","механик","пилот","почтальон","повар","пекарь","парашют","компас","микрофон","телескоп","микроскоп","маскарад","портрет","скульптура","карикатура","иллюстрация","маршрут","комета","планета","галактика","спутник","космодром","ракета","астронавт","гравитация","марафон","эстафета","трек","полоса","скейтборд","самокат","ролики","каноэ","парус","якорь","навигатор","перекрёсток","пешеход","светофор","переход","эскалатор","турникет","диалект","сценарий","метафора","ирония","аллегория","парадокс","формула","теорема","переменная","уравнение","фотосинтез","диаграмма","график","алгоритм","архив","протокол","сервер","клиент","пароль","шифр","волонтёр","ярмарка","праздник","фестиваль","капитан","команда","стратегия","тактика","капля","узор"],
  hard:["амбивалентность","конформизм","парадигма","катарсис","энтропия","апофения","идентификация","диссоциация","консенсус","редукционизм","рефлексия","онтология","эвристика","герменевтика","персистентность","импликация","дедукция","индукция","супрематизм","синергия","палиндром","оксюморон","метаморфоза","категоричность","диахрония","синекдоха","аллитерация","перфекционизм","преференция","когезия","когерентность","субстанция","трансцендентность","имманентность","телеметрия","релятивизм","экстраполяция","интерполяция","комбинаторика","аксиома","лемма","корреляция","деконструкция","репликация","квантификация","интерференция","флуктуация","суперпозиция","идемпотентность","асимптота","дифференциация","интеграция","дисперсия","конфабуляция","экспликация","импеданс","резистивность","индуктивность","аберрация","адиабатический","энтальпия","инвариант","аппроксимация","агрегация","аналогия","антиномия","апофеоз","конгруэнтность","конкатенация","идентификатор","криптография","стохастика","гомоморфизм","изоморфизм","биекция","диффузия","конденсация","сублимация","адсорбция","десорбция","термодинамика","катализ","ингибитор","рекурсия","итерация","регрессия","марковская цепь","градиент","дивергенция","лапласиан","кумулятивный","персистентный"],
  films_series:["Титаник","Аватар","Матрица","Интерстеллар","Начало","Темный рыцарь","Джокер","Властелин колец","Хоббит","Гарри Поттер","Звёздные войны","Мандалорец","Игра престолов","Дом дракона","Ведьмак","Шерлок","Доктор Хаус","Друзья","Теория большого взрыва","Офис","Побег из Шоушенка","Зелёная миля","Форрест Гамп","1+1","Ла-ла-ленд","Крестный отец","Таксист","Остров проклятых","Бойцовский клуб","Семь","Криминальное чтиво","Кил Билл","Однажды в Голливуде","Дюна","Бегущий по лезвию","Чужой","Хищник","Терминатор","Робокоп","Человек-паук","Железный человек","Мстители","Капитан Америка","Тор","Черная пантера","Стражи Галактики","Дэдпул","Локи","Во все тяжкие","Лучше звоните Солу","Наркос","Пикки Блайндерс","Викинги","Чёрное зеркало","Очень странные дела","Король Лев","Алладин","Холодное сердце","Тайна Коко","История игрушек","Рататуй","ВАЛЛ·И","Вверх","Головоломка","Моана","Пираты Карибского моря","Индиана Джонс","Миссия невыполнима","Джеймс Бонд","Шрек","Мадагаскар","Кунг-фу Панда","Как приручить дракона","Гладиатор","Троя","300 спартанцев","Храброе сердце","Марсианин","Выживший","Большой куш","Карты, деньги, два ствола","Достать ножи","Кингсман","Джентльмены","Аркейн","Кобра Кай","Сотня","Колесо времени","Фауда","Офис (UK)"],
  geography:["Европа","Азия","Африка","Северная Америка","Южная Америка","Австралия","Антарктида","Россия","Москва","Санкт-Петербург","США","Вашингтон","Нью-Йорк","Лос-Анджелес","Канада","Оттава","Торонто","Мексика","Бразилия","Рио-де-Жанейро","Аргентина","Буэнос-Айрес","Чили","Перу","Лима","Колумбия","Богота","Германия","Берлин","Франция","Париж","Испания","Мадрид","Италия","Рим","Милан","Венеция","Пиза","Греция","Афины","Великобритания","Лондон","Норвегия","Швеция","Стокгольм","Финляндия","Хельсинки","Дания","Копенгаген","Исландия","Рейкьявик","Польша","Варшава","Чехия","Прага","Австрия","Вена","Швейцария","Цюрих","Нидерланды","Амстердам","Бельгия","Брюссель","Португалия","Лиссабон","Турция","Стамбул","Анкара","Египет","Каир","Марокко","Рабат","Южная Африка","Кейптаун","Нигерия","Абуджа","Кения","Найроби","Эфиопия","Аддис-Абеба","Израиль","Иерусалим","Иордания","Амман","Саудовская Аравия","Эр-Рияд","ОАЭ","Дубай","Индия","Дели","Мумбаи","Непал","Катманду","Китай","Пекин","Великая китайская стена"],
  kids:["мяч","кукла","мишка","зайчик","солнышко","облако","радуга","снежинка","санки","варежки","шапка","шарф","машинка","паровоз","поезд","самолёт","ракета","лодка","парус","велосипед","самокат","качели","горка","карусель","зоопарк","цирк","парк","игрушка","конструктор","кубики","пазл","раскраска","фломастер","карандаш","кисточка","краски","пластилин","ножницы","клей","книжка","сказка","песня","танец","музыка","праздник","подарок","шарик","торт","свечи","печенье","конфета","шоколад","мороженое","яблоко","банан","груша","апельсин","клубника","вишня","арбуз","дыня","морковь","огурец","помидор","суп","каша","котёнок","щенок","хомяк","рыбка","черепаха","лягушка","утёнок","слон","жираф","лев","тигр","зебра","панда","домик","кроватка","подушка","одеяло","ванна","мыло","щётка","паста","полотенце","коляска","мама","папа","бабушка","дедушка","брат","сестра","друг","подруга","прятки","салочки"]
};

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
    hitWords: Array.isArray(team?.hitWords) ? [...team.hitWords] : [],
    missWords: Array.isArray(team?.missWords) ? [...team.missWords] : []
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
function playBuzz(){
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const duration = 0.35;
    const sampleRate = audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i=0;i<data.length;i++){
      const progress = i / data.length;
      data[i] = (Math.random()*2 - 1) * (1 - progress) * 0.7;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    noise.connect(gain).connect(audioCtx.destination);
    noise.start();
  }catch(err){ /* ignore playback errors */ }
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
  if (themeSection) themeSection.style.display = v==='viewMenu' ? 'flex' : 'none';
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
  if (typeof qTimerId !== 'undefined'){ clearInterval(qTimerId); qTimerId=null; }
  if (typeof tTimerId !== 'undefined'){ clearInterval(tTimerId); tTimerId=null; }
  show('viewMenu');
};
helpBtn.onclick = () => {
  alert('КрокоМим — объясните слово жестами/мимикой. Кнопки: Угадано, Пропустить, Следующее; можно скрыть/показать слово и открыть значение на Википедии. Удачи!');
};

$('#goTeam').onclick = () => {
  ensureTeamsSeed();
  renderTeams();
  syncTeamSettingsFromMenu();
  show('viewTeamSetup');
};

// Quick setup
const qs = {
  dict: $('#quickDict'),
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
};
qs.timeMinus.onclick = () => { qs.time = Math.max(30, qs.time-30); upQuickTime(); };
qs.timePlus.onclick = () => { qs.time += 30; upQuickTime(); };
qs.dict.onchange = () => qs.customBox.style.display = (qs.dict.value==='custom')?'block':'none';
qs.ptsMinus.onclick = () => { qs.pts = Math.max(1, qs.pts-1); upQuickPts(); };
qs.ptsPlus.onclick = () => { qs.pts += 1; upQuickPts(); };
const updateQuickPts = () => {
  if (!qs.ptsControls) return;
  const enabled = qs.ptsToggle.checked;
  qs.ptsControls.style.display = enabled ? 'flex' : 'none';
  [qs.ptsMinus, qs.ptsPlus].forEach(btn=>{ if (btn) btn.disabled = !enabled; });
  if (qs.ptsLabel) qs.ptsLabel.classList.toggle('disabled', !enabled);
};
if (qs.timerToggle) qs.timerToggle.onchange = updateQuickTimerUI;
updateQuickTimerUI();
qs.ptsToggle.onchange = updateQuickPts;
updateQuickPts();
if (qs.dict){
  qs.dict.value = 'medium';
  qs.dict.dispatchEvent(new Event('change'));
}

// Quick game state
const initialQuickStats = readJson(QUICK_STATS_KEY, {hitWords:[], missWords:[]}) || {hitWords:[], missWords:[]};
let qHitWords = Array.isArray(initialQuickStats.hitWords) ? [...initialQuickStats.hitWords] : [];
let qMissWords = Array.isArray(initialQuickStats.missWords) ? [...initialQuickStats.missWords] : [];
let qWords=[], qIndex=0, qHide=false, qRemain=0, qHit=qHitWords.length, qMiss=qMissWords.length, qTarget=null;

const qUI = {
  word: $('#qWord'),
  hit: $('#qHit'), miss: $('#qMiss'),
  next: $('#qNext'), hitBtn: $('#qHitBtn'), skipBtn: $('#qSkipBtn'),
  hideBtn: $('#qHideBtn'), meaningBtn: $('#qMeaningBtn'),
  tBox: $('#qTimerBox'), tLabel: $('#qTimer'),
  statsBtn: $('#qStatsBtn')
};

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

const pad = n => String(n).padStart(2,'0');
const formatWordList = list => list.length ? list.join(', ') : '—';

function showWordStats(title, hitList, missList){
  alert(`${title}\n\nУгаданные (${hitList.length}):\n${formatWordList(hitList)}\n\nПропущенные (${missList.length}):\n${formatWordList(missList)}`);
}

function startQuickGame(){
  // build words
  let dictKey = qs.dict.value;
  if (!dictKey || (!DICTS[dictKey] && dictKey!=='custom')){
    dictKey = 'medium';
    if (qs.dict){
      qs.dict.value = 'medium';
      qs.dict.dispatchEvent(new Event('change'));
    }
  }
  if (dictKey==='custom'){
    const raw = qs.customText.value || '';
    qWords = raw.split(/[,\\n]/).map(s=>s.trim()).filter(Boolean);
  }else{
    qWords = [...DICTS[dictKey]];
  }
  if (qWords.length===0){ alert('Добавьте хотя бы одно слово'); return; }
  shuffle(qWords);
  qIndex=0; qHide=false; qHit=0; qMiss=0; qTarget = qs.ptsToggle.checked ? qs.pts : null;
  qHitWords = [];
  qMissWords = [];
  persistQuickStats();
  updateQuickCounters();
  qUI.word.textContent = qWords[qIndex];
  qUI.hideBtn.textContent = 'Скрыть слово';

  // timer
  clearInterval(qTimerId); qTimerId=null;
  if (qs.timerToggle.checked){
    qUI.tBox.style.display='inline-flex';
    qRemain = qs.time;
    qUI.tLabel.textContent = `${pad(Math.floor(qRemain/60))}:${pad(qRemain%60)}`;
    qTimerId = setInterval(()=>{
      qRemain--;
      qUI.tLabel.textContent = `${pad(Math.floor(qRemain/60))}:${pad(qRemain%60)}`;
      if (qRemain<=0){
        clearInterval(qTimerId); qTimerId=null;
        playBuzz();
        nextWord();
      }
    },1000);
  }else{
    qUI.tBox.style.display='none';
  }
  show('viewQuickGame');
}
$('#startQuick').onclick = startQuickGame;
if (modeQuickBtn) modeQuickBtn.onclick = startQuickGame;

function nextWord(){
  qIndex = (qIndex+1) % qWords.length;
  qHide=false;
  qUI.word.textContent = qWords[qIndex];
  qUI.hideBtn.textContent = 'Скрыть слово';
}

qUI.next.onclick = nextWord;
qUI.hitBtn.onclick = ()=>{
  qHit++;
  const current = qWords[qIndex];
  if (current) qHitWords.push(current);
  persistQuickStats();
  updateQuickCounters();
  if (qTarget!==null && qHit>=qTarget){
    if (qTimerId){ clearInterval(qTimerId); qTimerId=null; }
    playBuzz();
    alert('Вы достигли цели!');
    show('viewMenu');
    return;
  }
  nextWord();
};
qUI.skipBtn.onclick = ()=>{
  const current = qWords[qIndex];
  if (current) qMissWords.push(current);
  qMiss++;
  persistQuickStats();
  updateQuickCounters();
  nextWord();
};
qUI.hideBtn.onclick = ()=>{
  qHide = !qHide;
  qUI.word.textContent = qHide ? '•••' : qWords[qIndex];
  qUI.hideBtn.textContent = qHide ? 'Показать слово' : 'Скрыть слово';
};
qUI.meaningBtn.onclick = ()=> window.open('https://ru.wikipedia.org/wiki/'+encodeURIComponent(qWords[qIndex]), '_blank');
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
const teamRenameBtn = $('#teamRename');
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
        <div class="team-avatar" style="background:${iconDef.bg};color:${iconDef.color}">
          <span>${iconDef.emoji}</span>
        </div>
      </div>
      <div class="team-body">
        <div class="team-name">${escapeHtml(team.name)}</div>
        <button class="team-delete" type="button" title="Удалить команду" data-index="${index}">🗑️</button>
      </div>`;
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
if (teamRenameBtn){
  teamRenameBtn.onclick = ()=>{
    if (teams.length===0){ alert('Нет команд для редактирования'); return; }
    const list = teams.map((team, idx)=>`${idx+1}. ${team.name || defaultTeamName(idx)}`).join('\n');
    const idxInput = prompt('Введите номер команды для редактирования:\n'+list);
    if (idxInput===null) return;
    const idx = parseInt(idxInput, 10) - 1;
    if (Number.isNaN(idx) || idx<0 || idx>=teams.length){ alert('Некорректный номер команды'); return; }
    const current = teams[idx].name;
    const next = prompt('Новое название команды', current);
    if (next===null) return;
    const trimmed = next.trim();
    teams[idx].name = trimmed || defaultTeamName(idx);
    renderTeams();
    persistTeams();
  };
}

const ts = {
  dict: $('#teamDict'),
  customBox: $('#teamCustomBox'),
  customText: $('#teamCustomWords'),
  timerToggle: $('#teamTimerToggle'),
  time: 60,
  timeMinus: $('#teamTimeMinus'),
  timePlus: $('#teamTimePlus'),
  timeLabel: $('#teamTimeLabel'),
  ptsToggle: $('#teamPtsToggle'),
  ptsControls: $('#ptsControls'),
  pts: 10, ptsMinus: $('#ptsMinus'), ptsPlus: $('#ptsPlus'), ptsLabel: $('#ptsLabel')
};
const upTeamTime = () => ts.timeLabel.textContent = ts.time+' с';
const upPts = () => ts.ptsLabel.textContent = ts.pts;
upTeamTime(); upPts();
ts.timeMinus.onclick = ()=>{ ts.time = Math.max(30, ts.time-30); upTeamTime(); };
ts.timePlus.onclick = ()=>{ ts.time += 30; upTeamTime(); };
ts.ptsMinus.onclick = ()=>{ ts.pts = Math.max(1, ts.pts-1); upPts(); };
ts.ptsPlus.onclick = ()=>{ ts.pts += 1; upPts(); };
ts.dict.onchange = ()=> ts.customBox.style.display = (ts.dict.value==='custom')?'block':'none';
const updateTeamTimerUI = ()=>{
  if (!ts.timerToggle) return;
  const enabled = ts.timerToggle.checked;
  [ts.timeMinus, ts.timePlus].forEach(btn=>{ if (btn) btn.disabled = !enabled; });
  if (ts.timeLabel) ts.timeLabel.classList.toggle('disabled', !enabled);
};
const updatePtsUI = ()=>{
  const enabled = ts.ptsToggle.checked;
  ts.ptsControls.style.display = enabled ? 'flex' : 'none';
  [ts.ptsMinus, ts.ptsPlus].forEach(btn=>{ if (btn) btn.disabled = !enabled; });
  if (ts.ptsLabel) ts.ptsLabel.classList.toggle('disabled', !enabled);
};
if (ts.timerToggle) ts.timerToggle.onchange = updateTeamTimerUI;
updateTeamTimerUI();
ts.ptsToggle.onchange = updatePtsUI;
updatePtsUI();

function syncTeamSettingsFromMenu(){
  if (!qs || !ts) return;
  if (qs.dict && ts.dict){
    const dictValue = qs.dict.value || 'medium';
    ts.dict.value = dictValue;
    ts.dict.dispatchEvent(new Event('change'));
    if (dictValue === 'custom' && ts.customText && qs.customText){
      ts.customText.value = qs.customText.value;
    }
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
}

// Team game state
let tWords=[], tIndex=-1, tHide=false, tRemain=0, turn=0, roundActive=false, timerExpired=false;
let teamTimerEnabled = false;
let teamPointsEnabled = false;
let teamPointGoal = 10;

const tUI = {
  word: $('#tWord'),
  turnName: $('#turnTeamName'),
  tBox: $('#tTimerBox'), tLabel: $('#tTimer'),
  table: $('#scoreTable'),
  next: $('#tNext'), hit: $('#tHitBtn'), skip: $('#tSkipBtn'),
  hideBtn: $('#tHideBtn'), meaning: $('#tMeaningBtn'),
  startRound: $('#tStartRound'), endRound: $('#tEndRound'),
  status: $('#tRoundStatus'),
  statsBtn: $('#tStatsBtn')
};

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
  [tUI.next, tUI.hit, tUI.skip, tUI.hideBtn, tUI.meaning].forEach(btn=>{
    if (btn){
      btn.disabled = !enabled;
    }
  });
}

function resetWordView(){
  tHide = false;
  if (tUI.word) tUI.word.textContent = '—';
  if (tUI.hideBtn) tUI.hideBtn.textContent = 'Скрыть слово';
}

function advanceWord(){
  if (!tWords.length) return;
  tIndex = (tIndex + 1) % tWords.length;
  tHide = false;
  if (tUI.word) tUI.word.textContent = tWords[tIndex];
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

function startTeamGame(){
  if (teams.length<2){ alert('Нужно минимум 2 команды'); return; }
  let dictKey = ts.dict.value;
  if (!dictKey || (!DICTS[dictKey] && dictKey !== 'custom')){
    dictKey = 'medium';
    if (ts.dict){
      ts.dict.value = 'medium';
      ts.dict.dispatchEvent(new Event('change'));
    }
  }
  if (dictKey==='custom'){
    const raw = ts.customText.value || '';
    tWords = raw.split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
  }else{
    tWords = [...DICTS[dictKey]];
  }
  if (tWords.length===0){ alert('Добавьте хотя бы одно слово'); return; }
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
  tIndex=-1; tHide=false; turn=0; roundActive=false; timerExpired=false;
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
}
$('#startTeam').onclick = startTeamGame;

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
  playBuzz();
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
  tUI.word.textContent = tHide ? '•••' : tWords[tIndex];
  tUI.hideBtn.textContent = tHide ? 'Показать слово' : 'Скрыть слово';
};
tUI.meaning.onclick = ()=>{
  if (!roundActive || tIndex<0) return;
  window.open('https://ru.wikipedia.org/wiki/'+encodeURIComponent(tWords[tIndex]), '_blank');
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
  if (current) teams[turn].hitWords.push(current);
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
  if (current) teams[turn].missWords.push(current);
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
