import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_visitor_session
from app.models.models import Bot, Conversation, Lead, Message
from app.services.rag_engine import stream_grounded_answer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat Engine"])

class ChatQueryRequest(BaseModel):
    message: str
    visitor_name: str | None = None
    visitor_email: str | None = None
    visitor_phone: str | None = None

class LeadSubmitRequest(BaseModel):
    conversation_id: str
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    query: str | None = None

@router.post("/query")
async def query_chat(
    req: ChatQueryRequest, 
    request: Request,
    visitor_session: dict = Depends(get_visitor_session),
    db: AsyncSession = Depends(get_db)
):
    """Main RAG query endpoint for embeddable chatbot widget (Streams SSE)."""
    bot_id = visitor_session["bot_id"]
    tenant_id = visitor_session["tenant_id"]
    session_id = visitor_session["visitor_session_id"]
    
    # Rate Limiting via Redis
    redis = request.app.state.redis
    if redis:
        rate_key = f"rate_limit:chat:{bot_id}:{session_id}"
        requests = await redis.incr(rate_key)
        if requests == 1:
            await redis.expire(rate_key, 60)
        elif requests > settings.RATE_LIMIT_PER_MINUTE:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # Verify bot exists
    b_stmt = select(Bot).where(Bot.id == bot_id, Bot.tenant_id == tenant_id)
    bot = (await db.execute(b_stmt)).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # Get or create conversation session
    c_stmt = select(Conversation).where(
        Conversation.bot_id == bot_id,
        Conversation.tenant_id == tenant_id,
        Conversation.visitor_session_id == session_id
    )
    conversation = (await db.execute(c_stmt)).scalars().first()

    if not conversation:
        conversation = Conversation(
            tenant_id=tenant_id,
            bot_id=bot_id,
            visitor_session_id=session_id,
            visitor_name=req.visitor_name,
            visitor_email=req.visitor_email,
            visitor_phone=req.visitor_phone,
            status="active"
        )
        db.add(conversation)
        await db.flush()

    # Save User Message
    user_msg = Message(
        tenant_id=tenant_id,
        conversation_id=conversation.id,
        sender="visitor",
        text_content=req.message
    )
    db.add(user_msg)
    await db.commit()

    # Stream Response Generator
    async def event_generator():
        try:
            async for chunk in stream_grounded_answer(db, bot, req.message, conversation.id):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            request_id = str(uuid.uuid4())
            logger.error(f"SSE Streaming error [Request ID: {request_id}]: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': f'An internal error occurred. Please contact support. Request ID: {request_id}'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/lead")
async def submit_lead(
    req: LeadSubmitRequest, 
    visitor_session: dict = Depends(get_visitor_session),
    db: AsyncSession = Depends(get_db)
):
    """Saves visitor contact info for human handoff."""
    bot_id = visitor_session["bot_id"]
    tenant_id = visitor_session["tenant_id"]

    # Verify conversation ownership
    stmt = select(Conversation).where(
        Conversation.id == req.conversation_id,
        Conversation.bot_id == bot_id,
        Conversation.tenant_id == tenant_id
    )
    conversation = (await db.execute(stmt)).scalar_one_or_none()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found or access denied")

    lead = Lead(
        tenant_id=tenant_id,
        bot_id=bot_id,
        conversation_id=req.conversation_id,
        name=req.name,
        email=req.email,
        phone=req.phone,
        query=req.query
    )
    db.add(lead)
    await db.commit()
    return {"message": "Lead details saved successfully"}
