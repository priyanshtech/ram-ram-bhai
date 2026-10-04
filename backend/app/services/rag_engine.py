import json
import urllib.parse
from collections.abc import AsyncGenerator

import httpx
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
from app.services.embedding import get_text_embedding

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
async def retrieve_relevant_chunks(
    db: AsyncSession,
    tenant_id: str,
    bot_id: str,
    query_text: str,
    top_k: int = 4
) -> list[tuple[DocumentChunk, KnowledgeSource, float]]:
    """Retrieves top-K most relevant chunks strictly using pgvector cosine distance, scoped to tenant."""
    query_vec = await get_text_embedding(query_text)
    
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
    conversation_id: str
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
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.desc()).limit(12)
    history_msgs = (await db.execute(history_stmt)).scalars().all()
    history_msgs.reverse()

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
                full_answer = f"MOCK AI ANSWER: Based on our knowledge base, {retrieved_contexts[0][:100]}..."
                tokens_input = 100
                tokens_output = 20
                yield {"type": "chunk", "text": full_answer}
            elif settings.LLM_PROVIDER == "gemini" and settings.GEMINI_API_KEY:
                system_prompt = (
                    f"{PERMANENT_SYSTEM_PROMPT}\n\n"
                    "STRICT GROUNDING RULES:\n"
                    "1. For factual questions about products/services, answer ONLY using facts from the provided Context below.\n"
                    "2. If the user asks a factual question and the Context does not contain the answer, reply exactly with: \"I'm sorry, I don't have enough verified information to answer this accurately. Would you like to connect directly with our support team?\"\n"
                    "3. For conversational replies (like yes/no, contact info, greetings), acknowledge them naturally and continue the sales process using conversation history.\n"
                    "4. Do NOT make up facts, pricing, or policies.\n\n"
                    f"Context:\n{context_str}"
                )
                try:
                    tokens_input = len(system_prompt.split()) + len(query.split())
                    
                    contents = []
                    for msg in history_msgs:
                        contents.append({
                            "role": "user" if msg.sender == "visitor" else "model",
                            "parts": [{"text": msg.text_content}]
                        })
                    contents.append({"role": "user", "parts": [{"text": query}]})
                    
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.LLM_MODEL}:streamGenerateContent?key={settings.GEMINI_API_KEY}&alt=sse"
                        payload = {
                            "contents": contents,
                            "systemInstruction": {"role": "system", "parts": [{"text": system_prompt}]},
                            "generationConfig": {"temperature": 0.2}
                        }
                        
                        async with client.stream("POST", url, json=payload) as resp:
                            if resp.status_code != 200:
                                fallback_triggered = True
                                fallback_reason = f"AI API Error: {resp.status_code}"
                                full_answer = "I am currently unable to process your request due to an AI service error. Would you like to contact support?"
                                yield {"type": "chunk", "text": full_answer}
                            else:
                                async for line in resp.aiter_lines():
                                    if line.startswith("data: "):
                                        data_str = line[6:].strip()
                                        if data_str == "[DONE]":
                                            break
                                        if not data_str:
                                            continue
                                        try:
                                            data = json.loads(data_str)
                                            if "candidates" in data and len(data["candidates"]) > 0:
                                                candidate = data["candidates"][0]
                                                if "content" in candidate and "parts" in candidate["content"]:
                                                    chunk_text = candidate["content"]["parts"][0].get("text", "")
                                                    if chunk_text:
                                                        full_answer += chunk_text
                                                        tokens_output += 1
                                                        yield {"type": "chunk", "text": chunk_text}
                                        except Exception:
                                            pass
                except Exception:
                    fallback_triggered = True
                    fallback_reason = "AI service unavailable"
                    full_answer = "The AI service is currently unavailable. Please contact our human support team."
                    yield {"type": "chunk", "text": full_answer}
                    
            elif settings.LLM_PROVIDER == "openrouter" and settings.OPENROUTER_API_KEY:
                system_prompt = (
                    f"{PERMANENT_SYSTEM_PROMPT}\n\n"
                    "STRICT GROUNDING RULES:\n"
                    "1. For factual questions about products/services, answer ONLY using facts from the provided Context below.\n"
                    "2. If the user asks a factual question and the Context does not contain the answer, reply exactly with: \"I'm sorry, I don't have enough verified information to answer this accurately. Would you like to connect directly with our support team?\"\n"
                    "3. For conversational replies (like yes/no, contact info, greetings), acknowledge them naturally and continue the sales process using conversation history.\n"
                    "4. Do NOT make up facts, pricing, or policies.\n\n"
                    f"Context:\n{context_str}"
                )
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
                                err_text = await resp.aread()
                                fallback_reason = "AI service error"
                                full_answer = f"I am currently unable to process your request due to an AI service error. Status: {resp.status_code}, Body: {err_text.decode('utf-8')}. Would you like to contact support?"
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

        yield {
            "type": "done",
            "citations": citations if not fallback_triggered else [],
            "escalation_links": escalation_links,
            "fallback_triggered": fallback_triggered
        }

    finally:
        if not fallback_triggered and "don't have enough verified information" in full_answer:
            fallback_triggered = True
            fallback_reason = "Low confidence"

        # Save to database at the end of the generator or on disconnect
        bot_msg = Message(
            tenant_id=bot.tenant_id,
            conversation_id=conversation_id,
            sender="bot",
            text_content=full_answer,
            citations_json=citations if not fallback_triggered else [],
            fallback_triggered=fallback_triggered
        )
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
                channel="widget", # general fallback channel
                reason=fallback_reason,
                status="pending"
            )
            db.add(handoff)
            
        await db.commit()
