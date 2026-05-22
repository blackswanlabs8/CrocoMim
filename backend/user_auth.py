"""
User authentication and management module for CrocoMim application.
Provides user registration, login, profile management functionality.
"""

import os
import secrets
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import json

# Конфигурация
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
USERS_FILE = "users.json"
SESSIONS_FILE = "sessions.json"


def _get_data_dir() -> Path:
    """Получить директорию для хранения данных."""
    data_dir = Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def _get_users_file_path() -> Path:
    """Получить путь к файлу пользователей."""
    return _get_data_dir() / USERS_FILE


def _get_sessions_file_path() -> Path:
    """Получить путь к файлу сессий."""
    return _get_data_dir() / SESSIONS_FILE


def _load_users() -> Dict[str, Any]:
    """Загрузить пользователей из файла."""
    users_file = _get_users_file_path()
    if not users_file.exists():
        return {"users": {}}
    
    try:
        with users_file.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"users": {}}


def _save_users(data: Dict[str, Any]) -> None:
    """Сохранить пользователей в файл."""
    users_file = _get_users_file_path()
    with users_file.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _load_sessions() -> Dict[str, Any]:
    """Загрузить сессии из файла."""
    sessions_file = _get_sessions_file_path()
    if not sessions_file.exists():
        return {"sessions": {}}
    
    try:
        with sessions_file.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"sessions": {}}


def _save_sessions(data: Dict[str, Any]) -> None:
    """Сохранить сессии в файл."""
    sessions_file = _get_sessions_file_path()
    with sessions_file.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """
    Хэшировать пароль с солью.
    Возвращает кортеж (хэш, соль).
    """
    if salt is None:
        salt = secrets.token_hex(32)
    
    # Используем SHA-256 для хэширования пароля с солью
    password_hash = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
    return password_hash, salt


def _generate_session_token() -> str:
    """Сгенерировать уникальный токен сессии."""
    return secrets.token_urlsafe(64)


