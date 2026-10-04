import hashlib

import httpx
import numpy as np

from app.core.config import settings

# Dimensions mapped dynamically from settings
VECTOR_DIM = settings.EMBEDDING_DIMENSIONS

async def get_text_embedding(text: str) -> list[float]:
    """Returns vector embedding list for a text input."""
    if settings.DEVELOPMENT_MOCK_AI:
        # Return a deterministic or random vector for testing (Deterministic for testing)
        hash_digest = hashlib.sha256(text.encode('utf-8')).digest()
        seed = int.from_bytes(hash_digest[:4], 'big')
        np.random.seed(seed)
        return list(np.random.rand(VECTOR_DIM).astype(float))
        
    if not settings.OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set.")
        
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.OPENROUTER_BASE_URL}/embeddings",
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "HTTP-Referer": settings.FRONTEND_ORIGINS.split(",")[0]
            },
            json={"input": text, "model": settings.EMBEDDING_MODEL}
        )
        if resp.status_code == 200:
            data = resp.json()
            embedding = data["data"][0]["embedding"]
            if len(embedding) != VECTOR_DIM:
                raise ValueError(f"Embedding dimension mismatch! Model returned {len(embedding)} but config requires {VECTOR_DIM}.")
            return embedding
        else:
            raise Exception(f"Failed to get embedding: {resp.text}")
