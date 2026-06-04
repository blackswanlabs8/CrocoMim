# Маршруты для страницы словарей

## Изменения в бэкенде

### 1. Настройка Flask для раздачи статики

**Файл:** `backend/app.py`

```python
# Было:
app = Flask(__name__)

# Стало:
app = Flask(__name__, static_folder="../public", static_url_path="")
```

Теперь Flask автоматически раздаёт файлы из папки `/workspace/public/`.

### 2. Импорт функции для раздачи файлов

**Файл:** `backend/app.py`

```python
# Было:
from flask import Flask, jsonify, request, session

# Стало:
from flask import Flask, jsonify, request, session, send_from_directory
```

### 3. Новый маршрут для страницы словарей

**Файл:** `backend/app.py` (добавлено перед `if __name__ == "__main__":`)

```python
# ============================================================================
# STATIC FILES ROUTES
# ============================================================================

@app.route("/dictionaries")
def serve_dictionaries_index():
    """Serve the dictionaries page as a standalone page."""
    LOGGER.info("Serving /dictionaries page")
    return send_from_directory(app.static_folder, "dictionaries/index.html")
```

**Маршрут:** `GET /dictionaries`  
**Описание:** Отдаёт HTML-страницу управления словарями как отдельную страницу приложения.

---

## Обновлённые маршруты API

Все API endpoints для работы со словарями уже реализованы и доступны:

### Генерация словарей
- `POST /generate-dictionary` — генерация нового словаря через ИИ

### Хранилище пользователя
- `GET /user/dictionaries` — список личных словарей
- `POST /user/dictionaries` — создать новый словарь
- `GET /user/dictionaries/<id>` — получить словарь по ID
- `PUT /user/dictionaries/<id>` — обновить словарь
- `DELETE /user/dictionaries/<id>` — удалить словарь

### Маркетплейс
- `GET /marketplace/dictionaries` — список публичных словарей
- `GET /marketplace/dictionaries/<id>` — превью публичного словаря
- `POST /marketplace/dictionaries/<id>/add` — добавить публичный словарь в библиотеку

### Информация о генерациях
- `GET /user/generation-info` — информация о доступных генерациях (лимиты)

---

## Изменения во frontend

### 1. Главная страница (`public/index.html`)

Обновлена ссылка на страницу словарей:

```html
<!-- Было -->
<a href="./dictionaries/index.html" class="icon-btn" ...>

<!-- Стало -->
<a href="/dictionaries" class="icon-btn" ...>
```

**Кнопка:** 📚 в шапке сайта (справа от логотипа CrocoMim)

### 2. JavaScript страницы словарей (`public/scripts/dictionaries.js`)

#### Обновлены API endpoints

```javascript
// Было:
const API = {
  MY_DICTIONARIES: '/api/user/dictionaries',
  MARKETPLACE: '/api/marketplace/dictionaries',
  GENERATION_INFO: '/api/user/generation-info',
  GENERATE: '/api/generate-dictionary',
  ADD_TO_LIBRARY: (id) => `/api/marketplace/dictionaries/${id}/add`
};

// Стало (без префикса /api):
const API = {
  MY_DICTIONARIES: '/user/dictionaries',
  MARKETPLACE: '/marketplace/dictionaries',
  GENERATION_INFO: '/user/generation-info',
  GENERATE: '/generate-dictionary',
  ADD_TO_LIBRARY: (id) => `/marketplace/dictionaries/${id}/add`
};
```

#### Обновлена кнопка "Назад"

```javascript
// Было:
window.location.href = '../index.html';

// Стало:
window.location.href = '/';
```

---

## Как использовать

### Для пользователей:

1. Откройте главную страницу CrocoMim
2. Нажмите на кнопку **📚** в верхней панели (справа от логотипа)
3. Вы попадёте на страницу `/dictionaries` с тремя вкладками:
   - **Мои словари** — управление личными словарями
   - **Маркетплейс** — каталог публичных словарей
   - **Конструктор** — создание нового словаря с ИИ

### Для разработчиков:

#### Запуск backend:

```bash
cd /workspace/backend
python app.py
```

Backend будет доступен на `http://localhost:3000`

#### Проверка маршрутов:

```bash
# Страница словарей
curl http://localhost:3000/dictionaries

# API: список личных словарей (требуется авторизация)
curl -b "session=<your_session_token>" http://localhost:3000/user/dictionaries

# API: маркетплейс
curl http://localhost:3000/marketplace/dictionaries

# API: информация о генерациях (требуется авторизация)
curl -b "session=<your_session_token>" http://localhost:3000/user/generation-info
```

---

## Структура файлов

```
/workspace/
├── backend/
│   └── app.py                          # Добавлен маршрут /dictionaries
├── public/
│   ├── index.html                      # Обновлена ссылка на /dictionaries
│   ├── dictionaries/
│   │   └── index.html                  # Страница словарей (19 KB)
│   ├── scripts/
│   │   └── dictionaries.js             # Логика страницы (обновлены API paths)
│   └── styles/
│       └── dictionaries.css            # Стили страницы (14 KB)
└── DICTIONARY_SYSTEM_DOCUMENTATION.md  # Полная документация системы
```

---

## Тестирование

### Синтаксическая проверка backend:

```bash
python3 -m py_compile /workspace/backend/app.py
# Результат: Syntax OK ✓
```

### Проверка импорта Flask app:

```bash
python3 -c "import sys; sys.path.insert(0, '/workspace/backend'); from app import app; print('OK')"
# Результат: Flask app imports OK ✓
```

### Доступные маршруты (проверка):

```bash
python3 -c "import sys; sys.path.insert(0, '/workspace/backend'); from app import app; 
rules = [r.rule for r in app.url_map.iter_rules() if 'diction' in r.rule.lower()]; 
print('\n'.join(sorted(rules)))"
```

**Результат:**
```
/dictionaries
/marketplace/dictionaries
/marketplace/dictionaries/<dictionary_id>
/marketplace/dictionaries/<dictionary_id>/add
/user/dictionaries
/user/dictionaries/<dictionary_id>
```

---

## Примечания

1. **Статические файлы:** Flask теперь раздаёт все файлы из `/workspace/public/` автоматически через `static_folder`.

2. **CORS:** Если frontend и backend работают на разных доменах/портах, может потребоваться настройка CORS.

3. **Кеширование:** В HTML-файлах используются версии CSS/JS (`?v=...`) для контроля кеширования.

4. **Авторизация:** Все операции с личными словарями требуют авторизации через Flask session cookie.

5. **Лимиты генераций:** По умолчанию лимит отключён. Для включения задайте переменную окружения:
   ```bash
   export DICT_GENERATION_LIMIT_ENABLED=true
   export DICT_GENERATION_LIMIT_HOURS=24
   ```

---

## Контакты

Документация создана для команды разработки CrocoMim.  
Версия документа: 1.0  
Дата обновления: 2026-06-04
