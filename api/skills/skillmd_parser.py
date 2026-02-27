"""Parse SKILL.md to extract action parameter metadata.

Supports two SKILL.md formats:
  1. YAML body format (OpenClaw standard): actions with body[] param arrays in frontmatter
  2. Markdown table format (erpclaw-style): action tables in the body after frontmatter
  3. Code block format (erpclaw-payroll style): command examples in code blocks

Used by the gateway to serve /api/v1/schema/params/{skill} for auto form generation.
"""
import os
import re

import yaml

# Module-level cache: skill_name → (mtime, parsed_data)
_cache: dict[str, tuple[float, dict]] = {}

# Cross-skill entity lookup mappings (entity suffix → skill, list action)
_CROSS_SKILL_LOOKUPS = {
    "company": ("erpclaw-setup", "list-companies"),
    "account": ("erpclaw-gl", "list-accounts"),
    "fiscal-year": ("erpclaw-gl", "list-fiscal-years"),
    "cost-center": ("erpclaw-gl", "list-cost-centers"),
    "item": ("erpclaw-inventory", "list-items"),
    "warehouse": ("erpclaw-inventory", "list-warehouses"),
    "customer": ("erpclaw-selling", "list-customers"),
    "supplier": ("erpclaw-buying", "list-suppliers"),
    "employee": ("erpclaw-hr", "list-employees"),
    "department": ("erpclaw-hr", "list-departments"),
    "designation": ("erpclaw-hr", "list-designations"),
    "tax-template": ("erpclaw-tax", "list-tax-templates"),
    "payment-terms": ("erpclaw-setup", "list-payment-terms"),
    "holiday-list": ("erpclaw-hr", "list-holiday-lists"),
}

# Param name patterns → field types
_CURRENCY_NAMES = {
    "amount", "paid-amount", "received-amount", "total", "grand-total",
    "net-total", "base-amount", "outstanding-amount", "credit-limit",
    "budget-amount", "rate", "standard-rate", "base-total",
}

_TEXTAREA_NAMES = {"remarks", "description", "notes", "reason", "address", "terms"}


_DESCRIPTION_ENUM_PATTERNS = [
    # "Type: room, equipment, vehicle, or space"
    re.compile(r"(?:type|filter|status|purpose|method|mode|category|kind):\s*(.+)", re.I),
    # "Filter by status: draft, confirmed, completed, cancelled"
    re.compile(r"filter by \w+:\s*(.+)", re.I),
    # "Purpose: meeting, event, training, personal, other"
    re.compile(r"^\w+:\s*(.+)$", re.I),
]


def _parse_enum_from_description(desc: str) -> list[str] | None:
    """Try to extract enumerated values from a field description.

    Matches patterns like:
      "Type: room, equipment, vehicle, or space"
      "Filter by status: draft, confirmed, completed, cancelled"
      "Purpose: meeting, event, training, personal, other"
    """
    if not desc:
        return None
    for pat in _DESCRIPTION_ENUM_PATTERNS:
        m = pat.search(desc)
        if m:
            raw = m.group(1).strip().rstrip(".")
            # Split on commas, handle " or " / " and "
            raw = re.sub(r"\s+or\s+", ", ", raw)
            raw = re.sub(r"\s+and\s+", ", ", raw)
            vals = [v.strip().strip("'\"") for v in raw.split(",") if v.strip()]
            # Only treat as enum if we got 2+ short values (no long sentences)
            if len(vals) >= 2 and all(len(v) < 30 and " " not in v for v in vals):
                return vals
    return None


