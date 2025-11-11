"""Utilities for persisting feedback submissions."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict


class FeedbackStore:
    """Append-only JSONL store for feedback submissions."""

    def __init__(self, file_path: str | Path):
        self.file_path = Path(file_path)
        self._write_lock = asyncio.Lock()
        self._init_lock = asyncio.Lock()
        self._initialised = False

    async def _ensure_file(self) -> None:
        if self._initialised:
            return
        async with self._init_lock:
            if self._initialised:
                return
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            if not self.file_path.exists():
                self.file_path.write_text("", encoding="utf-8")
            self._initialised = True

    async def save(self, entry: Dict[str, Any]) -> None:
        """Persist a feedback entry as a JSON line."""
        await self._ensure_file()
        line = json.dumps(entry, ensure_ascii=False) + "\n"
        async with self._write_lock:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self._append_line, line)

    def _append_line(self, line: str) -> None:
        with self.file_path.open("a", encoding="utf-8") as handle:
            handle.write(line)
