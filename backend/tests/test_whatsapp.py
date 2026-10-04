"""Isolated integration tests: no WhatsApp account, Redis or external database required."""

import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api import whatsapp
from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.models import (
    Bot,
    Conversation,
    Message,
    Tenant,
    TenantMember,
    User,
    WhatsAppChat,
    WhatsAppReceipt,
)
from app.services.rag_engine import build_system_prompt, retrieve_relevant_chunks


@pytest.fixture
async def wa(monkeypatch):
    if not any(getattr(route, "path", "") == "/api/v1/whatsapp/account" for route in app.routes):
        pytest.skip("WhatsApp routes are temporarily disabled")
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    ids = {}
    async with factory() as db:
        for key in ("a", "b"):
            tenant = Tenant(id=f"tenant-{key}", name=key)
            user = User(
                id=f"user-{key}", email=f"{key}@example.com", hashed_password="unused"
            )
            bot = Bot(
                id=f"bot-{key}",
                tenant_id=tenant.id,
                name=f"Assistant {key}",
                status="active",
            )
            db.add_all(
                [
                    tenant,
                    user,
                    bot,
                    TenantMember(tenant_id=tenant.id, user_id=user.id, role="owner"),
                ]
            )
            ids[key] = {
                "tenant_id": tenant.id,
                "bot_id": bot.id,
                "headers": {"Authorization": f"Bearer {create_access_token(user.id)}"},
            }
        viewer = User(id="viewer", email="viewer@example.com", hashed_password="unused")
        db.add_all(
            [
                viewer,
                TenantMember(tenant_id="tenant-a", user_id="viewer", role="viewer"),
            ]
        )
        await db.commit()

    async def override_db():
        async with factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(settings, "WHATSAPP_CONNECTOR_TOKEN", "test-token-" + "a" * 32)

    async def fake_connector(*args, **kwargs):
        return {"status": "connected", "qr": None}

    monkeypatch.setattr(whatsapp, "connector_request", fake_connector)
    ai_calls = []

    async def answer(db, bot, text, conversation_id, **kwargs):
        ai_calls.append((bot.id, text, kwargs))
        yield {"type": "chunk", "text": "Verified answer."}
        yield {"type": "done", "citations": [], "fallback_triggered": False}

    monkeypatch.setattr(whatsapp, "stream_grounded_answer", answer)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for key in ("a", "b"):
            data = ids[key]
            response = await client.put(
                f"/api/v1/whatsapp/account?tenant_id={data['tenant_id']}",
                headers=data["headers"],
                json={"bot_id": data["bot_id"]},
            )
            assert response.status_code == 200, response.text
            data["account_id"] = response.json()["id"]
            await client.post(
                f"/api/v1/whatsapp/connect?tenant_id={data['tenant_id']}",
                headers=data["headers"],
            )
        yield client, factory, ids, ai_calls
    app.dependency_overrides.clear()
    await engine.dispose()


def internal_headers():
    return {"Authorization": f"Bearer {settings.WHATSAPP_CONNECTOR_TOKEN}"}


def internal_path(ids, suffix, tenant="a"):
    return f"/api/v1/whatsapp/internal/accounts/{ids[tenant]['account_id']}/{suffix}"


async def discover_and_enable(client, ids, jid="919999999999@s.whatsapp.net"):
    result = await client.post(
        internal_path(ids, "chats"),
        headers=internal_headers(),
        json={"chats": [{"jid": jid, "name": "Test Customer"}]},
    )
    assert result.status_code == 200, result.text
    chats = (
        await client.get(
            "/api/v1/whatsapp/chats?tenant_id=tenant-a", headers=ids["a"]["headers"]
        )
    ).json()
    chat = chats[0]
    assert chat["enabled"] is False
    await client.patch(
        f"/api/v1/whatsapp/chats/{chat['id']}?tenant_id=tenant-a",
        headers=ids["a"]["headers"],
        json={"enabled": True},
    )
    return chat["id"]


def text_payload(message_id=None, **kwargs):
    return {
        "jid": "919999999999@s.whatsapp.net",
        "name": "Test Customer",
        "message_id": message_id or str(uuid.uuid4()),
        "text": "What do you sell?",
        **kwargs,
    }


async def receive(client, ids, payload=None):
    response = await client.post(
        internal_path(ids, "messages"),
        headers=internal_headers(),
        json=payload or text_payload(),
    )
    assert response.status_code == 200, response.text
    return response.json()


