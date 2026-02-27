"""Chat API routes — session CRUD and SSE streaming."""
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

import db
from auth.jwt_utils import get_signing_secret, verify_token
from .ai_client import stream_chat
from .entity_resolver import resolve_entity

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

MAX_HISTORY = 50  # messages to include in AI context window


def _get_user_id(request: Request) -> str | None:
    """Extract user_id from Bearer token. Returns None if invalid."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    conn = db.get_connection()
    secret = get_signing_secret(conn)
    payload = verify_token(auth_header[7:], secret, expected_type="access")
    if not payload:
        return None
    return payload["sub"]


def _require_user(request: Request) -> tuple[str, None] | tuple[None, JSONResponse]:
    """Return (user_id, None) on success or (None, error_response) on failure."""
    user_id = _get_user_id(request)
    if not user_id:
        return None, JSONResponse(
            {"status": "error", "message": "Authentication required"}, status_code=401
        )
    return user_id, None


# ── Session CRUD ─────────────────────────────────────────────────────────────


@router.post("/sessions")
async def create_session(request: Request):
    """Create a new chat session."""
    user_id, err = _require_user(request)
    if err:
        return err

    try:
        body = await request.json()
    except Exception:
        body = {}

    session_id = str(uuid.uuid4())
    title = body.get("title", "New Chat")
    context = json.dumps(body.get("context", {}))
    now = datetime.now(timezone.utc).isoformat()

    conn = db.get_connection()
    conn.execute(
        """INSERT INTO chat_session (id, user_id, title, context, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (session_id, user_id, title, context, now, now),
    )
    conn.commit()

    return {
        "status": "ok",
        "session": {
            "id": session_id,
            "title": title,
            "context": body.get("context", {}),
            "created_at": now,
        },
    }


@router.get("/sessions")
async def list_sessions(request: Request):
    """List current user's chat sessions, most recent first."""
    user_id, err = _require_user(request)
    if err:
        return err

    conn = db.get_connection()
    rows = conn.execute(
        """SELECT id, title, context, created_at, updated_at
           FROM chat_session WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50""",
        (user_id,),
    ).fetchall()

    sessions = []
    for r in rows:
        ctx = r["context"] if isinstance(r, dict) else r[2]
        sessions.append({
            "id": r["id"] if isinstance(r, dict) else r[0],
            "title": r["title"] if isinstance(r, dict) else r[1],
            "context": json.loads(ctx) if ctx else {},
            "created_at": r["created_at"] if isinstance(r, dict) else r[3],
            "updated_at": r["updated_at"] if isinstance(r, dict) else r[4],
        })

    return {"status": "ok", "sessions": sessions}


@router.get("/sessions/{session_id}/messages")
async def get_messages(session_id: str, request: Request):
    """Get messages for a chat session (owner only)."""
    user_id, err = _require_user(request)
    if err:
        return err

    conn = db.get_connection()
    # Verify ownership
    session = conn.execute(
        "SELECT id FROM chat_session WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if not session:
        return JSONResponse(
            {"status": "error", "message": "Session not found"}, status_code=404
        )

    rows = conn.execute(
        """SELECT id, role, content, context, created_at
           FROM chat_message WHERE session_id = ? ORDER BY created_at ASC""",
        (session_id,),
    ).fetchall()

    messages = []
    for r in rows:
        ctx = r["context"] if isinstance(r, dict) else r[3]
        messages.append({
            "id": r["id"] if isinstance(r, dict) else r[0],
            "role": r["role"] if isinstance(r, dict) else r[1],
            "content": r["content"] if isinstance(r, dict) else r[2],
            "context": json.loads(ctx) if ctx else {},
            "created_at": r["created_at"] if isinstance(r, dict) else r[4],
        })

    return {"status": "ok", "messages": messages}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, request: Request):
    """Delete a chat session and all its messages (owner only)."""
    user_id, err = _require_user(request)
    if err:
        return err

    conn = db.get_connection()
    # Verify ownership
    session = conn.execute(
        "SELECT id FROM chat_session WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if not session:
        return JSONResponse(
            {"status": "error", "message": "Session not found"}, status_code=404
        )

    # CASCADE deletes messages
    conn.execute("DELETE FROM chat_session WHERE id = ?", (session_id,))
    conn.commit()

    return {"status": "ok", "message": "Session deleted"}


# ── Entity Resolution ────────────────────────────────────────────────────────


@router.post("/resolve-entity")
async def resolve_entity_endpoint(request: Request):
    """Resolve a natural language entity reference to DB matches.

    Body: { entity_type?: string, query: string, limit?: int }
    Returns: { matches: [{id, name, entity_type, confidence, source_detail}] }
    """
    user_id, err = _require_user(request)
    if err:
        return err

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"status": "error", "message": "Invalid request body"}, status_code=400
        )

    query = body.get("query", "").strip()
    if not query:
        return JSONResponse(
            {"status": "error", "message": "Query is required"}, status_code=400
        )

    entity_type = body.get("entity_type")
    limit = min(body.get("limit", 5), 20)

    matches = resolve_entity(entity_type, query, limit)
    return {"status": "ok", "query": query, "matches": matches}


