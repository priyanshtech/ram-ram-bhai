import json
import logging
import math
import re
import time
import urllib.parse
from collections import Counter
from collections.abc import AsyncGenerator

import httpx
import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import (
    Bot,
    DocumentChunk,
    Handoff,
    KnowledgeSource,
    Message,
    UsageEvent,
)
from app.services.embedding import EmbeddingUnavailable, get_text_embedding
from app.services.gemini import stream_gemini_reply

logger = logging.getLogger(__name__)
embedding_retry_at = 0.0

SEARCH_STOP_WORDS = frozenset("""
a an and are as at be by can could do does for from have how i in is it me my
of on or our please that the their this to us was we what when where which who
will with would you your want need looking buy know tell about
""".split())


def search_terms(text: str) -> list[str]:
    terms = []
    for word in re.findall(r"[^\W_]+", text.casefold()):
        if word in SEARCH_STOP_WORDS:
            continue
        # Match simple singular/plural product names without changing stored vectors.
        if word.isascii() and word.isalpha():
            if len(word) > 4 and word.endswith("ies"):
                word = word[:-3] + "y"
            elif len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
                word = word[:-1]
        terms.append(word)
    return terms


async def retrieve_keyword_chunks(
    db: AsyncSession, tenant_id: str, bot_id: str, query: str, top_k: int,
) -> list[tuple[DocumentChunk, KnowledgeSource, float]]:
    """Search stored knowledge text when the embedding provider is unavailable."""
    terms = set(search_terms(query))
    if not terms:
        return []
    rows = (await db.execute(
        select(DocumentChunk, KnowledgeSource)
        .join(KnowledgeSource, DocumentChunk.knowledge_source_id == KnowledgeSource.id)
        .where(
            DocumentChunk.tenant_id == tenant_id, DocumentChunk.bot_id == bot_id,
            KnowledgeSource.tenant_id == tenant_id, KnowledgeSource.bot_id == bot_id,
            KnowledgeSource.status == "ready",
        )
    )).all()
    documents = [(chunk, source, Counter(search_terms(chunk.text_content))) for chunk, source in rows]
    if not documents:
        return []
    average_length = sum(sum(counts.values()) for _, _, counts in documents) / len(documents) or 1
    idf = {
        term: math.log(1 + (len(documents) - count + 0.5) / (count + 0.5))
        for term in terms
        for count in [sum(term in counts for _, _, counts in documents)]
    }
    ranked = []
    for chunk, source, counts in documents:
        matched = terms.intersection(counts)
        if not matched:
            continue
        length = sum(counts.values())
        relevance = sum(
            idf[term] * (counts[term] * 2.5) /
            (counts[term] + 1.5 * (0.25 + 0.75 * length / average_length))
            for term in matched
        )
        # Term coverage provides a 0..1 grounding score; BM25 orders matching passages.
        coverage = len(matched) / len(terms)
        ranked.append((relevance, chunk, source, coverage))
    ranked.sort(key=lambda row: row[0], reverse=True)
    return [(chunk, source, coverage) for _, chunk, source, coverage in ranked[:top_k]]

