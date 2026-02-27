"""Skill routes — schema discovery and action execution."""
import glob
import os

import yaml
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .executor import SKILLS_DIR, execute_skill
from .skillmd_parser import get_cached_params, get_skill_actions
from .action_prober import probe_action_params
from .schema_introspector import introspect_child_tables
from events import emit_data_change
import db

# Cache: skill_name → company_id (avoids repeated DB queries)
_default_company_cache: dict[str, str | None] = {}


def _inject_company_id(skill: str, action: str, params: dict) -> dict:
    """Auto-inject company-id if not present and the skill's DB has a company table."""
    if "company-id" in params or "company_id" in params:
        return params

    # Skip injection for actions that don't accept --company-id
    _SKIP_COMPANY_ID = {
        ("erpclaw", "seed-demo-data"),
        ("erpclaw", "check-installation"),
        ("erpclaw", "install-guide"),
        ("erpclaw-setup", "initialize-database"),
        ("erpclaw-setup", "setup-company"),
        ("erpclaw-setup", "list-companies"),
    }
    if (skill, action) in _SKIP_COMPANY_ID:
        return params

    if skill not in _default_company_cache:
        company_id = None
        try:
            conn = db.get_skill_db(skill)
            if conn:
                # Check if company table exists and get default company
                row = conn.execute(
                    "SELECT id FROM company ORDER BY created_at ASC LIMIT 1"
                ).fetchone()
                if row:
                    company_id = row[0]
                conn.close()
        except Exception:
            pass
        _default_company_cache[skill] = company_id

    company_id = _default_company_cache.get(skill)
    if company_id:
        params = {**params, "company-id": company_id}
    return params

router = APIRouter(tags=["skills"])


@router.get("/api/v1/schema/actions/{skill}")
async def list_actions(skill: str):
    """Discover available actions for a skill.

    Three-level fallback:
    1. Subprocess probe: argparse choices= error or 'available' key in response
    2. Subprocess probe: parse action names from error/suggestion text
    3. YAML frontmatter: read action names from SKILL.md scripts[].actions[]
    """
    result = await execute_skill(skill, "__discover__", {})
    actions = result.get("available_actions") or result.get("available")
    if actions:
        return {"status": "ok", "skill": skill, "actions": actions}

    # Level 2: Parse action names from suggestion/message text
    suggestion = result.get("suggestion", "") or result.get("message", "")
    if "available actions:" in suggestion.lower():
        # Extract "Available actions: add-foo, list-foos, ..."
        idx = suggestion.lower().index("available actions:")
        raw = suggestion[idx + len("available actions:"):].strip()
        parsed = [a.strip() for a in raw.split(",") if a.strip()]
        if parsed:
            return {"status": "ok", "skill": skill, "actions": parsed}

    # Level 3: Read from SKILL.md YAML frontmatter
    skill_md = os.path.join(SKILLS_DIR, skill, "SKILL.md")
    yaml_actions = get_skill_actions(skill_md)
    if yaml_actions:
        return {"status": "ok", "skill": skill, "actions": yaml_actions}

    return {"status": "error", "message": f"Could not discover actions for {skill}"}