def _yaml_field_to_param(field_def: dict, all_action_names: list[str] | None = None) -> dict:
    """Convert a YAML body field definition to a ParamSchema field dict."""
    name = field_def.get("name", "")
    # Use kebab internally for pattern matching, but preserve original name for CLI flags
    kebab_name = name.replace("_", "-")
    field_type = field_def.get("type", "string")
    desc = field_def.get("description", "")
    required = field_def.get("required", False)

    result: dict = {
        "name": name,  # Keep original — gateway sends as --{name} CLI flag
        "label": _name_to_label(kebab_name),
        "required": required,
    }
    if desc:
        result["description"] = desc

    # Check description for enumerated values first
    enum_vals = _parse_enum_from_description(desc)
    if enum_vals:
        result["type"] = "select"
        result["options"] = [{"label": _name_to_label(v.replace("_", "-")), "value": v}
                             for v in enum_vals]
        return result

    # Type mapping from YAML type + name patterns
    if field_type == "integer":
        # Could be a number or currency based on name
        if kebab_name in _CURRENCY_NAMES or kebab_name.endswith(("-amount", "-total")):
            result["type"] = "currency"
        else:
            result["type"] = "number"
            result["step"] = 1
        return result

    if field_type in ("float", "number"):
        if kebab_name in _CURRENCY_NAMES or kebab_name.endswith(("-amount", "-total", "-rate", "-price")):
            result["type"] = "currency"
        else:
            result["type"] = "number"
            result["step"] = 0.01
        return result

    if field_type == "boolean":
        result["type"] = "boolean"
        return result

    if field_type in ("json", "object", "array"):
        result["type"] = "json"
        return result

    # String type — apply name-based inference
    # Entity lookup
    if kebab_name.endswith("-id"):
        entity = kebab_name[:-3]
        result["type"] = "entity-lookup"
        result["label"] = _name_to_label(entity)
        if entity in _CROSS_SKILL_LOOKUPS:
            skill, action = _CROSS_SKILL_LOOKUPS[entity]
            result["lookup_skill"] = skill
            result["lookup_action"] = action
        elif all_action_names:
            # Try same-skill lookup
            list_action = f"list-{entity}s"
            if list_action in all_action_names:
                result["lookup_action"] = list_action
            else:
                result["lookup_action"] = f"list-{entity}s"
        else:
            result["lookup_action"] = f"list-{entity}s"
        return result

    # Date fields
    if kebab_name.endswith("-date") or kebab_name in (
        "date", "valid-till", "from-date", "to-date",
        "effective-from", "effective-to", "period-start", "period-end",
    ):
        result["type"] = "date"
        return result

    # Time fields
    if kebab_name.endswith("-time") or kebab_name in ("start-time", "end-time"):
        result["type"] = "time"
        return result

    # Currency
    if kebab_name in _CURRENCY_NAMES or kebab_name.endswith(("-amount", "-total")):
        result["type"] = "currency"
        return result

    # Rate fields that look like currency
    if "rate" in kebab_name and ("hourly" in kebab_name or "daily" in kebab_name or "price" in desc.lower()):
        result["type"] = "currency"
        return result

    # Rate/numeric
    if kebab_name.endswith("-rate") or kebab_name in ("qty", "quantity"):
        result["type"] = "number"
        return result

    # Email
    if kebab_name == "email" or kebab_name.endswith("-email"):
        result["type"] = "email"
        return result

    # Phone
    if kebab_name == "phone" or kebab_name.endswith("-phone"):
        result["type"] = "phone"
        return result

    # Textarea
    if kebab_name in _TEXTAREA_NAMES or kebab_name.endswith(("-remarks", "-notes", "-description")):
        result["type"] = "textarea"
        return result

    # Boolean-ish
    if kebab_name.startswith(("is-", "has-", "enable-", "exempt-")):
        result["type"] = "boolean"
        return result

    # Default: text
    result["type"] = "text"
    return result


def _find_frontmatter_end(content: str) -> int:
    """Find the closing --- of YAML frontmatter.

    Must match --- at the start of a line (not inside comments like '# --- Status ---').
    """
    pos = 3  # Skip opening ---
    while True:
        idx = content.index("---", pos)
        # Check if --- is at the start of a line
        if idx == 0 or content[idx - 1] == "\n":
            return idx
        pos = idx + 3


