import pytest

from app.services.embedding import get_text_embedding


@pytest.mark.asyncio
async def test_deterministic_mock_embeddings(monkeypatch):
    monkeypatch.setattr("app.services.embedding.settings.DEVELOPMENT_MOCK_AI", True)
    
    text1 = "How do I reset my password?"
    text2 = "How do I update my billing information?"
    
    vec1_a = await get_text_embedding(text1)
    vec1_b = await get_text_embedding(text1)
    
    vec2_a = await get_text_embedding(text2)
    
    # Must be deterministic for the same text
    assert vec1_a == vec1_b
    
    # Must be different for different text
    assert vec1_a != vec2_a
