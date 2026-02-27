"""Entity resolver — fuzzy search across skill databases for context resolution.

Supports two modes:
1. Dynamic: reads webclaw.entities from SKILL.md and queries skill-specific DBs
2. Fallback: hardcoded ERP entity tables (backward-compatible with existing erpclaw skills)
"""

from __future__ import annotations

import glob
import os
import sqlite3

import yaml

import db
from skills.executor import SKILLS_DIR

# Fallback entity config for erpclaw skills (backward compatibility)
# Used when a skill has no webclaw.entities in its SKILL.md
_DEFAULT_ENTITY_TABLES: dict[str, tuple[str, str, str, list[str]]] = {
    "customer": ("customer", "customer_name", "id", ["email", "customer_group"]),
    "supplier": ("supplier", "supplier_name", "id", ["email", "supplier_group"]),
    "item": ("item", "item_name", "id", ["item_code", "item_group"]),
    "account": ("account", "account_name", "id", ["account_number", "account_type"]),
    "employee": ("employee", "employee_name", "id", ["employee_id", "department"]),
    "company": ("company", "company_name", "id", []),
    "warehouse": ("warehouse", "warehouse_name", "id", ["warehouse_type"]),
    "project": ("project", "project_name", "id", ["status"]),
}

# Cache: skill_name → entity config dict
_entity_config_cache: dict[str, dict] = {}


def _load_skill_entities(skill_name: str) -> dict[str, tuple[str, str, str, list[str]]]:
    """Load entity config from a skill's SKILL.md webclaw.entities section.

    Returns dict of entity_type → (table, name_col, id_col, search_cols).
    """
    if skill_name in _entity_config_cache:
        return _entity_config_cache[skill_name]

    entities: dict[str, tuple[str, str, str, list[str]]] = {}
    skill_md = os.path.join(SKILLS_DIR, skill_name, "SKILL.md")

    try:
        with open(skill_md, "r") as f:
            content = f.read()
        if content.startswith("---"):
            end = content.index("---", 3)
            frontmatter = yaml.safe_load(content[3:end])
            if frontmatter:
                webclaw = frontmatter.get("webclaw", {})
                if isinstance(webclaw, dict) and webclaw.get("entities"):
                    for etype, config in webclaw["entities"].items():
                        if isinstance(config, dict):
                            entities[etype] = (
                                config.get("table", etype + "s"),
                                config.get("name_col", "name"),
                                config.get("id_col", "id"),
                                config.get("search_cols", []),
                            )
    except Exception:
        pass

    _entity_config_cache[skill_name] = entities
    return entities


def resolve_entity(
    entity_type: str | None,
    query: str,
    limit: int = 5,
    conn: sqlite3.Connection | None = None,
    skill: str | None = None,
) -> list[dict]:
    """Search for an entity by name, returning ranked matches.

    Args:
        entity_type: Specific type to search (e.g., "customer"), or None for all.
        query: Natural language query string.
        limit: Max results per type.
        conn: Optional DB connection (if None, auto-detects from skill).
        skill: Optional skill name for per-skill entity resolution.

    Returns:
        List of matches sorted by confidence.
    """
    if not query or not query.strip():
        return []

    q = query.strip().lower()
    results: list[dict] = []

    # Determine which entity configs and DBs to use
    search_targets: list[tuple[dict[str, tuple], sqlite3.Connection | None]] = []

    if skill:
        # Try skill-specific entities first
        skill_entities = _load_skill_entities(skill)
        if skill_entities:
            skill_conn = conn or db.get_skill_db(skill)
            if skill_conn:
                search_targets.append((skill_entities, skill_conn))

    # If no skill-specific entities found, use defaults
    if not search_targets:
        if conn is None:
            # Try to get any available skill DB (default erpclaw)
            conn = db.get_skill_db("erpclaw-setup")
        if conn:
            search_targets.append((_DEFAULT_ENTITY_TABLES, conn))

    for entity_tables, db_conn in search_targets:
        if db_conn is None:
            continue

        types_to_search = (
            {entity_type: entity_tables[entity_type]}
            if entity_type and entity_type in entity_tables
            else entity_tables
        )

        for etype, (table, name_col, id_col, extras) in types_to_search.items():
            try:
                # Check if table exists
                exists = db_conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    (table,),
                ).fetchone()
                if not exists:
                    continue

                # Exact match → confidence 1.0
                sql = f"SELECT {id_col}, {name_col}"
                if extras:
                    sql += ", " + ", ".join(extras)
                sql += f" FROM {table} WHERE LOWER({name_col}) = ? LIMIT ?"

                for row in db_conn.execute(sql, (q, limit)):
                    results.append(_build_match(row, etype, name_col, id_col, extras, 1.0, "exact match"))

                # Starts-with match → confidence 0.85
                sql_starts = f"SELECT {id_col}, {name_col}"
                if extras:
                    sql_starts += ", " + ", ".join(extras)
                sql_starts += f" FROM {table} WHERE LOWER({name_col}) LIKE ? AND LOWER({name_col}) != ? LIMIT ?"

                for row in db_conn.execute(sql_starts, (f"{q}%", q, limit)):
                    results.append(_build_match(row, etype, name_col, id_col, extras, 0.85, "starts with"))

                # Contains match → confidence 0.65
                sql_contains = f"SELECT {id_col}, {name_col}"
                if extras:
                    sql_contains += ", " + ", ".join(extras)
                sql_contains += f" FROM {table} WHERE LOWER({name_col}) LIKE ? AND LOWER({name_col}) NOT LIKE ? LIMIT ?"

                for row in db_conn.execute(sql_contains, (f"%{q}%", f"{q}%", limit)):
                    results.append(_build_match(row, etype, name_col, id_col, extras, 0.65, "contains"))

            except Exception:
                continue

    # Sort by confidence descending
    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results[:limit]


def _build_match(
    row, entity_type: str, name_col: str, id_col: str, extras: list[str],
    confidence: float, match_type: str,
) -> dict:
    """Build a match result dict from a DB row."""
    if hasattr(row, "keys"):
        row_dict = dict(row)
        eid = row_dict.get(id_col, "")
        name = row_dict.get(name_col, "")
        extra = {k: row_dict.get(k) for k in extras if k in row_dict}
    else:
        eid = row[0]
        name = row[1]
        extra = {extras[i]: row[i + 2] for i in range(len(extras)) if i + 2 < len(row)}

    return {
        "id": str(eid),
        "name": str(name),
        "entity_type": entity_type,
        "confidence": confidence,
        "source_detail": f"{match_type}: '{name}'",
        "extra": extra,
    }
