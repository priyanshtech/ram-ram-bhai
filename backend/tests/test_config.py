import pytest
from pydantic import ValidationError


def test_development_allows_free_models_and_real_api(monkeypatch):
    """
    Tests that in development, we can use DEVELOPMENT_MOCK_AI=false (real API) 
    and :free models without validation failure.
    """
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("DEVELOPMENT_MOCK_AI", "false")
    monkeypatch.setenv("EMBEDDING_MODEL", "nvidia/llama-nemotron-embed-vl-1b-v2:free")
    monkeypatch.setenv("LLM_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")
    
    # Importing Settings should not raise a ValidationError
    from app.core.config import Settings
    settings = Settings()
    
    assert settings.ENVIRONMENT == "development"
    assert settings.DEVELOPMENT_MOCK_AI is False
    assert settings.EMBEDDING_MODEL.endswith(":free")

def test_production_rejects_free_models(monkeypatch):
    """
    Tests that in production, using a :free model raises a ValidationError.
    """
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEVELOPMENT_MOCK_AI", "false")
    monkeypatch.setenv("EMBEDDING_MODEL", "nvidia/llama-nemotron-embed-vl-1b-v2:free")
    # Set other valid prod settings to bypass other errors
    monkeypatch.setenv("SECRET_KEY", "some-secure-random-key-in-prod-1234")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_support")
    
    from app.core.config import Settings
    
    with pytest.raises(ValidationError) as exc_info:
        Settings()
        
    error_msg = str(exc_info.value)
    assert "Refusing to start in production with a :free embedding model" in error_msg
