"""
LLM Service for dictionary generation via OpenRouter API.
Provides functionality to generate Russian game dictionary cards with descriptions and gesture hints.
"""

import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Загрузка переменных окружения из .env файла
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Конфигурация OpenRouter API
OPENROUTER_API_KEY = "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"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = "openai/gpt-4o-mini"

# Таймауты и повторные попытки
DEFAULT_TIMEOUT = 60
DEFAULT_RETRIES = 3
RETRY_DELAY_BASE = 1.5

# Константы сложности
DIFFICULTY_LEVELS = {
    "easy": {"level": "A1-A2", "description": "Beginner"},
    "medium": {"level": "B1-B2", "description": "Intermediate"},
    "hard": {"level": "C1-C2", "description": "Advanced"},
}

TARGET_WORDS_COUNT = 30


class DictionaryGenerationError(Exception):
    """Базовое исключение для ошибок генерации словаря."""
    pass


class APIResponseError(DictionaryGenerationError):
    """Ошибка ответа от API (невалидная структура или содержимое)."""
    pass


class WordValidationError(DictionaryGenerationError):
    """Ошибка валидации слов (недостаточно слов, дубликаты, missing поля)."""
    pass


def build_prompt(difficulty: str, topic: Optional[str] = None) -> Tuple[str, str]:
    """
    Построить системный и пользовательский промпты для генерации игрового словаря.

    Args:
        difficulty: Уровень сложности (easy, medium, hard)
        topic: Опциональная тема для слов (может быть None)

    Returns:
        Кортеж (system_prompt, user_prompt)
    """
    normalized_topic = topic.strip() if topic and topic.strip() else "без конкретной темы"

    system_prompt = """SYSTEM PROMPT:

Ты — редактор словарей для русскоязычной игры «Крокодил/Пантомима».

Твоя задача — создавать качественные игровые словари на русском языке.

Правила:

1. Генерируй слова и словосочетания, которые реально можно показать жестами, мимикой или действиями.
2. Не используй слишком абстрактные, политические, оскорбительные, взрослые, жестокие или спорные темы.
3. Не используй редкие термины, которые большинство игроков не поймёт.
4. Не добавляй одинаковые или почти одинаковые слова.
5. Не используй английские слова, если пользователь явно не попросил.
6. Все поля должны быть на русском языке.
7. Поле term — короткое слово или словосочетание.
8. Поле description — короткое понятное объяснение термина.
9. Поле about — короткая подсказка, как можно показать это слово в игре.
10. Сначала мысленно придумай больше вариантов, отбери лучшие, а в ответе верни ровно 30 элементов.
11. Ответ должен строго соответствовать JSON-схеме. Без Markdown, без комментариев, без текста вне JSON.
""".strip()

    user_prompt = f"""USER PROMPT:

Создай словарь для игры «Крокодил/Пантомима».

Тема словаря: {normalized_topic}
Сложность: {difficulty}
Количество итоговых слов: {TARGET_WORDS_COUNT}
Язык: русский

Требования к словам:

* слова должны подходить для показа жестами;
* слова должны быть понятны большинству игроков;
* сложность должна соответствовать выбранному уровню;
* не должно быть дублей;
* не должно быть слишком похожих вариантов;
* не должно быть слов, которые невозможно нормально показать;
* избегай однотипности, словарь должен быть разнообразным.

Формат каждого элемента:

* term: слово или короткое словосочетание;
* description: короткое объяснение;
* about: короткая подсказка, как это показать.

Верни ровно {TARGET_WORDS_COUNT} лучших слов.
""".strip()

    return system_prompt, user_prompt

