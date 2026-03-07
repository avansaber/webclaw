"""Expansion prompt engine for Adaptive ERP.

Evaluates trigger rules against usage counters and generates
expansion prompts when thresholds are exceeded.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .triggers import TRIGGER_RULES
from .usage_tracker import get_counters
from .profiles import get_current_profile


def evaluate_triggers(conn, user_id: str) -> list[dict]:
    """Evaluate all trigger rules for the user's active profile.

    Returns a list of newly created expansion prompts (if any).
    Skips rules where:
    - The suggested skill is already active
    - A prompt for this skill already exists (pending or accepted)
    - The threshold hasn't been reached
    - A required prerequisite skill isn't active
    """
    profile = get_current_profile(conn, user_id)
    if not profile:
        return []

    profile_id = profile["id"]
    # active_skills is already a list (parsed by get_current_profile)
    active_skills = profile["active_skills"]
    if isinstance(active_skills, str):
        active_skills = json.loads(active_skills)
    active_set = set(active_skills)

    counters = get_counters(conn, profile_id)

    # Get existing prompts to avoid duplicates
    existing = conn.execute(
        "SELECT suggested_skill, status FROM expansion_prompt WHERE profile_id = ?",
        (profile_id,),
    ).fetchall()
    prompted_skills = {r["suggested_skill"] for r in existing}

    new_prompts = []
    now = datetime.now(timezone.utc).isoformat()

    for rule in TRIGGER_RULES:
        # Skip if skill already active
        if rule.suggested_skill in active_set:
            continue

        # Skip if already prompted (pending or accepted)
        if rule.suggested_skill in prompted_skills:
            continue

        # Skip if prerequisite not met
        if rule.requires_active and rule.requires_active not in active_set:
            continue

        # Check threshold
        count = counters.get(rule.entity_type, 0)
        if count < rule.threshold:
            continue

        # Threshold met — create expansion prompt
        message = rule.message_template.format(n=count)
        prompt_id = str(uuid.uuid4())
        trigger_json = json.dumps({
            "rule_id": rule.id,
            "entity_type": rule.entity_type,
            "threshold": rule.threshold,
            "actual_count": count,
        })

        conn.execute(
            "INSERT INTO expansion_prompt (id, profile_id, trigger_rule, suggested_skill, message, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, 'pending', ?)",
            (prompt_id, profile_id, trigger_json, rule.suggested_skill, message, now),
        )

        new_prompts.append({
            "id": prompt_id,
            "suggested_skill": rule.suggested_skill,
            "message": message,
            "status": "pending",
            "created_at": now,
        })

    if new_prompts:
        conn.commit()

    return new_prompts
