from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

from flask import Flask, jsonify, request

from smtp_send import send_email

ALLOWED_CATEGORIES = {"typo", "difficulty", "other"}
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_FEEDBACK_FILE = "feedback.log"
DEFAULT_LOG_FILE = "backend.log"

app = Flask(__name__)


APP_VERSION = "0.5.3"

LOGGER = logging.getLogger(__name__)


def _configure_logging() -> Path:
    data_dir = Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
    log_file = os.environ.get("BACKEND_LOG_FILE", DEFAULT_LOG_FILE).strip() or DEFAULT_LOG_FILE
    data_dir.mkdir(parents=True, exist_ok=True)
    log_path = data_dir / log_file

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
    data_dir.mkdir(parents=True, exist_ok=True)
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
    LOGGER.info("/version endpoint called")
    return jsonify({"version": APP_VERSION})


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
