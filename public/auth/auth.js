/**
 * Модуль аутентификации пользователей для CrocoMim.
 * Предоставляет функции для регистрации, входа, выхода и управления профилем.
 */

/**
 * Базовый URL для API. Использует runtime-конфигурацию если доступна.
 */
function getApiBaseUrl() {
    // Проверяем runtime-конфигурацию (как в app.js и feedback.js)
    const flags = (typeof window.RUNTIME_FLAGS === 'object' && window.RUNTIME_FLAGS) || {};
    const origin = window.location?.origin || '';
    const apiPath = flags.testMode ? '/test/api' : '/api';
    const apiBase = origin ? `${origin}${apiPath}` : apiPath;
    
    // Используем runtime config если доступен
    if (window.RUNTIME_CONFIG && window.RUNTIME_CONFIG.publicApiBaseUrl) {
        return window.RUNTIME_CONFIG.publicApiBaseUrl;
    }
    
    return apiBase;
}

const API_BASE_URL = getApiBaseUrl();

/**
 * Ключ для хранения данных пользователя в localStorage
 */
const SESSION_USER_KEY = 'session_user';

function saveSessionUser(user) {
    if (!user || typeof user !== 'object') return;
    try {
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } catch (error) {
        console.warn('Не удалось сохранить профиль пользователя локально:', error);
    }
}

function getSessionUser() {
    try {
        const raw = localStorage.getItem(SESSION_USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        console.warn('Не удалось прочитать профиль пользователя из localStorage:', error);
        return null;
    }
}

function removeSessionUser() {
    localStorage.removeItem(SESSION_USER_KEY);
}

async function parseApiResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();
    return { ok: false, error: text || 'Некорректный ответ сервера' };
}

/**
 * Сохранить токен сессии в localStorage
 */
function saveSessionToken(token) {
    localStorage.setItem('session_token', token);
}

/**
 * Получить токен сессии из localStorage
 */
function getSessionToken() {
    return localStorage.getItem('session_token');
}

/**
 * Удалить токен сессии из localStorage
 */
function removeSessionToken() {
    localStorage.removeItem('session_token');
}

/**
 * Проверить, авторизован ли пользователь
 */
function isAuthenticated() {
    return !!getSessionToken();
}

/**
 * Зарегистрировать нового пользователя
 * @param {string} username - Имя пользователя
 * @param {string} email - Email
 * @param {string} password - Пароль
 * @returns {Promise<{success: boolean, message: string, user?: object}>}
 */
async function register(username, email, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await parseApiResponse(response);
        
        if (data.ok) {
            return { success: true, message: 'Регистрация успешна', user: data.user };
        } else {
            return { success: false, message: data.error || 'Ошибка регистрации' };
        }
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, message: 'Ошибка соединения с сервером' };
    }
}

/**
 * Войти пользователя
 * @param {string} username - Имя пользователя или email
 * @param {string} password - Пароль
 * @returns {Promise<{success: boolean, message: string, user?: object, session_token?: string}>}
 */
async function login(username, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await parseApiResponse(response);
        
        if (data.ok) {
            saveSessionToken(data.session_token);
            saveSessionUser(data.user);
            return { success: true, message: 'Вход выполнен успешно', user: data.user, session_token: data.session_token };
        } else {
            return { success: false, message: data.error || 'Ошибка входа' };
        }
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, message: 'Ошибка соединения с сервером' };
    }
}

/**
 * Выйти пользователя
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function logout() {
    const token = getSessionToken();
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: token ? JSON.stringify({ session_token: token }) : '{}'
        });
        
        const data = await parseApiResponse(response);
        removeSessionToken();
        removeSessionUser();
        
        if (data.ok) {
            return { success: true, message: data.message || 'Выход выполнен успешно' };
        } else {
            return { success: false, message: data.error || 'Ошибка выхода' };
        }
    } catch (error) {
        console.error('Logout error:', error);
        removeSessionToken();
        removeSessionUser();
        return { success: true, message: 'Выход выполнен (сессия удалена локально)' };
    }
}

/**
 * Получить данные текущего пользователя
 * @returns {Promise<{success: boolean, message: string, user?: object}>}
 */
async function getCurrentUser() {
    const token = getSessionToken();
    
    if (!token) {
        return { success: false, message: 'Пользователь не авторизован' };
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await parseApiResponse(response);
        
        if (data.ok) {
            saveSessionUser(data.user);
            return { success: true, message: 'Данные получены', user: data.user };
        } else {
            if (response.status === 401) {
                const errorMessage = String(data?.error || '').toLowerCase();
                const isDefinitelyInvalidSession = errorMessage.includes('сессия не найдена')
                    || errorMessage.includes('сессия истекла')
                    || errorMessage.includes('токен сессии не предоставлен');
                if (isDefinitelyInvalidSession) {
                    removeSessionToken();
                    removeSessionUser();
                } else {
                    const cachedUser = getSessionUser();
                    if (cachedUser) {
                        return {
                            success: true,
                            message: 'Показаны локально сохраненные данные пользователя',
                            user: cachedUser,
                            cached: true
                        };
                    }
                }
            }
            return { success: false, message: data.error || 'Ошибка получения данных' };
        }
    } catch (error) {
        console.error('Get current user error:', error);
        const cachedUser = getSessionUser();
        if (cachedUser) {
            return { success: true, message: 'Показаны локально сохраненные данные пользователя', user: cachedUser, cached: true };
        }
        return { success: false, message: 'Ошибка соединения с сервером' };
    }
}

/**
 * Обновить отображаемое имя пользователя
 * @param {string} displayName - Новое отображаемое имя
 * @returns {Promise<{success: boolean, message: string, user?: object}>}
 */
async function updateProfile(displayName) {
    const token = getSessionToken();
    
    if (!token) {
        return { success: false, message: 'Пользователь не авторизован' };
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ display_name: displayName })
        });
        
        const data = await parseApiResponse(response);
        
        if (data.ok) {
            return { success: true, message: 'Профиль обновлен', user: data.user };
        } else {
            return { success: false, message: data.error || 'Ошибка обновления профиля' };
        }
    } catch (error) {
        console.error('Update profile error:', error);
        return { success: false, message: 'Ошибка соединения с сервером' };
    }
}

/**
 * Изменить пароль пользователя
 * @param {string} oldPassword - Старый пароль
 * @param {string} newPassword - Новый пароль
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function changePassword(oldPassword, newPassword) {
    const token = getSessionToken();
    
    if (!token) {
        return { success: false, message: 'Пользователь не авторизован' };
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
        
        const data = await parseApiResponse(response);
        
        if (data.ok) {
            return { success: true, message: data.message || 'Пароль изменен' };
        } else {
            return { success: false, message: data.error || 'Ошибка смены пароля' };
        }
    } catch (error) {
        console.error('Change password error:', error);
        return { success: false, message: 'Ошибка соединения с сервером' };
    }
}

// Экспортируем функции для использования в других модулях
window.AuthAPI = {
    register,
    login,
    logout,
    getCurrentUser,
    updateProfile,
    changePassword,
    isAuthenticated,
    getSessionToken,
    saveSessionToken,
    removeSessionToken,
    getSessionUser,
    saveSessionUser,
    removeSessionUser
};