def _parse_yaml_body(content: str) -> dict:
    """Parse SKILL.md YAML frontmatter body[] arrays into ParamSchema.

    This handles the standard OpenClaw SKILL.md format where actions have
    structured body: arrays with name, type, required, description per param.
    """
    if not content.startswith("---"):
        return {"actions": {}, "entity_groups": []}

    try:
        end = _find_frontmatter_end(content)
        frontmatter = yaml.safe_load(content[3:end])
    except (ValueError, yaml.YAMLError):
        return {"actions": {}, "entity_groups": []}

    if not frontmatter or not isinstance(frontmatter, dict):
        return {"actions": {}, "entity_groups": []}

    scripts = frontmatter.get("scripts", [])
    if not scripts or not isinstance(scripts, list):
        return {"actions": {}, "entity_groups": []}

    # Collect all action names first for same-skill entity lookup resolution
    all_action_names = []
    for script in scripts:
        for action_def in script.get("actions", []):
            name = action_def.get("name", "")
            if name:
                all_action_names.append(name)

    actions: dict[str, dict] = {}
    entity_group_map: dict[str, list[str]] = {}
    has_body_params = False

    for script in scripts:
        for action_def in script.get("actions", []):
            action_name = action_def.get("name", "")
            if not action_name:
                continue

            body_params = action_def.get("body", [])
            if body_params and isinstance(body_params, list):
                has_body_params = True

            required = []
            optional = []
            for param in (body_params or []):
                if not isinstance(param, dict) or not param.get("name"):
                    continue
                field = _yaml_field_to_param(param, all_action_names)
                if field.get("required"):
                    required.append(field)
                else:
                    optional.append(field)

            action_data: dict = {
                "action_type": _action_type(action_name),
                "required": required,
                "optional": optional,
            }

            # Add description if available
            desc = action_def.get("description", "")
            if desc:
                action_data["description"] = desc

            # Derive entity group from action name
            group = _derive_entity_group(action_name)
            if group:
                action_data["entity_group"] = group
                entity_group_map.setdefault(group, []).append(action_name)

            actions[action_name] = action_data

    # Only return YAML-parsed results if we actually found body params
    # (avoids returning empty-param actions when body: is not used)
    if not has_body_params:
        return {"actions": {}, "entity_groups": []}

    entity_groups = [{"name": n, "actions": a} for n, a in entity_group_map.items()]
    return {"actions": actions, "entity_groups": entity_groups}


def _parse_yaml_actions(content: str) -> list[str]:
    """Extract just the action names from YAML frontmatter (for discovery)."""
    if not content.startswith("---"):
        return []
    try:
        end = _find_frontmatter_end(content)
        frontmatter = yaml.safe_load(content[3:end])
    except (ValueError, yaml.YAMLError):
        return []
    if not frontmatter or not isinstance(frontmatter, dict):
        return []
    action_names = []
    for script in frontmatter.get("scripts", []):
        for action_def in script.get("actions", []):
            name = action_def.get("name", "")
            if name:
                action_names.append(name)
    return action_names


def _strip_backticks(s: str) -> str:
    return s.strip().strip("`").strip()


def _parse_type_hint(raw: str) -> tuple[str, str | None, list[str] | None]:
    """Extract type hint from a flag string like '`--flag` (JSON)'.

    Returns (flag_name, hint_value, enum_options).
    hint_value is the raw text in parens (e.g. "JSON", "20", "USD").
    enum_options is set if hint contains pipe-separated values.
    """
    # Match: `--flag-name` (hint) or `--flag-name` (val1|val2)
    # Note: pipes in tables are escaped as \|
    m = re.match(r"^`([^`]+)`\s*(?:\(([^)]+)\))?\s*(.*)$", raw.strip())
    if not m:
        # Try without backticks
        m2 = re.match(r"^--(\S+)\s*(?:\(([^)]+)\))?", raw.strip())
        if m2:
            name = m2.group(1)
            hint = m2.group(2)
        else:
            return raw.strip().lstrip("-"), None, None
    else:
        name = m.group(1).lstrip("-")
        hint = m.group(2)

    enum_opts = None
    if hint:
        # Unescape \| back to |
        hint = hint.replace("\\|", "|")
        if "|" in hint and not hint.upper().startswith("JSON"):
            enum_opts = [v.strip() for v in hint.split("|") if v.strip()]

    return name, hint, enum_opts


