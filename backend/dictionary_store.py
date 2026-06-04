"""
SQLite-backed storage for user dictionaries.

The LLM response is treated only as transport JSON. After validation, each
saved dictionary is persisted as one row in ``dictionaries`` and every card is
persisted as a separate row in ``dictionary_items``. ``user_dictionaries`` keeps
track of dictionaries added to a user's library so public/shared dictionaries
can be attached to other users later without changing ownership.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB_FILE = "dictionaries.sqlite3"

ALLOWED_DIFFICULTIES = {"easy", "medium", "hard", "mix"}
ALLOWED_VISIBILITIES = {"private", "unlisted", "public"}
ALLOWED_STATUSES = {"draft", "published", "moderation", "rejected", "blocked"}
ALLOWED_SOURCES = {"manual", "ai", "imported"}
MAX_TITLE_LENGTH = 120
MAX_TOPIC_LENGTH = 120
MAX_ITEMS_PER_DICTIONARY = 300
MAX_DICTIONARIES_PER_USER = 100


class DictionaryStoreError(Exception):
    """Base class for dictionary storage errors."""


class DictionaryValidationError(DictionaryStoreError):
    """Raised when a dictionary payload is invalid."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_data_dir() -> Path:
    data_dir = Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_database_path() -> Path:
    file_name = os.environ.get("DICTIONARIES_DB_FILE", DEFAULT_DB_FILE).strip() or DEFAULT_DB_FILE
    return _get_data_dir() / file_name


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(get_database_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def initialize_database() -> None:
    """Create dictionary tables and indexes if they do not exist."""
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS dictionaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id TEXT NOT NULL,
                title TEXT NOT NULL,
                topic TEXT NOT NULL,
                difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'mix')),
                visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
                status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'moderation', 'rejected', 'blocked')),
                source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'imported')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dictionary_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dictionary_id INTEGER NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                term TEXT NOT NULL,
                description TEXT NOT NULL,
                about TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(dictionary_id, position)
            );

            CREATE TABLE IF NOT EXISTS user_dictionaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                dictionary_id INTEGER NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
                added_at TEXT NOT NULL,
                is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
                UNIQUE(user_id, dictionary_id)
            );

            CREATE INDEX IF NOT EXISTS idx_dictionaries_owner ON dictionaries(owner_id);
            CREATE INDEX IF NOT EXISTS idx_dictionaries_visibility_status ON dictionaries(visibility, status);
            CREATE INDEX IF NOT EXISTS idx_dictionary_items_dictionary_position ON dictionary_items(dictionary_id, position);
            CREATE INDEX IF NOT EXISTS idx_dictionary_items_term ON dictionary_items(term);
            CREATE INDEX IF NOT EXISTS idx_user_dictionaries_user ON user_dictionaries(user_id);
            """
        )


def _row_to_summary(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "owner_id": row["owner_id"],
        "title": row["title"],
        "topic": row["topic"],
        "difficulty": row["difficulty"],
        "visibility": row["visibility"],
        "status": row["status"],
        "source": row["source"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "added_at": row["added_at"] if "added_at" in row.keys() else None,
        "is_favorite": bool(row["is_favorite"]) if "is_favorite" in row.keys() else False,
        "items_count": row["items_count"] if "items_count" in row.keys() else 0,
    }


def _row_to_item(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "dictionary_id": row["dictionary_id"],
        "position": row["position"],
        "term": row["term"],
        "description": row["description"],
        "about": row["about"],
        "created_at": row["created_at"],
    }


def _dictionary_with_items(conn: sqlite3.Connection, user_id: str, dictionary_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        """
        SELECT d.*, ud.added_at, ud.is_favorite, COUNT(di.id) AS items_count
        FROM dictionaries d
        LEFT JOIN user_dictionaries ud ON ud.dictionary_id = d.id AND ud.user_id = ?
        LEFT JOIN dictionary_items di ON di.dictionary_id = d.id
        WHERE d.id = ? AND (d.owner_id = ? OR ud.id IS NOT NULL OR d.visibility IN ('public', 'unlisted'))
        GROUP BY d.id, ud.added_at, ud.is_favorite
        """,
        (user_id, dictionary_id, user_id),
    ).fetchone()
    if row is None:
        return None
    items = conn.execute(
        "SELECT * FROM dictionary_items WHERE dictionary_id = ? ORDER BY position ASC, id ASC",
        (dictionary_id,),
    ).fetchall()
    result = _row_to_summary(row)
    result["items"] = [_row_to_item(item) for item in items]
    return result


def _as_non_empty_text(value: Any, field: str, max_length: int) -> str:
    if not isinstance(value, str):
        raise DictionaryValidationError(f"Поле {field} должно быть строкой")
    text = value.strip()
    if not text:
        raise DictionaryValidationError(f"Поле {field} обязательно")
    if len(text) > max_length:
        raise DictionaryValidationError(f"Поле {field} не должно быть длиннее {max_length} символов")
    return text


def _validate_enum(value: Any, field: str, allowed: set[str], default: Optional[str] = None) -> str:
    raw = value if value is not None else default
    if not isinstance(raw, str):
        raise DictionaryValidationError(f"Поле {field} должно быть строкой")
    normalized = raw.strip().lower()
    if normalized not in allowed:
        raise DictionaryValidationError(f"Поле {field} должно быть одним из: {', '.join(sorted(allowed))}")
    return normalized


def normalize_items(items: Any, expected_count: Optional[int] = None) -> List[Dict[str, str]]:
    if not isinstance(items, list):
        raise DictionaryValidationError("Поле items должно быть массивом")
    if not items:
        raise DictionaryValidationError("Поле items должно содержать хотя бы одно слово")
    if len(items) > MAX_ITEMS_PER_DICTIONARY:
        raise DictionaryValidationError(f"Словарь не может содержать больше {MAX_ITEMS_PER_DICTIONARY} слов")

    normalized: List[Dict[str, str]] = []
    seen_terms: set[str] = set()
    for idx, raw in enumerate(items, start=1):
        if isinstance(raw, str):
            item = {"term": raw, "description": "", "about": ""}
        elif isinstance(raw, dict):
            item = raw
        else:
            raise DictionaryValidationError(f"Элемент #{idx} должен быть объектом или строкой")

        term = (item.get("term") or "").strip()
        description = (item.get("description") or "").strip()
        about = (item.get("about") or "").strip()
        missing = []
        if not term:
            missing.append("term")
        if not description:
            missing.append("description")
        if not about:
            missing.append("about")
        if missing:
            raise DictionaryValidationError(f"Элемент #{idx}: отсутствуют поля {', '.join(missing)}")

        term_key = term.casefold()
        if term_key in seen_terms:
            continue
        seen_terms.add(term_key)
        normalized.append({"term": term, "description": description, "about": about})

    if expected_count is not None and len(normalized) != expected_count:
        raise DictionaryValidationError(
            f"Словарь должен содержать {expected_count} уникальных слов, получено {len(normalized)}"
        )
    return normalized


def normalize_dictionary_payload(
    payload: Dict[str, Any],
    *,
    expected_count: Optional[int] = None,
    default_source: str = "manual",
) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise DictionaryValidationError("Словарь должен быть JSON-объектом")

    title = _as_non_empty_text(payload.get("title"), "title", MAX_TITLE_LENGTH)
    topic = _as_non_empty_text(payload.get("topic"), "topic", MAX_TOPIC_LENGTH)
    difficulty = _validate_enum(payload.get("difficulty"), "difficulty", ALLOWED_DIFFICULTIES)
    visibility = _validate_enum(payload.get("visibility"), "visibility", ALLOWED_VISIBILITIES, "private")
    status = _validate_enum(payload.get("status"), "status", ALLOWED_STATUSES, "draft")
    source = _validate_enum(payload.get("source"), "source", ALLOWED_SOURCES, default_source)
    raw_items = payload.get("items")
    if raw_items is None:
        raw_items = payload.get("dictionary")
    if raw_items is None:
        raw_items = payload.get("words")
    items = normalize_items(raw_items, expected_count=expected_count)

    return {
        "title": title,
        "topic": topic,
        "difficulty": difficulty,
        "visibility": visibility,
        "status": status,
        "source": source,
        "items": items,
    }


def _count_owned_dictionaries(conn: sqlite3.Connection, user_id: str) -> int:
    row = conn.execute("SELECT COUNT(*) AS count FROM dictionaries WHERE owner_id = ?", (user_id,)).fetchone()
    return int(row["count"] if row else 0)


def create_dictionary(
    owner_id: str,
    payload: Dict[str, Any],
    *,
    expected_count: Optional[int] = None,
    default_source: str = "manual",
) -> Dict[str, Any]:
    if not owner_id:
        raise DictionaryValidationError("Пользователь не указан")
    data = normalize_dictionary_payload(payload, expected_count=expected_count, default_source=default_source)
    now = _utc_now()

    initialize_database()
    with _connect() as conn:
        if _count_owned_dictionaries(conn, owner_id) >= MAX_DICTIONARIES_PER_USER:
            raise DictionaryValidationError(f"Нельзя создать больше {MAX_DICTIONARIES_PER_USER} словарей")

        cursor = conn.execute(
            """
            INSERT INTO dictionaries (owner_id, title, topic, difficulty, visibility, status, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                owner_id,
                data["title"],
                data["topic"],
                data["difficulty"],
                data["visibility"],
                data["status"],
                data["source"],
                now,
                now,
            ),
        )
        dictionary_id = int(cursor.lastrowid)
        conn.executemany(
            """
            INSERT INTO dictionary_items (dictionary_id, position, term, description, about, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (dictionary_id, idx, item["term"], item["description"], item["about"], now)
                for idx, item in enumerate(data["items"], start=1)
            ],
        )
        conn.execute(
            "INSERT INTO user_dictionaries (user_id, dictionary_id, added_at, is_favorite) VALUES (?, ?, ?, 0)",
            (owner_id, dictionary_id, now),
        )
        conn.commit()
        created = _dictionary_with_items(conn, owner_id, dictionary_id)
        if created is None:
            raise DictionaryStoreError("Не удалось прочитать созданный словарь")
        return created


def list_user_dictionaries(user_id: str) -> List[Dict[str, Any]]:
    if not user_id:
        return []
    initialize_database()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT d.*, ud.added_at, ud.is_favorite, COUNT(di.id) AS items_count
            FROM user_dictionaries ud
            JOIN dictionaries d ON d.id = ud.dictionary_id
            LEFT JOIN dictionary_items di ON di.dictionary_id = d.id
            WHERE ud.user_id = ?
            GROUP BY d.id, ud.added_at, ud.is_favorite
            ORDER BY ud.is_favorite DESC, d.updated_at DESC, d.id DESC
            """,
            (user_id,),
        ).fetchall()
        return [_row_to_summary(row) for row in rows]


