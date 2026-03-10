"""Business profile definitions and activation logic.

Each profile maps a business type to a set of core skills (activated on
onboarding) and optional expansions (suggested via triggers). Profiles also
carry vocabulary overrides so the AI chat can adapt terminology.

Profile keys match erpclaw's onboarding.py for consistency (hyphen-case).
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
# 18 profiles matching erpclaw/scripts/onboarding.py

PROFILES: dict[str, ProfileTemplate] = {}


def _register(p: ProfileTemplate) -> None:
    PROFILES[p.key] = p


_register(ProfileTemplate(
    key="small-business",
    display_name="Small Business",
    description="General small business: sales, purchasing, basic inventory, CRM",
    icon="briefcase",
    core_skills=["erpclaw"],
    optional_skills=[
        "erpclaw-ops", "erpclaw-growth",
    ],
    vocabulary={
        "patient": "customer",
        "encounter": "transaction",
        "provider": "employee",
    },
))

_register(ProfileTemplate(
    key="retail",
    display_name="Retail Business",
    description="Brick-and-mortar or e-commerce retail: POS, pricing, loyalty, merchandising",
    icon="shopping-cart",
    core_skills=["erpclaw", "retailclaw"],
    optional_skills=[
        "erpclaw-growth", "erpclaw-pos",
    ],
    vocabulary={
        "patient": "customer",
        "encounter": "sale",
        "order": "sales order",
    },
))

_register(ProfileTemplate(
    key="manufacturing",
    display_name="Manufacturing",
    description="Production: BOMs, work orders, MRP, quality control, asset management",
    icon="factory",
    core_skills=["erpclaw", "erpclaw-ops"],
    optional_skills=[
        "erpclaw-growth", "erpclaw-maintenance",
    ],
    vocabulary={
        "patient": "product",
        "encounter": "production run",
    },
))

_register(ProfileTemplate(
    key="professional-services",
    display_name="Professional Services",
    description="Consulting, agencies: projects, timesheets, billing, CRM",
    icon="users",
    core_skills=["erpclaw", "erpclaw-growth", "erpclaw-ops"],
    optional_skills=[],
    vocabulary={
        "patient": "client",
        "order": "engagement",
        "item": "deliverable",
    },
))

_register(ProfileTemplate(
    key="distribution",
    display_name="Distribution / Wholesale",
    description="Distribution and wholesale: advanced inventory, buying, selling, logistics",
    icon="truck",
    core_skills=["erpclaw", "retailclaw"],
    optional_skills=[
        "erpclaw-growth", "erpclaw-logistics",
    ],
    vocabulary={
        "patient": "customer",
        "order": "purchase order",
        "item": "SKU",
    },
))

_register(ProfileTemplate(
    key="saas",
    display_name="SaaS / Subscription",
    description="Software-as-a-Service: usage billing, subscriptions, CRM, analytics",
    icon="cloud",
    core_skills=["erpclaw", "erpclaw-growth"],
    optional_skills=[
        "erpclaw-integrations",
    ],
    vocabulary={
        "patient": "subscriber",
        "order": "subscription",
        "invoice": "billing statement",
    },
))

_register(ProfileTemplate(
    key="property-management",
    display_name="Property Management",
    description="Rental properties, leases, tenants, maintenance, and accounting",
    icon="home",
    core_skills=["erpclaw", "propertyclaw"],
    optional_skills=[
        "propertyclaw-commercial", "erpclaw-maintenance",
    ],
    vocabulary={
        "customer": "tenant",
        "order": "lease",
        "item": "unit",
        "invoice": "rent statement",
    },
))

_register(ProfileTemplate(
    key="healthcare",
    display_name="Hospital / Clinic",
    description="Full healthcare facility with clinical, lab, billing, and staff management",
    icon="building-2",
    core_skills=["erpclaw", "healthclaw"],
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
    key="dental",
    display_name="Dental Practice",
    description="Dental clinic with patient management, tooth charts, and CDT codes",
    icon="stethoscope",
    core_skills=["erpclaw", "healthclaw", "healthclaw-dental"],
    optional_skills=[],
    vocabulary={
        "customer": "patient",
        "transaction": "visit",
        "order": "treatment plan",
        "item": "procedure",
        "invoice": "statement",
    },
))

_register(ProfileTemplate(
    key="veterinary",
    display_name="Veterinary Clinic",
    description="Animal care with species profiles, vaccinations, and weight-based dosing",
    icon="heart-pulse",
    core_skills=["erpclaw", "healthclaw", "healthclaw-vet"],
    optional_skills=[],
    vocabulary={
        "customer": "pet owner",
        "patient": "animal",
        "encounter": "visit",
        "provider": "veterinarian",
    },
))

_register(ProfileTemplate(
    key="mental-health",
    display_name="Mental Health Practice",
    description="Therapy and counseling with assessments, treatment plans, and session notes",
    icon="brain",
    core_skills=["erpclaw", "healthclaw", "healthclaw-mental"],
    optional_skills=[],
    vocabulary={
        "customer": "client",
        "transaction": "session",
        "encounter": "session",
        "order": "treatment plan",
        "provider": "therapist",
    },
))

_register(ProfileTemplate(
    key="home-health",
    display_name="Home Health Agency",
    description="Home health: visits, care plans, aides, scheduling, compliance",
    icon="home-heart",
    core_skills=["erpclaw", "healthclaw", "healthclaw-homehealth"],
    optional_skills=[],
    vocabulary={
        "customer": "patient",
        "transaction": "visit",
        "order": "care plan",
        "employee": "aide",
    },
))

_register(ProfileTemplate(
    key="k12-school",
    display_name="K-12 School",
    description="School management with students, K-12 compliance, scheduling, and state reporting",
    icon="graduation-cap",
    core_skills=["erpclaw", "educlaw", "educlaw-k12"],
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
    key="college-university",
    display_name="College / University",
    description="Higher education with financial aid, LMS integration, and accreditation reporting",
    icon="graduation-cap",
    core_skills=["erpclaw", "educlaw", "educlaw-finaid"],
    optional_skills=[
        "educlaw-scheduling", "educlaw-lms", "educlaw-statereport",
        "educlaw-highered", "erpclaw-growth",
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

_register(ProfileTemplate(
    key="nonprofit",
    display_name="Nonprofit / NGO",
    description="Nonprofit: grants, donor management, fund accounting, CRM",
    icon="heart-handshake",
    core_skills=["erpclaw", "nonprofitclaw"],
    optional_skills=[
        "erpclaw-growth",
    ],
    vocabulary={
        "customer": "donor",
        "order": "grant",
        "invoice": "receipt",
        "item": "program",
    },
))

_register(ProfileTemplate(
    key="enterprise",
    display_name="Enterprise",
    description="Full enterprise: all modules including advanced accounting, integrations",
    icon="building",
    core_skills=["erpclaw", "erpclaw-growth", "erpclaw-ops"],
    optional_skills=[
        "erpclaw-integrations", "erpclaw-alerts",
    ],
    vocabulary={
        "patient": "customer",
        "encounter": "transaction",
    },
))

_register(ProfileTemplate(
    key="full-erp",
    display_name="Full ERP Suite",
    description="Everything: all expansion modules, all verticals, all regional packs",
    icon="layers",
    core_skills=[
        "erpclaw", "erpclaw-growth", "erpclaw-ops",
        "erpclaw-integrations", "erpclaw-alerts",
        "retailclaw", "propertyclaw", "healthclaw", "educlaw",
    ],
    optional_skills=[],
    vocabulary={},
))

_register(ProfileTemplate(
    key="custom",
    display_name="Custom",
    description="Choose your own modules — start with core and add what you need",
    icon="settings",
    core_skills=["erpclaw"],
    optional_skills=[
        "erpclaw-ops", "erpclaw-growth", "erpclaw-integrations",
        "erpclaw-alerts", "retailclaw", "propertyclaw",
        "healthclaw", "educlaw", "nonprofitclaw",
    ],
    vocabulary={},
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
