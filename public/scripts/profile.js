// Личный кабинет: API и UI с серверным хранением данных
// Используется бэкенд Flask для регистрации, авторизации и статистики

const PROFILE_SESSION_KEY = 'croc-profile-session';

// Используем относительный путь к API, как в feedback.js
const API_BASE = '/api';

// Минимальная длина пароля
const MIN_PASSWORD_LENGTH = 6;

// Состояние профиля
let profileState = {
  isLoggedIn: false,
  userId: null,
  email: null,
  stats: null
};

// Валидация email
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5) return false;
  // Простая проверка формата email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

// Валидация пароля
function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= MIN_PASSWORD_LENGTH;
}

// Загрузка сохранённой сессии
function loadProfileSession() {
  try {
    const session = localStorage.getItem(PROFILE_SESSION_KEY);
    if (session) {
      const data = JSON.parse(session);
      if (data && data.userId) {
        profileState.isLoggedIn = true;
        profileState.userId = data.userId;
        profileState.email = data.email;
        return true;
      }
    }
  } catch (e) {
    console.warn('Failed to load profile session', e);
  }
  return false;
}

// Сохранение сессии
function saveProfileSession(userId, email) {
  try {
    const sessionData = { userId, email, timestamp: Date.now() };
    localStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(sessionData));
    profileState.isLoggedIn = true;
    profileState.userId = userId;
    profileState.email = email;
    return true;
  } catch (e) {
    console.warn('Failed to save profile session', e);
  }
  return false;
}

// Выход
function logoutProfile() {
  try {
    localStorage.removeItem(PROFILE_SESSION_KEY);
  } catch (e) {
    console.warn('Failed to clear profile', e);
  }
  profileState = { isLoggedIn: false, userId: null, email: null, stats: null };
}

// Регистрация пользователя через сервер
async function register(email, password) {
  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    return { ok: data.ok, data, status: response.status };
  } catch (e) {
    console.error('Registration error', e);
    return { ok: false, data: { error: 'Ошибка сети' }, status: 500 };
  }
}

// Вход пользователя через сервер
async function login(email, password) {
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    return { ok: data.ok, data, status: response.status };
  } catch (e) {
    console.error('Login error', e);
    return { ok: false, data: { error: 'Ошибка сети' }, status: 500 };
  }
}

// Загрузка статистики с сервера
async function loadStats(userId) {
  try {
    const response = await fetch(`${API_BASE}/auth/stats?userId=${userId}`);
    const data = await response.json();
    return { ok: data.ok, data: data.ok ? { stats: data.stats } : data, status: response.status };
  } catch (e) {
    console.error('Load stats error', e);
    return { ok: false, data: { error: 'Ошибка сети' }, status: 500 };
  }
}

