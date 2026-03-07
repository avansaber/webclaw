"""Usage counter tracking for Adaptive ERP.

Increments entity-type counters when mutating actions succeed.
Used by the expansion engine to trigger skill suggestions.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import db
from .profiles import get_current_profile


# Map action entity stems to entity_type + skill_name.
# e.g., "add-patient" → entity_type="patient", skill_name from the request.
# Only "add-*" and "create-*" actions increment counters (new entity creation).
ENTITY_MAP: dict[str, str] = {
    # HealthClaw
    "patient": "patient",
    "encounter": "encounter",
    "appointment": "appointment",
    "treatment-plan": "treatment_plan",
    # Dental
    "tooth-chart": "tooth_chart",
    # Vet
    "animal": "animal",
    # Mental health
    "assessment": "assessment",
    # ERPClaw core
    "employee": "employee",
    "customer": "customer",
    "vendor": "vendor",
    "supplier": "supplier",
    "item": "item",
    "sales-order": "sales_order",
    "purchase-order": "purchase_order",
    "invoice": "invoice",
    "sales-invoice": "sales_invoice",
    "purchase-invoice": "purchase_invoice",
    "project": "project",
    "task": "task",
    "asset": "asset",
    "work-order": "work_order",
    "bom": "bom",
    "support-ticket": "support_ticket",
    "issue": "issue",
    "lead": "lead",
    "opportunity": "opportunity",
    # PropClaw
    "property": "property",
    "lease": "lease",
    "tenant": "tenant",
}


def track_action(user_id: str, skill: str, action: str) -> None:
    """Increment usage counter for a successful mutating action.

    Only tracks add-* and create-* actions (entity creation).
    Silently returns if no profile exists or entity isn't tracked.
    """
    # Only track entity-creating actions
    if not (action.startswith("add-") or action.startswith("create-")):
        return

    # Extract entity stem: "add-patient" → "patient", "create-sales-invoice" → "sales-invoice"
    entity_stem = action.split("-", 1)[1] if "-" in action else action
    entity_type = ENTITY_MAP.get(entity_stem)
    if not entity_type:
        return

    try:
        conn = db.get_connection()
        profile = get_current_profile(conn, user_id)
        if not profile:
            return

        profile_id = profile["id"]
        now = datetime.now(timezone.utc).isoformat()

        # Upsert: increment if exists, insert if not
        existing = conn.execute(
            "SELECT id, count FROM usage_counter "
            "WHERE profile_id = ? AND entity_type = ? AND skill_name = ?",
            (profile_id, entity_type, skill),
        ).fetchone()

        if existing:
            conn.execute(
                "UPDATE usage_counter SET count = count + 1, last_updated = ? "
                "WHERE id = ?",
                (now, existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO usage_counter (id, profile_id, entity_type, skill_name, count, last_updated) "
                "VALUES (?, ?, ?, ?, 1, ?)",
                (str(uuid.uuid4()), profile_id, entity_type, skill, now),
            )
        conn.commit()
    except Exception:
        # Usage tracking is non-critical — never break the action
        pass


def get_counters(conn, profile_id: str) -> dict[str, int]:
    """Get all usage counters for a profile as {entity_type: count}."""
    rows = conn.execute(
        "SELECT entity_type, count FROM usage_counter WHERE profile_id = ?",
        (profile_id,),
    ).fetchall()
    return {r["entity_type"]: r["count"] for r in rows}
