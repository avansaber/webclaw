"""Child table introspection via SQLite PRAGMA.

Discovers child tables for a skill's database entities by analyzing
table naming patterns and column metadata. Used by the frontend to
auto-render repeatable row sections for child tables (items, details, etc.)
without requiring manual UI.yaml configuration.
"""

import re
import sqlite3

import db

# Suffixes that indicate a child table, mapped to param names
CHILD_SUFFIXES = {
    "_item": "items",
    "_detail": "details",
    "_line": "lines",
    "_entry": "entries",
    "_reading": "readings",
    "_account": "accounts",
}

# Columns to exclude from form rendering
EXCLUDE_COLUMNS = {
    "id",
    "created_at",
    "updated_at",
    # Computed columns (qty * rate)
    "amount",
    "net_amount",
    "total_amount",
    "base_amount",
    "base_net_amount",
    # Tracking qty columns (set by system, not user input)
    "received_qty",
    "invoiced_qty",
    "delivered_qty",
    "billed_qty",
    "returned_qty",
    "transferred_qty",
    "completed_qty",
    "produced_qty",
}

# Columns ending in _id that are lookups — map to list-{entity}s action
# e.g., item_id → list-items, warehouse_id → list-warehouses
ENTITY_PLURALS = {
    "company": "companies",
    "currency": "currencies",
    "delivery_note": "delivery-notes",
    "stock_entry": "stock-entries",
    "territory": "territories",
    "category": "categories",
}

# Cross-skill entity action mappings (mirrors ACTION_SKILL_MAP from frontend)
ENTITY_SKILL_MAP = {
    "list-items": "erpclaw-inventory",
    "list-warehouses": "erpclaw-inventory",
    "list-customers": "erpclaw-selling",
    "list-suppliers": "erpclaw-buying",
    "list-companies": "erpclaw-setup",
    "list-accounts": "erpclaw-setup",
    "list-cost-centers": "erpclaw-setup",
    "list-employees": "erpclaw-hr",
    "list-tax-templates": "erpclaw-tax",
    "list-assets": "erpclaw-assets",
}


def _pluralize(name: str) -> str:
    """Pluralize an entity name for list action derivation."""
    if name in ENTITY_PLURALS:
        return ENTITY_PLURALS[name]
    kebab = name.replace("_", "-")
    if kebab.endswith("s"):
        return kebab
    if kebab.endswith("y"):
        return kebab[:-1] + "ies"
    return kebab + "s"


def _column_to_label(col_name: str) -> str:
    """Convert column name to human-readable label."""
    # Remove _id suffix for labels
    name = col_name
    if name.endswith("_id"):
        name = name[:-3]
    return name.replace("_", " ").title()


def _infer_field_type(col_name: str) -> dict:
    """Infer form field type from column name.

    Returns dict with type and optional extra props (entity_action, step, etc.)
    """
    # Entity lookups: columns ending in _id
    if col_name.endswith("_id"):
        entity = col_name[:-3]  # item_id → item
        action = f"list-{_pluralize(entity)}"
        result = {
            "type": "entity-lookup",
            "entity_action": action,
            "entity_value_field": "id",
            "entity_display_field": "name",
        }
        skill = ENTITY_SKILL_MAP.get(action)
        if skill:
            result["entity_skill"] = skill
        return result

    # Currency fields
    if col_name in ("rate", "price", "cost") or col_name.endswith(("_rate", "_price", "_cost")):
        return {"type": "currency"}

    # Quantity fields
    if col_name in ("quantity", "qty"):
        return {"type": "number", "default": "1", "min": 1}

    # Percentage fields
    if col_name.endswith(("_percentage", "_percent")):
        return {"type": "number", "step": 0.01}

    # Date fields
    if col_name.endswith("_date") or col_name in ("date",):
        return {"type": "date"}

    # Default: text
    return {"type": "text"}


def introspect_child_tables(skill: str) -> dict:
    """Discover child tables for all entities in a skill's database.

    Returns:
        Dict keyed by parent entity name, each containing a list of
        child table info with field definitions.
    """
    conn = db.get_skill_db(skill)
    if not conn:
        return {}

    try:
        # Get all table names
        tables = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
        ]

        # Build set of parent tables (tables that don't match child patterns)
        parent_tables = set()
        child_candidates = []

        for table in tables:
            is_child = False
            for suffix in CHILD_SUFFIXES:
                if table.endswith(suffix):
                    parent = table[: -len(suffix)]
                    if parent in tables:
                        child_candidates.append((parent, table, suffix))
                        is_child = True
                        break
            if not is_child:
                parent_tables.add(table)

        result = {}
        for parent, child_table, suffix in child_candidates:
            # Get column info via PRAGMA
            columns = conn.execute(f"PRAGMA table_info('{child_table}')").fetchall()

            # Identify parent FK column
            parent_fk = f"{parent}_id"

            fields = []
            for col in columns:
                col_name = col[1]  # name is second element
                col_notnull = col[3]  # notnull is fourth element

                # Skip excluded columns and parent FK
                if col_name in EXCLUDE_COLUMNS or col_name == parent_fk:
                    continue

                field_info = _infer_field_type(col_name)
                field = {
                    "key": col_name.replace("_", "-"),
                    "label": _column_to_label(col_name),
                    "type": field_info["type"],
                    "required": bool(col_notnull),
                }

                # Add extra props from type inference
                for prop in ("entity_action", "entity_skill", "entity_value_field",
                             "entity_display_field", "default", "min", "step"):
                    if prop in field_info:
                        field[prop] = field_info[prop]

                fields.append(field)

            if fields:
                param_name = CHILD_SUFFIXES[suffix]
                if parent not in result:
                    result[parent] = []
                result[parent].append({
                    "table": child_table,
                    "param_name": param_name,
                    "fields": fields,
                })

        return result
    finally:
        conn.close()
