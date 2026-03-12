"""Auto-generate UIConfig from SKILL.md metadata.

When a skill has no UI.yaml, this module generates a complete UIConfig dict
from SKILL.md action/parameter metadata. The generated config matches the
ocui_version 1.0 schema used by the frontend — same structure as a hand-written
UI.yaml, just inferred from action naming conventions and parameter types.

The generated config is cached to disk (~/clawd/skills/{skill}/.generated-ui.json)
so it's only regenerated when SKILL.md changes.
"""
import json
import os
import re

import yaml

from .executor import SKILLS_DIR, MODULES_DIR
from .skillmd_parser import get_cached_params, _name_to_label

# Cache: skill → (skill_md_mtime, ui_config)
_gen_cache: dict[str, tuple[float, dict]] = {}

# Status field value → color mapping (used for badge colors)
_STATUS_COLORS = {
    # Universal
    "active": "green", "inactive": "gray", "pending": "yellow",
    "completed": "green", "cancelled": "red", "closed": "gray",
    # Draft-submit lifecycle
    "draft": "gray", "submitted": "blue", "approved": "green",
    "rejected": "red", "overdue": "red", "paid": "green",
    # Wells / operations
    "drilling": "blue", "producing": "green", "shut_in": "yellow",
    "permitted": "yellow", "completing": "blue", "ta": "orange", "pa": "gray",
    # Leases
    "expired": "red", "hbp": "blue", "terminated": "red",
    # Deals
    "open": "blue", "won": "green", "lost": "red",
    # Tasks
    "in_progress": "blue", "open": "blue",
    # General
    "enabled": "green", "disabled": "gray", "archived": "gray",
    "confirmed": "green", "processing": "blue",
}

# Icon mapping: entity keyword → lucide icon name
_ENTITY_ICONS = {
    "company": "building-2", "customer": "users", "supplier": "truck",
    "contact": "contact", "employee": "user-check", "user": "user",
    "well": "fuel", "lease": "file-text", "deal": "handshake",
    "activity": "activity", "task": "check-square", "basin": "map",
    "interest": "percent", "report": "bar-chart-3", "dashboard": "layout-dashboard",
    "invoice": "file-text", "order": "shopping-cart", "payment": "credit-card",
    "item": "package", "account": "book-open", "journal": "book",
    "warehouse": "warehouse", "inventory": "boxes", "stock": "boxes",
    "patient": "heart-pulse", "appointment": "calendar", "claim": "file-check",
    "property": "home", "unit": "door-open", "tenant": "key",
    "student": "graduation-cap", "course": "book-open", "enrollment": "clipboard-list",
    "vehicle": "car", "recipe": "utensils", "menu": "menu",
    "project": "folder-kanban", "asset": "hard-drive", "ticket": "ticket",
    "loan": "banknote", "fleet": "truck", "document": "file",
}

# Skill name → color
_SKILL_COLORS = {
    "erpclaw": "#2563eb", "oilcrm": "#d97706", "healthclaw": "#dc2626",
    "educlaw": "#7c3aed", "propertyclaw": "#059669", "retailclaw": "#e11d48",
    "constructclaw": "#ea580c", "agricultureclaw": "#16a34a",
    "automotiveclaw": "#4f46e5", "foodclaw": "#c026d3", "hospitalityclaw": "#0891b2",
    "legalclaw": "#6366f1", "nonprofitclaw": "#0d9488",
}


_SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _find_skill_md(skill: str) -> str | None:
    """Find SKILL.md for a skill (validates skill name to prevent path traversal)."""
    if not _SKILL_NAME_RE.match(skill):
        return None
    for base in [SKILLS_DIR, MODULES_DIR]:
        path = os.path.join(base, skill, "SKILL.md")
        if os.path.isfile(path):
            return path
    return None


def _read_frontmatter(skill_md_path: str) -> dict:
    """Read YAML frontmatter from SKILL.md."""
    try:
        with open(skill_md_path) as f:
            content = f.read()
        if not content.startswith("---"):
            return {}
        end = content.index("---", 3)
        return yaml.safe_load(content[3:end]) or {}
    except Exception:
        return {}


def _singularize(word: str) -> str:
    """Basic English singularization for entity names."""
    if word.endswith("ies"):
        return word[:-3] + "y"
    if word.endswith("ses"):
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def _pluralize(word: str) -> str:
    """Basic English pluralization for entity names."""
    if word.endswith("y") and word[-2] not in "aeiou":
        return word[:-1] + "ies"
    if word.endswith(("s", "sh", "ch", "x", "z")):
        return word + "es"
    return word + "s"