def call_openrouter(
    system_prompt: str,
    user_prompt: str,
    retries: int = DEFAULT_RETRIES,
    timeout: int = DEFAULT_TIMEOUT
) -> Dict[str, Any]:
    """
    Вызвать OpenRouter API с обработкой ошибок и повторными попытками.
    
    Args:
        system_prompt: Системный промпт
        user_prompt: Пользовательский промпт
        retries: Количество попыток при ошибке
        timeout: Таймаут запроса в секундах
    
    Returns:
        Ответ от API в виде словаря
    
    Raises:
        RuntimeError: Если все попытки исчерпаны
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY не задан в переменных окружения")

    if retries < 1:
        raise ValueError("retries должен быть >= 1")
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://crocomim.app",
        "X-OpenRouter-Title": "CrocoMim Dictionary Generator",
    }
    
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 4096,
    }
    
    last_error: Optional[Exception] = None
    
    for attempt in range(1, retries + 1):
        response: Optional[requests.Response] = None

        try:
            response = requests.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
                timeout=timeout,
            )
            
            if response.status_code == 200:
                try:
                    return response.json()
                except ValueError as e:
                    last_error = e
                    logger.warning("Попытка %s: не удалось разобрать JSON - %s", attempt, e)
            else:
                error_msg = f"HTTP {response.status_code}: {response.text[:500]}"
                last_error = RuntimeError(error_msg)
                logger.warning("Попытка %s: %s", attempt, error_msg)

                # При ошибках 4xx не повторяем (кроме 429 - rate limit)
                if 400 <= response.status_code < 500 and response.status_code != 429:
                    raise RuntimeError(error_msg)
                
        except requests.Timeout:
            last_error = requests.Timeout(f"Timeout after {timeout}s on attempt {attempt}")
            logger.warning("Попытка %s: %s", attempt, last_error)
        except requests.RequestException as e:
            last_error = e
            logger.warning("Попытка %s: Сетевая ошибка - %s", attempt, e)
        
        # Экспоненциальная задержка перед следующей попыткой
        if attempt < retries:
            retry_after = None
            if response is not None:
                retry_after_header = response.headers.get("Retry-After")
                if retry_after_header:
                    try:
                        retry_after = float(retry_after_header)
                    except ValueError:
                        retry_after = None

            delay = retry_after if retry_after is not None else min(RETRY_DELAY_BASE ** attempt, 30)
            logger.warning("Ожидание %.1fс перед следующей попыткой...", delay)
            time.sleep(delay)
    
    raise RuntimeError(f"Не удалось получить ответ от OpenRouter после {retries} попыток. Последняя ошибка: {last_error}")


def extract_words_from_response(raw_response: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Извлечь список слов из ответа OpenRouter API с умным парсингом.
    
    Args:
        raw_response: Сырой ответ от API
    
    Returns:
        Список словарей с полями: term, description, about
    
    Raises:
        APIResponseError: Если не удалось распарсить ответ или структура невалидна
        WordValidationError: Если слова не прошли валидацию (не 30 шт, дубликаты, missing поля)
    """
    try:
        # Стандартный формат OpenRouter/GPT
        content = raw_response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise APIResponseError(
            f"Не удалось извлечь content из ответа: {json.dumps(raw_response, ensure_ascii=False)[:500]}"
        ) from e
    
    # Умная очистка текста
    text = content.strip()
    
    # 1. Удаляем markdown-блоки ```json ... ```
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.DOTALL).strip()
    
    # 2. Поиск первого [ и последнего ] для извлечения массива
    first_bracket = text.find("[")
    last_bracket = text.rfind("]")
    
    if first_bracket == -1 or last_bracket == -1 or first_bracket >= last_bracket:
        # Попытка найти JSON-объект с ключом "words"
        match = re.search(r'\{[\s\S]*?"words"[\s\S]*?\}', text)
        if match:
            json_candidate = match.group()
        else:
            raise APIResponseError(f"Ответ не содержит JSON-массив или объект с 'words': {text[:300]}")
    else:
        json_candidate = text[first_bracket:last_bracket + 1]
    
    # 3. Безопасный json.loads()
    try:
        data = json.loads(json_candidate)
    except json.JSONDecodeError as e:
        # Если не получилось, пробуем найти объект целиком
        match = re.search(r'\{[\s\S]*?\}', text)
        if match:
            try:
                data = json.loads(match.group())
            except json.JSONDecodeError:
                raise APIResponseError(f"Не удалось распарсить JSON из ответа: {text[:300]}") from e
        else:
            raise APIResponseError(f"Ответ не содержит валидный JSON: {text[:300]}") from e
    
    # 4. Валидация структуры
    if isinstance(data, list):
        words_raw = data
    elif isinstance(data, dict):
        if "words" not in data:
            raise APIResponseError(f"Ответ не содержит ключ 'words': {json.dumps(data, ensure_ascii=False)[:300]}")
        words_raw = data["words"]
    else:
        raise APIResponseError(f"Неожиданный тип данных: {type(data)}, ожидался list или dict")
    
    if not isinstance(words_raw, list):
        raise APIResponseError(f"'words' должен быть массивом, получено: {type(words_raw)}")
    
    # 5. Нормализация и фильтрация слов
    normalized_words: List[Dict[str, str]] = []
    seen_terms: set = set()

    for idx, item in enumerate(words_raw):
        if not isinstance(item, dict):
            continue

        term = (item.get("term") or "").strip()
        description = (item.get("description") or "").strip()
        about = (item.get("about") or "").strip()

        # Валидация наличия обязательных полей
        missing_fields = []
        if not term:
            missing_fields.append("term")
        if not description:
            missing_fields.append("description")
        if not about:
            missing_fields.append("about")

        if missing_fields:
            print(f"Пропуск записи #{idx}: отсутствуют поля {missing_fields}")
            continue

        # Проверка на дубликаты (case-insensitive)
        term_lower = term.lower()
        if term_lower in seen_terms:
            print(f"Пропуск дубликата: {term}")
            continue

        seen_terms.add(term_lower)
        normalized_words.append({
            "term": term,
            "description": description,
            "about": about,
        })
    
    # 6. Финальная валидация количества
    if len(normalized_words) != TARGET_WORDS_COUNT:
        raise WordValidationError(
            f"Получено {len(normalized_words)} слов вместо требуемых {TARGET_WORDS_COUNT}. "
            f"Уникальных: {len(seen_terms)}"
        )
    
    return normalized_words


