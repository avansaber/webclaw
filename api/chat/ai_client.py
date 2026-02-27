"""OpenClaw gateway streaming client for chat-alongside-data.

Routes chat messages through the local OpenClaw gateway (same AI pipeline
as the Telegram bot). Uses the OpenAI-compatible /v1/chat/completions
endpoint with streaming support.
"""
import json
import os
from typing import AsyncGenerator

import httpx

# OpenClaw gateway runs locally on the same server
OPENCLAW_GATEWAY_URL = os.environ.get(
    "OPENCLAW_GATEWAY_URL", "http://127.0.0.1:18789"
)
OPENCLAW_CHAT_ENDPOINT = f"{OPENCLAW_GATEWAY_URL}/v1/chat/completions"
MAX_TOKENS = 4096

# Path to OpenClaw config (for gateway auth token)
OPENCLAW_CONFIG_PATH = os.path.expanduser("~/.openclaw/openclaw.json")

_gateway_token: str | None = None


def _get_gateway_token() -> str:
    """Load gateway auth token from OpenClaw config (cached after first read)."""
    global _gateway_token
    if _gateway_token:
        return _gateway_token

    # Read from OpenClaw config
    if os.path.exists(OPENCLAW_CONFIG_PATH):
        with open(OPENCLAW_CONFIG_PATH) as f:
            data = json.load(f)
        token = data.get("gateway", {}).get("auth", {}).get("token", "")
        if token:
            _gateway_token = token
            return _gateway_token

    # Fallback: environment variable
    _gateway_token = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")
    if not _gateway_token:
        raise RuntimeError(
            "No OpenClaw gateway token found. Check ~/.openclaw/openclaw.json"
        )
    return _gateway_token


def build_system_prompt(context: dict) -> str:
    """Build a system prompt that includes the current UI context and resolved entities."""
    domain = context.get("domain")
    if domain:
        intro = f"You are an AI assistant embedded in a **{domain}** web application."
    else:
        intro = "You are an AI assistant embedded in a business web application."

    parts = [
        intro,
        "You help users understand their data, answer questions about records,",
        "and guide them through workflows.",
        "",
        "Keep responses concise and actionable. Use markdown formatting.",
        "When referring to specific records, mention their IDs.",
    ]

    skill = context.get("skill")
    if skill:
        parts.append(f"\nThe user is currently viewing the **{skill}** skill.")

    entity = context.get("entity")
    if entity:
        parts.append(f"They are looking at: **{entity}**")

    record_id = context.get("record_id")
    if record_id:
        parts.append(f"Specific record: `{record_id}`")

    view = context.get("view")
    if view:
        parts.append(f"Current view: {view}")

    # Resolved entities from context resolution (C1)
    resolved = context.get("resolved_entities")
    if resolved and isinstance(resolved, list) and len(resolved) > 0:
        parts.append("\n**Resolved entities from the conversation:**")
        for ent in resolved:
            name = ent.get("name", "?")
            etype = ent.get("entity_type", "entity")
            conf = ent.get("confidence", 0)
            parts.append(f"- {etype}: **{name}** (id: {ent.get('id', '?')}, confidence: {conf:.0%})")

    return "\n".join(parts)


async def stream_chat(
    messages: list[dict], context: dict
) -> AsyncGenerator[str, None]:
    """Stream AI response chunks via OpenClaw gateway. Yields text deltas."""
    token = _get_gateway_token()
    system = build_system_prompt(context)

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # Prepend system message as first message (OpenAI format)
    openai_messages = [{"role": "system", "content": system}] + messages

    body = {
        "model": "openclaw",
        "messages": openai_messages,
        "stream": True,
        "max_tokens": MAX_TOKENS,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST", OPENCLAW_CHAT_ENDPOINT, headers=headers, json=body
        ) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                error_msg = error_body.decode("utf-8", errors="replace")[:500]
                yield f"[Error: API returned {resp.status_code}: {error_msg}]"
                return

            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    event = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                # OpenAI streaming format
                choices = event.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    text = delta.get("content", "")
                    if text:
                        yield text
                    if choices[0].get("finish_reason"):
                        break

                # Error handling
                if event.get("error"):
                    error_msg = event["error"].get("message", "Unknown error")
                    yield f"\n\n[Error: {error_msg}]"
                    break
