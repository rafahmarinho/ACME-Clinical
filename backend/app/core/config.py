from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or backend/.env)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ACME Clinical API"
    environment: str = "development"

    supabase_url: str = Field(default="http://127.0.0.1:54321")
    # Service role (or "secret") key. Server-side only — never expose it to the browser.
    supabase_service_role_key: str = ""

    # Comma separated list of allowed browser origins.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Optional regex, e.g. preview deployments: https://acme-clinical-.*\.vercel\.app
    cors_origin_regex: str | None = None

    frontend_url: str = "http://localhost:5173"
    demo_password: str = "AcmeDemo!2026"

    # Minimum wall-clock seconds between automatic simulation ticks.
    auto_tick_min_interval: float = 4.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
