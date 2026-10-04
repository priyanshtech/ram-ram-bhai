"""Workspace management and authenticated callbacks from the local Baileys connector."""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, delete, exists, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_tenant_access
from app.models.models import (
    Bot,
    Conversation,
    Message,
    WhatsAppAccount,
    WhatsAppChat,
    WhatsAppIdentity,
    WhatsAppReceipt,
)
from app.services.rag_engine import stream_grounded_answer

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])
read_access = require_tenant_access(["owner", "admin", "agent", "viewer"])
write_access = require_tenant_access(["owner", "admin"])
Db = Annotated[AsyncSession, Depends(get_db)]
logger = logging.getLogger(__name__)


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def require_connector(authorization: Annotated[str | None, Header()] = None):
    token = settings.WHATSAPP_CONNECTOR_TOKEN
    if not token or not secrets.compare_digest(authorization or "", f"Bearer {token}"):
        raise HTTPException(401, "Invalid connector credentials")


internal = APIRouter(prefix="/internal", dependencies=[Depends(require_connector)])


class AccountConfig(BaseModel):
    bot_id: str | None = None
    paused: bool | None = None


class ChatToggle(BaseModel):
    enabled: bool


class DiscoveredChat(BaseModel):
    jid: str = Field(max_length=100)
    alternate_jid: str | None = Field(default=None, max_length=100)
    name: str = Field(default="", max_length=200)

    @field_validator("jid", "alternate_jid")
    @classmethod
    def direct_chat_only(cls, value):
        if value is not None:
            import re

            if not re.fullmatch(r"[0-9]+@(s\.whatsapp\.net|lid)", value):
                raise ValueError("Only individual WhatsApp chats are supported")
        return value


class ChatSync(BaseModel):
    chats: list[DiscoveredChat] = Field(max_length=500)


class IncomingText(DiscoveredChat):
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    message_id: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=10000)


class DeliveryResult(BaseModel):
    sent: bool


