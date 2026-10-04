from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TenantMember, require_tenant_access
from app.models.models import Bot, Conversation, Handoff, KnowledgeSource, Lead, Message

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

class DashboardOverviewResponse(BaseModel):
    total_conversations: int
    unique_visitors: int
    total_leads: int
    lead_conversion_rate: float
    quote_requests: int
    sales_opportunities: int
    total_handoffs: int
    unanswered_questions: int
    fallback_rate: float
    avg_response_time_seconds: float
    product_enquiries: int
class ConversationResponse(BaseModel):
    channel: str = "widget"
    id: str
    bot_id: str
    visitor_session_id: str
    visitor_name: str | None = None
    status: str
    created_at: datetime

class MessageResponse(BaseModel):
    id: str
    sender: str
    text_content: str
    fallback_triggered: bool
    created_at: datetime

class LeadResponse(BaseModel):
    id: str
    name: str | None
    company: str | None = None
    email: str | None
    phone: str | None
    interested_product: str | None = None
    requirement: str | None = None
    location: str | None = None
    estimated_quantity: str | None = None
    purchase_timeline: str | None = None
    status: str
    source: str
    query: str | None
    created_at: datetime

class UnansweredQuestionResponse(BaseModel):
    id: str
    conversation_id: str
    text_content: str
    created_at: datetime

async def _verify_bot_access(db: AsyncSession, bot_id: str, tenant_id: str) -> Bot:
    stmt = select(Bot).where(Bot.id == bot_id, Bot.tenant_id == tenant_id)
    bot = (await db.execute(stmt)).scalar_one_or_none()
    if not bot:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Bot not found or access denied")
    return bot