@router.get("/api/v1/schema/params/{skill}")
async def get_skill_params(skill: str):
    """Return action parameter metadata parsed from SKILL.md body.

    Used by frontend to auto-generate forms without UI.yaml.
    Three-level fallback:
      1. SKILL.md table parsing (standard format)
      2. SKILL.md code block example parsing (e.g. payroll-style)
      3. Deep probe: run each action without args, parse error for required params
    """
    skill_md = os.path.join(SKILLS_DIR, skill, "SKILL.md")
    parsed = get_cached_params(skill, skill_md)

    # Level 1+2: SKILL.md parsing (tables then code blocks) succeeded
    if parsed and parsed.get("actions"):
        return JSONResponse(
            {"status": "ok", "skill": skill, "schema_source": "skill.md", **parsed},
            headers={"Cache-Control": "public, max-age=300, stale-while-revalidate=600"},
        )

    # Level 3: Deep probe — discover params by running actions without args
    # First, discover what actions exist
    discover_result = await execute_skill(skill, "__discover__", {})
    actions = discover_result.get("available_actions") or discover_result.get("available")
    if actions:
        probed = await probe_action_params(skill, actions)
        if probed and probed.get("actions"):
            return JSONResponse(
                {"status": "ok", "skill": skill, "schema_source": "probe", **probed},
                headers={"Cache-Control": "public, max-age=60"},
            )

    # No SKILL.md and no discoverable actions
    if not parsed:
        return JSONResponse(
            {"status": "error", "message": f"No SKILL.md found for {skill}"},
            status_code=404,
        )

    # SKILL.md exists but has no parseable action metadata
    return JSONResponse(
        {"status": "ok", "skill": skill, "schema_source": "skill.md", **parsed},
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/api/v1/schema/child-tables/{skill}")
async def get_child_tables(skill: str):
    """Return child table schemas discovered via SQLite PRAGMA introspection.

    Used by the frontend to auto-render repeatable row sections for child
    tables (items, details, etc.) without requiring manual UI.yaml config.
    """
    child_tables = introspect_child_tables(skill)
    if not child_tables:
        return JSONResponse(
            {"status": "ok", "skill": skill, "child_tables": {}},
            headers={"Cache-Control": "public, max-age=600"},
        )
    return JSONResponse(
        {"status": "ok", "skill": skill, "child_tables": child_tables},
        headers={"Cache-Control": "public, max-age=600"},
    )


@router.get("/api/v1/schema/skills")
async def list_skills():
    """List installed skills with metadata from SKILL.md frontmatter.

    Generic: discovers ANY skill directory containing a SKILL.md file.
    """
    skills = []
    for skill_md_path in sorted(glob.glob(os.path.join(SKILLS_DIR, "*/SKILL.md"))):
        skill_dir = os.path.dirname(skill_md_path)
        skill_name = os.path.basename(skill_dir)
        meta = {"name": skill_name}

        try:
            with open(skill_md_path, "r") as f:
                content = f.read()
            if content.startswith("---"):
                end = content.index("---", 3)
                frontmatter = yaml.safe_load(content[3:end])
                if frontmatter:
                    meta["description"] = frontmatter.get("description", "")
                    meta["version"] = frontmatter.get("version", "")
                    meta["category"] = frontmatter.get("category", "")
                    meta["tier"] = frontmatter.get("tier", 0)
                    meta["tags"] = frontmatter.get("tags", [])
                    meta["requires"] = frontmatter.get("requires", [])
                    # Read webclaw config if present (for smart UI)
                    webclaw = frontmatter.get("webclaw")
                    if webclaw and isinstance(webclaw, dict):
                        meta["webclaw"] = webclaw
                        # webclaw.category overrides top-level category
                        if webclaw.get("category"):
                            meta["category"] = webclaw["category"]
                    # Auto-detect category from skill name prefix if still empty
                    if not meta["category"] and "-" in skill_name:
                        prefix = skill_name.split("-")[0]
                        # Map known prefixes to categories
                        PREFIX_CATEGORIES = {
                            "auditclaw": "compliance",
                        }
                        meta["category"] = PREFIX_CATEGORIES.get(prefix, "")
        except Exception:
            pass

        skills.append(meta)

    return {"status": "ok", "skills": skills, "count": len(skills)}


@router.get("/api/v1/activity")
async def get_activity(limit: int = 10):
    """Recent activity from audit_log table in the erpclaw database."""
    import sqlite3

    erpclaw_db = os.path.expanduser("~/.openclaw/erpclaw/data.sqlite")
    try:
        conn = sqlite3.connect(erpclaw_db)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT skill, action, user_id, timestamp as created_at "
            "FROM audit_log ORDER BY timestamp DESC LIMIT ?",
            (min(limit, 50),),
        ).fetchall()
        conn.close()
        return {"status": "ok", "activity": [dict(r) for r in rows]}
    except Exception:
        return {"status": "ok", "activity": []}


@router.get("/api/v1/{skill}/{action}")
async def get_action(skill: str, action: str, request: Request):
    """Handle GET requests (list-*, get-*, status, etc.)."""
    params = dict(request.query_params)
    params = _inject_company_id(skill, action, params)
    result = await execute_skill(skill, action, params)
    status_code = 200 if result.get("status") == "ok" else 400
    return JSONResponse(result, status_code=status_code)


@router.post("/api/v1/{skill}/{action}")
async def post_action(skill: str, action: str, request: Request):
    """Handle POST requests (add-*, update-*, submit-*, cancel-*, delete-*)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    params = dict(request.query_params)
    params.update(body)
    params = _inject_company_id(skill, action, params)
    result = await execute_skill(skill, action, params)
    status_code = 200 if result.get("status") == "ok" else 400

    # Emit data-change event for successful mutating actions (SSE subscribers)
    if result.get("status") == "ok" and not action.startswith(("list-", "get-")):
        entity = action.split("-", 1)[1] if "-" in action else action
        await emit_data_change(skill, entity)

    return JSONResponse(result, status_code=status_code)