async def account_for(db, tenant_id):
    return (
        await db.execute(
            select(WhatsAppAccount).where(WhatsAppAccount.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


async def internal_account(db, account_id):
    account = await db.get(WhatsAppAccount, account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    return account


async def owned_bot(db, bot_id, tenant_id):
    bot = (
        await db.execute(
            select(Bot).where(Bot.id == bot_id, Bot.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "Bot not found or access denied")
    return bot


async def connector_request(method, account_id, action="", *, required=True):
    if not settings.WHATSAPP_CONNECTOR_TOKEN:
        if not required:
            return {
                "status": "unavailable",
                "qr": None,
                "error": "Configure WHATSAPP_CONNECTOR_TOKEN in both services.",
            }
        raise HTTPException(503, "Configure WHATSAPP_CONNECTOR_TOKEN in both services.")
    try:
        async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
            response = await client.request(
                method,
                f"{settings.WHATSAPP_CONNECTOR_URL.rstrip('/')}/accounts/{account_id}{action}",
                headers={
                    "Authorization": f"Bearer {settings.WHATSAPP_CONNECTOR_TOKEN}"
                },
            )
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError):
        if not required:
            return {
                "status": "unavailable",
                "qr": None,
                "error": "Start the local WhatsApp connector on port 3101.",
            }
        raise HTTPException(
            503, "WhatsApp connector unavailable. Start it locally and try again."
        )


def public_account(account):
    return {
        "id": account.id,
        "bot_id": account.bot_id,
        "paused": account.paused,
        "connect_requested": account.connect_requested,
    }


@router.get("/account", dependencies=[Depends(read_access)])
async def get_account(tenant_id: str, db: Db):
    account = await account_for(db, tenant_id)
    if not account:
        return {"account": None, "connection": {"status": "offline", "qr": None}}
    connection = await connector_request("GET", account.id, required=False)
    return {"account": public_account(account), "connection": connection}


@router.put("/account", dependencies=[Depends(write_access)])
async def configure_account(req: AccountConfig, tenant_id: str, db: Db):
    account = await account_for(db, tenant_id)
    if req.bot_id:
        await owned_bot(db, req.bot_id, tenant_id)
    if not account:
        if not req.bot_id:
            raise HTTPException(400, "Select an AI assistant first")
        account = WhatsAppAccount(tenant_id=tenant_id, bot_id=req.bot_id)
        db.add(account)
    else:
        account.revision += 1
        account.changed_at = now()
    if req.bot_id:
        account.bot_id = req.bot_id
    if req.paused is not None:
        account.paused = req.paused
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "An account already exists. Refresh and try again.")
    return public_account(account)


@router.post("/connect", dependencies=[Depends(write_access)])
async def connect(tenant_id: str, db: Db):
    account = await account_for(db, tenant_id)
    if not account:
        raise HTTPException(400, "Select and save an AI assistant first")
    account.connect_requested = True
    account.revision += 1
    account.changed_at = now()
    await db.commit()
    return await connector_request("POST", account.id, "/connect")


@router.post("/disconnect", dependencies=[Depends(write_access)])
async def disconnect(tenant_id: str, db: Db):
    account = await account_for(db, tenant_id)
    if not account:
        raise HTTPException(404, "Account not found")
    account.connect_requested = False
    account.revision += 1
    account.changed_at = now()
    await db.commit()
    # Saving the stop request also lets the connector reconcile after an outage.
    return await connector_request("POST", account.id, "/disconnect", required=False)


@router.post("/logout", dependencies=[Depends(write_access)])
async def logout(tenant_id: str, db: Db):
    account = await account_for(db, tenant_id)
    if not account:
        raise HTTPException(404, "Account not found")
    # Stop durable reconnect requests before removing credentials.
    account.connect_requested = False
    account.revision += 1
    account.changed_at = now()
    await db.execute(
        update(WhatsAppChat)
        .where(WhatsAppChat.account_id == account.id)
        .values(enabled=False, revision=WhatsAppChat.revision + 1, changed_at=now())
    )
    await db.commit()
    return await connector_request("POST", account.id, "/logout")


@router.get("/chats", dependencies=[Depends(read_access)])
async def list_chats(
    tenant_id: str,
    db: Db,
    search: str = Query(default="", max_length=200),
    enabled: bool | None = None,
):
    account = await account_for(db, tenant_id)
    if not account:
        return []
    stmt = select(WhatsAppChat).where(WhatsAppChat.account_id == account.id)
    if enabled is not None:
        stmt = stmt.where(WhatsAppChat.enabled == enabled)
    chats = (
        (await db.execute(stmt.order_by(
            case((func.trim(WhatsAppChat.name) == "", 1), else_=0),
            func.lower(WhatsAppChat.name), WhatsAppChat.phone, WhatsAppChat.id,
        )))
        .scalars()
        .all()
    )
    needle = search.casefold().strip()
    return [
        {
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
            "enabled": c.enabled,
            "last_message_at": c.last_message_at,
        }
        for c in chats
        if not needle or needle in f"{c.name} {c.phone or ''}".casefold()
    ]


@router.patch("/chats/{chat_id}", dependencies=[Depends(write_access)])
async def toggle_chat(chat_id: str, req: ChatToggle, tenant_id: str, db: Db):
    account = await account_for(db, tenant_id)
    chat = (
        await db.execute(
            select(WhatsAppChat).where(
                WhatsAppChat.id == chat_id,
                WhatsAppChat.account_id == (account.id if account else ""),
            )
        )
    ).scalar_one_or_none()
    if not chat:
        raise HTTPException(404, "Chat not found or access denied")
    if chat.enabled != req.enabled:
        chat.enabled = req.enabled
        chat.revision += 1
        chat.changed_at = now()
    await db.commit()
    return {"id": chat.id, "enabled": chat.enabled}


async def discover_chat(db, account_id, req):
    jids = list(dict.fromkeys(j for j in (req.jid, req.alternate_jid) if j))
    known = (
        (
            await db.execute(
                select(WhatsAppIdentity).where(
                    WhatsAppIdentity.account_id == account_id,
                    WhatsAppIdentity.jid.in_(jids),
                )
            )
        )
        .scalars()
        .all()
    )
    ids = list(dict.fromkeys(identity.chat_id for identity in known))
    chat = await db.get(WhatsAppChat, ids[0]) if ids else None
    if not chat:
        chat = WhatsAppChat(account_id=account_id, name=req.name)
        db.add(chat)
        await db.flush()
    # Preserve one chat across phone-number and privacy-ID representations.
    for duplicate_id in ids[1:]:
        duplicate = await db.get(WhatsAppChat, duplicate_id)
        # Conflicting saved choices resolve to off.
        chat.enabled = chat.enabled and duplicate.enabled
        chat.revision += 1
        chat.changed_at = now()
        if not chat.name:
            chat.name = duplicate.name
        chat.phone = chat.phone or duplicate.phone
        await db.execute(
            update(WhatsAppIdentity)
            .where(WhatsAppIdentity.chat_id == duplicate_id)
            .values(chat_id=chat.id)
        )
        await db.execute(
            update(WhatsAppReceipt)
            .where(WhatsAppReceipt.chat_id == duplicate_id)
            .values(chat_id=chat.id, status="cancelled")
        )
        await db.execute(delete(WhatsAppChat).where(WhatsAppChat.id == duplicate_id))
    if req.name.strip():
        chat.name = req.name.strip()
    for jid in jids:
        if jid.endswith("@s.whatsapp.net"):
            chat.phone = jid.split("@")[0]
        if not any(identity.jid == jid for identity in known):
            db.add(WhatsAppIdentity(account_id=account_id, chat_id=chat.id, jid=jid))
    await db.flush()
    return chat


@internal.get("/accounts")
async def requested_accounts(db: Db):
    accounts = (
        (
            await db.execute(
                select(WhatsAppAccount).where(WhatsAppAccount.connect_requested == True)
            )
        )
        .scalars()
        .all()
    )
    return [{"id": a.id} for a in accounts]


@internal.post("/accounts/{account_id}/chats")
async def sync_chats(account_id: str, req: ChatSync, db: Db):
    await internal_account(db, account_id)
    try:
        for item in req.chats:
            await discover_chat(db, account_id, item)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Chat sync changed concurrently; retry discovery")
    return {"ok": True}


@internal.get("/accounts/{account_id}/chats")
async def saved_contacts(account_id: str, db: Db):
    await internal_account(db, account_id)
    chats = (await db.execute(
        select(WhatsAppChat).where(WhatsAppChat.account_id == account_id)
    )).scalars().all()
    contacts = []
    for chat in chats:
        jids = [identity.jid for identity in chat.identities]
        phone_jid = next((jid for jid in jids if jid.endswith("@s.whatsapp.net")), None)
        lid_jid = next((jid for jid in jids if jid.endswith("@lid")), None)
        for jid in jids:
            alternate = phone_jid if jid.endswith("@lid") else lid_jid
            contacts.append({"jid": jid, "name": chat.name, "alternate_jid": alternate})
    return contacts


async def permitted(db, account, chat):
    bot = await owned_bot(db, account.bot_id, account.tenant_id)
    return (
        account.connect_requested
        and not account.paused
        and chat.enabled
        and bot.status == "active"
    )


@internal.post("/accounts/{account_id}/messages")
async def incoming_message(account_id: str, req: IncomingText, db: Db):
    account = await internal_account(db, account_id)
    try:
        chat = await discover_chat(db, account_id, req)
        chat.last_message_at = now()
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # A simultaneous discovery may have created this identity first.
        chat = await discover_chat(db, account_id, req)
        chat.last_message_at = now()
        await db.commit()
    # Only metadata is retained for disabled chats; their content never reaches the AI.
    received_at = (
        req.received_at.replace(tzinfo=timezone.utc)
        if req.received_at.tzinfo is None
        else req.received_at
    )
    received_at = received_at.astimezone(timezone.utc).replace(tzinfo=None)
    # Invalidate queued incoming work after a selection changes, even off then on.
    if (
        account.changed_at > received_at
        or chat.changed_at > received_at
        or not await permitted(db, account, chat)
    ):
        return {"action": "skip"}
    receipt = WhatsAppReceipt(
        account_id=account.id,
        chat_id=chat.id,
        message_id=req.message_id,
        account_revision=account.revision,
        chat_revision=chat.revision,
    )
    db.add(receipt)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return {"action": "duplicate"}
    bot = await owned_bot(db, account.bot_id, account.tenant_id)
    session_id = f"whatsapp:{account.id}:{chat.id}"
    conversation = (
        (
            await db.execute(
                select(Conversation).where(
                    Conversation.tenant_id == account.tenant_id,
                    Conversation.bot_id == bot.id,
                    Conversation.visitor_session_id == session_id,
                )
            )
        )
        .scalars()
        .first()
    )
    if not conversation:
        conversation = Conversation(
            tenant_id=account.tenant_id,
            bot_id=bot.id,
            visitor_session_id=session_id,
            visitor_name=chat.name or chat.phone or "WhatsApp contact",
            visitor_phone=chat.phone,
            channel="whatsapp",
        )
        db.add(conversation)
        await db.flush()
    receipt.conversation_id = conversation.id
    db.add(
        Message(
            tenant_id=account.tenant_id,
            conversation_id=conversation.id,
            sender="visitor",
            text_content=req.text,
        )
    )
    await db.commit()
    receipt_id = receipt.id
    try:
        parts = []
        final_answer = None
        async for event in stream_grounded_answer(
            db,
            bot,
            req.text,
            conversation.id,
            channel="whatsapp",
            persist_response=False,
        ):
            if event["type"] == "chunk":
                parts.append(event["text"])
            elif event["type"] == "done":
                final_answer = event.get("answer")
                receipt.citations_json = event.get("citations", [])
                receipt.fallback_triggered = event.get("fallback_triggered", False)
        receipt.reply = (final_answer if final_answer is not None else "".join(parts)).strip()
        receipt.status = "generated" if receipt.reply else "failed"
        await db.commit()
    except Exception:
        logger.exception("WhatsApp reply generation failed for receipt %s", receipt_id)
        await db.rollback()
        receipt = await db.get(WhatsAppReceipt, receipt_id)
        receipt.status = "failed"
        await db.commit()
        raise HTTPException(503, "Could not generate a reply")
    return {
        "action": "reply" if receipt.reply else "skip",
        "receipt_id": receipt.id,
        "text": receipt.reply,
    }


@internal.post("/accounts/{account_id}/receipts/{receipt_id}/authorize")
async def authorize_send(account_id: str, receipt_id: str, db: Db):
    # A single claim prevents duplicate sends, including after a connector restart.
    account = await internal_account(db, account_id)
    receipt = (
        await db.execute(
            select(WhatsAppReceipt).where(
                WhatsAppReceipt.id == receipt_id,
                WhatsAppReceipt.account_id == account_id,
            )
        )
    ).scalar_one_or_none()
    if not receipt:
        raise HTTPException(404, "Receipt not found")
    chat = await db.get(WhatsAppChat, receipt.chat_id)
    allowed = (
        receipt.status == "generated"
        and receipt.created_at > now() - timedelta(minutes=2)
        and account.revision == receipt.account_revision
        and chat.revision == receipt.chat_revision
        and await permitted(db, account, chat)
    )
    if not allowed:
        if receipt.status == "generated":
            receipt.status = "cancelled"
            await db.commit()
        return {"allowed": False}
    result = await db.execute(
        update(WhatsAppReceipt)
        .where(
            WhatsAppReceipt.id == receipt.id,
            WhatsAppReceipt.status == "generated",
            exists(
                select(WhatsAppAccount.id).where(
                    WhatsAppAccount.id == account.id,
                    WhatsAppAccount.revision == receipt.account_revision,
                    WhatsAppAccount.connect_requested == True,
                    WhatsAppAccount.paused == False,
                )
            ),
            exists(
                select(WhatsAppChat.id).where(
                    WhatsAppChat.id == chat.id,
                    WhatsAppChat.revision == receipt.chat_revision,
                    WhatsAppChat.enabled == True,
                )
            ),
            exists(
                select(Bot.id).where(Bot.id == account.bot_id, Bot.status == "active")
            ),
        )
        .values(status="sending")
    )
    await db.commit()
    return {"allowed": result.rowcount == 1}


@internal.post("/accounts/{account_id}/receipts/{receipt_id}/delivery")
async def delivery(account_id: str, receipt_id: str, req: DeliveryResult, db: Db):
    account = await internal_account(db, account_id)
    result = await db.execute(
        update(WhatsAppReceipt)
        .where(
            WhatsAppReceipt.id == receipt_id,
            WhatsAppReceipt.account_id == account.id,
            WhatsAppReceipt.status == "sending",
        )
        .values(status="sent" if req.sent else "failed")
        .returning(WhatsAppReceipt)
    )
    receipt = result.scalar_one_or_none()
    if receipt and req.sent:
        db.add(
            Message(
                tenant_id=account.tenant_id,
                conversation_id=receipt.conversation_id,
                sender="bot",
                text_content=receipt.reply,
                citations_json=receipt.citations_json,
                fallback_triggered=receipt.fallback_triggered,
            )
        )
    await db.commit()
    return {"ok": True}


router.include_router(internal)
