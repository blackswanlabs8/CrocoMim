from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

from flask import Flask, jsonify, request

from smtp_send import send_email
from user_auth import (
    register_user,
    login_user,
    logout_user,
    get_user_by_session,
    update_display_name,
    change_password,
    check_generation_limit,
    update_last_generation,
)
from services.llm_service import generate_dictionary as generate_dict_llm
from services.llm_service import DictionaryGenerationError

ALLOWED_CATEGORIES = {"typo", "difficulty", "other"}
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_FEEDBACK_FILE = "feedback.log"
DEFAULT_LOG_FILE = "backend.log"

app = Flask(__name__)


# Версия приложения фиксируется здесь, чтобы проще отслеживать сборки.
APP_VERSION = "0.6.0"

LOGGER = logging.getLogger(__name__)


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


@app.route("/api/generate-dictionary", methods=["POST"])
def api_generate_dictionary():
    """
    Генерация словаря через OpenRouter API с проверкой лимитов.
    
    Требует авторизации через Bearer токен.
    Лимит: 1 генерация в 24 часа на пользователя.
    
    Returns:
        dictionary: Список слов
        allowed: Флаг доступности генерации
        next_available_at: Время следующей доступной генерации (UTC)
    """
    LOGGER.info("Received /api/generate-dictionary request")
    
    # Проверка авторизации
    auth_header = request.headers.get("Authorization", "")
    session_token = None
    
    if auth_header.startswith("Bearer "):
        session_token = auth_header[7:]
    
    if not session_token:
        LOGGER.warning("No session token provided for dictionary generation")
        return jsonify({"ok": False, "error": "Требуется авторизация"}), 401
    
    # Получение данных пользователя
    success, message, user_data = get_user_by_session(session_token)
    
    if not success:
        LOGGER.info("Dictionary generation - auth failed: %s", message)
        return jsonify({"ok": False, "error": message}), 401
    
    user_id = user_data["id"]
    LOGGER.info("Dictionary generation request from user: %s", user_data["username"])
    
    # Проверка лимита генерации
    limit_success, limit_message, can_generate = check_generation_limit(user_id, limit_hours=24)
    
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
            "next_available_at": next_available_at
        }), 429
    
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
        
        # Обновление времени последней генерации
        update_success, update_message = update_last_generation(user_id)
        
        if not update_success:
            LOGGER.warning("Failed to update last generation time for user %s: %s", user_id, update_message)
            # Не прерываем ответ, но логируем предупреждение
        
        # Вычисление времени следующей доступной генерации
        from datetime import timedelta
        next_available = datetime.now(timezone.utc) + timedelta(hours=24)
        next_available_at = next_available.isoformat()
        
        LOGGER.info("Dictionary generated successfully for user %s: %d words", user_id, len(dictionary))
        
        return jsonify({
            "ok": True,
            "dictionary": dictionary,
            "allowed": True,
            "next_available_at": next_available_at,
            "count": len(dictionary)
        }), 200
        
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


@app.route("/dict/status", methods=["GET"])
def api_dict_status():
    """
    Проверка статуса лимита генерации словаря для текущего пользователя.
    
    Требует авторизации через Bearer токен.
    
    Returns:
        allowed: Флаг доступности генерации
        next_available_at: Время следующей доступной генерации (UTC)
        last_generation: Время последней генерации (если есть)
    """
    LOGGER.info("Received /dict/status request")
    
    # Проверка авторизации
    auth_header = request.headers.get("Authorization", "")
    session_token = None
    
    if auth_header.startswith("Bearer "):
        session_token = auth_header[7:]
    
    if not session_token:
        LOGGER.warning("No session token provided for dict status")
        return jsonify({"ok": False, "error": "Требуется авторизация"}), 401
    
    # Получение данных пользователя
    success, message, user_data = get_user_by_session(session_token)
    
    if not success:
        LOGGER.info("Dict status - auth failed: %s", message)
        return jsonify({"ok": False, "error": message}), 401
    
    user_id = user_data["id"]
    LOGGER.info("Dict status check for user: %s", user_data["username"])
    
    # Проверка лимита генерации
    limit_success, limit_message, can_generate = check_generation_limit(user_id, limit_hours=24)
    
    # Извлечение времени последней генерации из данных пользователя
    last_generation = user_data.get("last_dict_generation")
    
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
        next_available = datetime.now(timezone.utc) + timedelta(hours=24)
        next_available_at = next_available.isoformat()
    
    LOGGER.info("Dict status for user %s: allowed=%s", user_id, can_generate)
    
    return jsonify({
        "ok": True,
        "allowed": can_generate,
        "next_available_at": next_available_at,
        "last_generation": last_generation
    }), 200


