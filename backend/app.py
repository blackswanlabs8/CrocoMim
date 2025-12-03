from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
# from importlib import import_module
from pathlib import Path
from typing import Any, Dict, List, Tuple

from flask import Flask, jsonify, request

from smtp_send import send_email

ALLOWED_CATEGORIES = {"typo", "difficulty", "other"}
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_FEEDBACK_FILE = "feedback.log"
DEFAULT_LOG_FILE = "backend.log"

app = Flask(__name__)


# Версия приложения фиксируется здесь, чтобы проще отслеживать сборки.
APP_VERSION = "0.6.1"

LOGGER = logging.getLogger(__name__)
# _GENERATOR_CACHE: Dict[str, Any] = {}


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


'''
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
'''


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

    email = payload.get("email")
    if email is not None and not (isinstance(email, str) and email.strip()):
        errors.append("email must be a non-empty string or omitted")

    consent = payload.get("consent")
    if consent is not True:
        errors.append("consent must be true")

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
        "consent": consent,
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


'''
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
'''


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
        "Persisting feedback. Category=%s, Email=%s, Consent=%s",
        record.get("category"),
        record.get("email") or "—",
        record.get("consent"),
    )

    try:
        _send_email(record)
    except Exception as exc:  # pragma: no cover - unexpected SMTP errors
        LOGGER.exception("Failed to send feedback emails")
        return jsonify({"ok": False, "error": f"Failed to deliver feedback: {exc}"}), 500

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


if __name__ == "__main__":
    LOGGER.info("Starting Flask app. Version=%s", APP_VERSION)
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "3000"))
    app.run(host=host, port=port)