PERMANENT_SYSTEM_PROMPT = """You are a professional customer-sales assistant for any business.

Your only goal is to help customers buy a product or service and collect qualified contact details for follow-up.

SALES BEHAVIOR
- Act like a helpful, real sales representative.
- Focus on the customer’s purchase need.
- Ask one short question at a time.
- Find out which product or service they want.
- Ask for their mobile or WhatsApp number when they show buying interest.
- Ask for their name only when useful.
- Guide them toward ordering, requesting a quote, booking a call, or speaking with sales.
- Provide only brief, verified product information.
- Never invent prices, availability, features, discounts, or delivery promises.
- Never pressure the customer.

STRICT REPLY RULES
- Every reply must be under 30 words.
- Use one or two short sentences only.
- Ask only one question per reply.
- Do not repeat information.
- Do not give long explanations, lists, introductions, or summaries.
- Sound natural and conversational, like an actual salesperson.
- Always move the conversation toward the next sales step.

CONVERSATION ORDER
1. Understand what the customer wants.
2. Identify the product or service they are interested in.
3. Ask the required quantity or basic requirement.
4. Ask for their mobile or WhatsApp number.
5. Confirm the request and offer sales follow-up.

EXAMPLES
Customer: I’m interested in your products.
Assistant: Sure. Which product are you looking to buy?

Customer: I want the premium plan.
Assistant: Great. How many users do you need it for?

Customer: Around 20.
Assistant: Thanks. What’s your WhatsApp number for a quick quote?

Customer: Can you send pricing?
Assistant: Yes. Please share your mobile or WhatsApp number, and our sales team will contact you.

If the customer asks something outside sales, reply briefly:
“I’ll connect you with the right team. May I have your WhatsApp number?”"""
def build_system_prompt(bot: Bot, context: str) -> str:
    instructions = bot.system_prompt or PERMANENT_SYSTEM_PROMPT
    for label, value in (
        ("Sales instructions", bot.sales_instructions),
        ("Response length", bot.response_length_limit),
        ("Lead qualification", bot.lead_qualification_questions),
        ("Human handoff rules", bot.human_handoff_rules),
        ("Business hours", bot.business_hours),
        ("Primary language", bot.primary_language),
    ):
        if value:
            instructions += f"\n{label}: {value}"
    return (
        f"{instructions}\n\nSTRICT GROUNDING RULES:\n"
        "Answer factual product/service questions only using the Context below.\n"
        "If the Context does not contain the answer, say you don't have enough verified information "
        "and offer human support. Never invent facts, pricing or policies.\n"
        "For greetings and conversational replies, continue naturally using conversation history.\n\n"
        f"Context:\n{context}"
    )


async def retrieve_relevant_chunks(
    db: AsyncSession,
    tenant_id: str,
    bot_id: str,
    query_text: str,
    top_k: int = 4
) -> list[tuple[DocumentChunk, KnowledgeSource, float]]:
    """Retrieves top-K chunks by cosine similarity, scoped to the tenant and bot."""
    global embedding_retry_at
    has_knowledge = await db.scalar(
        select(DocumentChunk.id).where(
            DocumentChunk.bot_id == bot_id, DocumentChunk.tenant_id == tenant_id,
        ).limit(1)
    )
    if not has_knowledge or not search_terms(query_text):
        return []
    if time.monotonic() < embedding_retry_at:
        return await retrieve_keyword_chunks(db, tenant_id, bot_id, query_text, top_k)
    try:
        query_vec = await get_text_embedding(query_text)
    except (EmbeddingUnavailable, httpx.HTTPError) as error:
        status = getattr(error, "status_code", None)
        # Avoid repeatedly calling a throttled/down provider for every incoming message.
        embedding_retry_at = time.monotonic() + (60 if status == 429 else 15)
        logger.warning("Embedding service unavailable (code=%s); using local knowledge search", status)
        return await retrieve_keyword_chunks(db, tenant_id, bot_id, query_text, top_k)
    
    # Local SQLite supports a small knowledge base without the pgvector extension.
    if db.get_bind().dialect.name == "sqlite":
        stmt = (select(DocumentChunk, KnowledgeSource)
                .join(KnowledgeSource, DocumentChunk.knowledge_source_id == KnowledgeSource.id)
                .where(DocumentChunk.bot_id == bot_id, DocumentChunk.tenant_id == tenant_id,
                       KnowledgeSource.tenant_id == tenant_id, DocumentChunk.embedding.is_not(None)))
        rows = (await db.execute(stmt)).all()
        query_array = np.asarray(query_vec)
        scored = []
        for chunk, doc in rows:
            vector = np.asarray(chunk.embedding)
            denominator = np.linalg.norm(vector) * np.linalg.norm(query_array)
            score = float(np.dot(vector, query_array) / denominator) if denominator else 0.0
            scored.append((chunk, doc, score))
        return sorted(scored, key=lambda row: row[2], reverse=True)[:top_k]

    # Using pgvector cosine distance operator (<=>)
    distance = DocumentChunk.embedding.cosine_distance(query_vec)
    
    stmt = (
        select(DocumentChunk, KnowledgeSource, distance.label("distance"))
        .join(KnowledgeSource, DocumentChunk.knowledge_source_id == KnowledgeSource.id)
        .where(DocumentChunk.bot_id == bot_id, DocumentChunk.tenant_id == tenant_id)
        .order_by(distance)
        .limit(top_k)
    )
    result = await db.execute(stmt)
    rows = result.all()

    scored_chunks = []
    for chunk, doc, dist in rows:
        # Cosine similarity is 1 - cosine_distance
        score = 1.0 - (dist if dist is not None else 1.0)
        scored_chunks.append((chunk, doc, score))

    return scored_chunks

