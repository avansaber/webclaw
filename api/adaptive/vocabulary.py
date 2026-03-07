"""Vocabulary adaptation for Adaptive ERP.

Resolves profile-specific terminology overrides and injects them
into the chat system prompt so the AI uses the right vocabulary.
"""
from __future__ import annotations

import json

import db
from .profiles import get_current_profile


def get_vocabulary_context(user_id: str) -> dict | None:
    """Get the user's adaptive profile context for chat injection.

    Returns a dict with profile_name, active_skills, and vocabulary_overrides,
    or None if no profile is set.
    """
    conn = db.get_connection()
    profile = get_current_profile(conn, user_id)
    if not profile:
        return None

    overrides = {}
    try:
        overrides = json.loads(profile.get("vocabulary_overrides", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    active_skills = []
    try:
        active_skills = json.loads(profile.get("active_skills", "[]") or "[]")
    except (json.JSONDecodeError, TypeError):
        pass

    return {
        "profile_name": profile["display_name"],
        "profile_key": profile["profile_key"],
        "active_skills": active_skills,
        "vocabulary": overrides,
    }


def build_vocabulary_prompt(vocab_context: dict) -> str:
    """Build a system prompt snippet for vocabulary adaptation.

    Returns a formatted string to append to the chat system prompt.
    """
    parts = []
    profile_name = vocab_context.get("profile_name", "")
    if profile_name:
        parts.append(f"\n**Business profile: {profile_name}**")

    vocab = vocab_context.get("vocabulary", {})
    if vocab:
        parts.append("Use the following terminology for this business:")
        for standard, adapted in vocab.items():
            parts.append(f'- Use "{adapted}" instead of "{standard}"')

    skills = vocab_context.get("active_skills", [])
    if skills:
        skill_names = ", ".join(s.replace("erpclaw-", "").replace("healthclaw-", "").title() for s in skills)
        parts.append(f"\nActive modules: {skill_names}")

    return "\n".join(parts)
