"""SSE event bus and /events endpoint — Sprint B3.

In-memory pub/sub: skills and routes call `publish()` to broadcast events.
Connected clients receive them via Server-Sent Events at GET /api/v1/events.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter()

# ── In-memory event bus ────────────────────────────────────────────────────

_subscribers: list[asyncio.Queue] = []
_lock = asyncio.Lock()


async def subscribe() -> asyncio.Queue:
    """Register a new subscriber and return their event queue."""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    async with _lock:
        _subscribers.append(q)
    return q


async def unsubscribe(q: asyncio.Queue) -> None:
    """Remove a subscriber."""
    async with _lock:
        try:
            _subscribers.remove(q)
        except ValueError:
            pass


async def publish(event: dict) -> None:
    """Broadcast an event to all connected clients."""
    event.setdefault("timestamp", time.time())
    async with _lock:
        dead: list[asyncio.Queue] = []
        for q in _subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            _subscribers.remove(q)


def publish_sync(event: dict) -> None:
    """Non-async version for use in synchronous code paths."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(publish(event))
    except RuntimeError:
        pass


# ── Convenience publishers ─────────────────────────────────────────────────

async def emit_schema_update(skill: str) -> None:
    await publish({"type": "schema-update", "skill": skill})


async def emit_data_change(skill: str, entity: str, scope: str = "all", id: str | None = None) -> None:
    evt: dict = {"type": "data-change", "skill": skill, "entity": entity, "scope": scope}
    if id:
        evt["id"] = id
    await publish(evt)


async def emit_job_status(job_id: str, status: str, result: dict | None = None) -> None:
    evt: dict = {"type": "job-status", "job_id": job_id, "status": status}
    if result:
        evt["result"] = result
    await publish(evt)


# ── SSE endpoint ───────────────────────────────────────────────────────────

HEARTBEAT_INTERVAL = 30  # seconds


@router.get("/api/v1/events")
async def events_stream(request: Request):
    """Server-Sent Events stream for real-time updates.

    Event types: heartbeat, schema-update, data-change, job-status.
    Requires Bearer token in query param or header.
    """
    # Auth: accept token from header or query param
    from auth.jwt_utils import verify_token
    from db import get_connection

    token = request.query_params.get("token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        return StreamingResponse(
            iter([f"data: {json.dumps({'type': 'error', 'message': 'Authentication required'})}\n\n"]),
            media_type="text/event-stream",
            status_code=401,
        )

    conn = get_connection()
    from auth.jwt_utils import get_signing_secret
    secret = get_signing_secret(conn)
    payload = verify_token(token, secret, expected_type="access")
    if not payload:
        return StreamingResponse(
            iter([f"data: {json.dumps({'type': 'error', 'message': 'Invalid token'})}\n\n"]),
            media_type="text/event-stream",
            status_code=401,
        )

    queue = await subscribe()

    async def event_generator() -> AsyncGenerator[str, None]:
        last_heartbeat = time.time()
        try:
            while True:
                # Check for disconnect
                if await request.is_disconnected():
                    break

                # Drain events from queue
                try:
                    event = queue.get_nowait()
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.QueueEmpty:
                    pass

                # Heartbeat
                now = time.time()
                if now - last_heartbeat >= HEARTBEAT_INTERVAL:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                    last_heartbeat = now

                await asyncio.sleep(0.5)
        finally:
            await unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
