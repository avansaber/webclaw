"""Business profile definitions and activation logic.

Each profile maps a business type to a set of core skills (activated on
onboarding) and optional expansions (suggested via triggers). Profiles also
carry vocabulary overrides so the AI chat can adapt terminology.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class ProfileTemplate:
    key: str
    display_name: str
    description: str
    icon: str
    core_skills: list[str]
    optional_skills: list[str] = field(default_factory=list)
    vocabulary: dict[str, str] = field(default_factory=dict)


# ── Profile catalogue ────────────────────────────────────────────────────────

PROFILES: dict[str, ProfileTemplate] = {}


def _register(p: ProfileTemplate) -> None:
    PROFILES[p.key] = p


_register(ProfileTemplate(
    key="general_business",
    display_name="General Business",
    description="Small-to-medium business with sales, purchasing, and inventory",
    icon="briefcase",
    core_skills=["erpclaw"],
    optional_skills=[
        "erpclaw-people", "erpclaw-ops", "erpclaw-growth",
    ],
    vocabulary={
        "patient": "customer",
        "encounter": "transaction",
        "provider": "employee",
    },
))

_register(ProfileTemplate(
    key="dental_practice",
    display_name="Dental Practice",
    description="Dental clinic with patient management, tooth charts, and CDT codes",
    icon="stethoscope",
    core_skills=[
        "healthclaw", "healthclaw-dental", "erpclaw",
    ],
    optional_skills=["erpclaw-people"],
    vocabulary={
        "customer": "patient",
        "transaction": "visit",
        "order": "treatment plan",
        "item": "procedure",
        "invoice": "statement",
    },
))

_register(ProfileTemplate(
    key="hospital",
    display_name="Hospital / Clinic",
    description="Full healthcare facility with clinical, lab, billing, and staff management",
    icon="building-2",
    core_skills=[
        "healthclaw", "erpclaw", "erpclaw-people",
    ],
    optional_skills=[
        "erpclaw-ops", "healthclaw-mental",
        "healthclaw-dental", "healthclaw-homehealth",
    ],
    vocabulary={
        "customer": "patient",
        "transaction": "encounter",
        "order": "clinical order",
        "item": "service",
        "employee": "provider",
    },
))

_register(ProfileTemplate(
    key="vet_clinic",
    display_name="Veterinary Clinic",
    description="Animal care with species profiles, vaccinations, and weight-based dosing",
    icon="heart-pulse",
    core_skills=[
        "healthclaw", "healthclaw-vet", "erpclaw",
    ],
    optional_skills=["erpclaw-people"],
    vocabulary={
        "customer": "pet owner",
        "patient": "animal",
        "encounter": "visit",
        "provider": "veterinarian",
    },
))

_register(ProfileTemplate(
    key="mental_health",
    display_name="Mental Health Practice",
    description="Therapy and counseling with assessments, treatment plans, and session notes",
    icon="brain",
    core_skills=[
        "healthclaw", "healthclaw-mental", "erpclaw",
    ],
    optional_skills=["erpclaw-people"],
    vocabulary={
        "customer": "client",
        "transaction": "session",
        "encounter": "session",
        "order": "treatment plan",
        "provider": "therapist",
    },
))

_register(ProfileTemplate(
    key="property_mgmt",
    display_name="Property Management",
    description="Rental properties, leases, tenants, maintenance, and accounting",
    icon="home",
    core_skills=["propclaw", "erpclaw"],
    optional_skills=["erpclaw-people"],
    vocabulary={
        "customer": "tenant",
        "order": "lease",
        "item": "unit",
        "invoice": "rent statement",
    },
))

_register(ProfileTemplate(
    key="manufacturing",
    display_name="Manufacturing",
    description="Production with BOMs, work orders, MRP, and quality control",
    icon="factory",
    core_skills=["erpclaw", "erpclaw-ops"],
    optional_skills=["erpclaw-people"],
    vocabulary={
        "patient": "product",
        "encounter": "production run",
    },
))

_register(ProfileTemplate(
    key="professional_services",
    display_name="Professional Services",
    description="Consulting, legal, or agency with projects, CRM, and time tracking",
    icon="users",
    core_skills=["erpclaw", "erpclaw-growth", "erpclaw-ops"],
    optional_skills=["erpclaw-people"],
    vocabulary={
        "patient": "client",
        "order": "engagement",
        "item": "deliverable",
    },
))

_register(ProfileTemplate(
    key="education_k12",
    display_name="K-12 School",
    description="School management with students, K-12 compliance, scheduling, and state reporting",
    icon="graduation-cap",
    core_skills=[
        "educlaw", "educlaw-k12", "erpclaw", "erpclaw-people",
    ],
    optional_skills=[
        "educlaw-scheduling", "educlaw-lms", "educlaw-finaid",
        "educlaw-statereport",
    ],
    vocabulary={
        "customer": "student",
        "order": "enrollment",
        "invoice": "tuition statement",
        "item": "course",
        "employee": "teacher",
    },
))

_register(ProfileTemplate(
    key="education_university",
    display_name="College / University",
    description="Higher education with financial aid, LMS integration, and accreditation reporting",
    icon="graduation-cap",
    core_skills=[
        "educlaw", "educlaw-finaid", "erpclaw", "erpclaw-people",
    ],
    optional_skills=[
        "educlaw-scheduling", "educlaw-lms", "educlaw-statereport",
        "educlaw-k12", "erpclaw-growth",
    ],
    vocabulary={
        "customer": "student",
        "order": "enrollment",
        "invoice": "bursar statement",
        "item": "course",
        "employee": "faculty",
        "lead": "applicant",
    },
))


# ── Database operations ──────────────────────────────────────────────────────

def list_templates() -> list[dict]:
    """Return all profile templates as dicts (no DB needed)."""
    return [
        {
            "key": p.key,
            "display_name": p.display_name,
            "description": p.description,
            "icon": p.icon,
            "core_skills": p.core_skills,
            "optional_skills": p.optional_skills,
        }
        for p in PROFILES.values()
    ]


def activate_profile(
    conn: sqlite3.Connection,
    user_id: str,
    profile_key: str,
    extra_skills: list[str] | None = None,
) -> dict:
    """Create an adaptive_profile and activate its core skills.

    If the user already has a profile, it is replaced.
    """
    template = PROFILES.get(profile_key)
    if not template:
        return {"error": f"Unknown profile: {profile_key}"}

    # Build skill list: core + any extras the user selected
    skills = list(template.core_skills)
    if extra_skills:
        for s in extra_skills:
            if s not in skills:
                skills.append(s)

    now = datetime.now(timezone.utc).isoformat()
    profile_id = str(uuid.uuid4())

    # Delete existing profile for this user (one profile per user)
    old = conn.execute(
        "SELECT id FROM adaptive_profile WHERE user_id = ?", (user_id,)
    ).fetchone()
    if old:
        conn.execute("DELETE FROM adaptive_profile WHERE id = ?", (old["id"],))

    conn.execute(
        "INSERT INTO adaptive_profile "
        "(id, user_id, profile_key, display_name, active_skills, vocabulary_overrides, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            profile_id, user_id, profile_key, template.display_name,
            json.dumps(skills), json.dumps(template.vocabulary),
            now, now,
        ),
    )

    # Log each skill activation
    for skill_name in skills:
        conn.execute(
            "INSERT INTO skill_activation (id, profile_id, skill_name, activated_at, activated_by) "
            "VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), profile_id, skill_name, now, "onboarding"),
        )

    conn.commit()

    return {
        "id": profile_id,
        "profile_key": profile_key,
        "display_name": template.display_name,
        "active_skills": skills,
    }


def get_current_profile(conn: sqlite3.Connection, user_id: str) -> dict | None:
    """Get the user's active profile, or None."""
    row = conn.execute(
        "SELECT id, profile_key, display_name, active_skills, vocabulary_overrides, created_at "
        "FROM adaptive_profile WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    if not row:
        return None

    return {
        "id": row["id"],
        "profile_key": row["profile_key"],
        "display_name": row["display_name"],
        "active_skills": json.loads(row["active_skills"]),
        "vocabulary_overrides": json.loads(row["vocabulary_overrides"]),
        "created_at": row["created_at"],
    }


def update_skills(
    conn: sqlite3.Connection,
    user_id: str,
    add: list[str] | None = None,
    remove: list[str] | None = None,
) -> dict:
    """Add or remove skills from the user's active profile."""
    profile = get_current_profile(conn, user_id)
    if not profile:
        return {"error": "No active profile"}

    skills = list(profile["active_skills"])
    now = datetime.now(timezone.utc).isoformat()

    if add:
        for s in add:
            if s not in skills:
                skills.append(s)
                conn.execute(
                    "INSERT OR IGNORE INTO skill_activation "
                    "(id, profile_id, skill_name, activated_at, activated_by) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), profile["id"], s, now, "manual"),
                )

    if remove:
        # Never allow removing erpclaw (foundation)
        for s in remove:
            if s in skills and s != "erpclaw":
                skills.remove(s)

    conn.execute(
        "UPDATE adaptive_profile SET active_skills = ?, updated_at = ? WHERE id = ?",
        (json.dumps(skills), now, profile["id"]),
    )
    conn.commit()

    return {"active_skills": skills}


def seed_vocabulary(conn: sqlite3.Connection) -> None:
    """Seed vocabulary_map from all profile templates. Idempotent."""
    for p in PROFILES.values():
        for standard, adapted in p.vocabulary.items():
            conn.execute(
                "INSERT OR REPLACE INTO vocabulary_map (profile_key, standard_term, adapted_term) "
                "VALUES (?, ?, ?)",
                (p.key, standard, adapted),
            )
    conn.commit()
