# Маршруты Flask для системы словарей CrocoMim

## Статус: ✅ Все маршруты реализованы и протестированы

---

## 📄 Страницы (HTML)

| Маршрут | Метод | Файл | Описание |
|---------|-------|------|----------|
| `/dictionaries` | GET | `/public/dictionaries/index.html` | **Главная страница управления словарями** |

### Детали маршрута `/dictionaries`:

```python
@app.route("/dictionaries")
def serve_dictionaries_index():
    """Serve the dictionaries page as a standalone page."""
    LOGGER.info("Serving /dictionaries page")
    return send_from_directory(app.static_folder, "dictionaries/index.html")
```

**Строка в коде:** 1004-1008 в `/workspace/backend/app.py`

**Что возвращает:** HTML-страницу с тремя вкладками:
- Мои словари
- Маркетплейс
- Конструктор

---

## 🔌 API Endpoints

### 1. Маркетплейс словарей

| Маршрут | Метод | Функция | Описание |
|---------|-------|---------|----------|
| `/marketplace/dictionaries` | GET | `list_public_dictionaries()` | Список всех публичных словарей |
| `/marketplace/dictionaries/<id>` | GET | `get_public_dictionary(id)` | Детали конкретного словаря (превью) |
| `/marketplace/dictionaries/<id>/add` | POST | `add_dictionary_to_user(id)` | Добавить словарь в личную библиотеку |

**Пример запроса:**
```bash
GET https://crocomim.ru/marketplace/dictionaries
```

**Ответ:**
```json
{
  "ok": true,
  "dictionaries": [
    {
      "id": 1,
      "title": "Английские слова A1",
      "source_language": "en",
      "target_language": "ru",
      "difficulty": "easy",
      "word_count": 50,
      "author": "john_doe",
      "created_at": "2024-06-01T10:00:00Z"
    }
  ]
}
```

**Строки в коде:** 678-762 в `/workspace/backend/app.py`

---

### 2. Хранилище пользователя

| Маршрут | Метод | Функция | Описание |
|---------|-------|---------|----------|
| `/user/dictionaries` | GET | `list_user_dictionaries(user_id)` | Список личных словарей пользователя |
| `/user/dictionaries` | POST | `create_dictionary()` | Создать новый словарь |
| `/user/dictionaries/<id>` | GET | `get_user_dictionary(id)` | Получить конкретный словарь |
| `/user/dictionaries/<id>` | PUT | `update_dictionary(id)` | Обновить словарь |
| `/user/dictionaries/<id>` | DELETE | `delete_dictionary(id)` | Удалить словарь |

**Требует авторизации:** ✅ Да (Flask session cookie)

**Пример запроса:**
```bash
GET https://crocomim.ru/user/dictionaries
Cookie: session=<session_token>
```

**Строки в коде:** 524-610 в `/workspace/backend/app.py`

---

### 3. Генерация словарей

| Маршрут | Метод | Функция | Описание |
|---------|-------|---------|----------|
| `/generate-dictionary` | POST | `generate_dict_llm()` | Сгенерировать словарь через ИИ |
| `/user/generation-info` | GET | `get_user_generation_info()` | Информация о доступных генерациях |

**Лимиты:**
- 10 бесплатных генераций навсегда
- После исчерпания — 1 генерация в 24 часа

**Пример запроса:**
```bash
POST https://crocomim.ru/generate-dictionary
Content-Type: application/json
Cookie: session=<session_token>

{
  "topic": "Путешествия",
  "difficulty": "medium",
  "source_language": "en",
  "target_language": "ru"
}
```

**Ответ:**
```json
{
  "ok": true,
  "dictionary": [
    {"word": "journey", "translation": "путешествие"},
    {"word": "destination", "translation": "назначение"}
  ],
  "remaining_generations": 9
}
```

**Строки в коде:** 
- `/generate-dictionary`: 370-522
- `/user/generation-info`: 763-792

---

### 4. Авторизация

| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/auth/register` | POST | Регистрация нового пользователя |
| `/auth/login` | POST | Вход в систему |
| `/auth/logout` | POST | Выход из системы |
| `/auth/me` | GET | Получить данные текущего пользователя |
| `/auth/profile` | PUT | Обновить профиль |
| `/auth/change-password` | POST | Сменить пароль |

**Строки в коде:** 845-1002 в `/workspace/backend/app.py`

---

## 🔧 Системные маршруты

| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/` | GET | Health check |
| `/healthz` | GET | Проверка работоспособности |
| `/version` | GET | Версия приложения |
| `/feedback` | POST | Отправить обратную связь |

**Debug-маршруты (только для разработки):**
- `/debug/sessions` — дампы сессий
- `/debug/sessions/clear-active` — очистка активных сессий
- `/debug/auth-check` — проверка токена авторизации

---

## 📁 Структура файлов

```
/workspace/
├── backend/
│   ├── app.py                    # Главный файл с маршрутами
│   ├── dictionary_store.py       # Работа с БД словарей
│   ├── user_auth.py              # Аутентификация и лимиты
│   ├── site.wsgi                 # WSGI-точка входа для Apache
│   └── services/
│       └── llm_service.py        # Генерация через ИИ
├── public/
│   ├── dictionaries/
│   │   └── index.html            # Страница управления словарями
│   ├── styles/
│   │   └── dictionaries.css      # Стили страницы
│   └── scripts/
│       └── dictionaries.js       # Логика frontend
└── DEPLOYMENT_INSTRUCTIONS.md    # Инструкция по развёртыванию
```

---

## 🚀 Развёртывание на crocomim.ru

### Проблема
Apache не знает о маршрутах Flask и возвращает 404.

### Решение

#### Вариант 1: .htaccess (рекомендуется)

Создайте файл `/home/evrocleani/domains/crocomim.ru/public_html/.htaccess`:

```apache
RewriteEngine On
RewriteCond %{REQUEST_URI} !^/static/
RewriteCond %{REQUEST_URI} !\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$
RewriteRule ^(.*)$ /backend/site.wsgi/$1 [QSA,L]
```

#### Вариант 2: Проверка site.wsgi

Убедитесь, что `/workspace/backend/site.wsgi` корректно импортирует приложение.

#### Вариант 3: Локальный тест

```bash
cd /workspace/backend
python app.py
# Откройте http://localhost:3000/dictionaries
```

---

## 📊 Диагностика

### Логи для проверки

1. **WSGI-лог:**
   ```
   /home/evrocleani/domains/crocomim.ru/public_html/data/wsgi-debug.log
   ```
   Должно быть: `"WSGI application created successfully"`

2. **Backend-лог:**
   ```
   /workspace/data/backend.log
   ```
   Должно быть: `"Serving /dictionaries page"`

### Тестовые запросы

```bash
# Страница словарей
curl -I https://crocomim.ru/dictionaries

# API маркетплейса
curl https://crocomim.ru/marketplace/dictionaries

# API генераций (требует авторизации)
curl -b "session=<token>" https://crocomim.ru/user/generation-info
```

---

## ✅ Чеклист готовности

- [x] Маршрут `/dictionaries` добавлен в `app.py`
- [x] HTML-страница создана в `/public/dictionaries/index.html`
- [x] CSS-стили созданы в `/public/styles/dictionaries.css`
- [x] JavaScript-логика создана в `/public/scripts/dictionaries.js`
- [x] API endpoints для маркетплейса реализованы
- [x] API endpoints для хранилища реализованы
- [x] API endpoints для генерации реализованы
- [x] Лимиты генераций настроены (10 бесплатных + 24h cooldown)
- [x] WSGI-файл настроен
- [x] Документация создана
- [ ] .htaccess настроен на хостинге ⚠️ **ТРЕБУЕТСЯ ВРУЧНУЮ**

---

## 📞 Поддержка

При проблемах:
1. Проверьте логи WSGI и backend
2. Убедитесь, что `.htaccess` создан
3. Проверьте права доступа к файлам
4. Перезапустите WSGI-приложение на хостинге

**Контакты:** см. админ-панель хостинга или `/workspace/DEPLOYMENT_INSTRUCTIONS.md`
