"""LLM service for generating Russian word dictionaries via OpenRouter."""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

# Временно храним ключ в коде по требованию продукта.
OPENROUTER_API_KEY = "<SECRET>"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = "openai/gpt-4o-mini"

TARGET_WORDS_COUNT = 30
DEFAULT_TIMEOUT = 20
DEFAULT_RETRIES = 2
RETRY_DELAY_BASE = 1.5

BANNED_SUBSTRINGS = {
    "хер", "пиз", "еб", "бля", "сука", "нах", "шлюх", "порно", "секс",
    "наркот", "террор", "экстрем",
}


class DictionaryGenerationError(Exception):
    pass


class APIResponseError(DictionaryGenerationError):
    pass


class WordValidationError(DictionaryGenerationError):
    pass


def _build_prompts() -> tuple[str, str]:
    system_prompt = f"""
Ты генерируешь набор слов для игры «Крокодил».

Требования:
- Верни РОВНО {TARGET_WORDS_COUNT} слов.
- Язык: только русский.
- Сложность: medium.
- Только общеупотребительные слова средней сложности.
- Только существительные в именительном падеже, единственном числе.
- Без имён собственных, аббревиатур, брендов, политических лозунгов.
- Без токсичной, оскорбительной, сексуальной, наркотической и экстремистской лексики.
- Без повторов.

Формат:
Верни только JSON-объект: {{"words": ["слово1", ..., "слово30"]}}
Никакого дополнительного текста.
""".strip()

    user_prompt = "Сгенерируй словарь из 30 русских слов средней сложности в указанном JSON-формате."
    return system_prompt, user_prompt


def _call_openrouter(system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://crocomim.app",
        "X-Title": "CrocoMim AI Dictionary",
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.5,
        "max_tokens": 500,
    }

    last_error: Optional[Exception] = None
    for attempt in range(1, DEFAULT_RETRIES + 1):
        try:
            response = requests.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers=headers,
                data=json.dumps(payload),
                timeout=DEFAULT_TIMEOUT,
            )
            if response.status_code == 200:
                return response.json()

            # 4xx (кроме 429) повторять не нужно
            if 400 <= response.status_code < 500 and response.status_code != 429:
                raise APIResponseError(f"OpenRouter HTTP {response.status_code}: {response.text[:200]}")

            last_error = APIResponseError(f"OpenRouter HTTP {response.status_code}: {response.text[:200]}")
        except requests.RequestException as exc:
            last_error = exc

        if attempt < DEFAULT_RETRIES:
            time.sleep(RETRY_DELAY_BASE ** attempt)

    raise DictionaryGenerationError(f"Не удалось получить ответ OpenRouter: {last_error}")


def _extract_json_content(raw_response: Dict[str, Any]) -> Dict[str, Any]:
    try:
        content = raw_response["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise APIResponseError("Некорректный формат ответа OpenRouter") from exc

    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.IGNORECASE | re.DOTALL).strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise APIResponseError(f"Ответ модели не является валидным JSON: {content[:200]}") from exc

    if not isinstance(data, dict) or "words" not in data:
        raise APIResponseError("Ответ модели должен содержать объект с ключом 'words'")
    return data


def _validate_words(words_raw: Any) -> List[str]:
    if not isinstance(words_raw, list):
        raise WordValidationError("Поле words должно быть массивом")

    normalized: List[str] = []
    seen: set[str] = set()
    for item in words_raw:
        if not isinstance(item, str):
            continue

        word = re.sub(r"\s+", " ", item.strip())
        if not word:
            continue

        lower = word.lower()
        if lower in seen:
            continue

        if not re.fullmatch(r"[а-яё-]+", lower):
            continue

        if any(block in lower for block in BANNED_SUBSTRINGS):
            continue

        seen.add(lower)
        normalized.append(word)

    if len(normalized) != TARGET_WORDS_COUNT:
        raise WordValidationError(
            f"Получено {len(normalized)} валидных слов, требуется {TARGET_WORDS_COUNT}"
        )

    return normalized


def generate_dictionary(difficulty: str = "medium", topic: Optional[str] = None, target_count: int = TARGET_WORDS_COUNT) -> List[str]:
    del topic
    if (difficulty or "medium").strip().lower() != "medium":
        raise ValueError("Для AI-генерации поддерживается только сложность medium")
    if target_count != TARGET_WORDS_COUNT:
        raise ValueError("Для AI-генерации поддерживается только 30 слов")

    start = datetime.now(timezone.utc)
    system_prompt, user_prompt = _build_prompts()
    raw = _call_openrouter(system_prompt, user_prompt)
    parsed = _extract_json_content(raw)
    words = _validate_words(parsed.get("words"))

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    print(f"AI dictionary generated in {elapsed:.2f}s ({len(words)} words)")
    return words