def _entity_icon(entity_key: str) -> str:
    """Pick a lucide icon for an entity based on keyword matching."""
    for keyword, icon in _ENTITY_ICONS.items():
        if keyword in entity_key:
            return icon
    return "file"


def _infer_entities(parsed: dict) -> dict[str, dict]:
    """Group actions into entity definitions.

    Returns {entity_key: {actions: {action_type: action_name}, fields: [...]}}.
    """
    entities: dict[str, dict] = {}

    for action_name, action_data in parsed.get("actions", {}).items():
        # Skip setup/seed/utility actions
        action_type = action_data.get("action_type", "")
        if action_type in ("setup", "utility") or action_name.startswith(("seed-", "setup-")):
            continue

        # Derive entity key from action name
        prefix_map = {
            "add-": "create", "create-": "create", "update-": "update",
            "list-": "list", "get-": "read", "delete-": "delete",
            "submit-": "submit", "cancel-": "cancel",
            "complete-": "status-transition", "approve-": "status-transition",
            "reject-": "status-transition", "advance-": "status-transition",
            "win-": "status-transition", "lose-": "status-transition",
            "confirm-": "status-transition",
        }

        matched_prefix = None
        matched_type = None
        for prefix, atype in prefix_map.items():
            if action_name.startswith(prefix):
                matched_prefix = prefix
                matched_type = atype
                break

        if not matched_prefix:
            continue

        suffix = action_name[len(matched_prefix):]
        entity_key = _singularize(suffix).replace("-", "_")

        if entity_key not in entities:
            entities[entity_key] = {
                "actions": {},
                "params": {},
                "status_options": None,
            }

        # Map action type → action name
        entities[entity_key]["actions"][matched_type] = action_name

        # Collect params (prefer create action, then update, then others)
        if matched_type == "create":
            all_params = (action_data.get("required", []) +
                          action_data.get("optional", []))
            entities[entity_key]["params"]["create"] = all_params
        elif matched_type == "update" and "create" not in entities[entity_key]["params"]:
            all_params = (action_data.get("required", []) +
                          action_data.get("optional", []))
            entities[entity_key]["params"]["update"] = all_params
        elif matched_type == "list":
            entities[entity_key]["params"]["list"] = (
                action_data.get("required", []) + action_data.get("optional", [])
            )

    # Filter: only keep entities that have at least a list or create action
    return {
        k: v for k, v in entities.items()
        if "list" in v["actions"] or "create" in v["actions"]
    }


def _build_fields(entity_key: str, entity_data: dict) -> dict[str, dict]:
    """Build UIConfig fields from action parameters."""
    fields: dict[str, dict] = {}
    seen_names = set()

    # Use create params first (most complete), then update, then list
    param_lists = []
    for source in ("create", "update", "list"):
        if source in entity_data["params"]:
            param_lists.append((source, entity_data["params"][source]))

    for source, params in param_lists:
        for param in params:
            name = param.get("name", "")
            if not name:
                continue

            # Normalize to underscore (field keys use underscores)
            field_key = name.replace("-", "_")

            # Skip pagination/filter-only params
            if field_key in ("limit", "offset", "search", "page", "sort", "order"):
                continue

            if field_key in seen_names:
                continue
            seen_names.add(field_key)

            ptype = param.get("type", "text")
            label = param.get("label", _name_to_label(name))
            required = param.get("required", False)

            field: dict = {
                "type": _map_param_type(ptype),
                "label": label,
                "required": required,
                "in_list_view": source != "list" and field_key not in (
                    "notes", "remarks", "description", "address",
                    "address_line1", "address_line2",
                ),
                "in_detail_view": True,
                "in_form_view": source != "list",
            }

            # Keep param_name for CLI flag mapping
            field["param_name"] = name

            # Options for select fields
            options = param.get("options")
            if options:
                field["options"] = options
                # Detect status fields
                if "status" in field_key:
                    entity_data["status_options"] = [
                        o.get("value", o) if isinstance(o, dict) else o
                        for o in options
                    ]

            # Entity lookups
            if ptype == "entity-lookup":
                field["type"] = "link"
                lookup_skill = param.get("lookup_skill", "")
                lookup_action = param.get("lookup_action", "")
                if lookup_action:
                    field["link_search_action"] = lookup_action
                if lookup_skill:
                    field["link_entity"] = lookup_skill

            fields[field_key] = field

    return fields