async def authorize(client, ids, receipt_id):
    response = await client.post(
        internal_path(ids, f"receipts/{receipt_id}/authorize"),
        headers=internal_headers(),
        json={},
    )
    assert response.status_code == 200, response.text
    return response.json()["allowed"]


async def test_disabled_chat_never_calls_ai_and_groups_are_rejected(wa):
    client, factory, ids, ai_calls = wa
    assert (await receive(client, ids))["action"] == "skip"
    assert ai_calls == []
    group = await client.post(
        internal_path(ids, "messages"),
        headers=internal_headers(),
        json=text_payload(jid="123@g.us"),
    )
    assert group.status_code == 422
    async with factory() as db:
        assert (await db.scalar(select(func.count(Message.id)))) == 0
        assert (await db.scalar(select(func.count(WhatsAppChat.id)))) == 1


async def test_enabled_chat_uses_bot_and_logs_only_confirmed_delivery(wa):
    client, factory, ids, ai_calls = wa
    await discover_and_enable(client, ids)
    payload = text_payload()
    reply = await receive(client, ids, payload)
    assert reply["action"] == "reply"
    assert ai_calls[0][0] == "bot-a"
    assert ai_calls[0][2] == {"channel": "whatsapp", "persist_response": False}
    async with factory() as db:
        assert (await db.scalar(select(func.count(Message.id)))) == 1
        conversation = await db.scalar(select(Conversation))
        assert conversation.channel == "whatsapp"
        assert conversation.visitor_name == "Test Customer"
    assert await authorize(client, ids, reply["receipt_id"])
    assert not await authorize(client, ids, reply["receipt_id"])
    for _ in range(2):
        response = await client.post(
            internal_path(ids, f"receipts/{reply['receipt_id']}/delivery"),
            headers=internal_headers(),
            json={"sent": True},
        )
        assert response.status_code == 200
    assert (await receive(client, ids, payload))["action"] == "duplicate"
    assert len(ai_calls) == 1
    async with factory() as db:
        assert (await db.scalar(select(func.count(Message.id)))) == 2


async def test_toggle_off_then_on_cancels_pending_reply(wa):
    client, _, ids, _ = wa
    chat_id = await discover_and_enable(client, ids)
    reply = await receive(client, ids)
    for enabled in (False, True):
        await client.patch(
            f"/api/v1/whatsapp/chats/{chat_id}?tenant_id=tenant-a",
            headers=ids["a"]["headers"],
            json={"enabled": enabled},
        )
    assert not await authorize(client, ids, reply["receipt_id"])
    assert (await receive(client, ids))["action"] == "reply"


async def test_disable_during_generation_prevents_send(wa, monkeypatch):
    client, _, ids, _ = wa
    chat_id = await discover_and_enable(client, ids)

    async def delayed_answer(*args, **kwargs):
        await client.patch(
            f"/api/v1/whatsapp/chats/{chat_id}?tenant_id=tenant-a",
            headers=ids["a"]["headers"],
            json={"enabled": False},
        )
        yield {"type": "chunk", "text": "Should never be sent"}

    monkeypatch.setattr(whatsapp, "stream_grounded_answer", delayed_answer)
    reply = await receive(client, ids)
    assert not await authorize(client, ids, reply["receipt_id"])


async def test_master_pause_and_inactive_bot_stop_processing(wa):
    client, factory, ids, ai_calls = wa
    await discover_and_enable(client, ids)
    await client.put(
        "/api/v1/whatsapp/account?tenant_id=tenant-a",
        headers=ids["a"]["headers"],
        json={"paused": True},
    )
    assert (await receive(client, ids))["action"] == "skip"
    await client.put(
        "/api/v1/whatsapp/account?tenant_id=tenant-a",
        headers=ids["a"]["headers"],
        json={"paused": False},
    )
    async with factory() as db:
        bot = await db.get(Bot, "bot-a")
        bot.status = "inactive"
        await db.commit()
    assert (await receive(client, ids))["action"] == "skip"
    assert not ai_calls