def _infer_field_type(name: str, hint: str | None, enum_opts: list[str] | None) -> dict:
    """Infer field type and metadata from param name and type hint."""
    field: dict = {"name": name, "label": _name_to_label(name)}

    # Enum/select from type hint
    if enum_opts:
        field["type"] = "select"
        field["options"] = [{"label": o, "value": o} for o in enum_opts]
        return field

    # JSON type
    if hint and hint.upper() == "JSON":
        field["type"] = "json"
        return field

    # Explicit type from hint — numeric default
    if hint and re.match(r"^-?\d+(\.\d+)?$", hint):
        if name in _CURRENCY_NAMES or name.endswith(("-amount", "-rate", "-total")):
            field["type"] = "currency"
        else:
            field["type"] = "number"
        field["default"] = hint
        return field

    # String default in hint (e.g., "USD", "moving_average")
    if hint and hint not in ("none",):
        # Check if it looks like a note/comment rather than a default
        if " " not in hint and len(hint) < 30:
            field["default"] = hint

    # Entity lookup: --*-id suffix
    if name.endswith("-id"):
        entity = name[:-3]  # e.g., "customer-id" → "customer"
        field["type"] = "entity-lookup"
        field["label"] = _name_to_label(entity)  # "Customer" not "Customer Id"
        if entity in _CROSS_SKILL_LOOKUPS:
            skill, action = _CROSS_SKILL_LOOKUPS[entity]
            field["lookup_skill"] = skill
            field["lookup_action"] = action
        else:
            # Same-skill lookup: guess list-{entity}s
            field["lookup_action"] = f"list-{entity}s"
        return field

    # Date fields
    if name.endswith("-date") or name in (
        "date", "valid-till", "from-date", "to-date",
        "effective-from", "effective-to", "period-start", "period-end",
        "valid-from", "valid-to",
    ):
        field["type"] = "date"
        return field

    # Currency fields
    if name in _CURRENCY_NAMES or name.endswith(("-amount", "-total")):
        field["type"] = "currency"
        return field

    # Rate/numeric fields
    if name.endswith("-rate") or name in ("exchange-rate", "qty", "quantity", "limit", "offset"):
        field["type"] = "number"
        return field

    # Textarea fields
    if name in _TEXTAREA_NAMES or name.endswith(("-remarks", "-notes", "-description")):
        field["type"] = "textarea"
        return field

    # Boolean-ish fields
    if name.startswith(("is-", "has-", "enable-", "exempt-")):
        field["type"] = "boolean"
        return field

    # Default: text
    field["type"] = "text"
    return field


def _name_to_label(name: str) -> str:
    """Convert kebab-case param name to Title Case label.
    'customer-type' → 'Customer Type', 'paid-from-account' → 'Paid From Account'
    """
    return " ".join(w.capitalize() for w in name.split("-"))


def _action_type(action: str) -> str:
    """Infer action type from naming convention."""
    if action.startswith(("add-", "create-")):
        return "create"
    if action.startswith("update-"):
        return "update"
    if action.startswith("list-"):
        return "list"
    if action.startswith("get-"):
        return "read"
    if action.startswith("submit-"):
        return "submit"
    if action.startswith("cancel-"):
        return "cancel"
    if action.startswith("delete-"):
        return "delete"
    if action.startswith(("confirm-", "complete-", "approve-", "reject-")):
        return "status-transition"
    if action.startswith(("check-", "validate-")):
        return "utility"
    if action.startswith(("seed-", "setup-")):
        return "setup"
    return "action"


