// Личный кабинет: API и UI

const PROFILE_API_BASE = '/api/auth';
const PROFILE_USER_KEY = 'croc-profile-user';

// Состояние профиля
let profileState = {
  isLoggedIn: false,
  userId: null,
  email: null,
  stats: null
};

// Загрузка сохранённого пользователя
function loadProfileUser() {
  try {
    const raw = localStorage.getItem(PROFILE_USER_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      profileState.isLoggedIn = true;
      profileState.userId = data.userId;
      profileState.email = data.email;
      return true;
    }
  } catch (e) {
    console.warn('Failed to load profile user', e);
  }
  return false;
}

// Сохранение пользователя
function saveProfileUser(userId, email) {
  try {
    localStorage.setItem(PROFILE_USER_KEY, JSON.stringify({ userId, email }));
    profileState.isLoggedIn = true;
    profileState.userId = userId;
    profileState.email = email;
  } catch (e) {
    console.warn('Failed to save profile user', e);
  }
}

// Выход
function logoutProfile() {
  try {
    localStorage.removeItem(PROFILE_USER_KEY);
  } catch (e) {
    console.warn('Failed to clear profile', e);
  }
  profileState = { isLoggedIn: false, userId: null, email: null, stats: null };
}

// HTTP запрос
async function profileRequest(endpoint, options = {}) {
  const url = `${PROFILE_API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options
  };
  
  try {
    const response = await fetch(url, config);
    const data = await response.json();
    return { ok: response.ok, data, status: response.status };
  } catch (e) {
    console.error('Profile request failed', e);
    return { ok: false, data: { error: 'Network error' }, status: 0 };
  }
}

// Регистрация
async function register(email, password) {
  return await profileRequest('/register', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

// Вход
async function login(email, password) {
  return await profileRequest('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

// Загрузка статистики
async function loadStats(userId) {
  return await profileRequest(`/stats?userId=${userId}`, { method: 'GET' });
}

// Обновление статистики
async function updateStats(userId, stats) {
  return await profileRequest('/stats', {
    method: 'POST',
    body: JSON.stringify({ userId, stats })
  });
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
    });
  });
  
  // Вход
  const loginBtn = document.getElementById('btnLoginSubmit');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errorEl = document.getElementById('loginError');
      
      errorEl.hidden = true;
      
      const result = await login(email, password);
      if (result.ok) {
        saveProfileUser(result.data.userId, result.data.email);
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
      
      const result = await register(email, password);
      if (result.ok) {
        saveProfileUser(result.data.userId, result.data.email);
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
loadProfileUser();

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