def generate_dictionary(
    difficulty: str = "medium",
    topic: Optional[str] = None,
    target_count: int = TARGET_WORDS_COUNT,
    max_retries: int = 3
) -> List[Dict[str, str]]:
    """
    Сгенерировать словарь английских слов с помощью OpenRouter API.
    
    Args:
        difficulty: Уровень сложности (easy, medium, hard)
        topic: Опциональная тема для слов
        target_count: Желаемое количество слов (по умолчанию 30)
        max_retries: Максимальное количество попыток при ошибке парсинга
    
    Returns:
        Список словарей с полями: term, description, about
    
    Raises:
        ValueError: Если некорректная сложность
        DictionaryGenerationError: Если не удалось сгенерировать валидный словарь
    """
    # Валидация сложности
    difficulty = (difficulty or "medium").strip().lower()
    if difficulty not in DIFFICULTY_LEVELS:
        raise ValueError(f"Неизвестная сложность '{difficulty}'. Допустимые: {', '.join(DIFFICULTY_LEVELS.keys())}")
    
    start_time = datetime.now(timezone.utc)
    print(f"Начало генерации словаря: сложность={difficulty}, тема={topic or 'общая'}, время={start_time.isoformat()}")
    
    # Построение промптов
    system_prompt, user_prompt = build_prompt(difficulty, topic)
    
    # Попытки генерации с retry logic
    last_error: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            # Вызов API
            raw_response = call_openrouter(system_prompt, user_prompt)
            
            # Извлечение и валидация слов
            words = extract_words_from_response(raw_response)
            
            # Обрезка до target_count если получилось больше
            if len(words) > target_count:
                words = words[:target_count]
            
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            print(f"Генерация успешна за {elapsed:.2f}с. Получено слов: {len(words)}")
            
            return words
            
        except (APIResponseError, WordValidationError) as e:
            last_error = e
            print(f"Попытка {attempt}: Ошибка парсинга/валидации - {e}")
            
            if attempt < max_retries:
                delay = RETRY_DELAY_BASE ** attempt
                print(f"Ожидание {delay:.1f}с перед повторной попыткой...")
                time.sleep(delay)
            else:
                print(f"Все {max_retries} попыток исчерпаны")
                raise DictionaryGenerationError(
                    f"Не удалось сгенерировать валидный словарь после {max_retries} попыток. "
                    f"Последняя ошибка: {e}"
                ) from e
        except Exception as e:
            # Другие ошибки (сеть, API) пробрасываем сразу
            print(f"Ошибка при вызове OpenRouter: {e}")
            raise
    
    # Должны вернуться из цикла выше, но на всякий случай
    raise DictionaryGenerationError("Неожиданная ошибка генерации словаря")


if __name__ == "__main__":
    # Тестовый запуск
    print("Тест генерации словаря (easy)...")
    try:
        result = generate_dictionary(difficulty="easy")
        print(f"Успешно сгенерировано {len(result)} слов:")
        for i, item in enumerate(result[:3], 1):
            print(f"{i}. {item['term']} - {item['description']}")
    except DictionaryGenerationError as e:
        print(f"Ошибка генерации: {e}")
    except ValueError as e:
        print(f"Ошибка валидации параметров: {e}")
    except Exception as e:
        print(f"Неожиданная ошибка: {e}")
