"""Helpers for reading runtime configuration shared with the frontend."""

from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Lock
from typing import Any, Dict


_DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "runtime.json"
_cached_config: Dict[str, Any] | None = None
_cached_path: Path | None = None
_cache_lock = Lock()


def _resolve_config_path() -> Path:
    explicit = os.environ.get("RUNTIME_CONFIG_PATH", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    return _DEFAULT_CONFIG_PATH


def _read_runtime_config(file_path: Path) -> Dict[str, Any]:
    try:
        raw = file_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    except OSError as exc:  # pragma: no cover - unexpected filesystem issues
        print(f"Не удалось загрузить runtime-конфигурацию из {file_path}: {exc}")
        return {}

    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"Не удалось загрузить runtime-конфигурацию из {file_path}: {exc}")
        return {}
    return data if isinstance(data, dict) else {}


def get_runtime_config() -> Dict[str, Any]:
    """Return the cached runtime configuration."""
    global _cached_config, _cached_path
    path = _resolve_config_path()
    with _cache_lock:
        if _cached_config is None or _cached_path != path:
            _cached_path = path
            _cached_config = _read_runtime_config(path)
        return _cached_config


def reload_runtime_config() -> Dict[str, Any]:
    global _cached_config, _cached_path
    with _cache_lock:
        _cached_config = None
        _cached_path = None
    return get_runtime_config()


def _extract_url(key: str) -> str | None:
    config = get_runtime_config()
    value = config.get(key)
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed:
            return trimmed
    return None


def get_public_api_base_url() -> str | None:
    return _extract_url("publicApiBaseUrl")


def get_backend_base_url() -> str | None:
    return _extract_url("backendBaseUrl")


__all__ = [
    "get_runtime_config",
    "reload_runtime_config",
    "get_public_api_base_url",
    "get_backend_base_url",
]
