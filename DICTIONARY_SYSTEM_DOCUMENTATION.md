# Документация системы словарей

## Обзор системы

Система состоит из трех основных компонентов:
1. **Маркетплейс словарей** - каталог публичных словарей
2. **Хранилище пользователя** - личные словари пользователя
3. **Генератор словарей** - создание словарей с помощью ИИ

---

## 1. Маркетплейс словарей

### Описание
Публичный каталог словарей, созданных другими пользователями. Пользователи могут просматривать, искать и добавлять словари в свою библиотеку.

### API Endpoints

#### GET /marketplace/dictionaries
Получение списка всех публичных словарей.

**Параметры запроса:**
- `page` (int, optional): номер страницы (по умолчанию 1)
- `per_page` (int, optional): количество на странице (по умолчанию 20)
- `category` (str, optional): фильтр по категории
- `language` (str, optional): фильтр по языку
- `search` (str, optional): поиск по названию и описанию
- `sort_by` (str, optional): сортировка (created_at, downloads, rating)
- `order` (str, optional): порядок (asc, desc)

**Пример запроса:**
```bash
GET /marketplace/dictionaries?page=1&per_page=20&category=business&language=en-ru&sort_by=downloads&order=desc
```

**Ответ:**
```json
{
  "dictionaries": [
    {
      "id": 123,
      "title": "Business English Vocabulary",
      "description": "Comprehensive business terminology",
      "category": "business",
      "source_language": "en",
      "target_language": "ru",
      "word_count": 500,
      "author": "john_doe",
      "author_id": 45,
      "downloads": 1250,
      "rating": 4.8,
      "reviews_count": 32,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-20T14:22:00Z",
      "is_premium": false,
      "price": 0,
      "tags": ["business", "english", "professional"]
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_items": 156,
    "total_pages": 8
  }
}
```

#### GET /marketplace/dictionaries/<dictionary_id>
Получение детальной информации о словаре (превью).

**Параметры:**
- `dictionary_id` (int): ID словаря

**Ответ:**
```json
{
  "id": 123,
  "title": "Business English Vocabulary",
  "description": "Comprehensive business terminology for professionals",
  "category": "business",
  "source_language": "en",
  "target_language": "ru",
  "word_count": 500,
  "author": "john_doe",
  "author_id": 45,
  "downloads": 1250,
  "rating": 4.8,
  "reviews_count": 32,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-20T14:22:00Z",
  "is_premium": false,
  "price": 0,
  "tags": ["business", "english", "professional"],
  "preview_words": [
    {"source": "meeting", "target": "встреча"},
    {"source": "deadline", "target": "крайний срок"},
    {"source": "budget", "target": "бюджет"}
  ],
  "can_add": true
}
```

#### POST /marketplace/dictionaries/<dictionary_id>/add
Добавление словаря из маркетплейса в библиотеку пользователя.

**Параметры:**
- `dictionary_id` (int): ID словаря

**Требования:**
- Пользователь должен быть авторизован
- Словарь должен быть публичным
- Пользователь не должен уже иметь этот словарь

**Ответ:**
```json
{
  "success": true,
  "message": "Dictionary added to your library",
  "dictionary_id": 123,
  "added_at": "2024-01-25T09:15:00Z"
}
```

**Возможные ошибки:**
- `401 Unauthorized`: Пользователь не авторизован
- `403 Forbidden`: Словарь приватный
- `409 Conflict`: Словарь уже в библиотеке
- `404 Not Found`: Словарь не найден

---

## 2. Хранилище пользователя

### Описание
Личное пространство пользователя для управления своими словарями. Включает созданные, отредактированные и сохранённые словари.

### API Endpoints

#### GET /user/dictionaries
Получение списка всех словарей пользователя.

**Параметры запроса:**
- `page` (int, optional): номер страницы (по умолчанию 1)
- `per_page` (int, optional): количество на странице (по умолчанию 20)
- `status` (str, optional): фильтр по статусу (draft, published, private, public)
- `category` (str, optional): фильтр по категории
- `search` (str, optional): поиск по названию

**Пример запроса:**
```bash
GET /user/dictionaries?page=1&status=public&category=medical
```

