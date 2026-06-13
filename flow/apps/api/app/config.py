from pathlib import Path
from pydantic_settings import BaseSettings

# Local SQLite DB under apps/api/data/ — no Docker/Postgres needed.
# Packaged builds override DATABASE_URL to a per-user app-data path.
_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "phoenix.db"


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Phoenix Flow API"
    APP_VERSION: str = "0.4.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = f"sqlite+aiosqlite:///{_DB_PATH.as_posix()}"

    # JWT
    JWT_SECRET: str = "phoenix-flow-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days — desktop app stays signed in

    # CORS — allow any local loopback port. The packaged frontend runs on a
    # random port picked at app launch, so we can't hard-code one.
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    CORS_ORIGIN_REGEX: str = r"^http://(localhost|127\.0\.0\.1):\d+$"

    # Frontend / desktop redirect targets used by the Google OAuth callback
    FRONTEND_URL: str = "http://localhost:3000"
    DESKTOP_PROTOCOL: str = "phoenixflow"  # custom protocol (fallback deep link)
    # Loopback port the Electron app listens on to receive the OAuth token.
    # This is the primary desktop redirect (Google-recommended loopback flow).
    DESKTOP_LOOPBACK_PORT: int = 53682

    # Supabase — auth + approval live here (verify access tokens via JWKS)
    SUPABASE_URL: str = ""

    # Google OAuth (https://console.cloud.google.com → Credentials → OAuth client ID)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"

    # Comma-separated list of emails that are auto-promoted to admin + approved
    # on their first Google sign-in (bootstrap the first admin this way).
    ADMIN_EMAILS: str = ""

    # Speech-to-text (faster-whisper, offline). Model auto-downloads on first use.
    # Sizes: tiny | base | small | medium | large-v3 (bigger = more accurate + heavier)
    WHISPER_MODEL: str = "small"
    WHISPER_DEVICE: str = "auto"  # auto | cpu | cuda

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def google_enabled(self) -> bool:
        return bool(self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET)


settings = Settings()
