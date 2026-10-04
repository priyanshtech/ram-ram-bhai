import uuid
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from app.core.config import settings
from app.models.models import Handoff

@pytest.mark.asyncio
async def test_fallback_creates_handoff(client):
    uid = str(uuid.uuid4())[:8]
    
    # 1. Create a tenant and bot
    resp = client.post("/api/v1/auth/signup", json={
        "email": f"handoff_{uid}@example.com",
        "password": "password",
        "full_name": "Handoff Tester",
        "tenant_name": "Handoff Co"
    })
    data = resp.json()
    bot_id = data["bot_id"]
    token = data["access_token"]
    tenant_id = data["tenant_id"]

    # 2. Get Bot public key
    b_resp = client.get(
        f"/api/v1/bots/{bot_id}?tenant_id={tenant_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    public_key = b_resp.json()["public_key"]

    # 3. Create visitor session
    session_resp = client.post(
        "/api/v1/widget/session",
        json={"public_key": public_key},
        headers={"Origin": "http://localhost"}
    )
    assert session_resp.status_code == 200
    visitor_token = session_resp.json()["visitor_session_token"]

    # 4. Chat query that will cause a low-confidence fallback
    # Since we have NO knowledge uploaded, any query will have no context and trigger fallback
    chat_resp = client.post(
        "/api/v1/chat/query",
        json={
            "message": "What is the meaning of life?",
            "visitor_session_id": "session-1234"
        },
        headers={
            "Authorization": f"Bearer {visitor_token}",
            "Origin": "http://localhost"
        }
    )
    assert chat_resp.status_code == 200
    assert "data:" in chat_resp.text

    # 5. Verify Handoff row is created
    engine = create_async_engine(settings.DATABASE_URL)
    async with AsyncSession(engine) as db_session:
        stmt = select(Handoff).where(Handoff.bot_id == bot_id, Handoff.tenant_id == tenant_id)
        result = await db_session.execute(stmt)
        handoffs = result.scalars().all()
        
        assert len(handoffs) == 1
        handoff = handoffs[0]
        
        # 6. Verify reason and status are saved
        assert handoff.reason in ["Low confidence", "Not configured"] # Depends on exact fallback triggered, but since DB is empty, it will be low confidence or not configured
        assert handoff.status == "pending"
        assert handoff.channel == "widget"
