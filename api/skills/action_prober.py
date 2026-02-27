"""Deep-probe skill actions to discover parameters when SKILL.md parsing fails.

Last-resort fallback: runs each form-able action (add-*, create-*, update-*)
without args, parses error messages for required parameter names, and infers
types from naming conventions. Results are cached per skill.
"""
import asyncio
import re

from .executor import execute_skill
from .skillmd_parser import _infer_field_type, _action_type, _derive_entity_group

# Cache: skill → probed params
_probe_cache: dict[str, dict] = {}

# Only probe actions that need forms (mutating actions)
_PROBE_PREFIXES = ("add-", "create-", "update-", "generate-", "compute-", "setup-", "seed-")

# Also include read actions for completeness (entity groups, no probing needed)
_READ_PREFIXES = ("list-", "get-", "submit-", "cancel-", "delete-")


async def probe_action_params(skill: str, actions: list[str]) -> dict:
    """Probe each form-able action without args to discover required params.

    Only probes add-*, create-*, update-*, generate-*, compute-* actions.
    Read/lifecycle actions (list-*, get-*, submit-*, cancel-*, delete-*) are
    included with empty param lists (they don't need forms).
    """
    if skill in _probe_cache:
        return _probe_cache[skill]

    result_actions: dict[str, dict] = {}
    entity_group_map: dict[str, list[str]] = {}

    # Separate form-able vs non-form actions
    form_actions = [a for a in actions if a.startswith(_PROBE_PREFIXES)]
    other_actions = [a for a in actions if not a.startswith(_PROBE_PREFIXES)]

    # Probe form-able actions in parallel (limited concurrency)
    sem = asyncio.Semaphore(5)

    async def probe_one(action: str) -> tuple[str, list[dict]]:
        async with sem:
            result = await execute_skill(skill, action, {})
            required: list[dict] = []
            msg = result.get("message", "") or result.get("error", "")

            # Pattern 1: "--name is required"
            matches = re.findall(r"--(\S+)\s+is\s+required", msg)
            # Pattern 2: "the following arguments are required: --name, --type"
            if not matches:
                req_match = re.search(r"required:\s*(.+)", msg)
                if req_match:
                    matches = re.findall(r"--(\S+)", req_match.group(1))
                    matches = [m.rstrip(",") for m in matches]
            # Pattern 3: "Missing required parameter: name" (no --)
            if not matches:
                m = re.search(r"[Mm]issing.*?(?:parameter|argument)s?:?\s*(.+)", msg)
                if m:
                    # Could be comma-separated
                    for p in m.group(1).split(","):
                        p = p.strip().lstrip("-").strip()
                        if p and len(p) < 30:
                            matches.append(p)

            seen = set()
            for param_name in matches:
                param_name = param_name.strip().rstrip(",")
                if param_name in seen:
                    continue
                seen.add(param_name)
                field = _infer_field_type(param_name, None, None)
                field["required"] = True
                required.append(field)

            return action, required

    tasks = [probe_one(a) for a in form_actions]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, Exception):
            continue
        action, required = r
        action_data: dict = {
            "action_type": _action_type(action),
            "required": required,
            "optional": [],
        }
        group = _derive_entity_group(action)
        if group:
            action_data["entity_group"] = group
            entity_group_map.setdefault(group, []).append(action)
        result_actions[action] = action_data

    # Add non-form actions with empty params
    for action in other_actions:
        action_data = {
            "action_type": _action_type(action),
            "required": [],
            "optional": [],
        }
        group = _derive_entity_group(action)
        if group:
            action_data["entity_group"] = group
            entity_group_map.setdefault(group, []).append(action)
        result_actions[action] = action_data

    entity_groups = [{"name": n, "actions": a} for n, a in entity_group_map.items()]

    result = {"actions": result_actions, "entity_groups": entity_groups}
    _probe_cache[skill] = result
    return result
