from __future__ import annotations

import json
import os
import smtplib
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Dict, List, Tuple

from flask import Flask, jsonify, request


ALLOWED_CATEGORIES = {"typo", "difficulty", "other"}
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_FEEDBACK_FILE = "feedback.log"
DEFAULT_ENV_FILE = Path(__file__).resolve().parent.parent / "config" / "smtp.env"

app = Flask(__name__)


APP_VERSION = "0.5.1"


def _load_local_env_file(path: Path = DEFAULT_ENV_FILE) -> None:
    """Load key/value pairs from a local env file if present.

    Existing environment variables are left untouched so external configuration
    still takes precedence. Lines that are empty or start with ``#`` are
    ignored. Only the first ``KEY=VALUE`` pair per line is respected.
    """

    if not path.exists():
        return

    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            if "=" not in stripped:
                continue

            key, value = stripped.split("=", 1)
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        # Failing to read the local env file should not prevent startup; fall
        # back to normal environment-only configuration.
        pass


_load_local_env_file()


@dataclass(frozen=True)
class SMTPConfig:
    host: str
    port: int
    username: str | None
    password: str | None
    sender: str
    recipient: str
    use_starttls: bool


def _resolve_storage_path() -> Path:
    data_dir = Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
    file_name = os.environ.get("FEEDBACK_FILE", DEFAULT_FEEDBACK_FILE).strip() or DEFAULT_FEEDBACK_FILE
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / file_name


def _load_smtp_config() -> SMTPConfig:
    host = (os.environ.get("SMTP_HOST") or "").strip()
    recipient = (os.environ.get("FEEDBACK_RECIPIENT") or "").strip()
    if not host:
        raise RuntimeError("SMTP_HOST is not configured")
    if not recipient:
        raise RuntimeError("FEEDBACK_RECIPIENT is not configured")

    port = int(os.environ.get("SMTP_PORT", "587"))
    username = (os.environ.get("SMTP_USERNAME") or "").strip() or None
    password = (os.environ.get("SMTP_PASSWORD") or "").strip() or None
    sender = (os.environ.get("FEEDBACK_SENDER") or "").strip() or username or recipient
    use_starttls = os.environ.get("SMTP_STARTTLS", "true").lower() not in {"0", "false", "no"}

    return SMTPConfig(
        host=host,
        port=port,
        username=username,
        password=password,
        sender=sender,
        recipient=recipient,
        use_starttls=use_starttls,
    )


def _send_email(record: Dict[str, Any], config: SMTPConfig) -> None:
    message = EmailMessage()
    subject_parts = ["CrocoMim feedback", record.get("category")]
    message["Subject"] = " - ".join(filter(None, subject_parts))
    message["From"] = config.sender
    message["To"] = config.recipient

    lines = [
        f"Received at: {record.get('receivedAt')}",
        f"Category: {record.get('category')}",
        f"Email: {record.get('email') or '—'}",
        "Message:",
        record.get("message", ""),
        "",
        "Context:",
        json.dumps(record.get("context", {}), ensure_ascii=False, indent=2),
        "",
        "Client:",
        json.dumps(record.get("client", {}), ensure_ascii=False, indent=2),
    ]
    message.set_content("\n".join(lines))

    with smtplib.SMTP(config.host, config.port, timeout=10) as smtp:
        if config.use_starttls:
            smtp.starttls()
        if config.username and config.password:
            smtp.login(config.username, config.password)
        smtp.send_message(message)


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
    return jsonify({"message": "Flask backend is alive"})


@app.route("/healthz")
def healthz():
    return jsonify({"ok": True})


@app.route("/version")
def version() -> Any:
    return jsonify({"version": APP_VERSION})


@app.route("/feedback", methods=["POST"])
def submit_feedback():
    if not request.is_json:
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Malformed JSON"}), 400

    normalized, errors = _validate_feedback(payload)
    if errors:
        return jsonify({"ok": False, "errors": errors}), 400

    record = {
        **normalized,
        "receivedAt": datetime.now(timezone.utc).isoformat(),
    }

    try:
        storage_path = _resolve_storage_path()
        with storage_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False))
            fh.write("\n")
    except OSError as exc:  # pragma: no cover - filesystem errors are unexpected
        return jsonify({"ok": False, "error": f"Failed to persist feedback: {exc}"}), 500

    try:
        smtp_config = _load_smtp_config()
        _send_email(record, smtp_config)
    except Exception as exc:  # pragma: no cover - unexpected SMTP errors
        return jsonify({"ok": False, "error": f"Failed to deliver feedback (logged locally): {exc}"}), 500

    return jsonify({"ok": True})


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "3000"))
    app.run(host=host, port=port)
