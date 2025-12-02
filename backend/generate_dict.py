import json
import re
import time
import uuid
import requests
import os
from pathlib import Path

from dotenv import load_dotenv  # pip install python-dotenv

# === ЗАГРУЗКА СЕКРЕТОВ ИЗ .env ===
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

YANDEX_CLOUD_FOLDER = os.getenv("YANDEX_CLOUD_FOLDER")
YANDEX_CLOUD_API_KEY = os.getenv("YANDEX_CLOUD_API_KEY")
YANDEX_CLOUD_MODEL = os.getenv("YANDEX_CLOUD_MODEL", "yandexgpt")
API_URL = os.getenv(
    "YANDEX_API_URL",
    "https://rest-assistant.api.cloud.yandex.net/v1/responses"
)

if not YANDEX_CLOUD_FOLDER or not YANDEX_CLOUD_API_KEY:
    raise RuntimeError(
        "Не заданы YANDEX_CLOUD_FOLDER или YANDEX_CLOUD_API_KEY в .env"
    )

DIFFICULTY_DESCRIPTIONS = {
    "easy": """
- Простые, понятные, повседневные слова.
- Максимально конкретные и наглядные.
- Легко показывать жестами даже детям.
""",
    "medium": """
- Слова средней сложности.
- Более узкие по значению или менее очевидные, но всё равно знакомые большинству людей.
- Можно включать редковстречающиеся бытовые или тематические термины.
""",
    "hard": """
- Редкие, специфические или абстрактные понятия по теме.
- Требуют выдумки для пантомимы, но всё ещё поддаются изображению.
- Подходят для сложного уровня игры.
"""
}


def build_prompts(topic: str, target_words: int, difficulty: str) -> tuple[str, str]:
    diff_text = DIFFICULTY_DESCRIPTIONS[difficulty]

    system = f"""
Ты помощник, который генерирует тематические списки существительных для игры «Крокодил» (charades).

ТВОЯ ЗАДАЧА:
1. Сгенерировать ровно {target_words} разных слов по заданной теме и сложности.
2. Вернуть результат строго в формате одного JSON-объекта.

[ЯЗЫК]
- Только русские существительные.
- Падеж: именительный.
- Без имён собственных (люди, страны, бренды, названия произведений и т.п.).
- Без аббревиатур, транслита, ненормативной лексики и жаргона.
- Без чисел и порядковых обозначений.

[ТЕМА]
- Все слова должны быть напрямую связаны с указанной темой.
- Не добавляй сверх-общие слова, не связанные с темой напрямую.

[СЛОЖНОСТЬ]
Текущая сложность: "{difficulty}".

Правила для этой сложности:
{diff_text}

[КОЛИЧЕСТВО]
- Должно получиться РОВНО {target_words} разных слов.
- Без повторов внутри списка (слово может встретиться только один раз).

[ФОРМАТ ОТВЕТА]
- Верни только один JSON-объект.
- Никакого текста до или после JSON.
- Никаких комментариев, Markdown или блоков ```json.
- Структура строго такая:

{{
  "words": ["слово1", "слово2", "..."]
}}

ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ:
- Используй только двойные кавычки ".
- Не добавляй лишних полей.
- Не добавляй запятые после последнего элемента массива или объекта.
"""

    user = f"""
ТЕМА:
"{topic}"

СЛОЖНОСТЬ:
"{difficulty}"

СГЕНЕРИРУЙ:
- Ровно {target_words} существительных по теме и указанной сложности.
- Все слова разные.

ВЕРНИ:
- Строго один JSON-объект вида:
  {{"words": ["слово1", "слово2", "..."]}}
"""
    return system.strip(), user.strip()


def post_with_retry(url: str, headers: dict, payload: dict,
                    retries: int = 3, timeout: int = 60) -> dict:
    for i in range(retries):
        try:
            r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=timeout)
            if r.status_code == 200:
                return r.json()
            print(f"HTTP {r.status_code}: {r.text}")
        except requests.RequestException as e:
            print(f"Сетевая ошибка: {e}")
        time.sleep(1.5 ** (i + 1))
    raise RuntimeError("Не удалось получить ответ от модели.")


