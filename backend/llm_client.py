"""LLM client abstraction — swap providers without changing business logic.

Supported providers:
- anthropic (Claude)
- openai (GPT-4o, GPT-4o-mini)
- google (Gemini)

Set via environment variables:
  LLM_PROVIDER=openai    (default: openai)
  LLM_MODEL=gpt-4o-mini  (default: gpt-4o-mini, cheapest with vision)
  OPENAI_API_KEY=...
  ANTHROPIC_API_KEY=...
  GOOGLE_API_KEY=...
"""

import base64
import json
import os
from typing import Optional


LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")


def _call_openai(
    messages: list,
    system: Optional[str] = None,
    max_tokens: int = 1024,
) -> str:
    """Call OpenAI-compatible API (works with DashScope, OpenAI, etc.)."""
    import openai

    client = openai.OpenAI(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=os.getenv("OPENAI_BASE_URL", None),  # None = default OpenAI
        timeout=60.0,  # 30s timeout to avoid hanging
    )
    full_messages = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages)

    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=full_messages,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content


def _call_anthropic(
    messages: list,
    system: Optional[str] = None,
    max_tokens: int = 1024,
) -> str:
    """Call Anthropic Claude API."""
    import anthropic

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
    response = client.messages.create(
        model=LLM_MODEL,
        max_tokens=max_tokens,
        system=system or "",
        messages=messages,
    )
    return response.content[0].text


def _call_google(
    messages: list,
    system: Optional[str] = None,
    max_tokens: int = 1024,
) -> str:
    """Call Google Gemini API."""
    import google.generativeai as genai

    genai.configure(api_key=os.getenv("GOOGLE_API_KEY", ""))
    model = genai.GenerativeModel(LLM_MODEL, system_instruction=system)

    # Convert messages to Gemini format
    history = []
    for msg in messages[:-1]:
        role = "user" if msg["role"] == "user" else "model"
        history.append({"role": role, "parts": [msg["content"]]})

    chat = model.start_chat(history=history)
    last = messages[-1]["content"] if messages else ""
    response = chat.send_message(last)
    return response.text


# ── Public Interface ───────────────────────────────────────────────


def chat_completion(
    messages: list,
    system: Optional[str] = None,
    max_tokens: int = 1024,
) -> str:
    """Send a chat completion request to the configured LLM provider."""
    providers = {
        "openai": _call_openai,
        "anthropic": _call_anthropic,
        "google": _call_google,
    }
    fn = providers.get(LLM_PROVIDER)
    if not fn:
        raise ValueError(f"Unknown LLM provider: {LLM_PROVIDER}. Use: {list(providers.keys())}")
    return fn(messages, system, max_tokens)


def vision_extract(image_b64: str, media_type: str, prompt: str) -> str:
    """Send an image + prompt to the configured LLM for extraction."""

    if LLM_PROVIDER == "openai":
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{image_b64}",
                            "detail": "high",
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        return _call_openai(messages)

    elif LLM_PROVIDER == "anthropic":
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        return _call_anthropic(messages)

    elif LLM_PROVIDER == "google":
        import google.generativeai as genai

        genai.configure(api_key=os.getenv("GOOGLE_API_KEY", ""))
        model = genai.GenerativeModel(LLM_MODEL)
        image_bytes = base64.b64decode(image_b64)
        response = model.generate_content(
            [
                {"mime_type": media_type, "data": image_bytes},
                prompt,
            ]
        )
        return response.text

    else:
        raise ValueError(f"Unknown LLM provider: {LLM_PROVIDER}")


def parse_json_response(raw: str) -> dict:
    """Extract JSON from LLM response (handles markdown code blocks)."""
    text = raw.strip()
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    return json.loads(text)