**Ответ:**
```json
{
  "dictionaries": [
    {
      "id": 789,
      "title": "Medical Terminology",
      "description": "Essential medical terms",
      "category": "medical",
      "source_language": "en",
      "target_language": "ru",
      "word_count": 350,
      "status": "public",
      "is_generated": true,
      "created_at": "2024-01-10T08:00:00Z",
      "updated_at": "2024-01-22T16:45:00Z",
      "downloads": 0,
      "rating": 0,
      "reviews_count": 0
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_items": 12,
    "total_pages": 1
  },
  "stats": {
    "total_dictionaries": 12,
    "public_dictionaries": 5,
    "private_dictionaries": 7,
    "generated_dictionaries": 8,
    "manual_dictionaries": 4
  }
}
```

#### GET /user/dictionaries/<dictionary_id>
Получение полного словаря пользователя для редактирования.

**Параметры:**
- `dictionary_id` (int): ID словаря

**Требования:**
- Пользователь должен быть владельцем словаря

**Ответ:**
```json
{
  "id": 789,
  "title": "Medical Terminology",
  "description": "Essential medical terms",
  "category": "medical",
  "source_language": "en",
  "target_language": "ru",
  "status": "public",
  "is_generated": true,
  "created_at": "2024-01-10T08:00:00Z",
  "updated_at": "2024-01-22T16:45:00Z",
  "words": [
    {"id": 1, "source": "diagnosis", "target": "диагноз", "notes": ""},
    {"id": 2, "source": "treatment", "target": "лечение", "notes": ""},
    {"id": 3, "source": "symptom", "target": "симптом", "notes": ""}
  ],
  "metadata": {
    "generation_prompt": "Medical terms for beginners",
    "last_edited_by": "user",
    "version": 3
  }
}
```

#### POST /user/dictionaries
Создание нового словаря или сохранение существующего.

**Тело запроса:**
```json
{
  "title": "My New Dictionary",
  "description": "Description of the dictionary",
  "category": "education",
  "source_language": "en",
  "target_language": "ru",
  "status": "private",
  "words": [
    {"source": "hello", "target": "привет", "notes": ""},
    {"source": "goodbye", "target": "до свидания", "notes": ""}
  ],
  "tags": ["basic", "greetings"]
}
```

**Обязательные поля:**
- `title` (str): название словаря
- `source_language` (str): язык оригинала (код ISO 639-1)
- `target_language` (str): целевой язык (код ISO 639-1)

**Опциональные поля:**
- `description` (str): описание
- `category` (str): категория
- `status` (str): статус (private/public, по умолчанию private)
- `words` (array): массив слов
- `tags` (array): теги

**Ответ:**
```json
{
  "success": true,
  "message": "Dictionary created successfully",
  "dictionary": {
    "id": 790,
    "title": "My New Dictionary",
    "status": "private",
    "word_count": 2,
    "created_at": "2024-01-25T10:00:00Z"
  }
}
```

#### PUT /user/dictionaries/<dictionary_id>
Обновление существующего словаря.

**Параметры:**
- `dictionary_id` (int): ID словаря

**Тело запроса:** (аналогично POST, все поля опциональны)

**Требования:**
- Пользователь должен быть владельцем словаря

**Ответ:**
```json
{
  "success": true,
  "message": "Dictionary updated successfully",
  "dictionary": {
    "id": 789,
    "title": "Medical Terminology Updated",
    "status": "public",
    "word_count": 355,
    "updated_at": "2024-01-25T11:30:00Z"
  }
}
```

#### DELETE /user/dictionaries/<dictionary_id>
Удаление словаря.

**Параметры:**
- `dictionary_id` (int): ID словаря

**Требования:**
- Пользователь должен быть владельцем словаря

**Ответ:**
```json
{
  "success": true,
  "message": "Dictionary deleted successfully",
  "dictionary_id": 789
}
```

#### PATCH /user/dictionaries/<dictionary_id>/visibility
Изменение видимости словаря (private ↔ public).

**Параметры:**
- `dictionary_id` (int): ID словаря

