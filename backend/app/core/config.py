import logging
import os
from typing import Any, Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    ENVIRONMENT: Literal["development", "test", "production"] = os.getenv("ENVIRONMENT", "development")
    PROJECT_NAME: str = "Multi-Tenant AI Support SaaS"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-key-change-in-production-2026")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    ALGORITHM: str = "HS256"

    # Database: Async SQLite by default, Postgres ready
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./ai_support.db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # CORS
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000"
    ]
    FRONTEND_ORIGINS: str = os.getenv("FRONTEND_ORIGINS", "http://localhost:3000")

    @model_validator(mode='before')
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> Any:
        if isinstance(v, dict) and "BACKEND_CORS_ORIGINS" in v:
            val = v["BACKEND_CORS_ORIGINS"]
            if isinstance(val, str) and not val.startswith("["):
                v["BACKEND_CORS_ORIGINS"] = [i.strip() for i in val.split(",")]
        return v

    # AI & Embedding Engine settings
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openrouter")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "nvidia/llama-nemotron-embed-vl-1b-v2:free")
    EMBEDDING_DIMENSIONS: int = int(os.getenv("EMBEDDING_DIMENSIONS", "1536"))
    
    DEFAULT_CONFIDENCE_THRESHOLD: float = 0.20
    DEVELOPMENT_MOCK_AI: bool = os.getenv("DEVELOPMENT_MOCK_AI", "false").lower() == "true"
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "20"))

    # Shared only between FastAPI and the local WhatsApp connector.
    WHATSAPP_CONNECTOR_URL: str = "http://127.0.0.1:3101"
    WHATSAPP_CONNECTOR_TOKEN: str = ""

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore")

    @model_validator(mode='after')
    def validate_production_safety(self) -> Self:
        is_prod = self.ENVIRONMENT == "production"

        if is_prod:
            if self.SECRET_KEY == "super-secret-key-change-in-production-2026":
                raise ValueError("SECRET_KEY must be changed in production")
            if "sqlite" in self.DATABASE_URL:
                raise ValueError("DATABASE_URL must point to PostgreSQL in production")
            if self.EMBEDDING_MODEL.endswith(":free"):
                logger.warning(f"WARNING: Using a :free embedding model ({self.EMBEDDING_MODEL}) in production!")
            if self.LLM_MODEL.endswith(":free"):
                logger.warning(f"WARNING: Using a :free LLM model ({self.LLM_MODEL}) in production!")
            if "*" in self.BACKEND_CORS_ORIGINS:
                raise ValueError("Wildcard CORS origin '*' is forbidden in production")
        elif self.ENVIRONMENT == "development":
            if self.EMBEDDING_MODEL.endswith(":free") or self.LLM_MODEL.endswith(":free"):
                logger.warning(
                    "WARNING: You are using a ':free' AI model in development. "
                    "These models are for development only and may expose submitted content."
                )

        return self

settings = Settings()
