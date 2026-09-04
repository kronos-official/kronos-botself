from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    bot_token: str = Field(min_length=20)
    owner_telegram_id: int
    api_id: int
    api_hash: str = Field(min_length=20)
    database_url: str
    redis_url: str
    secret_key: str = Field(min_length=32)
    webapp_url: str = ""
    sessions_dir: str = "/data/sessions"
    media_dir: str = "/data/media"
    timezone: str = "Asia/Tehran"
    log_level: str = "INFO"
    access_token_ttl: int = Field(default=3600, ge=300, le=86400)
    upload_max_mb: int = Field(default=50, ge=1, le=200)
    scheduler_poll_seconds: int = Field(default=2, ge=1, le=30)
    scheduler_batch_size: int = Field(default=20, ge=1, le=100)
    scheduler_retry_delay_seconds: int = Field(default=60, ge=10, le=3600)
    support_telegram_id: int | None = None
    support_max_active_tickets: int = Field(default=2, ge=1, le=10)
    support_max_attachment_mb: int = Field(default=8, ge=1, le=25)

    @field_validator("webapp_url")
    @classmethod
    def validate_webapp_url(cls, value: str) -> str:
        if not value:
            return value
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("webapp_url must be an absolute http(s) URL")
        return value.rstrip("/")

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        ZoneInfo(value)
        return value

    @property
    def webapp_origin(self) -> str:
        if not self.webapp_url:
            return ""
        parsed = urlsplit(self.webapp_url)
        return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))

    @property
    def miniapp_url(self) -> str:
        if not self.webapp_url:
            return ""
        return f"{self.webapp_origin}/miniapp/"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    Path(settings.sessions_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
    return settings
