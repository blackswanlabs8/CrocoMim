# CrocoMim

Интерактивная игра «CrocoMim» теперь разнесена на отдельные файлы для удобства разработки и подготовки к публикации как PWA.

## Структура проекта
- `public/index.html` — разметка приложения.
- `public/styles/main.css` — стили оформления.
- `public/scripts/app.js` — логика игры и регистрация service worker.
- `public/manifest.json` — манифест PWA.
- `public/service-worker.js` — кэширование статических ресурсов.
- `public/icons/icon.svg` — базовая иконка приложения.

## Запуск локально
Откройте файл `public/index.html` в браузере или поднимите любой статический сервер из папки `public`:

```bash
cd public
python -m http.server 8000
```

После запуска страница будет доступна по адресу <http://localhost:8000>. Для корректной регистрации PWA рекомендуется использовать именно сервер, а не открывать файл напрямую.

## PWA
Приложение содержит манифест и service worker с офлайн-кэшем базовых ресурсов. После первого посещения интерфейс будет доступен без подключения к сети.

## Сервер генерации словарей

Для работы кнопки «Сгенерировать словарь» нужно поднять Node.js-сервер из директории `server`:

```bash
YANDEX_GPT_API_KEY=... \
YANDEX_GPT_FOLDER_ID=... \
YANDEX_GPT_API_TYPE=assistant \
node server/index.js
```

По умолчанию сервер умеет работать с двумя API Яндекса:

- **`YANDEX_GPT_API_TYPE=assistant`** или `YANDEX_GPT_API_URL=https://rest-assistant.api.cloud.yandex.net/v1/responses` — REST Assistant API (совместимо с Python-примером из документации).
- **`YANDEX_GPT_API_TYPE=` (пусто)** — старый endpoint `https://llm.api.cloud.yandex.net/foundationModels/v1/completion`.

Не забудьте прокинуть ключ API и идентификатор каталога. Дополнительно можно указать `YANDEX_GPT_MODEL` (например, `yandexgpt-lite`) и `YANDEX_GPT_API_URL`, если требуется нестандартный endpoint.