**Тело запроса:**
```json
{
  "status": "public"
}
```

**Возможные значения status:**
- `private`: только владелец видит словарь
- `public`: словарь доступен в маркетплейсе

**Ответ:**
```json
{
  "success": true,
  "message": "Dictionary visibility changed to public",
  "dictionary_id": 789,
  "new_status": "public"
}
```

---

## 3. Генерация словарей

### Описание
Создание словарей с помощью искусственного интеллекта на основе пользовательского запроса.

### Лимиты генераций

**Бесплатный тариф:**
- 10 бесплатных генераций при регистрации
- После исчерпания: 1 генерация каждые 24 часа

**Премиум тариф (планируется):**
- Безлимитные генерации
- Приоритетная очередь
- Расширенные настройки генерации

### API Endpoints

#### GET /user/generation-info
Получение информации о доступных генерациях пользователя.

**Ответ:**
```json
{
  "user_id": 45,
  "generations_remaining": 7,
  "generations_total": 10,
  "generations_used": 3,
  "next_free_generation_at": null,
  "is_premium": false,
  "can_generate": true,
  "limit_type": "free",
  "reset_date": null
}
```

**Если лимит исчерпан:**
```json
{
  "user_id": 45,
  "generations_remaining": 0,
  "generations_total": 10,
  "generations_used": 10,
  "next_free_generation_at": "2024-01-26T10:00:00Z",
  "is_premium": false,
  "can_generate": false,
  "limit_type": "free",
  "wait_time_hours": 18
}
```

#### POST /generate-dictionary
Генерация нового словаря через ИИ.

**Тело запроса:**
```json
{
  "prompt": "Create a dictionary of 50 common business English terms with Russian translations",
  "source_language": "en",
  "target_language": "ru",
  "category": "business",
  "word_count": 50,
  "difficulty": "intermediate",
  "include_examples": true,
  "include_pronunciation": false
}
```

**Обязательные поля:**
- `prompt` (str): описание того, какой словарь нужен
- `source_language` (str): язык оригинала
- `target_language` (str): целевой язык

**Опциональные поля:**
- `category` (str): категория
- `word_count` (int): желаемое количество слов (по умолчанию 50, макс 200)
- `difficulty` (str): уровень сложности (beginner/intermediate/advanced)
- `include_examples` (bool): включать примеры использования (по умолчанию false)
- `include_pronunciation` (bool): включать транскрипцию (по умолчанию false)

**Требования:**
- Пользователь должен быть авторизован
- Должны быть доступные генерации (can_generate = true)

**Ответ:**
```json
{
  "success": true,
  "message": "Dictionary generated successfully",
  "dictionary": {
    "id": 791,
    "title": "Business English Terms",
    "description": "Generated from prompt: Create a dictionary of 50 common business...",
    "category": "business",
    "source_language": "en",
    "target_language": "ru",
    "word_count": 50,
    "status": "draft",
    "is_generated": true,
    "created_at": "2024-01-25T12:00:00Z",
    "words": [
      {"source": "meeting", "target": "встреча", "example": "", "pronunciation": ""},
      {"source": "deadline", "target": "крайний срок", "example": "", "pronunciation": ""}
    ]
  },
  "generations_remaining": 6,
  "edit_url": "/user/dictionaries/791/edit"
}
```

**Возможные ошибки:**
- `401 Unauthorized`: Пользователь не авторизован
- `429 Too Many Requests`: Превышен лимит генераций
- `400 Bad Request`: Неверные параметры запроса
- `500 Internal Server Error`: Ошибка генерации ИИ

---

## 4. Рабочий процесс пользователя

### Сценарий 1: Создание и публикация словаря

1. **Генерация:**
   ```
   POST /generate-dictionary
   → Получаем черновик словаря
   ```

2. **Редактирование:**
   ```
   GET /user/dictionaries/<id>
   → Редактируем слова, добавляем заметки
   PUT /user/dictionaries/<id>
   → Сохраняем изменения
   ```

3. **Публикация:**
   ```
   PATCH /user/dictionaries/<id>/visibility
   { "status": "public" }
   → Словарь появляется в маркетплейсе
   ```

