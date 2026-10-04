import ipaddress
import os
import socket
from urllib.parse import urlparse

from arq import create_pool
from arq.connections import RedisSettings
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.models import DocumentChunk, KnowledgeSource
from app.services.document_parser import (
    chunk_text,
    parse_file_content,
    parse_url_content,
)
from app.services.embedding import get_text_embedding


def is_valid_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ["http", "https"]:
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
            
        # Basic SSRF prevention: resolve IP and check if private
        try:
            # We must get all resolved IPs in case DNS returns multiple A/AAAA records
            addr_info = socket.getaddrinfo(hostname, 80, proto=socket.IPPROTO_TCP)
        except socket.gaierror:
            return False
            
        for addr in addr_info:
            ip = addr[4][0]
            ip_obj = ipaddress.ip_address(ip)
            
            # Block private, loopback, link-local, reserved, multicast, unspecified
            if (ip_obj.is_private or ip_obj.is_loopback or 
                ip_obj.is_link_local or ip_obj.is_multicast or 
                ip_obj.is_reserved or ip_obj.is_unspecified):
                return False
            
            # Catch additional IPv4 mapped IPv6 addresses
            if getattr(ip_obj, "ipv4_mapped", None):
                mapped_v4 = ip_obj.ipv4_mapped
                if (mapped_v4.is_private or mapped_v4.is_loopback or 
                    mapped_v4.is_link_local or mapped_v4.is_multicast or 
                    mapped_v4.is_reserved or mapped_v4.is_unspecified):
                    return False
            
        return True
    except Exception:
        return False

async def process_knowledge_source(ctx, source_id: str):
    """ARQ Worker function to process a knowledge source idempotently."""
    async with AsyncSessionLocal() as db:
        stmt = select(KnowledgeSource).where(KnowledgeSource.id == source_id)
        source = (await db.execute(stmt)).scalar_one_or_none()
        
        if not source:
            return "Source not found"
            
        source.status = "processing"
        source.error_message = None
        await db.commit()

        try:
            chunks = []
            if source.source_type == "url":
                if not is_valid_url(source.file_path_or_url):
                    raise ValueError("Invalid, unreachable, or forbidden URL provided.")
                chunks = await parse_url_content(source.file_path_or_url)
            elif source.source_type == "faq":
                chunks = chunk_text(source.file_path_or_url)
            else:
                # File upload
                file_path = source.file_path_or_url
                if not os.path.exists(file_path):
                    raise ValueError(f"File not found on disk: {file_path}")
                with open(file_path, "rb") as f:
                    content = f.read()
                chunks = await parse_file_content(os.path.basename(file_path), content)

            # Idempotency: Delete any existing chunks for this source (e.g. from a /reprocess call or previous partial failure)
            del_stmt = delete(DocumentChunk).where(DocumentChunk.knowledge_source_id == source.id)
            await db.execute(del_stmt)
            await db.commit()

            source.chunk_count = len(chunks)
            await db.commit()

            # Process Embeddings
            for idx, text in enumerate(chunks):
                emb = await get_text_embedding(text)
                chunk_record = DocumentChunk(
                    tenant_id=source.tenant_id,
                    knowledge_source_id=source.id,
                    bot_id=source.bot_id,
                    chunk_index=idx,
                    text_content=text,
                    embedding=emb
                )
                db.add(chunk_record)

            source.status = "ready"
            await db.commit()
            
        except BaseException as e:
            await db.rollback()
            source.status = "failed"
            source.error_message = str(e)
            await db.commit()
            raise e

async def enqueue_ingestion_job(source_id: str, redis_url: str):
    redis_settings = RedisSettings.from_dsn(redis_url)
    redis = await create_pool(redis_settings)
    await redis.enqueue_job("process_knowledge_source", source_id)

class WorkerSettings:
    functions = [process_knowledge_source]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    job_timeout = 3600  # 1 hour timeout for slow free AI models
