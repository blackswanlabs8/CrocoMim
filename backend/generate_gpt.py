"""Обёртка над генератором словаря на базе YandexGPT.

Модуль оставлен отдельным файлом, чтобы его было проще импортировать из
обработчиков Flask без изменения существующей реализации генератора.
"""

from generate_dict import (
    DIFFICULTY_DESCRIPTIONS,
    generate_crocodile_words,
)

__all__ = ["DIFFICULTY_DESCRIPTIONS", "generate_crocodile_words"]