def _map_param_type(ptype: str) -> str:
    """Map skillmd_parser param types to UI.yaml field types."""
    mapping = {
        "text": "text", "email": "text", "phone": "text",
        "number": "number", "integer": "integer",
        "currency": "currency", "date": "date", "time": "text",
        "boolean": "boolean", "select": "select",
        "textarea": "textarea", "json": "json",
        "entity-lookup": "link",
    }
    return mapping.get(ptype, "text")


def _detect_name_field(fields: dict[str, dict]) -> str:
    """Find the primary name/title field for an entity."""
    # Priority: name, title, *_name, label, subject
    priority = ["name", "title", "label", "subject"]
    for key in priority:
        if key in fields:
            return key

    # *_name pattern (e.g., well_name, lease_name, company_name)
    for key in fields:
        if key.endswith("_name"):
            return key

    # First text field that's required
    for key, fdef in fields.items():
        if fdef.get("type") == "text" and fdef.get("required"):
            return key

    # First field
    return next(iter(fields), "id")


def _detect_status_field(fields: dict[str, dict]) -> str | None:
    """Find the status field for an entity."""
    for key in fields:
        if "status" in key and fields[key].get("type") == "select":
            return key
    return None


def _build_status_colors(entity_data: dict, status_field: str | None) -> dict[str, str]:
    """Build status → color mapping from known status values."""
    colors = {}
    if entity_data.get("status_options"):
        for val in entity_data["status_options"]:
            colors[val] = _STATUS_COLORS.get(val, "gray")
    return colors


def _build_list_view(fields: dict[str, dict], name_field: str) -> dict:
    """Build list view configuration (columns, filters)."""
    columns = []
    filters = []

    # Name field is always first and linked
    if name_field in fields:
        columns.append({"field": name_field, "link": True})

    # Add up to 5 more visible fields
    for key, fdef in fields.items():
        if key == name_field:
            continue
        if not fdef.get("in_list_view", True):
            continue
        if len(columns) >= 6:
            break

        col: dict = {"field": key}
        if fdef.get("type") in ("currency", "number", "integer", "percent"):
            col["align"] = "right"
        columns.append(col)

        # Select fields become filters
        if fdef.get("type") == "select" and fdef.get("options"):
            filters.append({
                "field": key,
                "type": "select",
                "label": fdef.get("label", key),
            })

    return {
        "columns": columns,
        "filters": filters,
    }


def _build_detail_view(
    fields: dict[str, dict],
    name_field: str,
    status_field: str | None,
    entity_data: dict,
) -> dict:
    """Build detail view configuration (header, sections, actions)."""
    # Header
    header: dict = {"title_field": name_field}

    # Find a good subtitle field (type, category, etc.)
    for key in fields:
        if key != name_field and fields[key].get("type") == "select" and "status" not in key:
            header["subtitle_field"] = key
            break

    if status_field:
        header["status_field"] = status_field

    # Find amount field
    for key, fdef in fields.items():
        if fdef.get("type") == "currency":
            header["amount_field"] = key
            break

    # Build sections: Main info, then Additional
    main_fields = []
    extra_fields = []
    for key, fdef in fields.items():
        if fdef.get("type") == "textarea":
            extra_fields.append(key)
        elif fdef.get("in_detail_view", True):
            main_fields.append(key)

    sections = [{"label": "Details", "fields": main_fields, "columns": 2}]
    if extra_fields:
        sections.append({
            "label": "Notes & Description",
            "fields": extra_fields,
            "columns": 1,
            "collapsible": True,
        })

    # Actions
    actions = []
    if "update" in entity_data["actions"]:
        actions.append({
            "action": entity_data["actions"]["update"],
            "label": "Edit",
            "primary": True,
        })
    if "submit" in entity_data["actions"]:
        actions.append({
            "action": entity_data["actions"]["submit"],
            "label": "Submit",
            "requires_status": "draft",
        })
    if "cancel" in entity_data["actions"]:
        actions.append({
            "action": entity_data["actions"]["cancel"],
            "label": "Cancel",
            "requires_status": ["submitted", "active"],
            "destructive": True,
        })
    if "delete" in entity_data["actions"]:
        actions.append({
            "action": entity_data["actions"]["delete"],
            "label": "Delete",
            "destructive": True,
        })
    # Status transition actions
    for atype in ("status-transition",):
        if atype in entity_data["actions"]:
            action_name = entity_data["actions"][atype]
            label = action_name.replace("-", " ").title()
            actions.append({"action": action_name, "label": label})

    return {"header": header, "sections": sections, "actions": actions}


