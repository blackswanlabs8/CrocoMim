from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, request, session

from smtp_send import send_email
from user_auth import (
    register_user,
    login_user,
    logout_user,
    get_user_by_session,
    get_user_by_id,
    update_display_name,
    change_password,
    check_generation_limit,
    update_last_generation,
    get_user_generation_info,
    _get_data_dir,
    _get_sessions_file_path,
    _load_sessions,
    _save_sessions,
    _is_session_expired,
)
from services.llm_service import generate_dictionary as generate_dict_llm
from services.llm_service import DictionaryGenerationError, TARGET_WORDS_COUNT
from dictionary_store import (
    DictionaryValidationError,
    create_dictionary,
    delete_dictionary,
    get_user_dictionary,
    initialize_database,
    list_user_dictionaries,
    update_dictionary,
    list_public_dictionaries,
    get_public_dictionary,
    add_dictionary_to_user,
)

ALLOWED_CATEGORIES = {"typo", "difficulty", "other"}
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_FEEDBACK_FILE = "feedback.log"
DEFAULT_LOG_FILE = "backend.log"

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"


# Версия приложения фиксируется здесь, чтобы проще отслеживать сборки.
APP_VERSION = "0.7.0"

LOGGER = logging.getLogger(__name__)


def _read_bool_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _read_int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


# Временный флаг лимита генерации словарей.
# Сейчас лимит отключён по умолчанию; чтобы быстро включить обратно, задайте
# DICT_GENERATION_LIMIT_ENABLED=true и перезапустите backend.
DICT_GENERATION_LIMIT_ENABLED = _read_bool_env("DICT_GENERATION_LIMIT_ENABLED", default=False)
DICT_GENERATION_LIMIT_HOURS = _read_int_env("DICT_GENERATION_LIMIT_HOURS", 24)


# Блок ниже оставляем рядом с константами, чтобы логгер был готов прежде, чем
# запустятся любые обработчики Flask — это заметно упрощает расследование ошибок.

def _configure_logging() -> Path:
    data_dir = Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
    log_file = os.environ.get("BACKEND_LOG_FILE", DEFAULT_LOG_FILE).strip() or DEFAULT_LOG_FILE
    data_dir.mkdir(parents=True, exist_ok=True)
    log_path = data_dir / log_file

    # Пишем логи и в stdout, и в файл — это упрощает диагностику как в контейнере, так и при локальной отладке.
    handlers = [logging.StreamHandler(), logging.FileHandler(log_path, encoding="utf-8")]
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        handlers=handlers,
        force=True,
    )
    logging.getLogger("smtp").setLevel(logging.WARNING)
    LOGGER.info("Logging configured. Writing to %s", log_path)
    return log_path


# Configure logging as early as possible so that all modules share the same setup
LOG_PATH = _configure_logging()
initialize_database()


def _resolve_storage_path() -> Path:
    data_dir = Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
    file_name = os.environ.get("FEEDBACK_FILE", DEFAULT_FEEDBACK_FILE).strip() or DEFAULT_FEEDBACK_FILE
    # Ensure the storage directory exists even when a custom DATA_DIR is provided.
    data_dir.mkdir(parents=True, exist_ok=True)
    # Храним данные рядом с приложением, чтобы записи не терялись между перезапусками контейнера.
    return data_dir / file_name


def _send_email(record: Dict[str, Any]) -> None:
    category_subjects = {
        "typo": "Ошибка в тексте",
        "difficulty": "Не соответствует уровню сложности",
        "other": "Другая проблема/предложение",
    }

    subject = category_subjects.get(record.get("category"), "Обратная связь")

    body_lines = [
        record.get("message", ""),
        "",
        f"Email: {record.get('email') or '—'}",
        "",
        f"Received at: {record.get('receivedAt')}",
        "Context:",
        json.dumps(record.get("context", {}), ensure_ascii=False, indent=2),
        "",
        "Client:",
        json.dumps(record.get("client", {}), ensure_ascii=False, indent=2),
    ]

    body = "\n".join(body_lines)

    LOGGER.info("Sending feedback notification email")
    send_email(subject, body)