def register_user(username: str, email: str, password: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Зарегистрировать нового пользователя.
    
    Args:
        username: Имя пользователя (логин)
        email: Email пользователя
        password: Пароль
    
    Returns:
        Кортеж (success, message, user_data)
        - success: True если регистрация успешна
        - message: Сообщение о результате
        - user_data: Данные пользователя если успешно, иначе None
    """
    # Валидация входных данных
    if not username or len(username.strip()) < 3:
        return False, "Имя пользователя должно содержать минимум 3 символа", None
    
    if not email or "@" not in email:
        return False, "Некорректный email адрес", None
    
    if not password or len(password) < 6:
        return False, "Пароль должен содержать минимум 6 символов", None
    
    username = username.strip()
    email = email.strip().lower()
    
    # Загружаем существующих пользователей
    users_data = _load_users()
    
    # Проверяем существует ли пользователь с таким именем или email
    for user_id, user in users_data["users"].items():
        if user["username"].lower() == username.lower():
            return False, "Пользователь с таким именем уже существует", None
        if user["email"] == email:
            return False, "Пользователь с таким email уже существует", None
    
    # Создаем нового пользователя
    user_id = secrets.token_hex(16)
    password_hash, salt = _hash_password(password)
    
    now = datetime.now(timezone.utc).isoformat()
    
    new_user = {
        "id": user_id,
        "username": username,
        "display_name": username,  # По умолчанию отображаемое имя равно имени пользователя
        "email": email,
        "password_hash": password_hash,
        "salt": salt,
        "created_at": now,
        "updated_at": now
    }
    
    users_data["users"][user_id] = new_user
    _save_users(users_data)
    
    # Возвращаем данные пользователя без чувствительной информации
    user_data = {
        "id": new_user["id"],
        "username": new_user["username"],
        "display_name": new_user["display_name"],
        "email": new_user["email"],
        "created_at": new_user["created_at"]
    }
    
    return True, "Пользователь успешно зарегистрирован", user_data


def login_user(username: str, password: str) -> Tuple[bool, str, Optional[Dict[str, Any]], Optional[str]]:
    """
    Войти пользователя.
    
    Args:
        username: Имя пользователя или email
        password: Пароль
    
    Returns:
        Кортеж (success, message, user_data, session_token)
    """
    if not username or not password:
        return False, "Введите имя пользователя и пароль", None, None
    
    username = username.strip()
    users_data = _load_users()
    
    # Ищем пользователя по имени или email
    user = None
    for user_id, user_data in users_data["users"].items():
        if user_data["username"].lower() == username.lower() or user_data["email"] == username.lower():
            user = user_data
            break
    
    if not user:
        return False, "Пользователь не найден", None, None
    
    # Проверяем пароль
    password_hash, _ = _hash_password(password, user["salt"])
    if password_hash != user["password_hash"]:
        return False, "Неверный пароль", None, None
    
    # Создаем сессию
    session_token = _generate_session_token()
    sessions_data = _load_sessions()
    
    now = datetime.now(timezone.utc).isoformat()
    sessions_data["sessions"][session_token] = {
        "user_id": user["id"],
        "created_at": now,
        "expires_at": now  # Можно добавить логику истечения сессии
    }
    _save_sessions(sessions_data)
    
    # Возвращаем данные пользователя без чувствительной информации
    user_data = {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "email": user["email"],
        "created_at": user["created_at"]
    }
    
    return True, "Вход выполнен успешно", user_data, session_token


def logout_user(session_token: str) -> Tuple[bool, str]:
    """
    Выйти пользователя (удалить сессию).
    
    Args:
        session_token: Токен сессии
    
    Returns:
        Кортеж (success, message)
    """
    if not session_token:
        return False, "Токен сессии не предоставлен"
    
    sessions_data = _load_sessions()
    
    if session_token not in sessions_data["sessions"]:
        return True, "Сессия не найдена"  # Считаем успешным, т.к. сессии все равно нет
    
    del sessions_data["sessions"][session_token]
    _save_sessions(sessions_data)
    
    return True, "Выход выполнен успешно"


def get_user_by_session(session_token: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Получить данные пользователя по токену сессии.
    
    Args:
        session_token: Токен сессии
    
    Returns:
        Кортеж (success, message, user_data)
    """
    if not session_token:
        return False, "Токен сессии не предоставлен", None
    
    sessions_data = _load_sessions()
    
    if session_token not in sessions_data["sessions"]:
        return False, "Сессия не найдена", None
    
    session = sessions_data["sessions"][session_token]
    user_id = session["user_id"]
    
    users_data = _load_users()
    
    if user_id not in users_data["users"]:
        return False, "Пользователь не найден", None
    
    user = users_data["users"][user_id]
    
    # Возвращаем данные пользователя без чувствительной информации
    user_data = {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "email": user["email"],
        "created_at": user["created_at"],
        "updated_at": user["updated_at"]
    }
    
    return True, "Пользователь найден", user_data


def update_display_name(user_id: str, display_name: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Обновить отображаемое имя пользователя.
    
    Args:
        user_id: ID пользователя
        display_name: Новое отображаемое имя
    
    Returns:
        Кортеж (success, message, user_data)
    """
    if not display_name or len(display_name.strip()) < 1:
        return False, "Отображаемое имя не может быть пустым", None
    
    if len(display_name.strip()) > 50:
        return False, "Отображаемое имя слишком длинное (максимум 50 символов)", None
    
    display_name = display_name.strip()
    users_data = _load_users()
    
    if user_id not in users_data["users"]:
        return False, "Пользователь не найден", None
    
    now = datetime.now(timezone.utc).isoformat()
    users_data["users"][user_id]["display_name"] = display_name
    users_data["users"][user_id]["updated_at"] = now
    _save_users(users_data)
    
    user = users_data["users"][user_id]
    user_data = {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "email": user["email"],
        "created_at": user["created_at"],
        "updated_at": user["updated_at"]
    }
    
    return True, "Отображаемое имя успешно обновлено", user_data


def change_password(user_id: str, old_password: str, new_password: str) -> Tuple[bool, str]:
    """
    Изменить пароль пользователя.
    
    Args:
        user_id: ID пользователя
        old_password: Старый пароль
        new_password: Новый пароль
    
    Returns:
        Кортеж (success, message)
    """
    if not new_password or len(new_password) < 6:
        return False, "Новый пароль должен содержать минимум 6 символов"
    
    users_data = _load_users()
    
    if user_id not in users_data["users"]:
        return False, "Пользователь не найден"
    
    user = users_data["users"][user_id]
    
    # Проверяем старый пароль
    old_password_hash, _ = _hash_password(old_password, user["salt"])
    if old_password_hash != user["password_hash"]:
        return False, "Неверный текущий пароль"
    
    # Устанавливаем новый пароль
    new_password_hash, new_salt = _hash_password(new_password)
    
    now = datetime.now(timezone.utc).isoformat()
    users_data["users"][user_id]["password_hash"] = new_password_hash
    users_data["users"][user_id]["salt"] = new_salt
    users_data["users"][user_id]["updated_at"] = now
    _save_users(users_data)
    
    return True, "Пароль успешно изменен"


def get_user_by_id(user_id: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Получить данные пользователя по ID.
    
    Args:
        user_id: ID пользователя
    
    Returns:
        Кортеж (success, message, user_data)
        - success: True если пользователь найден
        - message: Сообщение о результате
        - user_data: Данные пользователя без чувствительной информации или None
    """
    if not user_id:
        return False, "ID пользователя не предоставлен", None
    
    users_data = _load_users()
    
    if user_id not in users_data["users"]:
        return False, "Пользователь не найден", None
    
    user = users_data["users"][user_id]
    
    # Возвращаем данные пользователя без чувствительной информации
    user_data = {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "email": user["email"],
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
        "last_dict_generation": user.get("last_dict_generation")
    }
    
    return True, "Пользователь найден", user_data


def check_generation_limit(user_id: str, limit_hours: int = 24) -> Tuple[bool, str, bool]:
    """
    Проверить, может ли пользователь сгенерировать словарь (лимит 1 генерация в N часов).
    
    Args:
        user_id: ID пользователя
        limit_hours: Период ограничения в часах (по умолчанию 24 часа)
    
    Returns:
        Кортеж (success, message, can_generate)
        - success: True если проверка выполнена успешно
        - message: Сообщение о результате
        - can_generate: True если пользователь может генерировать словарь
    """
    if not user_id:
        return False, "ID пользователя не предоставлен", False
    
    users_data = _load_users()
    
    if user_id not in users_data["users"]:
        return False, "Пользователь не найден", False
    
    user = users_data["users"][user_id]
    last_generation = user.get("last_dict_generation")
    
    # Если пользователь никогда не генерировал словарь, разрешаем генерацию
    if last_generation is None:
        return True, "Лимит не превышен", True
    
    try:
        # Парсим время последней генерации
        last_gen_datetime = datetime.fromisoformat(last_generation)
        
        # Получаем текущее время в UTC
        now = datetime.now(timezone.utc)
        
        # Вычисляем разницу во времени
        time_diff = now - last_gen_datetime
        
        # Проверяем, прошло ли достаточно времени
        if time_diff.total_seconds() >= limit_hours * 3600:
            return True, "Лимит не превышен", True
        else:
            # Вычисляем, сколько осталось ждать
            remaining_seconds = (limit_hours * 3600) - time_diff.total_seconds()
            remaining_hours = int(remaining_seconds // 3600)
            remaining_minutes = int((remaining_seconds % 3600) // 60)
            
            if remaining_hours > 0:
                wait_message = f"Подождите ещё {remaining_hours} ч. {remaining_minutes} мин."
            else:
                wait_message = f"Подождите ещё {remaining_minutes} мин."
            
            return True, f"Превышен лимит генерации. {wait_message}", False
            
    except (ValueError, TypeError) as e:
        # Если время некорректно, считаем что лимит не превышен
        return True, "Лимит не превышен", True


def update_last_generation(user_id: str) -> Tuple[bool, str]:
    """
    Обновить время последней генерации словаря для пользователя.
    
    Args:
        user_id: ID пользователя
    
    Returns:
        Кортеж (success, message)
        - success: True если обновление выполнено успешно
        - message: Сообщение о результате
    """
    if not user_id:
        return False, "ID пользователя не предоставлен"
    
    users_data = _load_users()
    
    if user_id not in users_data["users"]:
        return False, "Пользователь не найден"
    
    # Устанавливаем текущее время в UTC
    now = datetime.now(timezone.utc).isoformat()
    users_data["users"][user_id]["last_dict_generation"] = now
    users_data["users"][user_id]["updated_at"] = now
    
    _save_users(users_data)
    
    return True, "Время последней генерации обновлено"
