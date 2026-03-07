"""Alerts API — evaluates alert rules against live skill data."""
import glob
import os
import sqlite3
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from skills.executor import SKILLS_DIR, execute_skill
from .alert_rules import get_rules_for_skills, _check_condition

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])

# Simple cache: (timestamp, alerts_list)
_cache: tuple[float, list[dict]] | None = None
CACHE_TTL = 300  # 5 minutes

# Company ID cache (rarely changes)
_company_id_cache: tuple[float, str | None] | None = None
_COMPANY_CACHE_TTL = 3600  # 1 hour

ERPCLAW_DB = os.path.expanduser("~/.openclaw/erpclaw/data.sqlite")


def _get_installed_skills() -> set[str]:
    """Discover installed skill names from SKILLS_DIR."""
    skills = set()
    for path in glob.glob(os.path.join(SKILLS_DIR, "*/SKILL.md")):
        skill_name = os.path.basename(os.path.dirname(path))
        skills.add(skill_name)
    # Also check for skills with only scripts/ (no SKILL.md)
    for path in glob.glob(os.path.join(SKILLS_DIR, "*/scripts/db_query.py")):
        skill_name = os.path.basename(os.path.dirname(os.path.dirname(path)))
        skills.add(skill_name)
    return skills


def _get_default_company_id() -> str | None:
    """Read the first company ID from the ERPClaw database."""
    global _company_id_cache
    now = time.time()
    if _company_id_cache and (now - _company_id_cache[0]) < _COMPANY_CACHE_TTL:
        return _company_id_cache[1]

    try:
        if not os.path.exists(ERPCLAW_DB):
            _company_id_cache = (now, None)
            return None
        conn = sqlite3.connect(ERPCLAW_DB)
        row = conn.execute("SELECT id FROM company LIMIT 1").fetchone()
        conn.close()
        company_id = row[0] if row else None
        _company_id_cache = (now, company_id)
        return company_id
    except Exception:
        _company_id_cache = (now, None)
        return None


def _extract_count(result: dict, field_name: str) -> float | None:
    """Extract a numeric count from skill result, handling various formats."""
    # Direct field
    raw = result.get(field_name)
    if raw is not None:
        try:
            return float(raw)
        except (ValueError, TypeError):
            pass

    # Fallback: count items in a list field (e.g., "work_orders", "leases", etc.)
    for key, val in result.items():
        if isinstance(val, list):
            return float(len(val))

    return None


@router.get("")
async def get_alerts(request: Request):
    """Evaluate alert rules and return fired alerts.

    Results are cached for 5 minutes to avoid excessive skill calls.
    """
    global _cache

    # Check cache
    now = time.time()
    if _cache and (now - _cache[0]) < CACHE_TTL:
        return {"status": "ok", "alerts": _cache[1], "cached": True}

    installed = _get_installed_skills()
    rules = get_rules_for_skills(installed)

    # Pre-fetch company ID for rules that need it
    company_id = _get_default_company_id() if any(r.needs_company_id for r in rules) else None

    alerts: list[dict] = []
    for rule in rules:
        try:
            params = {**rule.params, "limit": "0"}

            # Auto-inject company-id if needed and available
            if rule.needs_company_id and company_id:
                params["company-id"] = company_id

            result = await execute_skill(rule.skill, rule.action, params)
            if result.get("status") != "ok":
                continue

            value = _extract_count(result, rule.field)
            if value is None:
                continue

            if _check_condition(value, rule.condition, rule.threshold):
                alerts.append({
                    "severity": rule.severity,
                    "message": rule.message_template.format(value=int(value)),
                    "count": int(value),
                    "skill": rule.skill,
                    "link": rule.link_path,
                })
        except Exception:
            continue  # Non-critical — skip failed rules

    _cache = (now, alerts)
    return {"status": "ok", "alerts": alerts, "cached": False}