def _difficulty_label(difficulty: str) -> str:
    labels = {"easy": "Лёгкий", "medium": "Средний", "hard": "Сложный", "mix": "Микс"}
    return labels.get(difficulty, difficulty)


def _dictionary_id_from_route(value: str) -> Optional[int]:
    try:
        dictionary_id = int(value)
    except (TypeError, ValueError):
        return None
    return dictionary_id if dictionary_id > 0 else None


def _require_json_payload() -> Tuple[Optional[Dict[str, Any]], Optional[Tuple[Any, int]]]:
    if not request.is_json:
        return None, (jsonify({"ok": False, "error": "Expected JSON body"}), 400)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, (jsonify({"ok": False, "error": "Malformed JSON"}), 400)
    return payload, None


def _validate_feedback(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    errors: List[str] = []

    category = payload.get("category")
    if category not in ALLOWED_CATEGORIES:
        errors.append("category must be one of: typo, difficulty, other")

    message = payload.get("message")
    if not isinstance(message, str) or len(message.strip()) < 10:
        errors.append("message must be a string with at least 10 characters")

    # Email теперь необязательное поле, его можно не передавать
    email = payload.get("email")
    if email is not None and (not isinstance(email, str) or not email.strip()):
        errors.append("email must be a non-empty string or omitted")

    # Consent больше не требуется - убираем проверку
    context = payload.get("context")
    if context is None:
        context = {}
    if not isinstance(context, dict):
        errors.append("context must be an object")

    client = payload.get("client")
    if client is None:
        client = {}
    if not isinstance(client, dict):
        errors.append("client must be an object")

    normalized = {
        "category": category,
        "message": message.strip() if isinstance(message, str) else None,
        "email": email.strip() if isinstance(email, str) else None,
        "context": context,
        "client": client,
    }
    return normalized, errors


@app.route("/")
def index():
    LOGGER.info("Health check root endpoint called")
    return jsonify({"message": "Flask backend is alive"})


@app.route("/healthz")
def healthz():
    LOGGER.info("/healthz endpoint called")
    return jsonify({"ok": True})


@app.route("/version")
def version() -> Any:
    LOGGER.info(
        "/version endpoint called from %s with version %s", request.remote_addr, APP_VERSION
    )
    return jsonify({"version": APP_VERSION})


def _get_current_session_user() -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    user_id = session.get("user_id")
    if not user_id:
        return False, "Требуется авторизация", None
    return get_user_by_id(user_id)


@app.route("/debug/sessions", methods=["GET"])
def debug_sessions() -> Any:
    """Development endpoint: dumps session storage for debugging."""
    data_dir = _get_data_dir()
    sessions_path = _get_sessions_file_path()
    sessions_data = _load_sessions()
    sessions_map = sessions_data.get("sessions", {})
    now = datetime.now(timezone.utc)

    session_items: List[Dict[str, Any]] = []
    for token, payload in sessions_map.items():
        created_at = payload.get("created_at")
        expires_at = payload.get("expires_at")
        is_expired = _is_session_expired(payload)

        created_dt = None
        expires_dt = None
        if isinstance(created_at, str):
            try:
                created_dt = datetime.fromisoformat(created_at)
            except ValueError:
                created_dt = None
        if isinstance(expires_at, str):
            try:
                expires_dt = datetime.fromisoformat(expires_at)
            except ValueError:
                expires_dt = None

        age_seconds = (now - created_dt).total_seconds() if created_dt else None
        ttl_seconds = (expires_dt - now).total_seconds() if expires_dt else None
        token_preview = f"{token[:16]}...{token[-8:]}" if len(token) > 24 else token

        session_items.append({
            "token": token,
            "token_preview": token_preview,
            "user_id": payload.get("user_id"),
            "created_at": created_at,
            "expires_at": expires_at,
            "is_expired": is_expired,
            "is_active": not is_expired,
            "age_seconds": age_seconds,
            "ttl_seconds": ttl_seconds,
        })

    active_count = sum(1 for item in session_items if item["is_active"])

    return jsonify({
        "ok": True,
        "debug": True,
        "warning": "Development endpoint. Exposes full session tokens.",
        "server_time_utc": now.isoformat(),
        "data_dir": str(data_dir),
        "sessions_file": str(sessions_path),
        "sessions_file_exists": sessions_path.exists(),
        "total_sessions": len(session_items),
        "active_sessions": active_count,
        "expired_sessions": len(session_items) - active_count,
        "sessions": session_items,
    })


@app.route("/debug/sessions/clear-active", methods=["GET", "POST"])
def debug_clear_active_sessions() -> Any:
    """Development endpoint: removes all active sessions from storage."""
    sessions_data = _load_sessions()
    sessions_map = sessions_data.get("sessions", {})

    removed_tokens: List[str] = []
    kept_sessions: Dict[str, Any] = {}

    for token, payload in sessions_map.items():
        if _is_session_expired(payload):
            kept_sessions[token] = payload
        else:
            removed_tokens.append(token)

    sessions_data["sessions"] = kept_sessions
    _save_sessions(sessions_data)

    return jsonify({
        "ok": True,
        "debug": True,
        "warning": "Development endpoint. Active sessions were deleted without authentication.",
        "removed_active_sessions": len(removed_tokens),
        "removed_tokens": removed_tokens,
        "remaining_sessions": len(kept_sessions),
    })


@app.route("/debug/auth-check", methods=["GET"])
def debug_auth_check() -> Any:
    """Development endpoint: checks whether auth token arrives and validates."""
    auth_header = request.headers.get("Authorization", "")
    has_authorization_header = bool(auth_header)
    bearer_prefix_valid = auth_header.startswith("Bearer ")
    session_token = auth_header[7:] if bearer_prefix_valid else ""

    sessions_data = _load_sessions()
    sessions_map = sessions_data.get("sessions", {})
    token_present_in_file = session_token in sessions_map if session_token else False

    validation_success = False
    validation_message = "Токен сессии не предоставлен"
    user_data = None
    if session_token:
        validation_success, validation_message, user_data = get_user_by_session(session_token)

    return jsonify({
        "ok": True,
        "debug": True,
        "warning": "Development endpoint. Exposes incoming auth details.",
        "path": request.path,
        "method": request.method,
        "raw_authorization_header": auth_header,
        "all_request_headers": {k: v for k, v in request.headers.items()},
        "has_authorization_header": has_authorization_header,
        "bearer_prefix_valid": bearer_prefix_valid,
        "authorization_header_length": len(auth_header),
        "token_length": len(session_token),
        "token_preview": (
            f"{session_token[:16]}...{session_token[-8:]}" if len(session_token) > 24 else session_token
        ),
        "token_present_in_sessions_file": token_present_in_file,
        "sessions_file": str(_get_sessions_file_path()),
        "sessions_file_exists": _get_sessions_file_path().exists(),
        "sessions_total": len(sessions_map),
        "validation_success": validation_success,
        "validation_message": validation_message,
        "validated_user": user_data if validation_success else None,
    })


@app.route("/generate-dictionary", methods=["POST"])
def api_generate_dictionary():
    """
    Генерация словаря через OpenRouter API с проверкой лимитов.
    
    Требует авторизации через Flask session cookie.
    Лимит: 1 генерация в 24 часа на пользователя.
    
    Returns:
        dictionary: Список слов
        allowed: Флаг доступности генерации
        next_available_at: Время следующей доступной генерации (UTC)
    """
    LOGGER.info("Received /generate-dictionary request")
    
    # Проверка авторизации через сессию Flask
    success, message, user_data = _get_current_session_user()
    
    if not success:
        LOGGER.info("Dictionary generation - auth failed: %s", message)
        return jsonify({"ok": False, "error": message}), 401
    
    user_id = user_data["id"]
    LOGGER.info("Dictionary generation request from user: %s", user_data["username"])
    
    # Проверка лимита генерации временно управляется флагом окружения.
    # Чтобы снова включить ограничение 1 генерация в сутки, задайте
    # DICT_GENERATION_LIMIT_ENABLED=true.
    if DICT_GENERATION_LIMIT_ENABLED:
        limit_success, limit_message, can_generate = check_generation_limit(
            user_id,
            limit_hours=DICT_GENERATION_LIMIT_HOURS,
        )

        if not can_generate:
            LOGGER.info("Generation limit exceeded for user %s: %s", user_id, limit_message)
            # Извлекаем время следующей доступной генерации из сообщения
            next_available_at = None
            if "следующая попытка доступна" in limit_message:
                # Парсим время из сообщения вида "... следующая попытка доступна в YYYY-MM-DDTHH:MM:SS..."
                import re
                match = re.search(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})', limit_message)
                if match:
                    next_available_at = match.group(1)

            return jsonify({
                "ok": False,
                "error": limit_message,
                "allowed": False,
                "limit_enabled": True,
                "next_available_at": next_available_at
            }), 429
    else:
        LOGGER.info("Dictionary generation limit is disabled; skipping limit check for user %s", user_id)
    
    # Парсинг параметров запроса
    if not request.is_json:
        LOGGER.warning("Request rejected: body is not JSON")
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400
    
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        LOGGER.warning("Request rejected: malformed JSON body")
        return jsonify({"ok": False, "error": "Malformed JSON"}), 400
    
    difficulty_raw = (payload.get("difficulty") or "medium").strip().lower()
    topic = (payload.get("topic") or "").strip()
    
    # Валидация сложности
    allowed_difficulties = {"easy", "medium", "hard"}
    if difficulty_raw not in allowed_difficulties:
        LOGGER.warning("Invalid difficulty: %s", difficulty_raw)
        return jsonify({
            "ok": False,
            "error": f"difficulty must be one of: {', '.join(sorted(allowed_difficulties))}"
        }), 400
    
    try:
        # Генерация словаря через LLM сервис
        LOGGER.info("Generating dictionary for user %s: difficulty=%s, topic=%s", 
                   user_id, difficulty_raw, topic or "общая")
        dictionary = generate_dict_llm(difficulty=difficulty_raw, topic=topic if topic else None)
        title_topic = topic or "Общий словарь"
        saved_dictionary = create_dictionary(
            user_id,
            {
                "title": f"{title_topic} — {_difficulty_label(difficulty_raw)}",
                "topic": title_topic,
                "difficulty": difficulty_raw,
                "visibility": "private",
                "status": "draft",
                "source": "ai",
                "items": dictionary,
            },
            expected_count=TARGET_WORDS_COUNT,
            default_source="ai",
        )
        
        # Обновление времени последней генерации нужно только при включённом лимите.
        # Пока лимит отключён, не записываем last_dict_generation, чтобы тестовые
        # генерации не заблокировали пользователя после обратного включения лимита.
        next_available_at = None
        if DICT_GENERATION_LIMIT_ENABLED:
            update_success, update_message = update_last_generation(user_id)

            if not update_success:
                LOGGER.warning("Failed to update last generation time for user %s: %s", user_id, update_message)
                # Не прерываем ответ, но логируем предупреждение

            # Вычисление времени следующей доступной генерации
            from datetime import timedelta
            next_available = datetime.now(timezone.utc) + timedelta(hours=DICT_GENERATION_LIMIT_HOURS)
            next_available_at = next_available.isoformat()
        
        LOGGER.info("Dictionary generated successfully for user %s: %d words", user_id, len(dictionary))
        
        return jsonify({
            "ok": True,
            "dictionary": dictionary,
            "words": [item["term"] for item in dictionary],
            "saved_dictionary": saved_dictionary,
            "dictionary_id": saved_dictionary["id"],
            "allowed": True,
            "limit_enabled": DICT_GENERATION_LIMIT_ENABLED,
            "next_available_at": next_available_at,
            "count": len(dictionary)
        }), 200
        
    except DictionaryValidationError as e:
        LOGGER.exception("Generated dictionary validation/storage failed for user %s", user_id)
        return jsonify({
            "ok": False,
            "error": f"Ошибка сохранения словаря: {e}"
        }), 500
    except DictionaryGenerationError as e:
        LOGGER.exception("Dictionary generation failed for user %s", user_id)
        return jsonify({
            "ok": False,
            "error": f"Ошибка генерации словаря: {e}"
        }), 500
    except ValueError as e:
        LOGGER.exception("Validation error for user %s", user_id)
        return jsonify({
            "ok": False,
            "error": str(e)
        }), 400
    except Exception as e:
        LOGGER.exception("Unexpected error during dictionary generation for user %s", user_id)
        return jsonify({
            "ok": False,
            "error": f"Внутренняя ошибка сервера: {e}"
        }), 500


