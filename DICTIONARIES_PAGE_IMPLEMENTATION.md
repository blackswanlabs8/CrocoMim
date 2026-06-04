# Реализация страницы словарей CrocoMim

## Обзор

Страница управления словарями реализована как **отдельная страница** `/dictionaries`, а не как модальное окно. Это соответствует архитектуре остальных функций приложения (авторизация, профиль).

## Архитектура

### Frontend

#### Страница
- **Файл:** `/workspace/public/dictionaries/index.html`
- **URL:** `https://crocomim.ru/dictionaries`
- **Маршрут Flask:** `GET /dictionaries`

#### Структура страницы:
```
┌─────────────────────────────────────┐
│  [←] 📚 Мои Словари       ✨10  👤 │
├─────────────────────────────────────┤
│ [Мои][Маркетплейс][Конструктор]     │
├─────────────────────────────────────┤
│                                     │
│  • Поиск и фильтры                  │
│  • Сетка карточек словарей          │
│  • Пошаговый мастер генерации       │
│                                     │
└─────────────────────────────────────┘
```

#### Компоненты:
1. **Шапка:**
   - Кнопка "Назад" → возвращает на главную (`/`)
   - Заголовок "📚 Мои Словари"
   - Счётчик генераций (✨10)
   - Кнопка профиля (👤)

2. **Вкладки:**
   - **Мои словари** — личные словари пользователя
   - **Маркетплейс** — каталог публичных словарей
   - **Конструктор** — создание нового словаря с ИИ

3. **Функционал:**
   - Поиск и фильтрация словарей
   - Создание через ИИ (3 шага)
   - Ручное редактирование слов
   - Публикация в маркетплейс
   - Импорт/экспорт словарей

#### Стили:
- **Файл:** `/workspace/public/styles/dictionaries.css`
- Адаптивный дизайн (mobile-first)
- Поддержка тёмной темы
- CSS-переменные для согласованности

#### Логика:
- **Файл:** `/workspace/public/scripts/dictionaries.js`
- Загрузка данных через API
- Управление состоянием вкладок
- Мастер генерации (пошаговый)
- Toast-уведомления

### Backend

#### Маршрут Flask
```python
@app.route("/dictionaries")
def serve_dictionaries_index():
    """Serve the dictionaries page as a standalone page."""
    LOGGER.info("Serving /dictionaries page")
    return send_from_directory(app.static_folder, "dictionaries/index.html")
```

**Файл:** `/workspace/backend/app.py` (строки 1004-1009)

#### API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/user/dictionaries` | Список словарей пользователя |
| POST | `/user/dictionaries` | Создать словарь |
| GET | `/user/dictionaries/<id>` | Получить словарь |
| PUT | `/user/dictionaries/<id>` | Обновить словарь |
| DELETE | `/user/dictionaries/<id>` | Удалить словарь |
| GET | `/marketplace/dictionaries` | Каталог публичных словарей |
| GET | `/marketplace/dictionaries/<id>` | Превью словаря |
| POST | `/marketplace/dictionaries/<id>/add` | Добавить в библиотеку |
| POST | `/generate-dictionary` | Генерация через ИИ |
| GET | `/user/generation-info` | Информация о лимитах |

#### Лимиты генераций:
- **Бесплатно:** 10 генераций
- **После исчерпания:** ожидание 24 часа между генерациями
- **Хранение:** в профиле пользователя (SQLite)

## Навигация

### Из главного меню
```javascript
// Файл: /workspace/public/scripts/app.js (строки 1410-1417)
const btnDictionaries = document.getElementById('btnDictionaries');
if (btnDictionaries) {
  btnDictionaries.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = './dictionaries';
  });
}
```

### Кнопка в шапке
```html
<!-- Файл: /workspace/public/index.html (строки 47-49) -->
<div class="icon-btn" id="btnDictionaries" title="Мои Словари" aria-label="Словари">
  <span class="material-symbols-rounded" style="font-size:20px;">library_books</span>
</div>
```

### Возврат назад
```javascript
// Файл: /workspace/public/scripts/dictionaries.js (строки 95-100)
const backBtn = document.getElementById('btnBack');
if (backBtn) {
  backBtn.addEventListener('click', () => {
    window.location.href = '/';
  });
}
```

## Развёртывание

### Требования
- Python 3.8+
- Flask
- SQLite (для хранения данных)

### Запуск backend
```bash
cd /workspace/backend
python app.py
```

Сервер запустится на `http://localhost:3000`

### Доступные URLs:
- `http://localhost:3000/` — главная страница
- `http://localhost:3000/dictionaries` — страница словарей
- `http://localhost:3000/auth/index.html` — авторизация

### Переменные окружения:
```bash
SECRET_KEY=your-secret-key
SESSION_COOKIE_SECURE=false  # true для production
DICT_GENERATION_LIMIT_ENABLED=false  # true для включения лимита
DICT_GENERATION_LIMIT_HOURS=24
```

## Тестирование

### Проверка синтаксиса
```bash
# Backend
python3 -m py_compile /workspace/backend/app.py

# Frontend JavaScript
node --check /workspace/public/scripts/app.js
node --check /workspace/public/scripts/dictionaries.js
```

### Ручное тестирование:
1. Открыть `http://localhost:3000/`
2. Нажать на кнопку 📚 в шапке
3. Проверить переход на `/dictionaries`
4. Протестировать все вкладки
5. Создать словарь через ИИ
6. Проверить счётчик генераций

## Структура файлов

```
/workspace/
├── backend/
│   ├── app.py              # Flask приложение + маршрут /dictionaries
│   ├── dictionary_store.py # CRUD операции со словарями
│   └── user_auth.py        # Аутентификация и лимиты
├── public/
│   ├── dictionaries/
│   │   └── index.html      # Страница словарей
│   ├── scripts/
│   │   ├── app.js          # Главная логика + навигация
│   │   └── dictionaries.js # Логика страницы словарей
│   └── styles/
│       └── dictionaries.css # Стили страницы
└── DICTIONARY_SYSTEM_DOCUMENTATION.md # Полная документация
```

## Отличия от модального окна

| Характеристика | Модальное окно | Отдельная страница |
|----------------|----------------|-------------------|
| URL            | Нет            | `/dictionaries` ✅ |
| Закладка       | Нельзя         | Можно ✅ |
| История браузера | Нет          | Есть ✅ |
| Прямая ссылка  | Нет            | Есть ✅ |
| Архитектура    | Встроенное     | Как auth/profile ✅ |

## Безопасность

- **Аутентификация:** Flask session cookies
- **CSRF Protection:** SameSite=Lax
- **XSS Protection:** санитайзинг ввода
- **Авторизация API:** проверка сессии перед операциями

## Производительность

- **Lazy loading:** загрузка данных по требованию
- **Кэширование:** пользовательские словари в памяти
- **Оптимизация:** минимальный размер CSS/JS

## Будущие улучшения

- [ ] PWA support (offline режим)
- [ ] Экспорт в PDF/Anki
- [ ] Совместное редактирование
- [ ] Теги и коллекции
- [ ] Статистика использования словарей

## Контакты

Поддержка: feedback@crocomim.ru  
Документация: `/DICTIONARY_SYSTEM_DOCUMENTATION.md`