def _build_form_view(fields: dict[str, dict]) -> dict:
    """Build form view configuration (field groups)."""
    required_fields = []
    optional_fields = []
    textarea_fields = []

    for key, fdef in fields.items():
        if not fdef.get("in_form_view", True):
            continue
        if fdef.get("type") == "textarea":
            textarea_fields.append(key)
        elif fdef.get("required"):
            required_fields.append(key)
        else:
            optional_fields.append(key)

    groups = []
    if required_fields:
        groups.append({
            "label": "Required Information",
            "fields": required_fields,
            "columns": 2,
        })
    if optional_fields:
        groups.append({
            "label": "Additional Details",
            "fields": optional_fields,
            "columns": 2,
            "collapsible": True,
        })
    if textarea_fields:
        groups.append({
            "label": "Notes",
            "fields": textarea_fields,
            "columns": 1,
            "collapsible": True,
        })

    return {"groups": groups}


def _build_dashboard(
    skill: str, entities: dict[str, dict], inferred: dict[str, dict]
) -> dict:
    """Build dashboard KPIs and quick actions from entity definitions."""
    kpis = []
    quick_actions = []

    for entity_key, entity_data in inferred.items():
        entity_label = entity_key.replace("_", " ").title()
        entity_label_plural = _pluralize(entity_label)

        # KPI: count of each entity
        list_action = entity_data["actions"].get("list")
        if list_action:
            kpi: dict = {
                "key": f"total_{entity_key}",
                "label": entity_label_plural,
                "type": "count",
                "action": list_action,
                "icon": _entity_icon(entity_key),
                "drill_action": list_action,
            }

            # Add status-filtered KPIs for entities with status
            if entity_data.get("status_options"):
                # Active/open count
                active_statuses = {"active", "open", "producing", "drilling", "in_progress"}
                active = [s for s in entity_data["status_options"] if s in active_statuses]
                if active:
                    kpi["filter"] = {f"{entity_key}_status": active[0]}
                    kpi["label"] = f"Active {entity_label_plural}"
                    kpi["severity"] = "success"

            kpis.append(kpi)

        # Quick action: create
        create_action = entity_data["actions"].get("create")
        if create_action:
            quick_actions.append({
                "action": create_action,
                "label": f"New {entity_label}",
                "icon": _entity_icon(entity_key),
            })

    # Limit to top 8 KPIs and 6 quick actions
    return {
        "kpis": kpis[:8],
        "quick_actions": quick_actions[:6],
    }


def _build_domains(entities: dict[str, dict], entity_groups: list[dict]) -> list[dict]:
    """Build sidebar domain groupings.

    Uses entity_groups from skillmd_parser if available, otherwise
    creates a flat "All" domain.
    """
    if entity_groups:
        # Map group names to entity keys
        group_entity_map: dict[str, list[str]] = {}
        for group in entity_groups:
            group_name = group.get("name", "Other")
            for action_name in group.get("actions", []):
                # Derive entity key
                for prefix in ("add-", "create-", "list-", "get-", "update-", "delete-",
                               "submit-", "cancel-"):
                    if action_name.startswith(prefix):
                        suffix = action_name[len(prefix):]
                        entity_key = _singularize(suffix).replace("-", "_")
                        if entity_key in entities:
                            group_entity_map.setdefault(group_name, [])
                            if entity_key not in group_entity_map[group_name]:
                                group_entity_map[group_name].append(entity_key)
                        break

        domains = []
        for group_name, entity_keys in group_entity_map.items():
            if entity_keys:
                domains.append({
                    "key": group_name.lower().replace(" ", "_"),
                    "label": group_name,
                    "icon": _entity_icon(entity_keys[0]),
                    "entities": entity_keys,
                })
        if domains:
            return domains

    # Fallback: single domain with all entities
    return [{
        "key": "all",
        "label": "All",
        "icon": "layers",
        "entities": list(entities.keys()),
    }]