def extract_text_from_response(raw: dict) -> str:
    # Вариант 1: исходный формат
    try:
        return raw["output"][0]["content"][0]["text"]
    except Exception:
        pass

    # Вариант 2: классический формат YandexGPT
    try:
        return raw["result"]["alternatives"][0]["message"]["text"]
    except Exception:
        pass

    raise RuntimeError(f"Не удалось разобрать ответ модели: {json.dumps(raw, ensure_ascii=False)[:500]}")


def norm(words):
    """
    Нормализация списка слов:
    - обрезаем пробелы;
    - схлопываем внутренние пробелы;
    - убираем пустые строки;
    - убираем дубли (регистронезависимо);
    - выкидываем слова с цифрами.
    """
    seen, out = set(), []
    for w in (re.sub(r"\s+", " ", str(x).strip()) for x in words):
        lw = w.lower()
        if lw and lw not in seen and not any(ch.isdigit() for ch in w):
            out.append(w)
            seen.add(lw)
    return out


def generate_crocodile_words(topic: str,
                             difficulty: str = "medium",
                             target_words: int = 50) -> list[str]:
    """
    Генерирует список слов для «Крокодила» по теме.

    Делает до 3 "умных" запросов к модели:
    - Если в какой-то попытке получаем >= target_words уникальных слов,
      список нормализуется и обрезается до target_words и сразу возвращается.
    - Если во всех попытках меньше target_words,
      возвращается самый длинный из полученных списков (может быть < target_words).

    Никаких исключений по количеству слов не кидает.
    """

    topic = (topic or "").strip()
    if not topic:
        raise ValueError("Тема не должна быть пустой.")

    difficulty = (difficulty or "medium").strip().lower()
    if difficulty not in DIFFICULTY_DESCRIPTIONS:
        print(f"Неизвестная сложность '{difficulty}', использую 'medium'.")
        difficulty = "medium"

    system_prompt, user_prompt = build_prompts(topic, target_words, difficulty)

    headers = {
        "Authorization": f"Api-Key {YANDEX_CLOUD_API_KEY}",
        "Content-Type": "application/json",
        "x-folder-id": YANDEX_CLOUD_FOLDER,
    }

    payload = {
        "model": f"gpt://{YANDEX_CLOUD_FOLDER}/{YANDEX_CLOUD_MODEL}",
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    best_words: list[str] = []
    t0 = time.time()

    for attempt in range(1, 4):  # 3 попытки
        print(f"Попытка генерации #{attempt}...")

        raw = post_with_retry(API_URL, headers, payload)
        text = extract_text_from_response(raw)

        s = text.strip()
        if s.startswith("```"):
            s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.I | re.S)

        data = json.loads(s)

        if isinstance(data, dict):
            words_raw = data.get("words", [])
        elif isinstance(data, list):
            words_raw = data
        else:
            print(f"Неподходящий формат JSON на попытке {attempt}: {type(data)}")
            continue

        words = norm(words_raw)

        # Если хватает или больше — обрезаем и выходим
        if len(words) >= target_words:
            words = words[:target_words]
            best_words = words
            print(f"Получено достаточно слов на попытке {attempt}: {len(words)} (нужно {target_words})")
            break

        # Иначе запоминаем лучший вариант
        if len(words) > len(best_words):
            best_words = words

        print(f"Попытка {attempt}: получено {len(words)} слов (нужно {target_words}). Пробуем ещё раз...")

    t1 = time.time()

    if len(best_words) < target_words:
        print(
            f"Предупреждение: после 3 попыток удалось получить только {len(best_words)} слов "
            f"из {target_words}. Возвращаю лучший результат."
        )

    print(f"Готово за {t1 - t0:.2f} сек. Тема: {topic}, сложность: {difficulty}")
    return best_words
