"""Health-check helpers compatible with the legacy Node.js tooling."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from .runtime_config import get_backend_base_url, get_public_api_base_url


def _resolve_default_base_url() -> str:
    return (
        get_public_api_base_url()
        or get_backend_base_url()
        or "http://localhost:3000"
    )


def check_health(base_url: Optional[str] = None, timeout: float = 10.0) -> bool:
    """Check the health endpoint of the CrocoMim backend."""
    base = base_url or _resolve_default_base_url()
    endpoint = urljoin(base.rstrip("/") + "/", "healthz")
    response = _fetch_json(endpoint, timeout=timeout)
    return bool(response.get("ok"))


def send_test_feedback(
    base_url: Optional[str] = None,
    overrides: Optional[Dict[str, Any]] = None,
    timeout: float = 10.0,
) -> Dict[str, Any]:
    """Send a feedback payload to verify that the backend accepts submissions."""
    base = base_url or _resolve_default_base_url()
    endpoint = urljoin(base.rstrip("/") + "/", "api/feedback")
    payload = _build_feedback_payload(overrides or {})
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    return _fetch_json(endpoint, data=data, headers=headers, timeout=timeout)


def _build_feedback_payload(overrides: Dict[str, Any]) -> Dict[str, Any]:
    base_payload: Dict[str, Any] = {
        "category": "other",
        "message": "Тестовое сообщение для проверки работы сервера",
        "consent": True,
        "email": None,
        "context": {
            "source": "serverChecks",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "client": {"agent": "serverChecks", "version": 1},
    }
    merged = {**base_payload, **overrides}
    merged["context"] = {**base_payload["context"], **overrides.get("context", {})}
    merged["client"] = {**base_payload["client"], **overrides.get("client", {})}
    return merged


def _fetch_json(
    url: str,
    data: Optional[bytes] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: float = 10.0,
) -> Dict[str, Any]:
    request = Request(url, data=data, method="POST" if data else "GET")
    for key, value in (headers or {}).items():
        request.add_header(key, value)

    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
    except HTTPError as exc:  # pragma: no cover - network side effects
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            parsed = json.loads(body) if body else {}
        except json.JSONDecodeError:
            raise RuntimeError(f"Unexpected response from {url}: {body}") from exc
        error = RuntimeError(
            f"Request to {url} failed with status {exc.code}"
        )
        setattr(error, "body", parsed)
        raise error from exc
    except URLError as exc:  # pragma: no cover - network failures
        raise RuntimeError(f"Network error while calling {url}: {exc.reason}") from exc

    try:
        return json.loads(payload) if payload else {}
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Unexpected response from {url}: {payload}") from exc


__all__ = ["check_health", "send_test_feedback"]
