from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

from flask import Flask, jsonify, request


ALLOWED_CATEGORIES = {"typo", "difficulty", "other"}
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_FEEDBACK_FILE = "feedback.log"

app = Flask(__name__)


def _resolve_storage_path() -> Path:
    data_dir = Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
    file_name = os.environ.get("FEEDBACK_FILE", DEFAULT_FEEDBACK_FILE).strip() or DEFAULT_FEEDBACK_FILE
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / file_name


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


@app.route("/api/feedback", methods=["POST"])
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

    return jsonify({"ok": True})


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "3000"))
    app.run(host=host, port=port)