// Обновление статистики на сервере
async function updateStats(userId, stats) {
  try {
    const response = await fetch(`${API_BASE}/auth/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stats })
    });
    const data = await response.json();
    return { ok: data.ok, data, status: response.status };
  } catch (e) {
    console.error('Update stats error', e);
    return { ok: false, data: { error: 'Ошибка сети' }, status: 500 };
  }
}

// Отрисовка вида профиля
function renderProfileView() {
  const notLoggedInEl = document.getElementById('profileNotLoggedIn');
  const loggedInEl = document.getElementById('profileLoggedIn');
  
  if (!notLoggedInEl || !loggedInEl) return;
  
  if (profileState.isLoggedIn && profileState.userId) {
    notLoggedInEl.hidden = true;
    loggedInEl.hidden = false;
    
    // Загрузка статистики
    loadStats(profileState.userId).then(result => {
      if (result.ok && result.data.stats) {
        const stats = result.data.stats;
        profileState.stats = stats;
        
        document.getElementById('profileEmail').textContent = stats.email;
        document.getElementById('statQuickGames').textContent = stats.quickGamesPlayed;
        document.getElementById('statQuickHit').textContent = stats.quickWordsHit;
        document.getElementById('statQuickMiss').textContent = stats.quickWordsMissed;
        document.getElementById('statTeamGames').textContent = stats.teamGamesPlayed;
        document.getElementById('statTeamRounds').textContent = stats.teamRoundsPlayed;
        
        document.getElementById('profileCreatedAt').textContent = stats.createdAt 
          ? new Date(stats.createdAt).toLocaleDateString('ru-RU') : '—';
        document.getElementById('profileLastLogin').textContent = stats.lastLogin 
          ? new Date(stats.lastLogin).toLocaleDateString('ru-RU') : '—';
      }
    });
  } else {
    notLoggedInEl.hidden = false;
    loggedInEl.hidden = true;
  }
}

// Инициализация форм
function setupProfileForms() {
  // Переключение табов
  document.querySelectorAll('.form-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      document.getElementById('loginForm').hidden = tabName !== 'login';
      document.getElementById('registerForm').hidden = tabName !== 'register';
      
      // Сброс ошибок при переключении табов
      const loginErrorEl = document.getElementById('loginError');
      const registerErrorEl = document.getElementById('registerError');
      if (loginErrorEl) loginErrorEl.hidden = true;
      if (registerErrorEl) registerErrorEl.hidden = true;
    });
  });
  
  // Обработка отправки форм по Enter
  const loginEmailInput = document.getElementById('loginEmail');
  const loginPasswordInput = document.getElementById('loginPassword');
  const registerEmailInput = document.getElementById('registerEmail');
  const registerPasswordInput = document.getElementById('registerPassword');
  
  // Вход по Enter
  if (loginEmailInput && loginPasswordInput) {
    const handleLoginEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const loginBtn = document.getElementById('btnLoginSubmit');
        if (loginBtn) loginBtn.click();
      }
    };
    loginEmailInput.addEventListener('keydown', handleLoginEnter);
    loginPasswordInput.addEventListener('keydown', handleLoginEnter);
  }
  
  // Регистрация по Enter
  if (registerEmailInput && registerPasswordInput) {
    const handleRegisterEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const registerBtn = document.getElementById('btnRegisterSubmit');
        if (registerBtn) registerBtn.click();
      }
    };
    registerEmailInput.addEventListener('keydown', handleRegisterEnter);
    registerPasswordInput.addEventListener('keydown', handleRegisterEnter);
  }
  
  // Вход
  const loginBtn = document.getElementById('btnLoginSubmit');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errorEl = document.getElementById('loginError');
      
      errorEl.hidden = true;
      
      // Валидация входных данных
      if (!isValidEmail(email)) {
        errorEl.textContent = 'Введите корректный email (не менее 5 символов)';
        errorEl.hidden = false;
        return;
      }
      
      if (!password || password.length < 1) {
        errorEl.textContent = 'Введите пароль';
        errorEl.hidden = false;
        return;
      }
      
      const result = await login(email, password);
      if (result.ok) {
        saveProfileSession(result.data.userId, result.data.email);
        renderProfileView();
      } else {
        errorEl.textContent = result.data.error || 'Ошибка входа';
        errorEl.hidden = false;
      }
    });
  }
  
  // Регистрация
  const registerBtn = document.getElementById('btnRegisterSubmit');
  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const email = document.getElementById('registerEmail').value.trim();
      const password = document.getElementById('registerPassword').value;
      const errorEl = document.getElementById('registerError');
      
      errorEl.hidden = true;
      
      // Валидация входных данных
      if (!isValidEmail(email)) {
        errorEl.textContent = 'Введите корректный email (не менее 5 символов)';
        errorEl.hidden = false;
        return;
      }
      
      if (!isValidPassword(password)) {
        errorEl.textContent = `Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов`;
        errorEl.hidden = false;
        return;
      }
      
      const result = await register(email, password);
      if (result.ok) {
        saveProfileSession(result.data.userId, result.data.email);
        renderProfileView();
      } else {
        errorEl.textContent = result.data.error || 'Ошибка регистрации';
        errorEl.hidden = false;
      }
    });
  }
  
  // Выход
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logoutProfile();
      renderProfileView();
    });
  }
}

// Авто-загрузка при старте
loadProfileSession();

// Экспорт для использования в app.js
window.Profile = {
  isLoggedIn: () => profileState.isLoggedIn,
  getUserId: () => profileState.userId,
  getEmail: () => profileState.email,
  loadStats: loadStats,
  updateStats: updateStats,
  renderProfileView: renderProfileView,
  setupProfileForms: setupProfileForms
};