@app.route("/user/dictionaries", methods=["GET"])
def api_list_user_dictionaries():
    success, message, user_data = _get_current_session_user()
    if not success:
        return jsonify({"ok": False, "error": message}), 401

    dictionaries = list_user_dictionaries(user_data["id"])
    return jsonify({"ok": True, "dictionaries": dictionaries}), 200


@app.route("/user/dictionaries", methods=["POST"])
def api_create_user_dictionary():
    success, message, user_data = _get_current_session_user()
    if not success:
        return jsonify({"ok": False, "error": message}), 401

    payload, error_response = _require_json_payload()
    if error_response:
        return error_response

    try:
        dictionary = create_dictionary(user_data["id"], payload or {}, default_source="manual")
        return jsonify({"ok": True, "dictionary": dictionary}), 201
    except DictionaryValidationError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        LOGGER.exception("Failed to create user dictionary for user %s", user_data["id"])
        return jsonify({"ok": False, "error": f"Не удалось сохранить словарь: {e}"}), 500


@app.route("/user/dictionaries/<dictionary_id>", methods=["GET"])
def api_get_user_dictionary(dictionary_id: str):
    success, message, user_data = _get_current_session_user()
    if not success:
        return jsonify({"ok": False, "error": message}), 401

    parsed_id = _dictionary_id_from_route(dictionary_id)
    if parsed_id is None:
        return jsonify({"ok": False, "error": "Некорректный id словаря"}), 400

    dictionary = get_user_dictionary(user_data["id"], parsed_id)
    if dictionary is None:
        return jsonify({"ok": False, "error": "Словарь не найден"}), 404
    return jsonify({"ok": True, "dictionary": dictionary}), 200