# ── SSE Streaming ────────────────────────────────────────────────────────────


def _save_message(
    conn, session_id: str, role: str, content: str, context: dict | None = None
) -> str:
    """Persist a chat message to the database. Returns message id."""
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO chat_message (id, session_id, role, content, context, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (msg_id, session_id, role, content, json.dumps(context or {}), now),
    )
    # Update session timestamp
    conn.execute(
        "UPDATE chat_session SET updated_at = ? WHERE id = ?", (now, session_id)
    )
    conn.commit()
    return msg_id


@router.post("/stream")
async def chat_stream(request: Request):
    """Stream an AI response via SSE. Creates session if needed, persists messages."""
    user_id, err = _require_user(request)
    if err:
        return err

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"status": "error", "message": "Invalid request body"}, status_code=400
        )

    message = body.get("message", "").strip()
    if not message:
        return JSONResponse(
            {"status": "error", "message": "Message is required"}, status_code=400
        )

    context = body.get("context", {})
    # Merge resolved entities into context for AI system prompt (C1)
    resolved_entities = body.get("resolved_entities")
    if resolved_entities:
        context["resolved_entities"] = resolved_entities
    session_id = body.get("session_id")

    conn = db.get_connection()

    # Auto-create session if not provided
    if not session_id:
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        # Use first ~50 chars of message as title
        title = message[:50] + ("..." if len(message) > 50 else "")
        conn.execute(
            """INSERT INTO chat_session (id, user_id, title, context, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (session_id, user_id, title, json.dumps(context), now, now),
        )
        conn.commit()
    else:
        # Verify ownership
        session = conn.execute(
            "SELECT id FROM chat_session WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
        if not session:
            return JSONResponse(
                {"status": "error", "message": "Session not found"}, status_code=404
            )

    # Save user message
    _save_message(conn, session_id, "user", message, context)

    # Load conversation history
    history_rows = conn.execute(
        """SELECT role, content FROM chat_message
           WHERE session_id = ? ORDER BY created_at ASC""",
        (session_id,),
    ).fetchall()

    # Build messages for AI (last N messages)
    ai_messages = []
    rows_to_use = history_rows[-MAX_HISTORY:]
    for r in rows_to_use:
        role = r["role"] if isinstance(r, dict) else r[0]
        content = r["content"] if isinstance(r, dict) else r[1]
        if role in ("user", "assistant"):
            ai_messages.append({"role": role, "content": content})

    async def event_generator():
        full_response = []
        try:
            async for chunk in stream_chat(ai_messages, context):
                full_response.append(chunk)
                yield f"data: {json.dumps({'type': 'delta', 'text': chunk})}\n\n"
        except Exception as e:
            error_text = f"[Error: {str(e)[:200]}]"
            full_response.append(error_text)
            yield f"data: {json.dumps({'type': 'delta', 'text': error_text})}\n\n"

        # Persist assistant response
        complete_text = "".join(full_response)
        if complete_text:
            _save_message(conn, session_id, "assistant", complete_text, context)

        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
