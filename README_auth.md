# Личный кабинет пользователя - Документация API

## Обзор

Добавлена функциональность личного кабинета пользователя с возможностью:
- Регистрации нового пользователя
- Входа в систему
- Выхода из системы
- Просмотра данных профиля
- Изменения отображаемого имени
- Изменения пароля

## Бэкенд (Flask)

### Созданные файлы

1. **`backend/user_auth.py`** - Модуль аутентификации и управления пользователями
   - Хранение пользователей в JSON-файле
   - Хэширование паролей с солью (SHA-256)
   - Управление сессиями через токены

2. **`backend/app.py`** - Обновлен с добавлением маршрутов аутентификации

### Функции в `user_auth.py`

| Функция | Описание |
|---------|----------|
| `register_user(username, email, password)` | Регистрация нового пользователя |
| `login_user(username, password)` | Аутентификация пользователя, создание сессии |
| `logout_user(session_token)` | Завершение сессии пользователя |
| `get_user_by_session(session_token)` | Получение данных пользователя по токену сессии |
| `update_display_name(user_id, display_name)` | Обновление отображаемого имени |
| `change_password(user_id, old_password, new_password)` | Изменение пароля пользователя |
| `_hash_password(password, salt)` | Хэширование пароля с солью |
| `_generate_session_token()` | Генерация уникального токена сессии |
| `_load_users()`, `_save_users(data)` | Загрузка/сохранение пользователей |
| `_load_sessions()`, `_save_sessions(data)` | Загрузка/сохранение сессий |

### Маршруты API

#### 1. Регистрация пользователя
```
POST /auth/register
Content-Type: application/json

{
    "username": "string (мин. 3 символа)",
    "email": "string (valid email)",
    "password": "string (мин. 6 символов)"
}

Ответ (201):
{
    "ok": true,
    "user": {
        "id": "string",
        "username": "string",
        "display_name": "string",
        "email": "string",
        "created_at": "ISO8601 datetime"
    }
}
```

#### 2. Вход пользователя
```
POST /auth/login
Content-Type: application/json

{
    "username": "string (имя или email)",
    "password": "string"
}

Ответ (200):
{
    "ok": true,
    "user": { ... },
    "session_token": "string"
}
```

#### 3. Выход пользователя
```
POST /auth/logout
Authorization: Bearer <session_token>
Content-Type: application/json

{}

Ответ (200):
{
    "ok": true,
    "message": "Выход выполнен успешно"
}
```

#### 4. Получить текущего пользователя
```
GET /auth/me
Authorization: Bearer <session_token>

Ответ (200):
{
    "ok": true,
    "user": {
        "id": "string",
        "username": "string",
        "display_name": "string",
        "email": "string",
        "created_at": "ISO8601 datetime",
        "updated_at": "ISO8601 datetime"
    }
}
```

#### 5. Обновить профиль (отображаемое имя)
```
PUT /auth/profile
Authorization: Bearer <session_token>
Content-Type: application/json

{
    "display_name": "string (1-50 символов)"
}

Ответ (200):
{
    "ok": true,
    "user": { ... }
}
```

#### 6. Изменить пароль
```
POST /auth/change-password
Authorization: Bearer <session_token>
Content-Type: application/json

{
    "old_password": "string",
    "new_password": "string (мин. 6 символов)"
}

Ответ (200):
{
    "ok": true,
    "message": "Пароль успешно изменен"
}
```

### Хранение данных

Данные хранятся в директории `/data` (или указанной в переменной окружения `DATA_DIR`):

- `users.json` - Пользователи с хэшами паролей
- `sessions.json` - Активные сессии

Пример структуры `users.json`:
```json
{
  "users": {
    "user_id": {
      "id": "user_id",
      "username": "username",
      "display_name": "Display Name",
      "email": "user@example.com",
      "password_hash": "sha256_hash",
      "salt": "random_salt",
      "created_at": "2024-01-01T00:00:00+00:00",
      "updated_at": "2024-01-01T00:00:00+00:00"
    }
  }
}
```

## Фронтенд

### Созданные файлы

1. **`public/auth/auth.js`** - JavaScript модуль для работы с API аутентификации
2. **`public/auth/index.html`** - Страница личного кабинета

### Функции в `auth.js`

| Функция | Описание |
|---------|----------|
| `register(username, email, password)` | Регистрация пользователя |
| `login(username, password)` | Вход пользователя |
| `logout()` | Выход пользователя |
| `getCurrentUser()` | Получение данных текущего пользователя |
| `updateProfile(displayName)` | Обновление отображаемого имени |
| `changePassword(oldPassword, newPassword)` | Изменение пароля |
| `isAuthenticated()` | Проверка авторизации |
| `getSessionToken()` | Получение токена из localStorage |
| `saveSessionToken(token)` | Сохранение токена в localStorage |
| `removeSessionToken()` | Удаление токена из localStorage |

### Страница личного кабинета (`public/auth/index.html`)

Функциональность:
- Форма входа (по имени/email и паролю)
- Форма регистрации (имя, email, пароль)
- Профиль пользователя с отображением:
  - Имя пользователя
  - Email
  - Отображаемое имя (с возможностью редактирования)
- Выпадающее меню пользователя с кнопками "Профиль" и "Выйти"
- Автоматическая проверка сессии при загрузке страницы

### Доступ к странице

Страница доступна по адресу: `/auth/index.html`

Для интеграции с основным приложением можно добавить ссылку в header главного файла `index.html`.

## Безопасность

- Пароли хэшируются с уникальной солью (SHA-256)
- Сессионные токены генерируются криптографически безопасным способом
- Токены хранятся в localStorage на клиенте
- Все защищенные маршруты требуют заголовок `Authorization: Bearer <token>`

## Пример использования

```javascript
// Регистрация
const regResult = await AuthAPI.register('username', 'email@example.com', 'password123');
if (regResult.success) {
    console.log('Регистрация успешна');
}

// Вход
const loginResult = await AuthAPI.login('username', 'password123');
if (loginResult.success) {
    console.log('Вход выполнен', loginResult.user);
}

// Обновление профиля
const updateResult = await AuthAPI.updateProfile('Новое Имя');
if (updateResult.success) {
    console.log('Имя обновлено', updateResult.user.display_name);
}

// Выход
await AuthAPI.logout();
```