### Сценарий 2: Поиск и использование чужого словаря

1. **Поиск:**
   ```
   GET /marketplace/dictionaries?category=business&language=en-ru
   → Получаем список словарей
   ```

2. **Просмотр:**
   ```
   GET /marketplace/dictionaries/123
   → Смотрим превью, читаем описание
   ```

3. **Добавление:**
   ```
   POST /marketplace/dictionaries/123/add
   → Словарь копируется в библиотеку пользователя
   ```

4. **Редактирование (опционально):**
   ```
   GET /user/dictionaries/<new_id>
   → Можем редактировать свою копию
   ```

### Сценарий 3: Управление личными словарями

1. **Просмотр библиотеки:**
   ```
   GET /user/dictionaries
   → Видим все свои словари со статистикой
   ```

2. **Фильтрация:**
   ```
   GET /user/dictionaries?status=public
   → Видим только опубликованные
   ```

3. **Изменение видимости:**
   ```
   PATCH /user/dictionaries/456/visibility
   { "status": "private" }
   → Убираем из маркетплейса
   ```

4. **Удаление:**
   ```
   DELETE /user/dictionaries/456
   → Удаляем словарь безвозвратно
   ```

---

## 5. Структуры данных

### Dictionary (Словарь)
```python
{
    "id": int,                  # Уникальный идентификатор
    "title": str,               # Название (max 200 символов)
    "description": str,         # Описание (max 2000 символов)
    "category": str,            # Категория
    "source_language": str,     # Код языка оригинала (ISO 639-1)
    "target_language": str,     # Код целевого языка (ISO 639-1)
    "word_count": int,          # Количество слов
    "author_id": int,           # ID создателя
    "author": str,              # Username создателя
    "status": str,              # draft/private/public
    "is_generated": bool,       # Создан через ИИ
    "is_premium": bool,         # Платный словарь
    "price": float,             # Цена (если premium)
    "downloads": int,           # Количество скачиваний
    "rating": float,            # Средний рейтинг (0-5)
    "reviews_count": int,       # Количество отзывов
    "tags": list[str],          # Теги для поиска
    "created_at": datetime,     # Дата создания
    "updated_at": datetime,     # Дата последнего обновления
    "published_at": datetime,   # Дата публикации
    "words": list[Word]         # Массив слов (только при детальном просмотре)
}
```

### Word (Слово)
```python
{
    "id": int,                  # Уникальный идентификатор
    "source": str,              # Слово на исходном языке
    "target": str,              # Перевод
    "notes": str,               # Заметки пользователя
    "example": str,             # Пример использования
    "pronunciation": str,       # Транскрипция
    "part_of_speech": str,      # Часть речи
    "frequency": str,           # Частотность
    "created_at": datetime,     # Дата добавления
    "updated_at": datetime      # Дата обновления
}
```

### UserGenerationInfo (Информация о генерациях)
```python
{
    "user_id": int,             # ID пользователя
    "generations_remaining": int,  # Осталось генераций
    "generations_total": int,      # Всего доступно
    "generations_used": int,       # Использовано
    "next_free_generation_at": datetime or null,  # Когда следующая бесплатная
    "is_premium": bool,         # Премиум аккаунт
    "can_generate": bool,       # Можно ли генерировать сейчас
    "limit_type": str,          # free/premium
    "wait_time_hours": int      # Часов ожидания (если лимит исчерпан)
}
```

---

## 6. Категории словарей

Поддерживаемые категории:
- `general` - Общие словари
- `business` - Бизнес и финансы
- `medical` - Медицина
- `legal` - Юридическая терминология
- `technical` - Технические термины
- `academic` - Академическая лексика
- `travel` - Путешествия и туризм
- `food` - Еда и кулинария
- `sports` - Спорт
- `arts` - Искусство и культура
- `science` - Наука
- `technology` - IT и технологии
- `everyday` - Повседневная лексика
- `slang` - Разговорная речь и сленг
- `other` - Другое

---

## 7. Языковые пары