@app.route("/user/dictionaries/<dictionary_id>", methods=["PUT"])
def api_update_user_dictionary(dictionary_id: str):
    success, message, user_data = _get_current_session_user()
    if not success:
        return jsonify({"ok": False, "error": message}), 401

    parsed_id = _dictionary_id_from_route(dictionary_id)
    if parsed_id is None:
        return jsonify({"ok": False, "error": "Некорректный id словаря"}), 400

    payload, error_response = _require_json_payload()
    if error_response:
        return error_response

    try:
        dictionary = update_dictionary(user_data["id"], parsed_id, payload or {})
        if dictionary is None:
            return jsonify({"ok": False, "error": "Словарь не найден или недоступен для редактирования"}), 404
        return jsonify({"ok": True, "dictionary": dictionary}), 200
    except DictionaryValidationError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        LOGGER.exception("Failed to update dictionary %s for user %s", parsed_id, user_data["id"])
        return jsonify({"ok": False, "error": f"Не удалось обновить словарь: {e}"}), 500


@app.route("/user/dictionaries/<dictionary_id>", methods=["DELETE"])
def api_delete_user_dictionary(dictionary_id: str):
    success, message, user_data = _get_current_session_user()
    if not success:
        return jsonify({"ok": False, "error": message}), 401

    parsed_id = _dictionary_id_from_route(dictionary_id)
    if parsed_id is None:
        return jsonify({"ok": False, "error": "Некорректный id словаря"}), 400

    if not delete_dictionary(user_data["id"], parsed_id):
        return jsonify({"ok": False, "error": "Словарь не найден или недоступен для удаления"}), 404
    return jsonify({"ok": True}), 200


