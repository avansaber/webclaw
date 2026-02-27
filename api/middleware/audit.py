"""Audit logging middleware — logs mutating skill actions to audit_log table."""
import asyncio
import re
import uuid
from datetime import datetime, timezone
from functools import partial

from fastapi import Request


async def audit_middleware(request: Request, call_next):
    """Log POST requests to skill routes in the audit_log table."""
    response = await call_next(request)

    # Only log POST to skill routes (not auth, not GET)
    if request.method != "POST":
        return response

    path = request.url.path
    if path.startswith("/api/v1/auth/"):
        return response

    match = re.match(r"^/api/v1/([^/]+)/([^/]+)$", path)
    if not match:
        return response

    skill, action = match.group(1), match.group(2)
    user_id = getattr(request.state, "user_id", None)

    # Write audit log asynchronously (non-blocking)
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, partial(_write_audit_log, user_id, skill, action, response.status_code))

    return response


def _write_audit_log(user_id: str | None, skill: str, action: str, status_code: int):
    """Write a row to the audit_log table (runs in thread pool)."""
    try:
        from db import get_connection

        conn = get_connection()
        conn.execute(
            """INSERT INTO audit_log (id, user_id, skill, action, description, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                user_id,
                skill,
                action,
                f"POST /{skill}/{action} → {status_code}",
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
    except Exception:
        pass  # Audit logging should never break the request