Формат: ISO 639-1 коды языков
Примеры:
- `en-ru` - Английский → Русский
- `ru-en` - Русский → Английский
- `es-fr` - Испанский → Французский
- `de-it` - Немецкий → Итальянский

Популярные языки:
- `en` - English
- `ru` - Русский
- `es` - Español
- `fr` - Français
- `de` - Deutsch
- `it` - Italiano
- `pt` - Português
- `zh` - 中文
- `ja` - 日本語
- `ko` - 한국어
- `ar` - العربية
- `tr` - Türkçe

---

## 8. Ошибки и коды состояния

### HTTP Status Codes

| Код | Описание | Когда возвращается |
|-----|----------|-------------------|
| 200 | OK | Успешный запрос |
| 201 | Created | Успешное создание ресурса |
| 204 | No Content | Успешное удаление |
| 400 | Bad Request | Неверные параметры запроса |
| 401 | Unauthorized | Пользователь не авторизован |
| 403 | Forbidden | Нет доступа к ресурсу |
| 404 | Not Found | Ресурс не найден |
| 409 | Conflict | Конфликт (например, словарь уже добавлен) |
| 422 | Unprocessable Entity | Ошибка валидации данных |
| 429 | Too Many Requests | Превышен лимит запросов/генераций |
| 500 | Internal Server Error | Внутренняя ошибка сервера |

