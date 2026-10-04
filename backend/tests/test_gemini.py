"""Exercise SDK request wiring without external API calls."""

from types import SimpleNamespace

import pytest
from google.genai import types

from app.services import gemini


def fake_client(monkeypatch, responses, error=None):
    captured = {}

    class Client:
        def __init__(self, **kwargs):
            captured.update(kwargs)
            self.aio = self
            self.models = self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            captured["closed"] = True

        async def generate_content_stream(self, **kwargs):
            captured.update(kwargs)
            if error:
                raise error

            async def stream():
                for response in responses:
                    yield response

            return stream()

    monkeypatch.setattr(gemini.genai, "Client", Client)
    monkeypatch.setattr(gemini.settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini.settings, "LLM_MODEL", "gemma-4-26b-a4b-it")
    return captured


async def test_gemma_stream_keeps_context_history_and_only_answer_parts(monkeypatch):
    responses = [types.GenerateContentResponse(candidates=[types.Candidate(
        content=types.Content(role="model", parts=[
            types.Part(text="Internal reasoning", thought=True),
            types.Part(text="Which quantity "),
            types.Part(text="do you need?"),
        ])
    )])]
    captured = fake_client(monkeypatch, responses)
    history = [SimpleNamespace(sender="visitor", text_content="Do you sell epoxy?"),
               SimpleNamespace(sender="bot", text_content="Yes."),
               SimpleNamespace(sender="bot", text_content="")]
    answer = "".join([text async for text in gemini.stream_gemini_reply(
        "Sell resin. Verified context: epoxy resin.", history, "I want to buy epoxy."
    )])
    assert answer == "Which quantity do you need?"
    assert captured["api_key"] == "test-key"
    assert captured["model"] == "gemma-4-26b-a4b-it"
    assert captured["config"].thinking_config.thinking_level == "HIGH"
    assert captured["config"].thinking_config.include_thoughts is False
    assert "Verified context" in captured["config"].system_instruction
    assert [content.role for content in captured["contents"]] == ["user", "model", "user"]
    assert captured["contents"][-1].parts[0].text == "I want to buy epoxy."
    assert captured["closed"] is True


async def test_empty_stream_is_a_failure_instead_of_blank_answer(monkeypatch):
    captured = fake_client(monkeypatch, [types.GenerateContentResponse()])
    with pytest.raises(RuntimeError, match="no answer text"):
        _ = [text async for text in gemini.stream_gemini_reply("Instructions", [], "Hello")]
    assert captured["closed"] is True


async def test_sdk_error_reaches_rag_fallback_and_closes_client(monkeypatch):
    captured = fake_client(monkeypatch, [], error=RuntimeError("Connection unavailable"))
    with pytest.raises(RuntimeError, match="Connection unavailable"):
        _ = [text async for text in gemini.stream_gemini_reply("Instructions", [], "Hello")]
    assert captured["closed"] is True
