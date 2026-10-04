from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_tenant_access
from app.models.models import AllowedDomain, Bot, TenantMember

router = APIRouter(prefix="/bots", tags=["Bots"])

class BotResponse(BaseModel):
    id: str
    tenant_id: str
    public_key: str
    name: str
    status: str
    system_prompt: str | None = None
    greeting_message: str | None = None
    theme_color: str | None = None
    primary_language: str | None = None
    escalation_whatsapp: str | None = None
    escalation_email: str | None = None
    escalation_phone: str | None = None
    escalation_booking: str | None = None
    confidence_threshold: float
    sales_instructions: str | None = None
    response_length_limit: str | None = None
    lead_qualification_questions: str | None = None
    human_handoff_rules: str | None = None
    business_hours: str | None = None
    fallback_message: str | None = None

class BotCreateRequest(BaseModel):
    name: str
    greeting_message: str | None = "Hello! How can I help you today?"
    theme_color: str | None = "#4F46E5"

class BotUpdateRequest(BaseModel):
    name: str | None = None
    status: str | None = None
    system_prompt: str | None = None
    greeting_message: str | None = None
    theme_color: str | None = None
    primary_language: str | None = None
    escalation_whatsapp: str | None = None
    escalation_email: str | None = None
    escalation_phone: str | None = None
    escalation_booking: str | None = None
    confidence_threshold: float | None = None
    sales_instructions: str | None = None
    response_length_limit: str | None = None
    lead_qualification_questions: str | None = None
    human_handoff_rules: str | None = None
    business_hours: str | None = None
    fallback_message: str | None = None

class DomainCreateRequest(BaseModel):
    domain: str

class DomainResponse(BaseModel):
    id: str
    domain: str

@router.get("", response_model=list[BotResponse])
async def list_bots(
    tenant_id: str = Query(..., description="Tenant ID to authorize access"),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Bot).where(Bot.tenant_id == tenant_id)
    bots = (await db.execute(stmt)).scalars().all()
    return bots

@router.post("", response_model=BotResponse)
async def create_bot(
    req: BotCreateRequest,
    tenant_id: str = Query(..., description="Tenant ID to authorize access"),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    bot = Bot(
        tenant_id=tenant_id,
        name=req.name,
        greeting_message=req.greeting_message,
        theme_color=req.theme_color
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)
    return bot

@router.get("/{bot_id}", response_model=BotResponse)
async def get_bot(
    bot_id: str,
    tenant_id: str = Query(..., description="Tenant ID to authorize access"),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Bot).where(Bot.id == bot_id, Bot.tenant_id == tenant_id)
    bot = (await db.execute(stmt)).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@router.put("/{bot_id}", response_model=BotResponse)
async def update_bot(
    bot_id: str,
    req: BotUpdateRequest,
    tenant_id: str = Query(..., description="Tenant ID to authorize access"),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Bot).where(Bot.id == bot_id, Bot.tenant_id == tenant_id)
    bot = (await db.execute(stmt)).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(bot, field, value)

    await db.commit()
    await db.refresh(bot)
    return bot

@router.post("/{bot_id}/domains", response_model=DomainResponse)
async def add_allowed_domain(
    bot_id: str,
    req: DomainCreateRequest,
    tenant_id: str = Query(..., description="Tenant ID to authorize access"),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    # Verify bot access
    stmt = select(Bot).where(Bot.id == bot_id, Bot.tenant_id == tenant_id)
    bot = (await db.execute(stmt)).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    # Sanitize the domain to only save the hostname
    raw_domain = req.domain.strip().lower()
    if not raw_domain.startswith("http"):
        raw_domain = "http://" + raw_domain
    clean_domain = urlparse(raw_domain).netloc.split(":")[0]
    
    if not clean_domain:
        raise HTTPException(status_code=400, detail="Invalid domain format")
        
    # Check if domain already exists
    ad_stmt = select(AllowedDomain).where(
        AllowedDomain.bot_id == bot_id, 
        AllowedDomain.domain == clean_domain
    )
    existing = (await db.execute(ad_stmt)).scalar_one_or_none()
    if existing:
        return existing
        
    domain = AllowedDomain(
        bot_id=bot_id,
        domain=clean_domain
    )
    db.add(domain)
    await db.commit()
    await db.refresh(domain)
    return domain

@router.get("/{bot_id}/domains", response_model=list[DomainResponse])
async def list_allowed_domains(
    bot_id: str,
    tenant_id: str = Query(..., description="Tenant ID to authorize access"),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Bot).where(Bot.id == bot_id, Bot.tenant_id == tenant_id)
    bot = (await db.execute(stmt)).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    ad_stmt = select(AllowedDomain).where(AllowedDomain.bot_id == bot_id)
    domains = (await db.execute(ad_stmt)).scalars().all()
    return domains

@router.delete("/{bot_id}/domains/{domain_id}")
async def remove_allowed_domain(
    bot_id: str,
    domain_id: str,
    tenant_id: str = Query(..., description="Tenant ID to authorize access"),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    # Verify bot access
    stmt = select(Bot).where(Bot.id == bot_id, Bot.tenant_id == tenant_id)
    bot = (await db.execute(stmt)).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    ad_stmt = select(AllowedDomain).where(
        AllowedDomain.id == domain_id,
        AllowedDomain.bot_id == bot_id
    )
    domain = (await db.execute(ad_stmt)).scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=404, detail="Allowed domain not found")
        
    await db.delete(domain)
    await db.commit()
    return {"message": "Allowed domain removed"}