@app.route("/dict/status", methods=["GET"])
def api_dict_status():
    """
    Проверка статуса лимита генерации словаря для текущего пользователя.
    
    Требует авторизации через Flask session cookie.
    
    Returns:
        allowed: Флаг доступности генерации
        next_available_at: Время следующей доступной генерации (UTC)
        last_generation: Время последней генерации (если есть)
    """
    LOGGER.info("Received /dict/status request")
    
    # Проверка авторизации через сессию Flask
    success, message, user_data = _get_current_session_user()
    
    if not success:
        LOGGER.info("Dict status - auth failed: %s", message)
        return jsonify({"ok": False, "error": message}), 401
    
    user_id = user_data["id"]
    LOGGER.info("Dict status check for user: %s", user_data["username"])
    
    # Извлечение времени последней генерации из данных пользователя
    last_generation = user_data.get("last_dict_generation")

    if not DICT_GENERATION_LIMIT_ENABLED:
        LOGGER.info("Dict status for user %s: limit disabled, allowed=True", user_id)
        return jsonify({
            "ok": True,
            "allowed": True,
            "limit_enabled": False,
            "next_available_at": None,
            "last_generation": last_generation
        }), 200

    # Проверка лимита генерации
    limit_success, limit_message, can_generate = check_generation_limit(
        user_id,
        limit_hours=DICT_GENERATION_LIMIT_HOURS,
    )

    # Вычисление времени следующей доступной генерации
    next_available_at = None
    if not can_generate and "следующая попытка доступна" in limit_message:
        import re
        match = re.search(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})', limit_message)
        if match:
            next_available_at = match.group(1)
    elif can_generate:
        # Если генерация разрешена, следующая доступна сразу после текущей
        from datetime import timedelta
        next_available = datetime.now(timezone.utc) + timedelta(hours=DICT_GENERATION_LIMIT_HOURS)
        next_available_at = next_available.isoformat()

    LOGGER.info("Dict status for user %s: allowed=%s", user_id, can_generate)

    return jsonify({
        "ok": True,
        "allowed": can_generate,
        "limit_enabled": True,
        "next_available_at": next_available_at,
        "last_generation": last_generation
    }), 200