def _parse_flags(cell: str, required: bool) -> list[dict]:
    """Parse a table cell containing comma-separated flags into field dicts."""
    cell = cell.strip()
    if not cell or cell == "(none)":
        return []

    fields = []
    # Split by comma, but be careful with commas inside parentheses
    # Strategy: split by `, ` or `,` when followed by backtick
    parts = re.split(r",\s*(?=`)", cell)
    if len(parts) == 1 and "`" not in cell:
        # Try splitting without backtick requirement
        parts = [p.strip() for p in cell.split(",") if p.strip()]

    for part in parts:
        part = part.strip()
        if not part or part == "(none)":
            continue

        name, hint, enum_opts = _parse_type_hint(part)
        if not name or name == "none":
            continue
        # Clean up any remaining backticks or dashes
        name = name.strip("`").lstrip("-").strip()
        if not name:
            continue

        field = _infer_field_type(name, hint, enum_opts)
        field["required"] = required
        fields.append(field)

    return fields


def _extract_flags_from_command(rest: str) -> dict[str, str | None]:
    """Extract --flag value pairs from a command line string."""
    flags: dict[str, str | None] = {}
    # Split on whitespace before --flag patterns
    parts = re.split(r"\s+(?=--[a-zA-Z])", rest)

    for part in parts:
        m = re.match(r"^--([a-zA-Z][\w-]*)\s*(.*)", part, re.DOTALL)
        if not m:
            continue
        name = m.group(1)
        value = m.group(2).strip()
        if value:
            # Strip surrounding quotes
            if len(value) >= 2:
                if (value[0] == '"' and value[-1] == '"') or \
                   (value[0] == "'" and value[-1] == "'"):
                    value = value[1:-1]
            # Ignore generic placeholders like <id>
            if value.startswith("<") and value.endswith(">"):
                flags[name] = None
            else:
                flags[name] = value
        else:
            flags[name] = None

    return flags


def _infer_field_type_with_value(name: str, value: str | None) -> dict:
    """Infer field type from param name + example value from code block."""
    hint = None
    if value:
        clean = value.strip("'\"")
        # JSON arrays/objects
        if clean.startswith("[") or clean.startswith("{") or "..." in clean:
            hint = "JSON"
        # Boolean values (0/1) for boolean-ish names — don't pass as numeric hint
        elif clean in ("0", "1", "true", "false") and \
                name.startswith(("is-", "has-", "enable-", "exempt-")):
            hint = None  # Let name-based boolean inference handle it
        # Date pattern in value — force date type even if name doesn't match
        elif re.match(r"^\d{4}-\d{2}-\d{2}", clean):
            field = _infer_field_type(name, None, None)
            field["type"] = "date"
            return field
        # Numeric value → pass as hint for default detection
        elif re.match(r"^-?\d+(\.\d+)?$", clean):
            hint = clean
    return _infer_field_type(name, hint, None)


def _derive_entity_group(action: str) -> str | None:
    """Derive entity group name from action name for auto-grouping."""
    prefixes = (
        "add-", "create-", "update-", "list-", "get-", "submit-",
        "cancel-", "delete-", "confirm-", "complete-", "approve-", "reject-",
        "generate-", "compute-", "seed-", "setup-",
    )
    for prefix in prefixes:
        if action.startswith(prefix):
            entity = action[len(prefix):]
            # Singularize for list-/generate- actions
            if entity.endswith("ies"):
                entity = entity[:-3] + "y"
            elif entity.endswith("ses"):
                entity = entity[:-2]
            elif entity.endswith("s") and not entity.endswith("ss"):
                entity = entity[:-1]
            return entity.replace("-", " ").title()
    return None


