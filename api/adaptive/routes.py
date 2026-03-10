"""Adaptive ERP API routes.

Endpoints for profile management, skill activation, usage tracking,
and expansion prompts. All under /api/v1/adaptive/.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

import db
from auth.jwt_utils import get_signing_secret, verify_token
from .profiles import (
    list_templates,
    activate_profile,
    get_current_profile,
    update_skills,
    seed_vocabulary,
)
from .expansion_engine import evaluate_triggers

router = APIRouter(prefix="/api/v1/adaptive", tags=["adaptive"])


def _get_user_id(request: Request) -> str | None:
    """Extract user_id from Authorization header.

    Adaptive routes are auth-exempt at the middleware level (so the
    public GET /profiles endpoint works), but most endpoints need auth.
    We parse the JWT here instead of relying on middleware.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    conn = db.get_connection()
    secret = get_signing_secret(conn)
    payload = verify_token(auth_header[7:], secret, expected_type="access")
    if not payload:
        return None
    return payload.get("sub")


# ── Profile templates ────────────────────────────────────────────────────────

@router.get("/profiles")
async def list_profile_templates():
    """List all available business profile templates."""
    templates = list_templates()
    return {"status": "ok", "profiles": templates}


# ── Profile activation ───────────────────────────────────────────────────────

@router.post("/profiles/activate")
async def activate(request: Request):
    """Create/replace the user's business profile and activate core skills.

    Body: {"profile_key": "dental", "extra_skills": ["erpclaw-ops"]}
    """
    user_id = _get_user_id(request)
    if not user_id:
        return JSONResponse(
            {"status": "error", "message": "Authentication required"},
            status_code=401,
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"status": "error", "message": "Invalid JSON body"},
            status_code=400,
        )

    profile_key = body.get("profile_key")
    if not profile_key:
        return JSONResponse(
            {"status": "error", "message": "profile_key is required"},
            status_code=400,
        )

    extra_skills = body.get("extra_skills", [])

    conn = db.get_connection()
    # Seed vocabulary on first activation
    seed_vocabulary(conn)
    result = activate_profile(conn, user_id, profile_key, extra_skills)

    if "error" in result:
        return JSONResponse(
            {"status": "error", "message": result["error"]},
            status_code=400,
        )

    return {"status": "ok", **result}


# ── Current profile ──────────────────────────────────────────────────────────

@router.get("/profiles/current")
async def current_profile(request: Request):
    """Get the authenticated user's active business profile."""
    user_id = _get_user_id(request)
    if not user_id:
        return JSONResponse(
            {"status": "error", "message": "Authentication required"},
            status_code=401,
        )

    conn = db.get_connection()
    profile = get_current_profile(conn, user_id)
    if not profile:
        return {"status": "ok", "profile": None}

    return {"status": "ok", "profile": profile}


# ── Skill management ─────────────────────────────────────────────────────────

@router.put("/profiles/current/skills")
async def modify_skills(request: Request):
    """Add or remove skills from the current profile.

    Body: {"add": ["erpclaw-ops"], "remove": ["erpclaw-growth"]}
    """
    user_id = _get_user_id(request)
    if not user_id:
        return JSONResponse(
            {"status": "error", "message": "Authentication required"},
            status_code=401,
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"status": "error", "message": "Invalid JSON body"},
            status_code=400,
        )

    conn = db.get_connection()
    result = update_skills(
        conn, user_id,
        add=body.get("add"),
        remove=body.get("remove"),
    )

    if "error" in result:
        return JSONResponse(
            {"status": "error", "message": result["error"]},
            status_code=400,
        )

    return {"status": "ok", **result}


# ── Usage counters ───────────────────────────────────────────────────────────

@router.get("/usage")
async def get_usage(request: Request):
    """Get usage counters for the current profile."""
    user_id = _get_user_id(request)
    if not user_id:
        return JSONResponse(
            {"status": "error", "message": "Authentication required"},
            status_code=401,
        )

    conn = db.get_connection()
    profile = get_current_profile(conn, user_id)
    if not profile:
        return {"status": "ok", "counters": []}

    rows = conn.execute(
        "SELECT entity_type, skill_name, count, last_updated "
        "FROM usage_counter WHERE profile_id = ? ORDER BY count DESC",
        (profile["id"],),
    ).fetchall()

    counters = [
        {
            "entity_type": r["entity_type"],
            "skill_name": r["skill_name"],
            "count": r["count"],
            "last_updated": r["last_updated"],
        }
        for r in rows
    ]
    return {"status": "ok", "counters": counters}