@router.get("/{bot_id}/overview", response_model=DashboardOverviewResponse)
async def get_dashboard_overview(
    bot_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    # Total conversations
    c_stmt = select(func.count(Conversation.id)).where(
        Conversation.bot_id == bot_id, 
        Conversation.tenant_id == tenant_id
    )
    total_conversations = (await db.execute(c_stmt)).scalar() or 0

    # Total fallback messages
    f_stmt = select(func.count(Message.id)).join(Conversation).where(
        Conversation.bot_id == bot_id,
        Conversation.tenant_id == tenant_id,
        Message.fallback_triggered == True
    )
    total_fallbacks = (await db.execute(f_stmt)).scalar() or 0

    # Total handoffs
    h_stmt = select(func.count(Handoff.id)).where(
        Handoff.bot_id == bot_id,
        Handoff.tenant_id == tenant_id
    )
    total_handoffs = (await db.execute(h_stmt)).scalar() or 0

    # Total leads collected
    l_stmt = select(func.count(Lead.id)).where(
        Lead.bot_id == bot_id,
        Lead.tenant_id == tenant_id
    )
    total_leads = (await db.execute(l_stmt)).scalar() or 0

    # Total knowledge sources
    s_stmt = select(func.count(KnowledgeSource.id)).where(
        KnowledgeSource.bot_id == bot_id,
        KnowledgeSource.tenant_id == tenant_id
    )
    total_sources = (await db.execute(s_stmt)).scalar() or 0

    # Total knowledge sources (keeping for internal use)
    s_stmt = select(func.count(KnowledgeSource.id)).where(
        KnowledgeSource.bot_id == bot_id,
        KnowledgeSource.tenant_id == tenant_id
    )
    total_sources = (await db.execute(s_stmt)).scalar() or 0

    # Unanswered questions (Escalated conversations' last user messages)
    uq_stmt = select(func.count(Message.id)).join(Conversation).where(
        Conversation.bot_id == bot_id,
        Conversation.tenant_id == tenant_id,
        Conversation.status == "escalated",
        Message.sender == "visitor"
    )
    unanswered_questions = (await db.execute(uq_stmt)).scalar() or 0

    # Real metrics without fake multipliers
    unique_visitors = total_conversations
    lead_conversion_rate = round((total_leads / max(1, total_conversations)) * 100, 1)
    
    # Query leads for specifics
    l_full_stmt = select(Lead).where(Lead.bot_id == bot_id, Lead.tenant_id == tenant_id)
    leads = (await db.execute(l_full_stmt)).scalars().all()
    
    quote_requests = sum(1 for l in leads if l.status in ["Qualified", "Quotation Sent", "Won"])
    sales_opportunities = len(leads) # Anyone who gives contact is an opp
    product_enquiries = sum(1 for l in leads if l.interested_product)

    return {
        "total_conversations": total_conversations,
        "unique_visitors": unique_visitors,
        "total_leads": total_leads,
        "lead_conversion_rate": lead_conversion_rate,
        "quote_requests": quote_requests,
        "sales_opportunities": sales_opportunities,
        "total_handoffs": total_handoffs,
        "unanswered_questions": unanswered_questions,
        "fallback_rate": round((total_fallbacks / max(1, total_conversations)) * 100, 1),
        "avg_response_time_seconds": 0.0,
        "product_enquiries": product_enquiries
    }

@router.get("/{bot_id}/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    bot_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    stmt = select(Conversation).where(
        Conversation.bot_id == bot_id,
        Conversation.tenant_id == tenant_id
    ).order_by(Conversation.created_at.desc())
    convs = (await db.execute(stmt)).scalars().all()
    return convs

@router.get("/{bot_id}/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    bot_id: str,
    conversation_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    stmt = select(Message).where(
        Message.conversation_id == conversation_id,
        Message.tenant_id == tenant_id
    ).order_by(Message.created_at.asc())
    msgs = (await db.execute(stmt)).scalars().all()
    return msgs

class FunnelStage(BaseModel):
    name: str
    count: int
    percentage: float
    change: str

@router.get("/{bot_id}/funnel", response_model=list[FunnelStage])
async def get_analytics_funnel(
    bot_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    
    # 1. Total conversations (Chats started)
    c_stmt = select(func.count(Conversation.id)).where(
        Conversation.bot_id == bot_id, Conversation.tenant_id == tenant_id
    )
    chats_started = (await db.execute(c_stmt)).scalar() or 0
    visitors = chats_started
    
    # Total Leads
    l_stmt = select(Lead).where(Lead.bot_id == bot_id, Lead.tenant_id == tenant_id)
    leads = (await db.execute(l_stmt)).scalars().all()
    
    requirement_captured = sum(1 for l in leads if l.requirement or l.query)
    product_selected = sum(1 for l in leads if l.interested_product)
    contact_collected = sum(1 for l in leads if l.email or l.phone)
    quote_requested = sum(1 for l in leads if l.status in ["Qualified", "Quotation Sent", "Won"])
    converted = sum(1 for l in leads if l.status == "Won")
    
    def calc_pct(count, total):
        if total == 0: return 0.0
        return round((count / total) * 100, 1)

    return [
        {"name": "Visitors", "count": visitors, "percentage": 100.0, "change": "0%"},
        {"name": "Chats started", "count": chats_started, "percentage": calc_pct(chats_started, visitors), "change": "0%"},
        {"name": "Requirement captured", "count": requirement_captured, "percentage": calc_pct(requirement_captured, chats_started), "change": "0%"},
        {"name": "Product/service selected", "count": product_selected, "percentage": calc_pct(product_selected, chats_started), "change": "0%"},
        {"name": "Contact info collected", "count": contact_collected, "percentage": calc_pct(contact_collected, chats_started), "change": "0%"},
        {"name": "Quote/demo requested", "count": quote_requested, "percentage": calc_pct(quote_requested, chats_started), "change": "0%"},
        {"name": "Converted lead", "count": converted, "percentage": calc_pct(converted, chats_started), "change": "0%"},
    ]

@router.get("/{bot_id}/leads", response_model=list[LeadResponse])
async def list_leads(
    bot_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    stmt = select(Lead).where(
        Lead.bot_id == bot_id,
        Lead.tenant_id == tenant_id
    ).order_by(Lead.created_at.desc())
    leads = (await db.execute(stmt)).scalars().all()
    return leads

@router.get("/{bot_id}/unanswered-questions", response_model=list[UnansweredQuestionResponse])
async def list_unanswered_questions(
    bot_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    
    # We define unanswered questions as visitor messages that immediately preceded a bot fallback
    # For MVP simplicity, we just fetch user messages in conversations that were escalated
    stmt = select(Message).join(Conversation).where(
        Conversation.bot_id == bot_id,
        Conversation.tenant_id == tenant_id,
        Conversation.status == "escalated",
        Message.sender == "visitor"
    ).order_by(Message.created_at.desc()).limit(50)
    
    msgs = (await db.execute(stmt)).scalars().all()
    return msgs
