from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "PhoenixPy API"
    APP_VERSION: str = "0.1.0"

    # CORS — allow any local loopback port. The frontend dev server runs on
    # 3200, but packaged builds may pick a different port, so allow all loopback.
    CORS_ORIGINS: list[str] = [
        "http://localhost:3200",
        "http://127.0.0.1:3200",
    ]
    CORS_ORIGIN_REGEX: str = r"^http://(localhost|127\.0\.0\.1):\d+$"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
