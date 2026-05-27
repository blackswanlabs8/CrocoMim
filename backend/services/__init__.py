"""
Services package for CrocoMim application.
Contains business logic modules separated from routes.
"""

from .llm_service import (
    generate_dictionary,
    TARGET_WORDS_COUNT,
    DictionaryGenerationError,
    APIResponseError,
    WordValidationError,
)

__all__ = [
    "generate_dictionary",
    "TARGET_WORDS_COUNT",
    "DictionaryGenerationError",
    "APIResponseError",
    "WordValidationError",
]
