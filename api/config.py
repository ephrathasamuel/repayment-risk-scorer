import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


class Settings:
    def __init__(self):
        self.database_url = os.environ.get("DATABASE_URL") or f"sqlite:///{(ROOT / 'data' / 'app.db').as_posix()}"
        self.models_dir = Path(os.environ.get("MODELS_DIR") or ROOT / "models")
        # Without SECRET_KEY, sessions are signed with a random key and end when the server restarts.
        self.secret_key = os.environ.get("SECRET_KEY") or secrets.token_urlsafe(32)
        self.cookie_secure = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
        self.session_hours = int(os.environ.get("SESSION_HOURS", "12"))
        # Accounts created on start-up if they don't exist yet. Never logged.
        self.seed_users = [
            (os.environ.get("ADMIN_EMAIL"), os.environ.get("ADMIN_PASSWORD"), "admin"),
            (os.environ.get("ANALYST_EMAIL"), os.environ.get("ANALYST_PASSWORD"), "analyst"),
        ]


settings = Settings()