@app.route("/generate-dictionary", methods=["POST"])
def generate_dictionary():
    LOGGER.info("Received /generate-dictionary request")

    if not request.is_json:
        LOGGER.warning("Request rejected: body is not JSON")
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        LOGGER.warning("Request rejected: malformed JSON body")
        return jsonify({"ok": False, "error": "Malformed JSON"}), 400

    topic = (payload.get("topic") or "").strip()
    difficulty_raw = (payload.get("difficulty") or "medium").strip().lower()
    errors: List[str] = []
    if len(topic) < 3:
        errors.append("topic must contain at least 3 characters")
    allowed_difficulties = {"easy", "medium", "hard"}
    if difficulty_raw not in allowed_difficulties:
        errors.append(f"difficulty must be one of: {', '.join(sorted(allowed_difficulties))}")

    if errors:
        LOGGER.info("Validation failed for /generate-dictionary: %s", errors)
        return jsonify({"ok": False, "errors": errors}), 400

    try:
        generated = generate_dict_llm(difficulty=difficulty_raw, topic=topic)
    except DictionaryGenerationError as exc:  # pragma: no cover - network or external errors
        LOGGER.exception("Failed to generate dictionary")
        return jsonify({"ok": False, "error": f"Failed to generate dictionary: {exc}"}), 500
    except ValueError as exc:
        LOGGER.info("Validation failed for /generate-dictionary: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 400

    if not isinstance(generated, list):  # pragma: no cover - unexpected return type
        LOGGER.error("Generator returned unsupported type: %s", type(generated))
        return jsonify({"ok": False, "error": "Generator returned unsupported format"}), 500

    normalized_words = [
        item.get("word", "").strip()
        for item in generated
        if isinstance(item, dict) and isinstance(item.get("word"), str) and item.get("word").strip()
    ]
    LOGGER.info(
        "Generated dictionary for topic '%s' with %d words",
        topic,
        len(normalized_words),
    )
    return jsonify(
        {
            "ok": True,
            "topic": topic,
            "difficulty": difficulty_raw,
            "count": len(normalized_words),
            "words": normalized_words,
        }
    )


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
    
    # Получаем токен из заголовка Authorization или из тела запроса
    auth_header = request.headers.get("Authorization", "")
    session_token = None
    
    if auth_header.startswith("Bearer "):
        session_token = auth_header[7:]
    elif request.is_json:
        payload = request.get_json(silent=True)
        if isinstance(payload, dict):
            session_token = payload.get("session_token")
    
    success, message = logout_user(session_token or "")
    
    if not success:
        LOGGER.info("Logout failed: %s", message)
        return jsonify({"ok": False, "error": message}), 400
    
    LOGGER.info("User logged out successfully")
    return jsonify({"ok": True, "message": message}), 200


@app.route("/auth/me", methods=["GET"])
def api_get_current_user():
    """Получить данные текущего пользователя."""
    LOGGER.info("Received /auth/me request")
    
    # Получаем токен из заголовка Authorization
    auth_header = request.headers.get("Authorization", "")
    session_token = None
    
    if auth_header.startswith("Bearer "):
        session_token = auth_header[7:]
    
    if not session_token:
        LOGGER.warning("No session token provided")
        return jsonify({"ok": False, "error": "Требуется авторизация"}), 401
    
    success, message, user_data = get_user_by_session(session_token)
    
    if not success:
        LOGGER.info("Get current user failed: %s", message)
        return jsonify({"ok": False, "error": message}), 401
    
    LOGGER.info("Current user retrieved: %s", user_data["username"])
    return jsonify({"ok": True, "user": user_data}), 200


@app.route("/auth/profile", methods=["PUT"])
def api_update_profile():
    """Обновить профиль пользователя (отображаемое имя)."""
    LOGGER.info("Received /auth/profile request")
    
    # Получаем токен из заголовка Authorization
    auth_header = request.headers.get("Authorization", "")
    session_token = None
    
    if auth_header.startswith("Bearer "):
        session_token = auth_header[7:]
    
    if not session_token:
        LOGGER.warning("No session token provided")
        return jsonify({"ok": False, "error": "Требуется авторизация"}), 401
    
    # Проверяем сессию и получаем пользователя
    success, message, user_data = get_user_by_session(session_token)
    
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
    
    # Получаем токен из заголовка Authorization
    auth_header = request.headers.get("Authorization", "")
    session_token = None
    
    if auth_header.startswith("Bearer "):
        session_token = auth_header[7:]
    
    if not session_token:
        LOGGER.warning("No session token provided")
        return jsonify({"ok": False, "error": "Требуется авторизация"}), 401
    
    # Проверяем сессию и получаем пользователя
    success, message, user_data = get_user_by_session(session_token)
    
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