# ── Expansion prompts ────────────────────────────────────────────────────────

@router.get("/expansion-prompts")
async def get_expansion_prompts(request: Request):
    """Get pending expansion suggestions for the current profile.

    Evaluates trigger rules first to generate any new prompts,
    then returns all pending prompts.
    """
    user_id = _get_user_id(request)
    if not user_id:
        return JSONResponse(
            {"status": "error", "message": "Authentication required"},
            status_code=401,
        )

    conn = db.get_connection()
    profile = get_current_profile(conn, user_id)
    if not profile:
        return {"status": "ok", "prompts": []}

    # Evaluate triggers to generate new prompts (if any thresholds exceeded)
    evaluate_triggers(conn, user_id)

    rows = conn.execute(
        "SELECT id, suggested_skill, message, status, created_at "
        "FROM expansion_prompt WHERE profile_id = ? AND status = 'pending' "
        "ORDER BY created_at DESC",
        (profile["id"],),
    ).fetchall()

    prompts = [
        {
            "id": r["id"],
            "suggested_skill": r["suggested_skill"],
            "message": r["message"],
            "status": r["status"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]
    return {"status": "ok", "prompts": prompts}


@router.post("/expansion-prompts/{prompt_id}/accept")
async def accept_expansion(prompt_id: str, request: Request):
    """Accept an expansion prompt — activates the suggested skill."""
    user_id = _get_user_id(request)
    if not user_id:
        return JSONResponse(
            {"status": "error", "message": "Authentication required"},
            status_code=401,
        )

    conn = db.get_connection()
    row = conn.execute(
        "SELECT ep.id, ep.suggested_skill, ep.profile_id, ap.user_id "
        "FROM expansion_prompt ep "
        "JOIN adaptive_profile ap ON ap.id = ep.profile_id "
        "WHERE ep.id = ? AND ep.status = 'pending'",
        (prompt_id,),
    ).fetchone()

    if not row:
        return JSONResponse(
            {"status": "error", "message": "Prompt not found or already resolved"},
            status_code=404,
        )

    if row["user_id"] != user_id:
        return JSONResponse(
            {"status": "error", "message": "Not your prompt"},
            status_code=403,
        )

    # Activate the skill
    result = update_skills(conn, user_id, add=[row["suggested_skill"]])
    if "error" in result:
        return JSONResponse(
            {"status": "error", "message": result["error"]},
            status_code=400,
        )

    # Mark prompt as accepted
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE expansion_prompt SET status = 'accepted', resolved_at = ? WHERE id = ?",
        (now, prompt_id),
    )
    conn.commit()

    return {
        "status": "ok",
        "activated_skill": row["suggested_skill"],
        "active_skills": result["active_skills"],
    }


@router.post("/expansion-prompts/{prompt_id}/dismiss")
async def dismiss_expansion(prompt_id: str, request: Request):
    """Dismiss an expansion prompt."""
    user_id = _get_user_id(request)
    if not user_id:
        return JSONResponse(
            {"status": "error", "message": "Authentication required"},
            status_code=401,
        )

    conn = db.get_connection()
    row = conn.execute(
        "SELECT ep.id, ap.user_id "
        "FROM expansion_prompt ep "
        "JOIN adaptive_profile ap ON ap.id = ep.profile_id "
        "WHERE ep.id = ? AND ep.status = 'pending'",
        (prompt_id,),
    ).fetchone()

    if not row:
        return JSONResponse(
            {"status": "error", "message": "Prompt not found or already resolved"},
            status_code=404,
        )

    if row["user_id"] != user_id:
        return JSONResponse(
            {"status": "error", "message": "Not your prompt"},
            status_code=403,
        )

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE expansion_prompt SET status = 'dismissed', resolved_at = ? WHERE id = ?",
        (now, prompt_id),
    )
    conn.commit()

    return {"status": "ok", "dismissed": prompt_id}
