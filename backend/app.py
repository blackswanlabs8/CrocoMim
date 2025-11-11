"""ASGI application implementing the CrocoMim backend in Python."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.staticfiles import StaticFiles

from .feedback_store import FeedbackStore
from .runtime_config import get_backend_base_url, get_runtime_config

LOGGER = logging.getLogger("crocomim.backend")

PORT = int(os.environ.get("PORT", "3000"))
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR.parent / "data")).resolve()
FEEDBACK_FILE = Path(
    os.environ.get("FEEDBACK_FILE", DATA_DIR / "feedback.log")
).resolve()
PUBLIC_DIR = (BASE_DIR.parent / "public").resolve()
CONFIG_DIR = (BASE_DIR.parent / "config").resolve()


def _resolve_cors_origins() -> Iterable[str] | bool:
    origin_env = os.environ.get("CORS_ORIGIN")
    if origin_env:
        origins = [item.strip() for item in origin_env.split(",") if item.strip()]
        if origins:
            return origins
    backend_base = get_backend_base_url()
    if backend_base:
        try:
            from urllib.parse import urlparse

            parsed = urlparse(backend_base)
            if parsed.scheme and parsed.netloc:
                return [f"{parsed.scheme}://{parsed.netloc}"]
        except ValueError:
            LOGGER.warning(
                "Некорректный backendBaseUrl в runtime-конфигурации: %s",
                backend_base,
            )
            return [backend_base]
    return True


feedback_store = FeedbackStore(FEEDBACK_FILE)
app = FastAPI(title="CrocoMim Backend", default_response_class=JSONResponse)
app.state.runtime_config = get_runtime_config()
app.state.public_dir = PUBLIC_DIR
app.state.config_dir = CONFIG_DIR
app.state.feedback_store = feedback_store


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        LOGGER.info("%s %s", request.method, request.url.path)
        response = await call_next(request)
        return response


app.add_middleware(LoggingMiddleware)

cors_origin = _resolve_cors_origins()
if cors_origin is True:
    allow_origins = ["*"]
else:
    allow_origins = list(cors_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/config", StaticFiles(directory=CONFIG_DIR, html=True), name="config")


@app.post("/api/feedback")
async def submit_feedback(request: Request):
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"ok": False, "error": "Invalid JSON payload"}, status_code=400)

    errors = _validate_feedback(payload)
    if errors:
        return JSONResponse({"ok": False, "errors": errors}, status_code=400)

    entry = {
        "receivedAt": _now_isoformat(),
        "ip": _get_client_ip(request),
        "userAgent": request.headers.get("user-agent"),
        "feedback": _sanitize_feedback(payload),
    }

    await feedback_store.save(entry)
    return JSONResponse({"ok": True})


@app.get("/healthz")
async def health_check():
    return {"ok": True}


@app.get("/{full_path:path}")
async def spa_handler(full_path: str):
    if full_path.startswith("api"):
        return JSONResponse({"ok": False, "error": "Not Found"}, status_code=404)

    candidate = (PUBLIC_DIR / full_path).resolve()
    if _is_within(candidate, PUBLIC_DIR) and candidate.is_file():
        return FileResponse(candidate)

    index_file = PUBLIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse({"ok": False, "error": "Not Found"}, status_code=404)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        path = request.url.path
        if path.startswith("/api"):
            return JSONResponse({"ok": False, "error": "Not Found"}, status_code=404)
        if request.method.upper() == "GET" and not path.startswith("/config"):
            index_file = PUBLIC_DIR / "index.html"
            if index_file.exists():
                return FileResponse(index_file)
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse({"ok": False, "error": detail}, status_code=exc.status_code)


@app.middleware("http")
async def handle_unhandled_errors(request: Request, call_next):  # type: ignore[override]
    try:
        return await call_next(request)
    except Exception:  # pragma: no cover - defensive programming
        LOGGER.exception("Unhandled error")
        return JSONResponse(
            {"ok": False, "error": "Internal Server Error"}, status_code=500
        )


def _is_within(path: Path, directory: Path) -> bool:
    try:
        path.relative_to(directory)
        return True
    except ValueError:
        return False


def _now_isoformat() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_feedback(payload: Dict[str, Any]) -> List[Dict[str, str]]:
    errors: List[Dict[str, str]] = []
    if not isinstance(payload, dict):
        errors.append({"field": "body", "message": "Expected JSON object"})
        return errors

    category = payload.get("category")
    if category not in {"typo", "difficulty", "other"}:
        errors.append({"field": "category", "message": "Unknown category"})

    message = payload.get("message")
    if not isinstance(message, str) or len(message.strip()) < 10:
        errors.append({"field": "message", "message": "Message must be at least 10 characters"})

    consent = payload.get("consent")
    if consent is not True:
        errors.append({"field": "consent", "message": "Consent is required"})

    context = payload.get("context")
    if not isinstance(context, dict):
        errors.append({"field": "context", "message": "Context is required"})

    client = payload.get("client")
    if not isinstance(client, dict):
        errors.append({"field": "client", "message": "Client info is required"})

    return errors


def _sanitize_feedback(payload: Dict[str, Any]) -> Dict[str, Any]:
    message = payload.get("message")
    email = payload.get("email")
    return {
        "category": payload.get("category"),
        "message": message.strip() if isinstance(message, str) else "",
        "email": email.strip() if isinstance(email, str) and email.strip() else None,
        "consent": True,
        "context": _sanitize_object(payload.get("context")),
        "client": _sanitize_object(payload.get("client")),
    }


def _sanitize_object(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    result: Dict[str, Any] = {}
    for key, val in value.items():
        if val is None:
            continue
        if isinstance(val, str):
            trimmed = val.strip()
            if trimmed:
                result[key] = trimmed
        else:
            result[key] = val
    return result


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = request.client
    return client.host if client else None


__all__ = ["app", "feedback_store"]