@app.route("/marketplace/dictionaries", methods=["GET"])
def api_list_marketplace_dictionaries():
    """
    Получить список публичных словарей для маркетплейса.
    
    Параметры:
        difficulty: Фильтр по сложности (easy/medium/hard/mix)
        topic: Поиск по теме словаря
        limit: Количество результатов (по умолчанию 50)
        offset: Смещение для пагинации
    
    Returns:
        dictionaries: Список публичных словарей
    """
    LOGGER.info("Received /marketplace/dictionaries request")
    
    difficulty = request.args.get("difficulty")
    topic = request.args.get("topic")
    
    try:
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Некорректные параметры пагинации"}), 400
    
    try:
        dictionaries = list_public_dictionaries(
            difficulty=difficulty,
            topic=topic,
            limit=limit,
            offset=offset,
        )
        return jsonify({"ok": True, "dictionaries": dictionaries}), 200
    except Exception as e:
        LOGGER.exception("Failed to list marketplace dictionaries")
        return jsonify({"ok": False, "error": f"Ошибка при загрузке словарей: {e}"}), 500


@app.route("/marketplace/dictionaries/<dictionary_id>", methods=["GET"])
def api_get_marketplace_dictionary(dictionary_id: str):
    """
    Получить информацию о публичном словаре без содержимого (для превью).
    """
    LOGGER.info("Received /marketplace/dictionaries/%s request", dictionary_id)
    
    parsed_id = _dictionary_id_from_route(dictionary_id)
    if parsed_id is None:
        return jsonify({"ok": False, "error": "Некорректный id словаря"}), 400
    
    dictionary = get_public_dictionary(parsed_id)
    if dictionary is None:
        return jsonify({"ok": False, "error": "Словарь не найден"}), 404
    
    return jsonify({"ok": True, "dictionary": dictionary}), 200


