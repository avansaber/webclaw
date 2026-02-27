#!/usr/bin/env python3
"""Webclaw API — generic OpenClaw UI gateway for any skill suite.

Routes:
  GET/POST /api/v1/{skill}/{action}  — Execute a skill action
  GET      /api/v1/schema/skills     — List installed skills
  GET      /api/v1/health            — Health check
  POST     /api/v1/auth/*            — Authentication endpoints
"""
import os
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import db
import rbac
from auth.routes import router as auth_router
from auth.jwt_utils import get_signing_secret, verify_token
from skills.router import router as skills_router
from chat.routes import router as chat_router
from events import router as events_router
from middleware.audit import audit_middleware

# Environment — defaults to production for safety
IS_DEV = os.environ.get("WEBCLAW_ENV", "production").lower() == "development"
CORS_ORIGIN = os.environ.get("WEBCLAW_CORS_ORIGIN", "http://localhost:3000")

# Skill name validation: lowercase letters, digits, hyphens — 2-64 chars
SKILL_NAME_RE = re.compile(r"^[a-z][a-z0-9-]{1,63}$")

MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB

AUTH_EXEMPT_PREFIXES = (
    "/api/v1/auth/",
    "/api/v1/health",
    "/api/v1/schema/",
    "/api/v1/chat/",
    "/api/v1/events",
)

app = FastAPI(title="Webclaw API", version="0.4.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN] if not IS_DEV else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(events_router)
app.include_router(skills_router)


# ── Middleware ────────────────────────────────────────────────────────────────

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Auth + RBAC + payload validation for all skill routes."""
    path = request.url.path

    # 1. Payload size limit
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_SIZE:
        return JSONResponse(
            {"status": "error", "message": "Request body too large (max 10MB)"},
            status_code=413,
        )

    # 2. Skip auth for exempt paths
    if any(path.startswith(prefix) for prefix in AUTH_EXEMPT_PREFIXES):
        return await call_next(request)

    # 3. Auth + RBAC for skill routes
    match = re.match(r"^/api/v1/([^/]+)/([^/]+)$", path)
    if match:
        skill, action = match.group(1), match.group(2)

        if not SKILL_NAME_RE.match(skill):
            return JSONResponse(
                {"status": "error", "message": f"Invalid skill name: {skill}"},
                status_code=400,
            )

        conn = db.get_connection()
        user_count = conn.execute("SELECT COUNT(*) FROM webclaw_user").fetchone()[0]
        if user_count == 0:
            request.state.user_id = None
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                {"status": "error", "message": "Authentication required"},
                status_code=401,
            )

        secret = get_signing_secret(conn)
        payload = verify_token(auth_header[7:], secret, expected_type="access")
        if not payload:
            return JSONResponse(
                {"status": "error", "message": "Invalid or expired token"},
                status_code=401,
            )

        user_id = payload["sub"]
        if not rbac.check_permission(conn, user_id, skill, action):
            return JSONResponse(
                {"status": "error", "message": f"Permission denied: {action} on {skill}"},
                status_code=403,
            )

        request.state.user_id = user_id

    return await call_next(request)


# Audit middleware (logs POST requests to skill routes)
app.middleware("http")(audit_middleware)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "service": "ocui-api"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
