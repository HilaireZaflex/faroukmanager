from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    APP_NAME: str = "FaroukManager"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = "sqlite:///./farouk_manager.db"

    SECRET_KEY: str = "farouk-manager-secret-key-2026-orange-mali"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    REDIS_URL: str = "redis://localhost:6379/0"
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://faroukmanager.onrender.com",
        "https://faroukmanager.onrender.com",
        "https://faroukmanager-backend.onrender.com",
    ]

    ADMIN_EMAIL: str = "admin@faroukmanager.com"
    ADMIN_PASSWORD: str = "Admin2026!"
    ADMIN_NAME: str = "Administrateur"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Autoriser variables .env additionnelles (notif providers, etc.)

settings = Settings()
