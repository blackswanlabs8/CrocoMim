# CrocoMim

Интерактивная игра «CrocoMim» теперь разнесена на отдельные файлы для удобства разработки и подготовки к публикации как PWA.

## Структура проекта
- `public/index.html` — разметка приложения.
- `public/styles/main.css` — стили оформления.
- `public/scripts/app.js` — логика игры и регистрация service worker.
- `public/manifest.json` — манифест PWA.
- `public/service-worker.js` — кэширование статических ресурсов.
- `public/icons/icon.svg` — базовая иконка приложения.
- `backend/app.py` — минимальный Flask-сервер для обработки обратной связи.

### Как выбирается адрес backend

При загрузке `public/index.html` ранний скрипт смотрит на адрес страницы и жёстко задаёт базовые URL для API без чтения файлов конфигурации:

- Если путь начинается с `/test` (например, `https://crocomim.ru/test`), включается тестовый режим и используется базовый URL `https://crocomim.ru/test/api`.
- Во всех остальных случаях выбирается боевой режим и базовый URL `https://crocomim.ru/api`.

## Запуск локально

### Только статический клиент
Откройте файл `public/index.html` в браузере или поднимите любой статический сервер из папки `public`:

```bash
cd public
python -m http.server 8000
```

После запуска страница будет доступна по адресу <http://localhost:8000>. Для корректной регистрации PWA рекомендуется использовать именно сервер, а не открывать файл напрямую.

### C минимальным бэкендом

Форма обратной связи отправляет данные на эндпоинт `POST /feedback`. Для локального тестирования выполните:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/app.py
```

По умолчанию сервер поднимается на <http://localhost:3000>, принимает отправки на `/feedback`, отправляет их на указанный SMTP (`SMTP_HOST`, `FEEDBACK_RECIPIENT`) и параллельно сохраняет в файл `data/feedback.log` (по одному JSON в строке). Путь можно изменить через переменные окружения `DATA_DIR` и `FEEDBACK_FILE`.

Для проверки работоспособности можно отправить запрос:

```bash
curl -X POST http://localhost:3000/feedback \
  -H "Content-Type: application/json" \
  -d '{"category":"typo","message":"Сообщение об ошибке...","consent":true,"context":{},"client":{}}'
```

В ответ сервер вернёт `{ "ok": true }`, а запись появится в `data/feedback.log`.

## PWA
Приложение содержит манифест и service worker с офлайн-кэшем базовых ресурсов и словарей. После первого посещения интерфейс и все словари будут доступны без подключения к сети.
