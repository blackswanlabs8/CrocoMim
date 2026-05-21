from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from importlib import import_module
from pathlib import Path
from typing import Any, Dict, List, Tuple

import bcrypt
from flask import Flask, jsonify, request

from smtp_send import send_email

ALLOWED_CATEGORIES = {"typo", "difficulty", "other"}
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_FEEDBACK_FILE = "feedback.log"
DEFAULT_LOG_FILE = "backend.log"
DEFAULT_DB_FILE = "users.db"

app = Flask(__name__)


# Версия приложения фиксируется здесь, чтобы проще отслеживать сборки.
APP_VERSION = "0.6.1"

LOGGER = logging.getLogger(__name__)
_GENERATOR_CACHE: Dict[str, Any] = {}


def _get_db_path() -> Path:
    data_dir = Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / DEFAULT_DB_FILE


def _get_db_connection():
    db_path = _get_db_path()
    conn = sqlite3.connect(db_path, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db() -> None:
    db_path = _get_db_path()
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_login TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_stats (
            user_id INTEGER PRIMARY KEY,
            quick_games_played INTEGER DEFAULT 0,
            quick_words_hit INTEGER DEFAULT 0,
            quick_words_missed INTEGER DEFAULT 0,
            team_games_played INTEGER DEFAULT 0,
            team_rounds_played INTEGER DEFAULT 0,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    conn.commit()
    conn.close()
    LOGGER.info("Database initialized at %s", db_path)


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


def _load_generator() -> Dict[str, Any]:
    if _GENERATOR_CACHE.get("ready"):
        return _GENERATOR_CACHE

    module = import_module("generate_dict")

    generate_fn = getattr(module, "generate_crocodile_words", None)
    difficulties = getattr(module, "DIFFICULTY_DESCRIPTIONS", None)

    if not callable(generate_fn):  # pragma: no cover - unexpected configuration
        raise RuntimeError("Dictionary generator function is missing")

    if not isinstance(difficulties, dict) or not difficulties:  # pragma: no cover - unexpected configuration
        raise RuntimeError("Dictionary generator difficulties are not configured")

    _GENERATOR_CACHE.update(
        {
            "ready": True,
            "generate": generate_fn,
            "difficulties": set(difficulties.keys()),
        }
    )
    LOGGER.info(
        "Dictionary generator loaded. Difficulties: %s", ", ".join(sorted(_GENERATOR_CACHE["difficulties"]))
    )
    return _GENERATOR_CACHE


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
    words_raw = payload.get("words") if "words" in payload else payload.get("targetWords")

    errors: List[str] = []
    if len(topic) < 3:
        errors.append("topic must contain at least 3 characters")

    try:
        target_words = int(words_raw) if words_raw is not None else 50
    except (TypeError, ValueError):
        errors.append("words must be a number")
        target_words = 50

    target_words = max(5, min(target_words, 200))

    try:
        generator = _load_generator()
    except Exception as exc:  # pragma: no cover - unexpected config issues
        LOGGER.exception("Dictionary generator is not available")
        return jsonify({"ok": False, "error": str(exc)}), 500

    allowed_difficulties = generator.get("difficulties", set())
    if difficulty_raw not in allowed_difficulties:
        errors.append(
            f"difficulty must be one of: {', '.join(sorted(allowed_difficulties))}"
        )

    if errors:
        LOGGER.info("Validation failed for /generate-dictionary: %s", errors)
        return jsonify({"ok": False, "errors": errors}), 400

    try:
        words = generator["generate"](topic=topic, difficulty=difficulty_raw, target_words=target_words)
    except Exception as exc:  # pragma: no cover - network or external errors
        LOGGER.exception("Failed to generate dictionary")
        return jsonify({"ok": False, "error": f"Failed to generate dictionary: {exc}"}), 500

    if not isinstance(words, list):  # pragma: no cover - unexpected return type
        LOGGER.error("Generator returned unsupported type: %s", type(words))
        return jsonify({"ok": False, "error": "Generator returned unsupported format"}), 500

    normalized_words = [w.strip() for w in words if isinstance(w, str) and w.strip()]
    LOGGER.info(
        "Generated dictionary for topic '%s' with %d words (requested %d)",
        topic,
        len(normalized_words),
        target_words,
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


# Конфигурация API префикса
API_PREFIX = os.environ.get("API_PREFIX", "/api").rstrip("/")

# Создаем Blueprint для API с префиксом
api_bp = Flask(__name__)

# Копируем все маршруты в blueprint с префиксом
def register_api_routes(app):
    """Регистрирует все API маршруты с префиксом /api"""
    
    @app.route(f"{API_PREFIX}/")
    def api_index():
        LOGGER.info("Health check root endpoint called")
        return jsonify({"message": "Flask backend is alive"})
    
    @app.route(f"{API_PREFIX}/healthz")
    def api_healthz():
        LOGGER.info("/healthz endpoint called")
        return jsonify({"ok": True})
    
    @app.route(f"{API_PREFIX}/version")
    def api_version() -> Any:
        LOGGER.info(
            "/version endpoint called from %s with version %s", request.remote_addr, APP_VERSION
        )
        return jsonify({"version": APP_VERSION})
    
    @app.route(f"{API_PREFIX}/generate-dictionary", methods=["POST"])
    def api_generate_dictionary():
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
        words_raw = payload.get("words") if "words" in payload else payload.get("targetWords")

        errors: List[str] = []
        if len(topic) < 3:
            errors.append("topic must contain at least 3 characters")

        try:
            target_words = int(words_raw) if words_raw is not None else 50
        except (TypeError, ValueError):
            errors.append("words must be a number")
            target_words = 50

        target_words = max(5, min(target_words, 200))

        try:
            generator = _load_generator()
        except Exception as exc:  # pragma: no cover - unexpected config issues
            LOGGER.exception("Dictionary generator is not available")
            return jsonify({"ok": False, "error": str(exc)}), 500

        allowed_difficulties = generator.get("difficulties", set())
        if difficulty_raw not in allowed_difficulties:
            errors.append(
                f"difficulty must be one of: {', '.join(sorted(allowed_difficulties))}"
            )

        if errors:
            LOGGER.info("Validation failed for /generate-dictionary: %s", errors)
            return jsonify({"ok": False, "errors": errors}), 400

        try:
            words = generator["generate"](topic=topic, difficulty=difficulty_raw, target_words=target_words)
        except Exception as exc:  # pragma: no cover - network or external errors
            LOGGER.exception("Failed to generate dictionary")
            return jsonify({"ok": False, "error": f"Failed to generate dictionary: {exc}"}), 500

        if not isinstance(words, list):  # pragma: no cover - unexpected return type
            LOGGER.error("Generator returned unsupported type: %s", type(words))
            return jsonify({"ok": False, "error": "Generator returned unsupported format"}), 500

        normalized_words = [w.strip() for w in words if isinstance(w, str) and w.strip()]
        LOGGER.info(
            "Generated dictionary for topic '%s' with %d words (requested %d)",
            topic,
            len(normalized_words),
            target_words,
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

    @app.route(f"{API_PREFIX}/feedback", methods=["POST"])
    def api_submit_feedback():
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

    # === Личный кабинет: API для регистрации, авторизации и статистики ===

    @app.route(f"{API_PREFIX}/auth/register", methods=["POST"])
    def api_register_user():
        LOGGER.info("Received /auth/register request")
        
        if not request.is_json:
            return jsonify({"ok": False, "error": "Expected JSON body"}), 400
        
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "Malformed JSON"}), 400
        
        email = payload.get("email")
        password = payload.get("password")
        
        errors = []
        if not isinstance(email, str) or len(email.strip()) < 5:
            errors.append("email must be a string with at least 5 characters")
        if not isinstance(password, str) or len(password) < 6:
            errors.append("password must be a string with at least 6 characters")
        
        if errors:
            return jsonify({"ok": False, "errors": errors}), 400
        
        email = email.strip().lower()
        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        created_at = datetime.now(timezone.utc).isoformat()
        
        try:
            conn = _get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
                (email, password_hash, created_at)
            )
            user_id = cursor.lastrowid
            cursor.execute(
                "INSERT INTO user_stats (user_id, updated_at) VALUES (?, ?)",
                (user_id, created_at)
            )
            conn.commit()
            conn.close()
            LOGGER.info("User registered: %s", email)
            return jsonify({"ok": True, "userId": user_id, "email": email})
        except sqlite3.IntegrityError:
            LOGGER.warning("Registration failed: email already exists - %s", email)
            return jsonify({"ok": False, "error": "Email already registered"}), 409
        except Exception as exc:
            LOGGER.exception("Registration failed")
            return jsonify({"ok": False, "error": str(exc)}), 500

    @app.route(f"{API_PREFIX}/auth/login", methods=["POST"])
    def api_login_user():
        LOGGER.info("Received /auth/login request")
        
        if not request.is_json:
            return jsonify({"ok": False, "error": "Expected JSON body"}), 400
        
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "Malformed JSON"}), 400
        
        email = payload.get("email")
        password = payload.get("password")
        
        errors = []
        if not isinstance(email, str) or len(email.strip()) < 5:
            errors.append("email must be a string with at least 5 characters")
        if not isinstance(password, str) or len(password) < 1:
            errors.append("password is required")
        
        if errors:
            return jsonify({"ok": False, "errors": errors}), 400
        
        email = email.strip().lower()
        
        try:
            conn = _get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id, password_hash FROM users WHERE email = ?", (email,))
            row = cursor.fetchone()
            
            if not row:
                LOGGER.warning("Login failed: user not found - %s", email)
                conn.close()
                return jsonify({"ok": False, "error": "Invalid email or password"}), 401
            
            user_id = row["id"]
            password_hash = row["password_hash"]
            
            if not bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8")):
                LOGGER.warning("Login failed: wrong password - %s", email)
                conn.close()
                return jsonify({"ok": False, "error": "Invalid email or password"}), 401
            
            last_login = datetime.now(timezone.utc).isoformat()
            cursor.execute("UPDATE users SET last_login = ? WHERE id = ?", (last_login, user_id))
            conn.commit()
            conn.close()
            
            LOGGER.info("User logged in: %s", email)
            return jsonify({"ok": True, "userId": user_id, "email": email})
        except Exception as exc:
            LOGGER.exception("Login failed")
            return jsonify({"ok": False, "error": str(exc)}), 500

    @app.route(f"{API_PREFIX}/auth/stats", methods=["GET"])
    def api_get_user_stats():
        LOGGER.info("Received /auth/stats GET request")

        user_id = request.args.get("userId")

        if not user_id:
            return jsonify({"ok": False, "error": "userId is required"}), 400

        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "userId must be an integer"}), 400

        try:
            conn = _get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT u.email, u.created_at, u.last_login, 
                       s.quick_games_played, s.quick_words_hit, s.quick_words_missed,
                       s.team_games_played, s.team_rounds_played, s.updated_at
                FROM users u
                JOIN user_stats s ON u.id = s.user_id
                WHERE u.id = ?
            """, (user_id,)
            )
            row = cursor.fetchone()
            conn.close()

            if not row:
                return jsonify({"ok": False, "error": "User not found"}), 404

            stats = {
                "email": row["email"],
                "createdAt": row["created_at"],
                "lastLogin": row["last_login"],
                "quickGamesPlayed": row["quick_games_played"] or 0,
                "quickWordsHit": row["quick_words_hit"] or 0,
                "quickWordsMissed": row["quick_words_missed"] or 0,
                "teamGamesPlayed": row["team_games_played"] or 0,
                "teamRoundsPlayed": row["team_rounds_played"] or 0,
                "updatedAt": row["updated_at"]
            }
            return jsonify({"ok": True, "stats": stats})
        except Exception as exc:
            LOGGER.exception("Failed to fetch stats")
            return jsonify({"ok": False, "error": str(exc)}), 500

    @app.route(f"{API_PREFIX}/auth/stats", methods=["POST"])
    def api_update_user_stats():
        LOGGER.info("Received /auth/stats POST request")

        if not request.is_json:
            return jsonify({"ok": False, "error": "Expected JSON body"}), 400

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "Malformed JSON"}), 400

        user_id = payload.get("userId")
        stats_update = payload.get("stats", {})

        if not user_id:
            return jsonify({"ok": False, "error": "userId is required"}), 400

        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "userId must be an integer"}), 400

        allowed_fields = {
            "quick_games_played", "quick_words_hit", "quick_words_missed",
            "team_games_played", "team_rounds_played"
        }

        updates = {}
        for key, value in stats_update.items():
            db_key = key.replace("quickGames", "quick_games").replace("quickWords", "quick_words").replace("teamGames", "team_games").replace("teamRounds", "team_rounds")
            db_key = db_key.replace("Played", "_played").replace("Hit", "_hit").replace("Missed", "_missed")
            if db_key in allowed_fields and isinstance(value, int) and value >= 0:
                updates[db_key] = value

        if not updates:
            return jsonify({"ok": False, "error": "No valid stats to update"}), 400

        try:
            conn = _get_db_connection()
            cursor = conn.cursor()

            set_clauses = []
            params = []
            for key, value in updates.items():
                set_clauses.append(f"{key} = ?")
                params.append(value)

            updated_at = datetime.now(timezone.utc).isoformat()
            set_clauses.append("updated_at = ?")
            params.append(updated_at)

            params.append(user_id)

            query = f"UPDATE user_stats SET {', '.join(set_clauses)} WHERE user_id = ?"
            cursor.execute(query, params)

            if cursor.rowcount == 0:
                conn.close()
                return jsonify({"ok": False, "error": "User stats not found"}), 404

            conn.commit()
            conn.close()
            LOGGER.info("Stats updated for user %s", user_id)
            return jsonify({"ok": True})
        except Exception as exc:
            LOGGER.exception("Failed to update stats")
            return jsonify({"ok": False, "error": str(exc)}), 500


if __name__ == "__main__":
    _init_db()
    LOGGER.info("Starting Flask app. Version=%s", APP_VERSION)
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "3000"))
    # Регистрируем API маршруты с префиксом
    register_api_routes(app)
    app.run(host=host, port=port)