_ACTION_LINE_RE = re.compile(
    r"^((?:add|create|update|list|get|submit|cancel|delete|generate|compute"
    r"|seed|setup|validate)-[\w-]+)\s*(.*)"
)


def _parse_code_blocks(body: str) -> dict:
    """Extract action params from code block examples when tables are missing.

    Parses ``` code blocks for action command lines like:
      add-customer --name "Test" --type individual --company-id <id>
    Flags appearing in ALL examples of an action → required.
    Flags in only SOME examples → optional.
    """
    # action → [dict_of_flags_per_example, ...]
    action_examples: dict[str, list[dict[str, str | None]]] = {}
    in_code = False

    for line in body.split("\n"):
        stripped = line.strip()

        if stripped.startswith("```"):
            in_code = not in_code
            continue

        if not in_code or not stripped:
            continue

        m = _ACTION_LINE_RE.match(stripped)
        if not m:
            continue

        action_name = m.group(1)
        rest = m.group(2)

        flags = _extract_flags_from_command(rest)
        if action_name not in action_examples:
            action_examples[action_name] = []
        action_examples[action_name].append(flags)

    if not action_examples:
        return {"actions": {}, "entity_groups": []}

    # Build action metadata with required/optional distinction
    actions: dict[str, dict] = {}
    entity_group_map: dict[str, list[str]] = {}

    for action_name, examples in action_examples.items():
        # Union of all flag names across examples
        all_flag_names: set[str] = set()
        for ex in examples:
            all_flag_names.update(ex.keys())

        # Flags in ALL examples → required; in SOME → optional
        required_flags = set(all_flag_names)
        for ex in examples:
            required_flags &= set(ex.keys())
        optional_flags = all_flag_names - required_flags

        # Build field specs with value-based type hints
        required = []
        for fname in sorted(required_flags):
            value_hint = None
            for ex in examples:
                if ex.get(fname):
                    value_hint = ex[fname]
                    break
            field = _infer_field_type_with_value(fname, value_hint)
            field["required"] = True
            required.append(field)

        optional = []
        for fname in sorted(optional_flags):
            value_hint = None
            for ex in examples:
                if ex.get(fname):
                    value_hint = ex[fname]
                    break
            field = _infer_field_type_with_value(fname, value_hint)
            field["required"] = False
            optional.append(field)

        action_data: dict = {
            "action_type": _action_type(action_name),
            "required": required,
            "optional": optional,
        }

        # Derive entity group from action name
        group = _derive_entity_group(action_name)
        if group:
            action_data["entity_group"] = group
            entity_group_map.setdefault(group, []).append(action_name)

        actions[action_name] = action_data

    entity_groups = [{"name": n, "actions": a} for n, a in entity_group_map.items()]
    return {"actions": actions, "entity_groups": entity_groups}


