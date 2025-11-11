"""Entry point for running the CrocoMim backend with ``python -m backend``."""

from __future__ import annotations

import logging
import os

from .app import PORT, app


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    log_level = os.environ.get("LOG_LEVEL", "info")

    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover - executed only without dependency
        raise SystemExit(
            "uvicorn is required to run the CrocoMim backend. Install dependencies with 'pip install -r backend/requirements.txt'."
        ) from exc

    uvicorn.run(app, host=host, port=PORT, log_level=log_level)


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    logging.basicConfig(level=logging.INFO)
    main()
