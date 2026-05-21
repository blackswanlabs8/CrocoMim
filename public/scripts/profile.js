// Личный кабинет: API и UI с локальным хранением данных
// Данные хранятся в localStorage браузера с шифрованием

const PROFILE_STORAGE_KEY = 'croc-profile-data';
const PROFILE_SESSION_KEY = 'croc-profile-session';

// Простое шифрование base64 (для демонстрации, не для продакшена)
function simpleEncrypt(data) {
  try {
    const json = JSON.stringify(data);
    return btoa(unescape(encodeURIComponent(json)));
  } catch (e) {
    console.warn('Encryption failed', e);
    return null;
  }
}

function simpleDecrypt(encrypted) {
  try {
    const json = decodeURIComponent(escape(atob(encrypted)));
    return JSON.parse(json);
  } catch (e) {
    console.warn('Decryption failed', e);
    return null;
  }
}

// Хеш пароля (простой, для демонстрации)
function hashPassword(password) {
  // В реальном проекте используйте bcrypt или argon2
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16) + '_' + btoa(password.split('').reverse().join(''));
}

// Состояние профиля
let profileState = {
  isLoggedIn: false,
  userId: null,
  email: null,
  stats: null
};

// Загрузка всех данных
function loadAllProfileData() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      return simpleDecrypt(raw);
    }
  } catch (e) {
    console.warn('Failed to load profile data', e);
  }
  return { users: [], currentUser: null };
}

// Сохранение всех данных
function saveAllProfileData(data) {
  try {
    const encrypted = simpleEncrypt(data);
    if (encrypted) {
      localStorage.setItem(PROFILE_STORAGE_KEY, encrypted);
      return true;
    }
  } catch (e) {
    console.warn('Failed to save profile data', e);
  }
  return false;
}

// Загрузка сохранённого пользователя
function loadProfileUser() {
  try {
    const session = localStorage.getItem(PROFILE_SESSION_KEY);
    if (session) {
      const data = simpleDecrypt(session);
      if (data && data.userId) {
        profileState.isLoggedIn = true;
        profileState.userId = data.userId;
        profileState.email = data.email;
        return true;
      }
    }
  } catch (e) {
    console.warn('Failed to load profile user', e);
  }
  return false;
}

// Сохранение пользователя в сессию
function saveProfileUser(userId, email) {
  try {
    const sessionData = { userId, email, timestamp: Date.now() };
    const encrypted = simpleEncrypt(sessionData);
    if (encrypted) {
      localStorage.setItem(PROFILE_SESSION_KEY, encrypted);
      profileState.isLoggedIn = true;
      profileState.userId = userId;
      profileState.email = email;
      return true;
    }
  } catch (e) {
    console.warn('Failed to save profile user', e);
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

// Регистрация пользователя
async function register(email, password) {
  return new Promise((resolve) => {
    // Валидация
    if (!email || !email.includes('@')) {
      resolve({ ok: false, data: { error: 'Некорректный email' }, status: 400 });
      return;
    }
    
    if (!password || password.length < 6) {
      resolve({ ok: false, data: { error: 'Пароль должен быть не менее 6 символов' }, status: 400 });
      return;
    }
    
    const allData = loadAllProfileData();
    
    // Проверка на существующего пользователя
    const existingUser = allData.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      resolve({ ok: false, data: { error: 'Пользователь с таким email уже существует' }, status: 409 });
      return;
    }
    
    // Создание нового пользователя
    const newUser = {
      userId: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      email: email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      lastLogin: null,
      stats: {
        quickGamesPlayed: 0,
        quickWordsHit: 0,
        quickWordsMissed: 0,
        teamGamesPlayed: 0,
        teamRoundsPlayed: 0,
        teamTotalScore: 0
      }
    };
    
    allData.users.push(newUser);
    allData.currentUser = newUser.userId;
    
    if (saveAllProfileData(allData)) {
      saveProfileUser(newUser.userId, newUser.email);
      resolve({ ok: true, data: { userId: newUser.userId, email: newUser.email }, status: 201 });
    } else {
      resolve({ ok: false, data: { error: 'Ошибка сохранения данных' }, status: 500 });
    }
  });
}

// Вход пользователя
async function login(email, password) {
  return new Promise((resolve) => {
    if (!email || !password) {
      resolve({ ok: false, data: { error: 'Введите email и пароль' }, status: 400 });
      return;
    }
    
    const allData = loadAllProfileData();
    const user = allData.users.find(u => 
      u.email.toLowerCase() === email.toLowerCase() && 
      u.passwordHash === hashPassword(password)
    );
    
    if (!user) {
      resolve({ ok: false, data: { error: 'Неверный email или пароль' }, status: 401 });
      return;
    }
    
    // Обновление времени последнего входа
    user.lastLogin = new Date().toISOString();
    allData.currentUser = user.userId;
    saveAllProfileData(allData);
    
    saveProfileUser(user.userId, user.email);
    resolve({ ok: true, data: { userId: user.userId, email: user.email }, status: 200 });
  });
}

// Загрузка статистики
async function loadStats(userId) {
  return new Promise((resolve) => {
    const allData = loadAllProfileData();
    const user = allData.users.find(u => u.userId === userId);
    
    if (!user) {
      resolve({ ok: false, data: { error: 'Пользователь не найден' }, status: 404 });
      return;
    }
    
    resolve({ ok: true, data: { stats: { ...user.stats, email: user.email, createdAt: user.createdAt, lastLogin: user.lastLogin } }, status: 200 });
  });
}

// Обновление статистики
async function updateStats(userId, stats) {
  return new Promise((resolve) => {
    const allData = loadAllProfileData();
    const user = allData.users.find(u => u.userId === userId);
    
    if (!user) {
      resolve({ ok: false, data: { error: 'Пользователь не найден' }, status: 404 });
      return;
    }
    
    // Обновление статистики
    user.stats = { ...user.stats, ...stats };
    
    if (saveAllProfileData(allData)) {
      resolve({ ok: true, data: { stats: user.stats }, status: 200 });
    } else {
      resolve({ ok: false, data: { error: 'Ошибка сохранения' }, status: 500 });
    }
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
