"""
LLM Service for dictionary generation via OpenRouter API.
Provides functionality to generate vocabulary lists with translations, examples, and transcriptions.
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import requests
from dotenv import load_dotenv

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
    Построить системный и пользовательский промпты для генерации словаря.
    
    Args:
        difficulty: Уровень сложности (easy, medium, hard)
        topic: Опциональная тема для слов (может быть None)
    
    Returns:
        Кортеж (system_prompt, user_prompt)
    """
    difficulty_info = DIFFICULTY_LEVELS.get(difficulty, DIFFICULTY_LEVELS["medium"])
    ceFR_level = difficulty_info["level"]
    description = difficulty_info["description"]
    
    topic_instruction = ""
    if topic and topic.strip():
        topic_instruction = f"""
[ТЕМА]
- Все слова должны быть связаны с темой: "{topic.strip()}"
- Если тема не указана, используй общеупотребительную лексику.
"""
    else:
        topic_instruction = """
[ТЕМА]
- Используй общеупотребительную лексику без привязки к конкретной теме.
"""
    
    system_prompt = f"""
Ты — профессиональный преподаватель английского языка и лексикограф.

ТВОЯ ЗАДАЧА:
Сгенерировать ровно {TARGET_WORDS_COUNT} английских слов с переводами, примерами использования и транскрипцией.

[УРОВЕНЬ СЛОЖНОСТИ]
Текущий уровень: {difficulty} ({ceFR_level} - {description})

Правила подбора слов:
- easy (A1-A2): Простые, базовые слова для начинающих. Конкретные, повседневные понятия.
- medium (B1-B2): Слова средней сложности. Более узкие значения, тематическая лексика.
- hard (C1-C2): Продвинутая лексика. Редкие, специфические или абстрактные понятия.

{topic_instruction}

[ТРЕБОВАНИЯ К СЛОВАМ]
- Только английские существительные, глаголы, прилагательные (разнообразные части речи).
- Без имен собственных (люди, страны, бренды, названия произведений).
- Без аббревиатур, сленга, ненормативной лексики.
- Без чисел и порядковых обозначений как отдельных слов.
- Все слова должны быть разными (без повторов).

[ФОРМАТ ОТВЕТА]
Верни ТОЛЬКО один JSON-объект строгой структуры:
{{
  "words": [
    {{
      "word": "английское слово",
      "translation": "перевод на русский",
      "example": "пример предложения на английском с этим словом",
      "transcription": "транскрипция в формате IPA"
    }}
  ]
}}

[ВАЖНО]
- Никакого текста до или после JSON.
- Никаких markdown-блоков, комментариев или объяснений.
- Используй только двойные кавычки ".
- Транскрипция в международном фонетическом алфавите (IPA), например: /ˈdɪkʃənəri/
- Примеры предложений должны быть простыми и понятными для уровня {ceFR_level}.
- Переводы точные и соответствующие контексту примера.
""".strip()
    
    user_prompt = f"""
СГЕНЕРИРУЙ словарь:
- Уровень сложности: {difficulty} ({ceFR_level})
- Количество слов: РОВНО {TARGET_WORDS_COUNT}
{f'- Тема: {topic}' if topic and topic.strip() else ''}

ВЕРНИ:
- Строго один JSON-объект с массивом words.
- Каждый элемент содержит: word, translation, example, transcription.
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
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://crocomim.app",  # Требуется OpenRouter
        "X-Title": "CrocoMim Dictionary Generator",
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
        try:
            response = requests.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers=headers,
                data=json.dumps(payload),
                timeout=timeout,
            )
            
            if response.status_code == 200:
                return response.json()
            
            error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
            print(f"Попытка {attempt}: {error_msg}")
            
            # При ошибках 4xx не повторяем (кроме 429 - rate limit)
            if 400 <= response.status_code < 500 and response.status_code != 429:
                raise RuntimeError(error_msg)
                
        except requests.Timeout:
            last_error = requests.Timeout(f"Timeout after {timeout}s on attempt {attempt}")
            print(f"Попытка {attempt}: {last_error}")
        except requests.RequestException as e:
            last_error = e
            print(f"Попытка {attempt}: Сетевая ошибка - {e}")
        
        # Экспоненциальная задержка перед следующей попыткой
        if attempt < retries:
            delay = RETRY_DELAY_BASE ** attempt
            print(f"Ожидание {delay:.1f}с перед следующей попыткой...")
            time.sleep(delay)
    
    raise RuntimeError(f"Не удалось получить ответ от OpenRouter после {retries} попыток. Последняя ошибка: {last_error}")


def extract_words_from_response(raw_response: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Извлечь список слов из ответа OpenRouter API с умным парсингом.
    
    Args:
        raw_response: Сырой ответ от API
    
    Returns:
        Список словарей с полями: word, translation, example, transcription
    
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
    seen_words: set = set()
    required_fields = {"word", "translation", "example", "transcription"}
    
    for idx, item in enumerate(words_raw):
        if not isinstance(item, dict):
            continue
        
        word = (item.get("word") or "").strip()
        translation = (item.get("translation") or "").strip()
        example = (item.get("example") or "").strip()
        transcription = (item.get("transcription") or "").strip()
        
        # Валидация наличия обязательных полей
        missing_fields = []
        if not word:
            missing_fields.append("word")
        if not translation:
            missing_fields.append("translation")
        if not example:
            missing_fields.append("example")
        if not transcription:
            missing_fields.append("transcription")
        
        if missing_fields:
            print(f"Пропуск записи #{idx}: отсутствуют поля {missing_fields}")
            continue
        
        # Проверка на дубликаты (case-insensitive)
        word_lower = word.lower()
        if word_lower in seen_words:
            print(f"Пропуск дубликата: {word}")
            continue
        
        # Проверка на числа в слове
        if any(ch.isdigit() for ch in word):
            print(f"Пропуск слова с цифрами: {word}")
            continue
        
        seen_words.add(word_lower)
        normalized_words.append({
            "word": word,
            "translation": translation,
            "example": example,
            "transcription": transcription,
        })
    
    # 6. Финальная валидация количества
    if len(normalized_words) != TARGET_WORDS_COUNT:
        raise WordValidationError(
            f"Получено {len(normalized_words)} слов вместо требуемых {TARGET_WORDS_COUNT}. "
            f"Уникальных: {len(seen_words)}"
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
        Список словарей с полями: word, translation, example, transcription
    
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
            print(f"{i}. {item['word']} - {item['translation']}")
    except DictionaryGenerationError as e:
        print(f"Ошибка генерации: {e}")
    except ValueError as e:
        print(f"Ошибка валидации параметров: {e}")
    except Exception as e:
        print(f"Неожиданная ошибка: {e}")