async def test_privacy_identity_reuses_chat_and_selection(wa):
    client, factory, ids, _ = wa
    chat_id = await discover_and_enable(client, ids)
    result = await receive(
        client,
        ids,
        text_payload(jid="123456789@lid", alternate_jid="919999999999@s.whatsapp.net"),
    )
    assert result["action"] == "reply"
    async with factory() as db:
        chats = (await db.scalars(select(WhatsAppChat))).all()
        assert len(chats) == 1 and chats[0].id == chat_id and chats[0].enabled
    response = await client.get(
        "/api/v1/whatsapp/chats?tenant_id=tenant-a&search=99999",
        headers=ids["a"]["headers"],
    )
    assert len(response.json()) == 1


async def test_tenant_role_and_connector_boundaries(wa):
    client, _, ids, _ = wa
    chat_id = await discover_and_enable(client, ids)
    attempts = [
        await client.get(
            "/api/v1/whatsapp/account?tenant_id=tenant-b", headers=ids["a"]["headers"]
        ),
        await client.patch(
            f"/api/v1/whatsapp/chats/{chat_id}?tenant_id=tenant-b",
            headers=ids["b"]["headers"],
            json={"enabled": True},
        ),
        await client.put(
            "/api/v1/whatsapp/account?tenant_id=tenant-a",
            headers=ids["a"]["headers"],
            json={"bot_id": "bot-b"},
        ),
        await client.post(
            internal_path(ids, "messages"),
            headers=ids["a"]["headers"],
            json=text_payload(),
        ),
        await client.patch(
            f"/api/v1/whatsapp/chats/{chat_id}?tenant_id=tenant-a",
            headers={"Authorization": f"Bearer {create_access_token('viewer')}"},
            json={"enabled": True},
        ),
    ]
    assert [r.status_code for r in attempts] == [404, 404, 404, 401, 403]
    reply = await receive(client, ids)
    cross_account = await client.post(
        internal_path(ids, f"receipts/{reply['receipt_id']}/authorize", tenant="b"),
        headers=internal_headers(),
        json={},
    )
    assert cross_account.status_code == 404


async def test_generation_failure_is_not_reprocessed(wa, monkeypatch):
    client, factory, ids, _ = wa
    await discover_and_enable(client, ids)

    async def broken(*args, **kwargs):
        raise RuntimeError("AI failure")
        yield

    monkeypatch.setattr(whatsapp, "stream_grounded_answer", broken)
    payload = text_payload()
    response = await client.post(
        internal_path(ids, "messages"), headers=internal_headers(), json=payload
    )
    assert response.status_code == 503, response.text
    assert (await receive(client, ids, payload))["action"] == "duplicate"
    async with factory() as db:
        assert (await db.scalar(select(WhatsAppReceipt))).status == "failed"


async def test_sqlite_knowledge_retrieval_and_saved_ai_instructions(wa, monkeypatch):
    from app.models.models import DocumentChunk, KnowledgeSource
    from app.services import rag_engine

    _, factory, _, _ = wa
    vector = [1.0] + [0.0] * (settings.EMBEDDING_DIMENSIONS - 1)

    async def embedding(_):
        return vector

    monkeypatch.setattr(rag_engine, "get_text_embedding", embedding)
    async with factory() as db:
        bot = await db.get(Bot, "bot-a")
        bot.system_prompt = "You sell bicycles."
        bot.sales_instructions = "Ask which size."
        db.add(
            KnowledgeSource(
                id="source-a",
                tenant_id="tenant-a",
                bot_id="bot-a",
                title="Catalogue",
                source_type="faq",
            )
        )
        db.add(
            DocumentChunk(
                tenant_id="tenant-a",
                bot_id="bot-a",
                knowledge_source_id="source-a",
                chunk_index=0,
                text_content="A bicycle costs 200.",
                embedding=vector,
            )
        )
        await db.commit()
        rows = await retrieve_relevant_chunks(db, "tenant-a", "bot-a", "price")
        assert rows[0][0].text_content == "A bicycle costs 200."
        assert rows[0][2] == pytest.approx(1)
        assert await retrieve_relevant_chunks(db, "tenant-b", "bot-b", "price") == []
        prompt = build_system_prompt(bot, rows[0][0].text_content)
        assert (
            "You sell bicycles." in prompt
            and "Ask which size." in prompt
            and "A bicycle costs 200." in prompt
        )


