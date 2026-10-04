import os
import re
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import TenantMember, require_tenant_access
from app.models.models import Bot, KnowledgeSource
from app.workers.ingestion_worker import enqueue_ingestion_job

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])

class URLIngestRequest(BaseModel):
    url: str

class FAQIngestRequest(BaseModel):
    question: str
    answer: str

ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "md"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown"
}

def sanitize_filename(filename: str) -> str:
    # Keep only alphanumeric, dots, dashes, and underscores
    return re.sub(r'[^a-zA-Z0-9.\-_]', '_', filename)

async def _verify_bot_access(db: AsyncSession, bot_id: str, tenant_id: str) -> Bot:
    stmt = select(Bot).where(Bot.id == bot_id, Bot.tenant_id == tenant_id)
    bot = (await db.execute(stmt)).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found or access denied")
    return bot

@router.get("/{bot_id}/sources")
async def list_sources(
    bot_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    stmt = select(KnowledgeSource).where(
        KnowledgeSource.bot_id == bot_id, 
        KnowledgeSource.tenant_id == tenant_id
    ).order_by(KnowledgeSource.created_at.desc())
    docs = (await db.execute(stmt)).scalars().all()
    return docs

@router.get("/{bot_id}/sources/{source_id}")
async def get_source(
    bot_id: str,
    source_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent", "viewer"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    stmt = select(KnowledgeSource).where(
        KnowledgeSource.id == source_id,
        KnowledgeSource.bot_id == bot_id, 
        KnowledgeSource.tenant_id == tenant_id
    )
    source = (await db.execute(stmt)).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source

@router.post("/{bot_id}/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    bot_id: str,
    tenant_id: str = Query(...),
    file: UploadFile = File(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)

    # Validate file type and extension
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {ALLOWED_EXTENSIONS}")

    # Validate size limit (naive check by reading to memory buffer first, or relying on FastAPI limits if configured globally)
    file.file.seek(0, 2)
    size_mb = file.file.tell() / (1024 * 1024)
    file.file.seek(0)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(status_code=400, detail=f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB}MB")

    safe_filename = sanitize_filename(file.filename)
    
    # Save file locally for the worker (Abstract storage later)
    upload_dir = os.path.join(os.getcwd(), "uploads", tenant_id, bot_id)
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, safe_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    source = KnowledgeSource(
        tenant_id=tenant_id,
        bot_id=bot_id,
        title=safe_filename,
        source_type=ext,
        status="queued",
        file_path_or_url=file_path
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    await enqueue_ingestion_job(source.id, settings.REDIS_URL)
    return {"message": "Upload queued", "source_id": source.id}

@router.post("/{bot_id}/ingest-url", status_code=status.HTTP_202_ACCEPTED)
async def ingest_url(
    bot_id: str,
    req: URLIngestRequest,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)

    source = KnowledgeSource(
        tenant_id=tenant_id,
        bot_id=bot_id,
        title=req.url,
        source_type="url",
        status="queued",
        file_path_or_url=req.url
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    await enqueue_ingestion_job(source.id, settings.REDIS_URL)
    return {"message": "URL ingest queued", "source_id": source.id}

@router.post("/{bot_id}/faq", status_code=status.HTTP_202_ACCEPTED)
async def add_faq(
    bot_id: str,
    req: FAQIngestRequest,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin", "agent"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)

    faq_text = f"Q: {req.question}\nA: {req.answer}"
    
    source = KnowledgeSource(
        tenant_id=tenant_id,
        bot_id=bot_id,
        title=f"FAQ: {req.question[:30]}...",
        source_type="faq",
        status="queued",
        file_path_or_url=faq_text
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    await enqueue_ingestion_job(source.id, settings.REDIS_URL)
    return {"message": "FAQ ingest queued", "source_id": source.id}

@router.post("/{bot_id}/sources/{source_id}/reprocess", status_code=status.HTTP_202_ACCEPTED)
async def reprocess_source(
    bot_id: str,
    source_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    
    stmt = select(KnowledgeSource).where(
        KnowledgeSource.id == source_id,
        KnowledgeSource.bot_id == bot_id,
        KnowledgeSource.tenant_id == tenant_id
    )
    source = (await db.execute(stmt)).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
        
    source.status = "queued"
    source.error_message = None
    source.version += 1
    
    await db.commit()
    await db.refresh(source)
    
    await enqueue_ingestion_job(source.id, settings.REDIS_URL)
    return {"message": "Reprocessing queued", "source_id": source.id}

@router.delete("/{bot_id}/sources/{source_id}")
async def delete_source(
    bot_id: str,
    source_id: str,
    tenant_id: str = Query(...),
    member: TenantMember = Depends(require_tenant_access(["owner", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    await _verify_bot_access(db, bot_id, tenant_id)
    
    stmt = select(KnowledgeSource).where(
        KnowledgeSource.id == source_id,
        KnowledgeSource.bot_id == bot_id,
        KnowledgeSource.tenant_id == tenant_id
    )
    source = (await db.execute(stmt)).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    await db.delete(source)
    await db.commit()
    return {"message": "Source deleted"}
