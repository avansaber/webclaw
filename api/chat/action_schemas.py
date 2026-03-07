"""Build compact action schema summaries for AI system prompt injection.

Reads parsed params from skillmd_parser and produces a concise summary
of available actions for the current skill — enough for the AI to generate
accurate composition blocks without flooding the context window.

Cached per skill with mtime-based invalidation.
"""
import os

from skills.executor import SKILLS_DIR
from skills.skillmd_parser import get_cached_params

# Cache: skill_name → (mtime, summary_text)
_schema_cache: dict[str, tuple[float, str]] = {}

# Max actions to include (prioritize mutating actions)
MAX_ACTIONS = 30


def _format_param(p: dict) -> str:
    """Format a single param: name* (type) or name (type)."""
    name = p.get("name", "?")
    required = p.get("required", False)
    ptype = p.get("type", "string")
    suffix = "*" if required else ""
    if ptype in ("string", "text"):
        return f"{name}{suffix}"
    return f"{name}{suffix}:{ptype}"


def get_action_schema(skill: str) -> str | None:
    """Return a compact action schema summary for a skill.

    Example output:
        add-customer(name*, email, phone) — Creates a new customer
        list-customers(status, limit) — Lists customers
        ...

    Returns None if no schema is available.
    """
    skill_md = os.path.join(SKILLS_DIR, skill, "SKILL.md")
    if not os.path.exists(skill_md):
        return None

    mtime = os.path.getmtime(skill_md)
    cached = _schema_cache.get(skill)
    if cached and cached[0] == mtime:
        return cached[1]

    parsed = get_cached_params(skill, skill_md)
    if not parsed:
        return None

    # parse_skill_body returns actions as a dict: {action_name: {required, optional, ...}}
    actions_dict = parsed.get("actions", {})
    if not actions_dict:
        return None

    # Handle both dict format (table/yaml body) and list format (fallback)
    if isinstance(actions_dict, list):
        # Bare list of action names, no param info
        action_names = actions_dict
        actions_meta = {}
    else:
        action_names = list(actions_dict.keys())
        actions_meta = actions_dict

    # Prioritize mutating actions (add/create/submit/update/delete) over list/get
    mutating = []
    reading = []
    for name in action_names:
        if name.startswith(("add-", "create-", "submit-", "update-", "delete-", "cancel-")):
            mutating.append(name)
        else:
            reading.append(name)

    ordered = mutating + reading
    if len(ordered) > MAX_ACTIONS:
        ordered = ordered[:MAX_ACTIONS]

    lines = []
    for action_name in ordered:
        meta = actions_meta.get(action_name, {})
        # Params are split into required[] and optional[] lists
        required = meta.get("required", [])
        optional = meta.get("optional", [])
        all_params = required + optional

        if all_params:
            param_str = ", ".join(_format_param(p) for p in all_params[:8])
        else:
            param_str = ""

        desc = meta.get("description", "")
        if desc:
            lines.append(f"  {action_name}({param_str}) — {desc}")
        else:
            lines.append(f"  {action_name}({param_str})")

    if not lines:
        return None

    summary = "\n".join(lines)
    _schema_cache[skill] = (mtime, summary)
    return summary
