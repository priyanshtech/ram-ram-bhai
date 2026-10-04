"""Async Gemini API replies shared by the widget, simulator and WhatsApp."""

from collections.abc import AsyncGenerator, Sequence

from google import genai
from google.genai import types

from app.core.config import settings
from app.models.models import Message


async def stream_gemini_reply(
    system_prompt: str, history: Sequence[Message], query: str
) -> AsyncGenerator[str, None]:
    contents = [
        types.Content(
            role="user" if message.sender == "visitor" else "model",
            parts=[types.Part.from_text(text=message.text_content)],
        )
        for message in history
        if message.text_content
    ]
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=query)]))
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.2,
        thinking_config=types.ThinkingConfig(thinking_level="HIGH", include_thoughts=False),
    )
    has_reply = False
    async with genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=120_000),
    ).aio as client:
        stream = await client.models.generate_content_stream(
            model=settings.LLM_MODEL, contents=contents, config=config
        )
        async for chunk in stream:
            # Emit only the first candidate's answer, excluding internal thinking/tool parts.
            candidates = chunk.candidates or []
            content = candidates[0].content if candidates else None
            for part in (content.parts or []) if content else []:
                if part.text and not part.thought:
                    has_reply = has_reply or bool(part.text.strip())
                    yield part.text
    if not has_reply:
        raise RuntimeError("Gemini returned no answer text")