def list_public_dictionaries(
    *,
    difficulty: Optional[str] = None,
    topic: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Получить список публичных словарей для маркетплейса."""
    initialize_database()
    with _connect() as conn:
        base_query = """
            SELECT d.*, COUNT(di.id) AS items_count
            FROM dictionaries d
            LEFT JOIN dictionary_items di ON di.dictionary_id = d.id
            WHERE d.visibility = 'public' AND d.status = 'published'
        """
        params: List[Any] = []
        
        if difficulty and difficulty in ALLOWED_DIFFICULTIES:
            base_query += " AND d.difficulty = ?"
            params.append(difficulty)
        
        if topic:
            base_query += " AND d.topic LIKE ?"
            params.append(f"%{topic}%")
        
        base_query += """
            GROUP BY d.id
            ORDER BY d.updated_at DESC, d.id DESC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])
        
        rows = conn.execute(base_query, params).fetchall()
        return [_row_to_summary(row) for row in rows]


def get_public_dictionary(dictionary_id: int) -> Optional[Dict[str, Any]]:
    """Получить публичный словарь по ID для просмотра в маркетплейсе."""
    initialize_database()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT d.*, COUNT(di.id) AS items_count
            FROM dictionaries d
            LEFT JOIN dictionary_items di ON di.dictionary_id = d.id
            WHERE d.id = ? AND d.visibility = 'public' AND d.status = 'published'
            GROUP BY d.id
            """,
            (dictionary_id,),
        ).fetchone()
        if row is None:
            return None
        return _row_to_summary(row)


def get_user_dictionary(user_id: str, dictionary_id: int) -> Optional[Dict[str, Any]]:
    if not user_id:
        return None
    initialize_database()
    with _connect() as conn:
        return _dictionary_with_items(conn, user_id, dictionary_id)


def update_dictionary(user_id: str, dictionary_id: int, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not user_id:
        raise DictionaryValidationError("Пользователь не указан")
    if not isinstance(payload, dict):
        raise DictionaryValidationError("Словарь должен быть JSON-объектом")
    initialize_database()
    with _connect() as conn:
        existing = conn.execute(
            "SELECT * FROM dictionaries WHERE id = ? AND owner_id = ?",
            (dictionary_id, user_id),
        ).fetchone()
        if existing is None:
            return None

        current = dict(existing)
        merged = {
            "title": payload.get("title", current["title"]),
            "topic": payload.get("topic", current["topic"]),
            "difficulty": payload.get("difficulty", current["difficulty"]),
            "visibility": payload.get("visibility", current["visibility"]),
            "status": payload.get("status", current["status"]),
            "source": current["source"],
            "items": payload.get("items") if "items" in payload else None,
        }
        items_provided = "items" in payload
        if not items_provided:
            rows = conn.execute(
                "SELECT term, description, about FROM dictionary_items WHERE dictionary_id = ? ORDER BY position ASC, id ASC",
                (dictionary_id,),
            ).fetchall()
            merged["items"] = [dict(row) for row in rows]

        data = normalize_dictionary_payload(merged, default_source=current["source"])
        now = _utc_now()
        conn.execute(
            """
            UPDATE dictionaries
            SET title = ?, topic = ?, difficulty = ?, visibility = ?, status = ?, updated_at = ?
            WHERE id = ? AND owner_id = ?
            """,
            (
                data["title"],
                data["topic"],
                data["difficulty"],
                data["visibility"],
                data["status"],
                now,
                dictionary_id,
                user_id,
            ),
        )
        if items_provided:
            conn.execute("DELETE FROM dictionary_items WHERE dictionary_id = ?", (dictionary_id,))
            conn.executemany(
                """
                INSERT INTO dictionary_items (dictionary_id, position, term, description, about, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (dictionary_id, idx, item["term"], item["description"], item["about"], now)
                    for idx, item in enumerate(data["items"], start=1)
                ],
            )
        conn.commit()
        return _dictionary_with_items(conn, user_id, dictionary_id)


