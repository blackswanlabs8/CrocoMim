"""
Services package for CrocoMim application.
Contains business logic modules separated from routes.
"""

from .llm_service import (
    build_prompt,
    call_openrouter,
    extract_words_from_response,
    generate_dictionary,
    DIFFICULTY_LEVELS,
    TARGET_WORDS_COUNT,
    DictionaryGenerationError,
    APIResponseError,
    WordValidationError,
)

__all__ = [
    "build_prompt",
    "call_openrouter",
    "extract_words_from_response",
    "generate_dictionary",
    "DIFFICULTY_LEVELS",
    "TARGET_WORDS_COUNT",
    "DictionaryGenerationError",
    "APIResponseError",
    "WordValidationError",
]