@app.route("/marketplace/dictionaries/<dictionary_id>/add", methods=["POST"])
def api_add_marketplace_dictionary(dictionary_id: str):
    """
    Добавить публичный словарь в библиотеку пользователя.
    
    Требует авторизации.
    """
    LOGGER.info("Received /marketplace/dictionaries/%s/add request", dictionary_id)
    
    success, message, user_data = _get_current_session_user()
    if not success:
        return jsonify({"ok": False, "error": message}), 401
    
    parsed_id = _dictionary_id_from_route(dictionary_id)
    if parsed_id is None:
        return jsonify({"ok": False, "error": "Некорректный id словаря"}), 400
    
    try:
        result = add_dictionary_to_user(user_data["id"], parsed_id)
        if result is None:
            return jsonify({"ok": False, "error": "Словарь не найден или недоступен"}), 404
        return jsonify({"ok": True, "dictionary": result}), 200
    except DictionaryValidationError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        LOGGER.exception("Failed to add marketplace dictionary for user %s", user_data["id"])
        return jsonify({"ok": False, "error": f"Ошибка при добавлении словаря: {e}"}), 500


@app.route("/user/generation-info", methods=["GET"])
def api_get_generation_info():
    """
    Получить информацию о доступных генерациях пользователя.
    
    Требует авторизации.
    
    Returns:
        available: Количество доступных генераций
        total: Общее количество генераций
        used: Количество использованных генераций
        next_available_at: Время следующей доступной генерации (если все использованы)
    """
    LOGGER.info("Received /user/generation-info request")
    
    success, message, user_data = _get_current_session_user()
    if not success:
        return jsonify({"ok": False, "error": message}), 401
    
    user_id = user_data["id"]
    gen_success, gen_message, generation_info = get_user_generation_info(user_id)
    
    if not gen_success:
        return jsonify({"ok": False, "error": gen_message}), 400
    
    return jsonify({
        "ok": True,
        **generation_info
    }), 200


@app.route("/feedback", methods=["POST"])
def submit_feedback():
    LOGGER.info("Received /feedback request")

    if not request.is_json:
        LOGGER.warning("Request rejected: body is not JSON")
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        LOGGER.warning("Request rejected: malformed JSON body")
        return jsonify({"ok": False, "error": "Malformed JSON"}), 400

    normalized, errors = _validate_feedback(payload)
    if errors:
        LOGGER.info("Validation failed with errors: %s", errors)
        return jsonify({"ok": False, "errors": errors}), 400

    record = {
        **normalized,
        "receivedAt": datetime.now(timezone.utc).isoformat(),
    }

    LOGGER.info(
        "Persisting feedback. Category=%s, Email=%s",
        record.get("category"),
        record.get("email") or "—",
    )

    try:
        _send_email(record)
    except Exception as exc:  # pragma: no cover - unexpected SMTP errors
        LOGGER.warning("Failed to send feedback notification email: %s. Continuing to save to file.", exc)
        # Не прерываем обработку, если email не отправился — всё равно сохраняем в файл

    try:
        storage_path = _resolve_storage_path()
        LOGGER.info("Appending feedback to %s", storage_path)
        with storage_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False))
            fh.write("\n")
    except OSError as exc:  # pragma: no cover - filesystem errors are unexpected
        LOGGER.exception("Failed to persist feedback to file")
        return jsonify({"ok": False, "error": f"Failed to persist feedback: {exc}"}), 500

    LOGGER.info("Feedback stored successfully")
    return jsonify({"ok": True})


# ==================== USER AUTHENTICATION ROUTES ====================

@app.route("/auth/register", methods=["POST"])
def api_register():
    """Регистрация нового пользователя."""
    LOGGER.info("Received /auth/register request")
    
    if not request.is_json:
        LOGGER.warning("Request rejected: body is not JSON")
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400
    
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        LOGGER.warning("Request rejected: malformed JSON body")
        return jsonify({"ok": False, "error": "Malformed JSON"}), 400
    
    username = (payload.get("username") or "").strip()
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""
    
    success, message, user_data = register_user(username, email, password)
    
    if not success:
        LOGGER.info("Registration failed: %s", message)
        return jsonify({"ok": False, "error": message}), 400
    
    LOGGER.info("User registered successfully: %s", username)
    return jsonify({"ok": True, "user": user_data}), 201