def parse_skill_body(skill_md_path: str) -> dict:
    """Parse SKILL.md to extract action→parameter metadata.

    Strategy (4-level fallback):
      1. YAML body format (OpenClaw standard) — body[] arrays in frontmatter
      2. Markdown table parsing (erpclaw-style) — tables in body after frontmatter
      3. Code block example parsing (e.g. erpclaw-payroll style)
      4. Deep probe fallback (handled by router, not here)

    Returns dict with:
      - actions: {action_name: {entity_group, action_type, required: [...], optional: [...]}}
      - entity_groups: [{name, actions: [...]}]
    """
    with open(skill_md_path, "r") as f:
        content = f.read()

    # Level 1: Try YAML body format first (OpenClaw standard SKILL.md)
    yaml_result = _parse_yaml_body(content)
    if yaml_result.get("actions"):
        return yaml_result

    # Skip YAML frontmatter for body parsing (Levels 2+3)
    body = content
    if content.startswith("---"):
        try:
            end = _find_frontmatter_end(content)
            body = content[end + 3:]
        except ValueError:
            pass

    actions = {}
    entity_groups = []
    current_group = None

    lines = body.split("\n")
    in_action_table = False
    header_cols = None

    for line in lines:
        stripped = line.strip()

        # Detect entity group headers: ### Entity Name (N actions)
        group_match = re.match(r"^###\s+(.+?)(?:\s*\(\d+\s*actions?\))?\s*$", stripped)
        if group_match:
            group_name = group_match.group(1).strip()
            # Skip non-action sections
            if group_name.lower() in (
                "quick command reference", "key concepts",
                "confirmation requirements", "proactive suggestions",
                "inter-skill coordination", "response formatting",
                "error recovery", "sub-skills", "essential commands",
                "skill activation triggers", "setup (first use only)",
                "the draft-submit-cancel lifecycle",
            ):
                in_action_table = False
                header_cols = None
                continue
            current_group = group_name
            in_action_table = False
            header_cols = None
            continue

        # Detect table header row
        if stripped.startswith("|") and stripped.endswith("|"):
            # Protect escaped pipes \| before splitting (used in enums like warn\|stop)
            safe = stripped.replace("\\|", "\x00")
            cells = [c.strip().replace("\x00", "|") for c in safe.split("|")[1:-1]]
            # Check if this is an action table header
            if len(cells) >= 2:
                lower_cells = [c.lower() for c in cells]
                if "action" in lower_cells[0] and any(
                    "flag" in c or "required" in c for c in lower_cells
                ):
                    in_action_table = True
                    header_cols = lower_cells
                    continue

            # Skip separator rows (|---|---|---|)
            if all(re.match(r"^[-:]+$", c) for c in cells if c):
                continue

            # Parse data rows in action tables
            if in_action_table and header_cols:
                if len(cells) < 2:
                    continue

                action_name = _strip_backticks(cells[0])
                if not action_name or action_name.startswith("-"):
                    continue

                required_fields = _parse_flags(cells[1] if len(cells) > 1 else "", True)
                optional_fields = _parse_flags(cells[2] if len(cells) > 2 else "", False)

                action_data = {
                    "action_type": _action_type(action_name),
                    "required": required_fields,
                    "optional": optional_fields,
                }
                if current_group:
                    action_data["entity_group"] = current_group

                actions[action_name] = action_data

                # Track entity groups
                if current_group:
                    existing = next(
                        (g for g in entity_groups if g["name"] == current_group), None
                    )
                    if existing:
                        existing["actions"].append(action_name)
                    else:
                        entity_groups.append(
                            {"name": current_group, "actions": [action_name]}
                        )
                continue

        # Non-table lines reset table state
        if stripped and not stripped.startswith("|"):
            if not stripped.startswith("#"):
                in_action_table = False
                header_cols = None

    # If table parsing found actions, return them
    if actions:
        return {"actions": actions, "entity_groups": entity_groups}

    # Fallback: parse code block examples (e.g. erpclaw-payroll style)
    return _parse_code_blocks(body)


def get_cached_params(skill_name: str, skill_md_path: str) -> dict | None:
    """Get parsed SKILL.md params with mtime-based caching."""
    if not os.path.exists(skill_md_path):
        return None

    mtime = os.path.getmtime(skill_md_path)
    cached = _cache.get(skill_name)
    if cached and cached[0] == mtime:
        return cached[1]

    try:
        parsed = parse_skill_body(skill_md_path)
        _cache[skill_name] = (mtime, parsed)
        return parsed
    except Exception:
        return None


def get_skill_actions(skill_md_path: str) -> list[str] | None:
    """Extract action names from SKILL.md YAML frontmatter.

    Used as a fallback for action discovery when the subprocess-based
    discovery fails (e.g. skills that don't use argparse choices=).
    """
    if not os.path.exists(skill_md_path):
        return None
    try:
        with open(skill_md_path, "r") as f:
            content = f.read()
        actions = _parse_yaml_actions(content)
        return actions if actions else None
    except Exception:
        return None