def delete_dictionary(user_id: str, dictionary_id: int) -> bool:
    if not user_id:
        return False
    initialize_database()
    with _connect() as conn:
        existing = conn.execute(
            "SELECT id FROM dictionaries WHERE id = ? AND owner_id = ?",
            (dictionary_id, user_id),
        ).fetchone()
        if existing is None:
            return False
        conn.execute("DELETE FROM dictionaries WHERE id = ? AND owner_id = ?", (dictionary_id, user_id))
        conn.commit()
        return True


def add_dictionary_to_user(user_id: str, dictionary_id: int) -> Optional[Dict[str, Any]]:
    """Attach an existing public/unlisted dictionary to a user's library."""
    if not user_id:
        raise DictionaryValidationError("Пользователь не указан")
    initialize_database()
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM dictionaries WHERE id = ? AND visibility IN ('public', 'unlisted') AND status = 'published'",
            (dictionary_id,),
        ).fetchone()
        if row is None:
            return None
        conn.execute(
            "INSERT OR IGNORE INTO user_dictionaries (user_id, dictionary_id, added_at, is_favorite) VALUES (?, ?, ?, 0)",
            (user_id, dictionary_id, _utc_now()),
        )
        conn.commit()
        return _dictionary_with_items(conn, user_id, dictionary_id)
