import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.config import settings
from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    memberships = relationship("TenantMember", back_populates="user", cascade="all, delete-orphan")

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    plan_tier = Column(String, default="free")  # free, starter, pro
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    members = relationship("TenantMember", back_populates="tenant", cascade="all, delete-orphan")
    bots = relationship("Bot", back_populates="tenant", cascade="all, delete-orphan")

class TenantMember(Base):
    __tablename__ = "tenant_members"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, default="owner")  # owner, admin, agent, viewer
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    tenant = relationship("Tenant", back_populates="members")
    user = relationship("User", back_populates="memberships")

class AllowedDomain(Base):
    __tablename__ = "allowed_domains"
    id = Column(String, primary_key=True, default=generate_uuid)
    bot_id = Column(String, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True)
    domain = Column(String, nullable=False)  # e.g. "example.com"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    bot = relationship("Bot", back_populates="allowed_domains")

class Bot(Base):
    __tablename__ = "bots"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    public_key = Column(String, unique=True, index=True, default=generate_uuid) # Used for widget embedding
    name = Column(String, nullable=False, default="Support AI Assistant")
    status = Column(String, default="active") # active, inactive
    system_prompt = Column(Text, nullable=True)
    greeting_message = Column(Text, default="Hello! How can I help you today?")
    theme_color = Column(String, default="#4F46E5")
    primary_language = Column(String, default="en")
    
    # AI Configuration (PRD)
    sales_instructions = Column(Text, nullable=True)
    response_length_limit = Column(String, nullable=True, default="under 30 words")
    lead_qualification_questions = Column(Text, nullable=True)
    human_handoff_rules = Column(Text, nullable=True)
    business_hours = Column(String, nullable=True)
    fallback_message = Column(Text, nullable=True, default="I'm sorry, I cannot help with that right now. Can I connect you to a human?")
    
    # Escalation Channels
    escalation_whatsapp = Column(String, nullable=True)
    escalation_email = Column(String, nullable=True)
    escalation_phone = Column(String, nullable=True)
    escalation_booking = Column(String, nullable=True)
    
    confidence_threshold = Column(Float, default=0.20)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    tenant = relationship("Tenant", back_populates="bots")
    allowed_domains = relationship("AllowedDomain", back_populates="bot", cascade="all, delete-orphan")
    knowledge_sources = relationship("KnowledgeSource", back_populates="bot", cascade="all, delete-orphan")
    chunks = relationship("DocumentChunk", back_populates="bot", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="bot", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="bot", cascade="all, delete-orphan")

class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bot_id = Column(String, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    source_type = Column(String, nullable=False)  # pdf, docx, faq, url, txt
    status = Column(String, default="queued")      # queued, processing, ready, failed
    error_message = Column(Text, nullable=True)
    chunk_count = Column(Integer, default=0)
    version = Column(Integer, default=1)
    file_path_or_url = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    bot = relationship("Bot", back_populates="knowledge_sources")
    chunks = relationship("DocumentChunk", back_populates="knowledge_source", cascade="all, delete-orphan")

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    knowledge_source_id = Column(String, ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    bot_id = Column(String, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    text_content = Column(Text, nullable=False)
    embedding = Column(Vector(settings.EMBEDDING_DIMENSIONS), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    knowledge_source = relationship("KnowledgeSource", back_populates="chunks")
    bot = relationship("Bot", back_populates="chunks")

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bot_id = Column(String, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True)
    visitor_session_id = Column(String, index=True, nullable=False)
    visitor_name = Column(String, nullable=True)
    visitor_email = Column(String, nullable=True)
    visitor_phone = Column(String, nullable=True)
    status = Column(String, default="active")  # active, escalated, closed
    channel = Column(String, nullable=False, default="widget", server_default="widget")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    bot = relationship("Bot", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="conversation", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender = Column(String, nullable=False)  # visitor, bot, system
    text_content = Column(Text, nullable=False)
    citations_json = Column(JSON, nullable=True)
    fallback_triggered = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    conversation = relationship("Conversation", back_populates="messages")

class Lead(Base):
    __tablename__ = "leads"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bot_id = Column(String, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=True)
    company = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True) # WhatsApp/Mobile
    
    interested_product = Column(String, nullable=True)
    requirement = Column(Text, nullable=True) # Replaces/extends query
    location = Column(String, nullable=True)
    estimated_quantity = Column(String, nullable=True)
    purchase_timeline = Column(String, nullable=True)
    
    status = Column(String, default="New") # New, Contacted, Qualified, Quotation Sent, Won, Lost
    source = Column(String, default="Chatbot")
    
    query = Column(Text, nullable=True) # Keeping for backwards compatibility
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    bot = relationship("Bot", back_populates="leads")
    conversation = relationship("Conversation", back_populates="leads")

class Handoff(Base):
    __tablename__ = "handoffs"
    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bot_id = Column(String, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String, nullable=False) # whatsapp, email, phone, booking
    reason = Column(String, nullable=True) # AI failure, explicitly requested, low confidence
    status = Column(String, default="pending") # pending, resolved
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

class UsageEvent(Base):
    __tablename__ = "usage_events"
    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bot_id = Column(String, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String, nullable=False) # chat_message, embedding
    tokens_input = Column(Integer, default=0)
    tokens_output = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class WhatsAppAccount(Base):
    __tablename__ = "whatsapp_accounts"
    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    bot_id = Column(String, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False)
    connect_requested = Column(Boolean, nullable=False, default=False)
    paused = Column(Boolean, nullable=False, default=False)
    revision = Column(Integer, nullable=False, default=0)
    changed_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class WhatsAppChat(Base):
    __tablename__ = "whatsapp_chats"
    id = Column(String, primary_key=True, default=generate_uuid)
    account_id = Column(String, ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False, default="")
    phone = Column(String, nullable=True)
    enabled = Column(Boolean, nullable=False, default=False)
    revision = Column(Integer, nullable=False, default=0)
    changed_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    last_message_at = Column(DateTime, nullable=True)
    identities = relationship("WhatsAppIdentity", cascade="all, delete-orphan", lazy="selectin")


class WhatsAppIdentity(Base):
    __tablename__ = "whatsapp_identities"
    __table_args__ = (UniqueConstraint("account_id", "jid", name="uq_whatsapp_identity"),)
    id = Column(String, primary_key=True, default=generate_uuid)
    account_id = Column(String, ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"), nullable=False)
    chat_id = Column(String, ForeignKey("whatsapp_chats.id", ondelete="CASCADE"), nullable=False, index=True)
    jid = Column(String, nullable=False)


class WhatsAppReceipt(Base):
    __tablename__ = "whatsapp_receipts"
    __table_args__ = (UniqueConstraint("account_id", "message_id", name="uq_whatsapp_message"),)
    id = Column(String, primary_key=True, default=generate_uuid)
    account_id = Column(String, ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"), nullable=False)
    chat_id = Column(String, ForeignKey("whatsapp_chats.id", ondelete="CASCADE"), nullable=False)
    message_id = Column(String, nullable=False)
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True)
    account_revision = Column(Integer, nullable=False)
    chat_revision = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="processing")
    reply = Column(Text, nullable=True)
    citations_json = Column(JSON, nullable=True)
    fallback_triggered = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