@app.route("/auth/login", methods=["POST"])
def api_login():
    """Вход пользователя."""
    LOGGER.info("Received /auth/login request")
    
    if not request.is_json:
        LOGGER.warning("Request rejected: body is not JSON")
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400
    
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        LOGGER.warning("Request rejected: malformed JSON body")
        return jsonify({"ok": False, "error": "Malformed JSON"}), 400
    
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    
    success, message, user_data, session_token = login_user(username, password)
    
    if not success:
        LOGGER.info("Login failed: %s", message)
        return jsonify({"ok": False, "error": message}), 401
    
    session["user_id"] = user_data["id"]
    session.permanent = True
    LOGGER.info("User logged in successfully: %s", username)
    return jsonify({
        "ok": True,
        "user": user_data,
        "session_token": session_token
    }), 200


@app.route("/auth/logout", methods=["POST"])
def api_logout():
    """Выход пользователя."""
    LOGGER.info("Received /auth/logout request")
    
    session.pop("user_id", None)
    LOGGER.info("User logged out successfully")
    return jsonify({"ok": True, "message": "Выход выполнен успешно"}), 200


@app.route("/auth/me", methods=["GET"])
def api_get_current_user():
    """Получить данные текущего пользователя."""
    LOGGER.info("Received /auth/me request")
    
    success, message, user_data = _get_current_session_user()
    
    if not success:
        LOGGER.info("Get current user failed: %s", message)
        return jsonify({"ok": False, "error": message}), 401
    
    LOGGER.info("Current user retrieved: %s", user_data["username"])
    return jsonify({"ok": True, "user": user_data}), 200


@app.route("/auth/profile", methods=["PUT"])
def api_update_profile():
    """Обновить профиль пользователя (отображаемое имя)."""
    LOGGER.info("Received /auth/profile request")
    
    success, message, user_data = _get_current_session_user()
    
    if not success:
        LOGGER.info("Profile update - auth failed: %s", message)
        return jsonify({"ok": False, "error": message}), 401
    
    if not request.is_json:
        LOGGER.warning("Request rejected: body is not JSON")
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400
    
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        LOGGER.warning("Request rejected: malformed JSON body")
        return jsonify({"ok": False, "error": "Malformed JSON"}), 400
    
    display_name = payload.get("display_name")
    
    if display_name is None:
        LOGGER.warning("No display_name provided")
        return jsonify({"ok": False, "error": "Поле display_name обязательно"}), 400
    
    success, message, updated_user = update_display_name(user_data["id"], display_name)
    
    if not success:
        LOGGER.info("Profile update failed: %s", message)
        return jsonify({"ok": False, "error": message}), 400
    
    LOGGER.info("Profile updated for user: %s", user_data["username"])
    return jsonify({"ok": True, "user": updated_user}), 200


@app.route("/auth/change-password", methods=["POST"])
def api_change_password():
    """Изменить пароль пользователя."""
    LOGGER.info("Received /auth/change-password request")
    
    success, message, user_data = _get_current_session_user()
    
    if not success:
        LOGGER.info("Change password - auth failed: %s", message)
        return jsonify({"ok": False, "error": message}), 401
    
    if not request.is_json:
        LOGGER.warning("Request rejected: body is not JSON")
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400
    
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        LOGGER.warning("Request rejected: malformed JSON body")
        return jsonify({"ok": False, "error": "Malformed JSON"}), 400
    
    old_password = payload.get("old_password") or ""
    new_password = payload.get("new_password") or ""
    
    success, message = change_password(user_data["id"], old_password, new_password)
    
    if not success:
        LOGGER.info("Change password failed: %s", message)
        return jsonify({"ok": False, "error": message}), 400
    
    LOGGER.info("Password changed for user: %s", user_data["username"])
    return jsonify({"ok": True, "message": message}), 200


if __name__ == "__main__":
    LOGGER.info("Starting Flask app. Version=%s", APP_VERSION)
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "3000"))
    app.run(host=host, port=port)