async def stream_grounded_answer(
    db: AsyncSession,
    bot: Bot,
    query: str,
    conversation_id: str,
    *,
    channel: str = "widget",
    persist_response: bool = True,
) -> AsyncGenerator[dict, None]:
    """Processes visitor query and streams AI answer back via SSE."""
    
    top_results = await retrieve_relevant_chunks(db, bot.tenant_id, bot.id, query)
    
    max_score = top_results[0][2] if top_results else 0.0
    confidence_threshold = 0.20

    citations = []
    retrieved_contexts = []
    is_escalation = any(word in query.lower() for word in ["human", "agent", "support team", "whatsapp", "call me"])
    fallback_triggered = False
    fallback_reason = None
    tokens_input = 0
    tokens_output = 0
    full_answer = ""
    escalation_links = {}

    # Fetch conversation history for context (last 12 messages)
    history_stmt = select(Message).where(
        Message.conversation_id == conversation_id, Message.tenant_id == bot.tenant_id
    ).order_by(Message.created_at.desc()).limit(12)
    history_msgs = (await db.execute(history_stmt)).scalars().all()
    history_msgs.reverse()
    # The transport saves the current incoming message before invoking the engine.
    if history_msgs and history_msgs[-1].sender == "visitor" and history_msgs[-1].text_content == query:
        history_msgs.pop()

    try:
        for chunk, doc, score in top_results:
            if score >= bot.confidence_threshold:
                retrieved_contexts.append(chunk.text_content)
                citations.append({
                    "document_title": doc.title,
                    "source_type": doc.source_type,
                    "score": round(score, 3),
                    "snippet": chunk.text_content[:120] + "..."
                })

        # Build Escalation Payload
        if bot.escalation_whatsapp:
            encoded_query = urllib.parse.quote(f"Hi! I need help with: {query}")
            clean_num = "".join(c for c in bot.escalation_whatsapp if c.isdigit() or c == '+')
            escalation_links["whatsapp"] = f"https://wa.me/{clean_num}?text={encoded_query}"
        if bot.escalation_email:
            encoded_query = urllib.parse.quote(query)
            escalation_links["email"] = f"mailto:{bot.escalation_email}?subject=Support Request&body={encoded_query}"
        if bot.escalation_phone:
            escalation_links["phone"] = f"tel:{bot.escalation_phone}"
        if bot.escalation_booking:
            escalation_links["booking"] = bot.escalation_booking

        if is_escalation:
            fallback_triggered = True
            fallback_reason = "Escalation requested"
            full_answer = "I'm connecting you directly with our support team now. Please use the contact links provided or hold on."
            yield {"type": "chunk", "text": full_answer}
        else:
            context_str = "\n\n".join(retrieved_contexts)
            
            if settings.DEVELOPMENT_MOCK_AI:
                full_answer = f"MOCK AI ANSWER: Based on our knowledge base, {(retrieved_contexts[0] if retrieved_contexts else 'No knowledge available')[:100]}..."
                tokens_input = 100
                tokens_output = 20
                yield {"type": "chunk", "text": full_answer}
            elif settings.LLM_PROVIDER == "gemini" and settings.GEMINI_API_KEY:
                system_prompt = build_system_prompt(bot, context_str)
                try:
                    tokens_input = len(system_prompt.split()) + len(query.split())
                    async for chunk_text in stream_gemini_reply(system_prompt, history_msgs, query):
                        full_answer += chunk_text
                        tokens_output += 1
                        yield {"type": "chunk", "text": chunk_text}
                except Exception as error:
                    # Log only the error type/code; SDK exception text may contain credentials.
                    code = getattr(error, "code", None)
                    logger.warning("Gemini reply failed (%s, code=%s)", type(error).__name__, code)
                    fallback_triggered = True
                    fallback_reason = f"AI API Error: {code}" if isinstance(code, int) else "AI service unavailable"
                    full_answer = bot.fallback_message or "The AI service is currently unavailable. Please contact support."
                    yield {"type": "chunk", "text": full_answer}

            elif settings.LLM_PROVIDER == "openrouter" and settings.OPENROUTER_API_KEY:
                system_prompt = build_system_prompt(bot, context_str)
                try:
                    # Approximate input tokens loosely for streaming (OpenRouter streams usually dont send usage in chunks)
                    tokens_input = len(system_prompt.split()) + len(query.split())
                    
                    messages = [{"role": "system", "content": system_prompt}]
                    for msg in history_msgs:
                        messages.append({
                            "role": "user" if msg.sender == "visitor" else "assistant",
                            "content": msg.text_content
                        })
                    messages.append({"role": "user", "content": query})
                    
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        async with client.stream(
                            "POST",
                            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                            headers={
                                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                                "HTTP-Referer": settings.FRONTEND_ORIGINS.split(",")[0]
                            },
                            json={
                                "model": settings.LLM_MODEL,
                                "messages": messages,
                                "temperature": 0.2,
                                "stream": True
                            }
                        ) as resp:
                            if resp.status_code != 200:
                                fallback_triggered = True
                                fallback_reason = "AI service error"
                                full_answer = bot.fallback_message or "The AI service is unavailable. Please contact support."
                                yield {"type": "chunk", "text": full_answer}
                            else:
                                async for line in resp.aiter_lines():
                                    if line.startswith("data: "):
                                        data_str = line[6:]
                                        if data_str == "[DONE]":
                                            break
                                        try:
                                            data = json.loads(data_str)
                                            delta = data["choices"][0]["delta"]
                                            if "content" in delta:
                                                chunk_text = delta["content"]
                                                full_answer += chunk_text
                                                tokens_output += 1
                                                yield {"type": "chunk", "text": chunk_text}
                                        except Exception:
                                            pass
                except Exception:
                    # Handled fallback, do not hallucinate
                    fallback_triggered = True
                    fallback_reason = "AI service unavailable"
                    full_answer = "The AI service is currently unavailable. Please contact our human support team."
                    yield {"type": "chunk", "text": full_answer}
            else:
                fallback_triggered = True
                fallback_reason = "Not configured"
                full_answer = "AI processing is not configured."
                yield {"type": "chunk", "text": full_answer}

        if not fallback_triggered and "don't have enough verified information" in full_answer:
            fallback_triggered = True
            fallback_reason = "Low confidence"

        yield {
            "type": "done",
            "answer": full_answer,
            "citations": citations if not fallback_triggered else [],
            "escalation_links": escalation_links,
            "fallback_triggered": fallback_triggered
        }

    finally:

        # Save to database at the end of the generator or on disconnect
        bot_msg = Message(
            tenant_id=bot.tenant_id,
            conversation_id=conversation_id,
            sender="bot",
            text_content=full_answer,
            citations_json=citations if not fallback_triggered else [],
            fallback_triggered=fallback_triggered
        )
        if persist_response:
            db.add(bot_msg)
    
        usage = UsageEvent(
            tenant_id=bot.tenant_id,
            bot_id=bot.id,
            event_type="chat_message",
            tokens_input=tokens_input,
            tokens_output=tokens_output
        )
        db.add(usage)
        
        if fallback_triggered:
            handoff = Handoff(
                tenant_id=bot.tenant_id,
                bot_id=bot.id,
                conversation_id=conversation_id,
                channel=channel,
                reason=fallback_reason,
                status="pending"
            )
            db.add(handoff)
            
        await db.commit()