def _build_action_map(entities: dict[str, dict], inferred: dict[str, dict]) -> dict:
    """Build the action_map that tells the frontend which component to render."""
    action_map = {}

    for entity_key, entity_data in inferred.items():
        slug = entity_key.replace("_", "-")
        slug_plural = _pluralize(slug)

        for atype, action_name in entity_data["actions"].items():
            entry: dict = {}

            if atype == "list":
                entry = {
                    "component": "DataTable",
                    "entity": entity_key,
                    "searchable": True,
                    "add_action": entity_data["actions"].get("create"),
                }
            elif atype == "create":
                entry = {
                    "component": "FormView",
                    "entity": entity_key,
                    "mode": "create",
                    "success_redirect": f"list-{slug_plural}",
                    "success_toast": f"{entity_key.replace('_', ' ').title()} created",
                }
            elif atype == "read":
                entry = {
                    "component": "DetailView",
                    "entity": entity_key,
                }
            elif atype == "update":
                entry = {
                    "component": "FormView",
                    "entity": entity_key,
                    "mode": "edit",
                    "success_toast": f"{entity_key.replace('_', ' ').title()} updated",
                }
            elif atype == "delete":
                entry = {
                    "component": None,
                    "hidden": True,
                }
            elif atype in ("submit", "cancel", "status-transition"):
                entry = {
                    "component": None,
                    "hidden": True,
                }

            if entry:
                action_map[action_name] = entry

    return action_map


def generate_ui_config(skill: str) -> dict | None:
    """Auto-generate a full UIConfig from SKILL.md metadata.

    Returns a dict matching the ocui_version 1.0 schema, or None if
    SKILL.md is not found or has no parseable actions.
    """
    skill_md = _find_skill_md(skill)
    if not skill_md:
        return None

    # Check cache
    mtime = os.path.getmtime(skill_md)
    cached = _gen_cache.get(skill)
    if cached and cached[0] == mtime:
        return cached[1]

    # Check disk cache
    cache_path = os.path.join(os.path.dirname(skill_md), ".generated-ui.json")
    if os.path.isfile(cache_path):
        cache_mtime = os.path.getmtime(cache_path)
        if cache_mtime >= mtime:
            try:
                with open(cache_path) as f:
                    config = json.load(f)
                _gen_cache[skill] = (mtime, config)
                return config
            except Exception:
                pass

    # Parse SKILL.md
    parsed = get_cached_params(skill, skill_md)
    if not parsed or not parsed.get("actions"):
        return None

    # Read frontmatter for metadata
    frontmatter = _read_frontmatter(skill_md)
    display_name = frontmatter.get("name", skill.replace("-", " ").title())
    version = frontmatter.get("version", "1.0.0")
    description = frontmatter.get("description", "")
    category = frontmatter.get("category", "")

    # Infer entities from actions
    inferred = _infer_entities(parsed)
    if not inferred:
        return None

    # Build entity definitions
    entity_defs: dict[str, dict] = {}
    for entity_key, entity_data in inferred.items():
        fields = _build_fields(entity_key, entity_data)
        if not fields:
            continue

        name_field = _detect_name_field(fields)
        status_field = _detect_status_field(fields)
        status_colors = _build_status_colors(entity_data, status_field)
        entity_label = entity_key.replace("_", " ").title()

        entity_def: dict = {
            "label": entity_label,
            "label_plural": _pluralize(entity_label),
            "icon": _entity_icon(entity_key),
            "table": entity_key,
            "id_col": "id",
            "name_col": name_field,
            "primary_field": name_field,
            "identifier_field": name_field,
            "fields": fields,
            "views": {
                "list": _build_list_view(fields, name_field),
                "detail": _build_detail_view(fields, name_field, status_field, entity_data),
                "form": _build_form_view(fields),
            },
        }

        if status_field:
            entity_def["status_field"] = status_field
        if status_colors:
            entity_def["status_colors"] = status_colors

        entity_defs[entity_key] = entity_def

    if not entity_defs:
        return None

    # Build UIConfig
    first_entity = next(iter(entity_defs))
    config: dict = {
        "ocui_version": "1.0",
        "skill": skill,
        "skill_version": version,
        "display_name": display_name,
        "icon": _entity_icon(skill.replace("claw", "").replace("-", "_")) or "box",
        "color": _SKILL_COLORS.get(skill, "#6366f1"),
        "default_entity": first_entity,
        "generated": True,  # Flag so frontend knows this was auto-generated
        "domains": _build_domains(entity_defs, parsed.get("entity_groups", [])),
        "dashboard": _build_dashboard(skill, entity_defs, inferred),
        "entities": entity_defs,
        "action_map": _build_action_map(entity_defs, inferred),
    }

    # Cache in memory
    _gen_cache[skill] = (mtime, config)

    # Cache to disk
    try:
        with open(cache_path, "w") as f:
            json.dump(config, f, indent=2)
    except Exception:
        pass  # Non-critical

    return config
