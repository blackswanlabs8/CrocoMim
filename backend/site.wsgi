import os
import sys
import traceback
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DEFAULT_DATA_DIR = PROJECT_DIR / "data"
os.environ.setdefault("DATA_DIR", str(DEFAULT_DATA_DIR))

# Путь к файлу отладочного лога
DEBUG_LOG = os.environ.get("WSGI_DEBUG_LOG", str(DEFAULT_DATA_DIR / "wsgi-debug.log"))

def log(msg: str) -> None:
    """Пишем отладочные сообщения в файл."""
    try:
        Path(DEBUG_LOG).parent.mkdir(parents=True, exist_ok=True)
        with open(DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        # Если даже лог упадёт, сервер хоть не умрёт
        pass

try:
    log("=== WSGI START (Flask) ===")

    # Отключаем пользовательские site-packages (~/.local/...), чтобы не мешались
    try:
        import site as _site
        _site.ENABLE_USER_SITE = False
        log("User site-packages disabled")
    except Exception as e:
        log(f"Could not disable user site: {e!r}")

    # Путь к твоему виртуальному окружению
    VENV_SITE = os.environ.get("CROCOMIM_VENV_SITE", "").strip()

    # Добавляем venv в sys.path
    if VENV_SITE and VENV_SITE not in sys.path:
        sys.path.insert(0, VENV_SITE)
    log(f"sys.path: {sys.path!r}")

    # Папка с app.py
    app_dir = str(BASE_DIR)
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)
    log(f"BASE_DIR: {app_dir}")

    # Пробуем импортировать Flask
    try:
        import flask  # type: ignore
        log(f"Flask imported: {getattr(flask, '__version__', 'unknown')}")
    except Exception as e:
        log("ERROR importing flask: " + repr(e))
        raise

    # Пробуем импортировать приложение
    try:
        from app import app as flask_app
        log("Imported app from app.py")
    except Exception as e:
        log("ERROR importing app: " + repr(e))
        log("TRACEBACK:\n" + traceback.format_exc())
        raise

    # Flask уже WSGI-приложение
    application = flask_app
    log("WSGI application created successfully")

except Exception as e:
    # Если что-то пошло не так — логируем и отдаём простой ответ
    log("FATAL ERROR in Flask site.wsgi: " + repr(e))
    log("TRACEBACK:\n" + traceback.format_exc())

    def application(environ, start_response):
        start_response("500 INTERNAL SERVER ERROR", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Internal error in Flask site.wsgi. See wsgi-debug.log."]
