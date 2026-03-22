"""Application configuration from environment."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # API
    port: int = 3001
    debug: bool = False

    # Database (empty = disabled; local-first stack lives in `.nugit/` in-repo)
    database_url: str = ""

    # Redis (empty = no ARQ pool; set for webhook/worker jobs)
    redis_url: str = ""

    # GitHub App
    github_app_id: str = ""
    github_app_private_key: str = ""  # PEM content or path
    github_webhook_secret: str = ""
    github_oauth_client_id: str = ""

    # Optional base URL for CLI/extensions
    api_base_url: str = "http://localhost:3001"


def get_settings() -> Settings:
    return Settings()
