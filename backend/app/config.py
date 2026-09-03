from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Fulfillment Tracker"
    data_dir: Path = Field(default=Path("./data"))
    database_url: str | None = None
    app_password: str | None = None
    app_secret_key: str | None = None
    # mock | live. Applies to any carrier without an explicit per-carrier mode in DB.
    carrier_mode: str = "mock"
    usps_client_id: str | None = None
    usps_client_secret: str | None = None
    fedex_api_key: str | None = None
    fedex_secret_key: str | None = None
    map_style_url: str = "https://tiles.openfreemap.org/styles/positron"
    map_style_url_dark: str = "https://tiles.openfreemap.org/styles/fiord"
    frontend_dist: Path | None = None
    log_level: str = "INFO"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(self.data_dir / 'app.db').resolve()}"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    s.uploads_dir.mkdir(parents=True, exist_ok=True)
    return s