async def test_queued_messages_are_invalidated_by_toggle_changes(wa):
    from datetime import datetime, timezone

    client, _, ids, ai_calls = wa
    chat_id = await discover_and_enable(client, ids)
    queued_at = datetime.now(timezone.utc).isoformat()
    for enabled in (False, True):
        await client.patch(
            f"/api/v1/whatsapp/chats/{chat_id}?tenant_id=tenant-a",
            headers=ids["a"]["headers"],
            json={"enabled": enabled},
        )
    assert (await receive(client, ids, text_payload(received_at=queued_at)))[
        "action"
    ] == "skip"
    assert not ai_calls


async def test_unlink_disables_chats_and_disconnect_preserves_choices(wa):
    client, _, ids, _ = wa
    await discover_and_enable(client, ids)
    await client.post(
        "/api/v1/whatsapp/disconnect?tenant_id=tenant-a", headers=ids["a"]["headers"]
    )
    assert (await receive(client, ids))["action"] == "skip"
    chats = (
        await client.get(
            "/api/v1/whatsapp/chats?tenant_id=tenant-a", headers=ids["a"]["headers"]
        )
    ).json()
    assert chats[0]["enabled"] is True
    await client.post(
        "/api/v1/whatsapp/connect?tenant_id=tenant-a", headers=ids["a"]["headers"]
    )
    assert (await receive(client, ids))["action"] == "reply"
    await client.post(
        "/api/v1/whatsapp/logout?tenant_id=tenant-a", headers=ids["a"]["headers"]
    )
    chats = (
        await client.get(
            "/api/v1/whatsapp/chats?tenant_id=tenant-a", headers=ids["a"]["headers"]
        )
    ).json()
    assert chats[0]["enabled"] is False


async def test_duplicate_identity_merge_resolves_conflicting_choices_to_off(wa):
    client, factory, ids, _ = wa
    await discover_and_enable(client, ids)
    await client.post(
        internal_path(ids, "chats"),
        headers=internal_headers(),
        json={"chats": [{"jid": "123456789@lid", "name": "Same Customer"}]},
    )
    result = await receive(
        client,
        ids,
        text_payload(jid="123456789@lid", alternate_jid="919999999999@s.whatsapp.net"),
    )
    assert result["action"] == "skip"
    async with factory() as db:
        chats = (await db.scalars(select(WhatsAppChat))).all()
        assert len(chats) == 1 and chats[0].enabled is False
        assert len(chats[0].identities) == 2


async def test_complete_fallback_replaces_partial_ai_output(wa, monkeypatch):
    client, _, ids, _ = wa
    await discover_and_enable(client, ids)

    async def interrupted_answer(*args, **kwargs):
        yield {"type": "chunk", "text": "An unfinished answer"}
        yield {"type": "chunk", "text": "Please contact support."}
        yield {
            "type": "done",
            "answer": "Please contact support.",
            "fallback_triggered": True,
            "citations": [],
        }

    monkeypatch.setattr(whatsapp, "stream_grounded_answer", interrupted_answer)
    reply = await receive(client, ids)
    assert reply["text"] == "Please contact support."


@pytest.mark.parametrize("fail", [False, True])
async def test_shared_gemini_engine_generates_or_records_safe_fallback(wa, monkeypatch, fail):
    from app.services import rag_engine

    client, factory, ids, _ = wa
    await discover_and_enable(client, ids)
    monkeypatch.setattr(settings, "DEVELOPMENT_MOCK_AI", False)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")

    async def retrieve(*args, **kwargs):
        return []

    async def gemini_reply(system_prompt, history, query):
        assert query == "What do you sell?"
        assert "STRICT GROUNDING RULES" in system_prompt
        if fail:
            yield "Partial answer"
            raise RuntimeError("Secret service details must never reach the customer")
        yield "What product "
        yield "are you looking for?"

    monkeypatch.setattr(rag_engine, "retrieve_relevant_chunks", retrieve)
    monkeypatch.setattr(rag_engine, "stream_gemini_reply", gemini_reply)
    monkeypatch.setattr(whatsapp, "stream_grounded_answer", rag_engine.stream_grounded_answer)
    reply = await receive(client, ids)
    assert reply["action"] == "reply"
    async with factory() as db:
        receipt = await db.get(WhatsAppReceipt, reply["receipt_id"])
        assert receipt.fallback_triggered is fail
        assert "Secret service details" not in receipt.reply
        if fail:
            assert "Partial answer" not in receipt.reply
        else:
            assert receipt.reply == "What product are you looking for?"