### Формат ошибок

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "title",
        "message": "Title is required"
      },
      {
        "field": "source_language",
        "message": "Invalid language code"
      }
    ]
  }
}
```

### Типы ошибок

- `VALIDATION_ERROR` - Ошибка валидации входных данных
- `NOT_FOUND` - Ресурс не найден
- `UNAUTHORIZED` - Требуется авторизация
- `FORBIDDEN` - Доступ запрещён
- `ALREADY_EXISTS` - Ресурс уже существует
- `LIMIT_EXCEEDED` - Превышен лимит
- `GENERATION_FAILED` - Ошибка генерации ИИ
- `DATABASE_ERROR` - Ошибка базы данных

---

## 9. Рекомендации по UX/UI

### Маркетплейс

**Главная страница:**
- Поиск с автодополнением
- Фильтры: категория, язык, цена, рейтинг
- Сортировка: популярные, новые, по рейтингу
- Карточки словарей с превью (название, автор, рейтинг, кол-во слов)
- Пагинация или infinite scroll

**Страница словаря:**
- Подробное описание
- Автор и его рейтинг
- Превью первых 10-20 слов
- Кнопка "Добавить в библиотеку"
- Отзывы и рейтинг
- Похожие словари

### Хранилище пользователя

**Главная страница:**
- Статистика: всего словарей, публичные, приватные
- Таблица/сетка словарей
- Быстрые фильтры: все, публичные, приватные, черновики
- Поиск по своим словарям
- Кнопка "Создать новый" (ведёт на генератор)

**Редактор словаря:**
- Поля: название, описание, категория, языки
- Таблица слов с возможностью редактирования
- Добавление/удаление слов
- Массовые операции (выбрать несколько, удалить)
- Импорт/экспорт (CSV, JSON)
- Переключатель видимости (private/public)
- Автосохранение

### Генератор

**Интерфейс генерации:**
- Текстовое поле для промпта (с примерами)
- Выбор языковой пары
- Выбор категории
- Настройки: количество слов, сложность, опции
- Индикатор доступных генераций
- Кнопка "Сгенерировать"
- Предпросмотр результата перед сохранением
- Опции: "Сохранить в библиотеку", "Редактировать", "Отменить"

**Индикатор лимитов:**
- Всегда показывать: "Осталось генераций: X из Y"
- Если 0: "Следующая бесплатная генерация через N часов"
- Прогресс-бар использования лимита
- CTA для апгрейда на премиум (если есть)

### Уведомления

**Типы уведомлений:**
- Успех: "Словарь сохранён", "Генерация завершена"
- Ошибки: "Лимит генераций исчерпан", "Ошибка сохранения"
- Предупреждения: "Вы собираетесь опубликовать словарь"
- Информация: "Ваш словарь добавлен в маркетплейс"

**Каналы:**
- In-app уведомления (колокольчик)
- Email (для важных событий)
- Push (если есть мобильное приложение)

---

## 10. Безопасность

### Авторизация
- Все пользовательские endpoints требуют аутентификации
- JWT токены или session-based auth
- Refresh tokens для долгоживущих сессий

### Права доступа
- Пользователь может редактировать только свои словари
- Приватные словари видны только владельцу
- Публичные словари видны всем, но редактировать может только владелец
- Администраторы могут модерировать контент

### Валидация
- Санитизация пользовательского ввода
- Проверка языковых кодов
- Ограничение размера словарей (макс 2000 слов)
- Rate limiting на API endpoints

### Модерация
- Жалобы на контент
- Автоматическая проверка на запрещённый контент
- Ручная модерация при необходимости
- Возможность скрыть словарь из маркетплейса

---

## 11. Производительность

### Кэширование
- Кэш списков словарей (5 минут)
- Кэш популярных словарей (1 час)
- Кэш статистики пользователя (10 минут)

### Пагинация
- Обязательная пагинация на всех списках
- Максимум 100 элементов на страницу
- Cursor-based пагинация для больших объёмов

### Индексация
- Индексы на полях поиска (title, description, tags)
- Индексы на foreign keys (author_id, category)
- Full-text search для описаний

### Асинхронные операции
- Генерация словарей через очередь задач
- Email уведомления асинхронно
- Экспорт/импорт больших словарей в фоне

---

## 12. Метрики и аналитика

### Для пользователей
- Количество созданных словарей
- Количество скачиваний своих словарей
- Средний рейтинг полученных отзывов
- Использованные генерации

### Для администрации
- Общее количество словарей
- Активные пользователи
- Популярные категории
- Конверсия генераций в публикации
- Загруженность системы генерации

### События для трекинга
- `dictionary_created` - Создание словаря
- `dictionary_generated` - Генерация через ИИ
- `dictionary_published` - Публикация в маркетплейс
- `dictionary_added` - Добавление из маркетплейса
- `dictionary_edited` - Редактирование словаря
- `dictionary_deleted` - Удаление словаря
- `generation_limit_reached` - Достигнут лимит генераций

---

## 13. Планы развития

### Версия 1.1 (следующая итерация)
- [ ] Система отзывов и рейтингов
- [ ] Избранное / Wishlist
- [ ] История версий словарей
- [ ] Совместное редактирование

### Версия 1.2
- [ ] Платные словари (монетизация)
- [ ] Подписки на авторов
- [ ] Система достижений
- [ ] Рекомендации словарей

### Версия 2.0
- [ ] Мобильное приложение
- [ ] Офлайн режим
- [ ] Синхронизация между устройствами
- [ ] API для разработчиков

---

## 14. FAQ

**Q: Сколько генераций доступно бесплатно?**
A: 10 генераций при регистрации, затем 1 генерация каждые 24 часа.

**Q: Могу ли я редактировать словарь после публикации?**
A: Да, вы можете редактировать свой словарь в любое время. Изменения автоматически отражаются у всех, кто добавил словарь.

**Q: Что будет, если я удалю словарь из маркетплейса?**
A: Словарь исчезнет из маркетплейса, но останется в вашей библиотеке. У других пользователей останутся их копии.

**Q: Могу ли я изменить языковую пару после создания?**
A: Нет, языковая пара фиксируется при создании. Создайте новый словарь с нужной парой.

**Q: Есть ли ограничение на размер словаря?**
A: Максимум 2000 слов в одном словаре. Для больших объёмов разбейте на несколько словарей.

**Q: Как добавить свой словарь в маркетплейс?**
A: В редакторе словаря переключите статус с "private" на "public". Словарь появится в маркетплейсе после проверки.

**Q: Могу ли я скачать словарь для офлайн использования?**
A: В текущей версии нет. Эта функция планируется в версии 2.0.

---

## Контакты поддержки

По вопросам и проблемам обращайтесь:
- Email: support@dictionary-platform.com
- Telegram: @dict_support
- GitHub Issues: https://github.com/your-org/dictionary-platform/issues

---

*Документация актуальна на январь 2025 года. Версия API: 1.0*
