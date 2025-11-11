"""CrocoMim backend package implemented in Python."""

from .app import app  # re-export FastAPI application for ASGI servers

__all__ = ["app"]
