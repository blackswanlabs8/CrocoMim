# Инструкция по развёртыванию страницы словарей на crocomim.ru

## Проблема
Ошибка `404 Not Found` при обращении к `/dictionaries` возникает из-за того, что Apache не знает о маршрутах Flask-приложения и пытается найти статический файл, которого нет.

## Решение

### Вариант 1: Настройка .htaccess (рекомендуется для shared-хостинга)

Создайте или обновите файл `/home/evrocleani/domains/crocomim.ru/public_html/.htaccess`:

```apache
RewriteEngine On

# Все запросы перенаправляем на WSGI-скрипт
RewriteCond %{REQUEST_URI} !^/static/
RewriteCond %{REQUEST_URI} !\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$
RewriteRule ^(.*)$ /backend/site.wsgi/$1 [QSA,L]
```

### Вариант 2: Обновление site.wsgi

Убедитесь, что файл `/workspace/backend/site.wsgi` корректно импортирует приложение:

```python
import os
import sys
import traceback
from pathlib import Path

DEBUG_LOG = "/home/evrocleani/domains/crocomim.ru/public_html/data/wsgi-debug.log"

def log(msg: str) -> None:
    try:
        Path(DEBUG_LOG).parent.mkdir(parents=True, exist_ok=True)
        with open(DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass

try:
    log("=== WSGI START (Flask) ===")

    try:
        import site as _site
        _site.ENABLE_USER_SITE = False
        log("User site-packages disabled")
    except Exception as e:
        log(f"Could not disable user site: {e!r}")

    VENV_SITE = "/home/evrocleani/venvs/crocomim/lib/python3.13/site-packages"

    if VENV_SITE not in sys.path:
        sys.path.insert(0, VENV_SITE)
    log(f"sys.path: {sys.path!r}")

    BASE_DIR = os.path.dirname(__file__)
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)
    log(f"BASE_DIR: {BASE_DIR}")

    try:
        import flask
        log(f"Flask imported: {getattr(flask, '__version__', 'unknown')}")
    except Exception as e:
        log("ERROR importing flask: " + repr(e))
        raise

    try:
        from app import app as flask_app
        log("Imported app from app.py")
    except Exception as e:
        log("ERROR importing app: " + repr(e))
        log("TRACEBACK:\n" + traceback.format_exc())
        raise

    application = flask_app
    log("WSGI application created successfully")

except Exception as e:
    log("FATAL ERROR in Flask site.wsgi: " + repr(e))
    log("TRACEBACK:\n" + traceback.format_exc())

    def application(environ, start_response):
        start_response("500 INTERNAL SERVER ERROR", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Internal error in Flask site.wsgi. See wsgi-debug.log."]
```

### Вариант 3: Прямая ссылка на страницу

Если WSGI не работает, можно разместить HTML-файл напрямую:

1. Скопируйте `/workspace/public/dictionaries/index.html` в `/home/evrocleani/domains/crocomim.ru/public_html/dictionaries/index.html`
2. Обновите пути к CSS и JS в HTML-файле:
   - Замените `/styles/dictionaries.css` на `/styles/dictionaries.css`
   - Замените `/scripts/dictionaries.js` на `/scripts/dictionaries.js`

**НО:** API-запросы всё равно будут требовать работающий Flask-бэкенд!

## Проверка работы

После настройки проверьте:

1. **WSGI-лог:** `/home/evrocleani/domains/crocomim.ru/public_html/data/wsgi-debug.log`
   - Должны быть записи "WSI application created successfully"

2. **Backend-лог:** `/workspace/data/backend.log`
   - Должны быть записи "Serving /dictionaries page"

3. **Тестовые URL:**
   - `https://crocomim.ru/dictionaries` — должна открыться страница
   - `https://crocomim.ru/marketplace/dictionaries` — должен работать API
   - `https://crocomim.ru/user/generation-info` — должен работать API

## Структура маршрутов Flask

Все маршруты определены в `/workspace/backend/app.py`:

| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/` | GET | Health check |
| `/dictionaries` | GET | Страница управления словарями |
| `/marketplace/dictionaries` | GET | Список публичных словарей |
| `/marketplace/dictionaries/<id>` | GET | Детали словаря |
| `/marketplace/dictionaries/<id>/add` | POST | Добавить в библиотеку |
| `/user/dictionaries` | GET/POST | CRUD личных словарей |
| `/user/dictionaries/<id>` | GET/PUT/DELETE | Операции со словарём |
| `/user/generation-info` | GET | Информация о лимитах |
| `/generate-dictionary` | POST | Генерация словаря |
| `/auth/*` | Various | Авторизация |

## Быстрый тест локально

```bash
cd /workspace/backend
python app.py
```

Откройте `http://localhost:3000/dictionaries` — должно работать.

## Контакты

При проблемах проверяйте логи:
- WSGI: `/home/evrocleani/domains/crocomim.ru/public_html/data/wsgi-debug.log`
- Backend: `/workspace/data/backend.log`
- Apache: стандартные логи хостинга
