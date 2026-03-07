"""Write-action interception — generates composition blocks for write requests.

Instead of letting the OpenClaw gateway execute write actions directly via tool-calling,
this module detects write intent, extracts parameters, and returns a <composition> block
that the frontend renders as a ConfirmationCard for user review before execution.
"""
import json
import os
import re

from skills.executor import SKILLS_DIR
from skills.skillmd_parser import get_cached_params

# Write-action prefixes
WRITE_PREFIXES = ("add-", "create-", "submit-", "update-", "delete-", "cancel-")

# Patterns that indicate a write request (imperative verbs)
_WRITE_PATTERNS = [
    re.compile(r"\b(add|create|make|new|register|insert)\b", re.I),
    re.compile(r"\b(update|edit|change|modify|set)\b", re.I),
    re.compile(r"\b(delete|remove|drop|erase)\b", re.I),
    re.compile(r"\b(submit|approve|finalize|post)\b", re.I),
    re.compile(r"\b(cancel|void|reverse)\b", re.I),
]

# Patterns that indicate a question/read (should NOT trigger composition)
_QUESTION_PATTERNS = [
    re.compile(r"^\s*(how|what|why|when|where|which|who|can|does|is|are|do|should|would|could)\b", re.I),
    re.compile(r"\?\s*$"),
    re.compile(r"\b(list|show|get|find|search|display|view|see|look|tell me|explain)\b", re.I),
]


def detect_write_intent(message: str, skill: str) -> dict | None:
    """Detect if the user message is requesting a write action.

    Returns {"action": "add-customer", "meta": {...}} or None.
    """
    if not skill or not message.strip():
        return None

    msg_lower = message.lower().strip()

    # Skip if it looks like a question or read request
    question_signals = sum(1 for p in _QUESTION_PATTERNS if p.search(msg_lower))
    if question_signals >= 2:
        return None
    # Single question signal: only skip if no write signal
    write_signals = sum(1 for p in _WRITE_PATTERNS if p.search(msg_lower))
    if question_signals >= 1 and write_signals == 0:
        return None
    if write_signals == 0:
        return None

    # Get available actions for this skill
    skill_md = os.path.join(SKILLS_DIR, skill, "SKILL.md")
    if not os.path.exists(skill_md):
        return None

    parsed = get_cached_params(skill, skill_md)
    if not parsed:
        return None

    actions_dict = parsed.get("actions", {})
    if isinstance(actions_dict, list):
        return None  # No param info

    # Find best matching write action
    best_match = None
    best_score = 0

    for action_name, meta in actions_dict.items():
        if not action_name.startswith(WRITE_PREFIXES):
            continue

        score = _action_match_score(msg_lower, action_name, meta)
        if score > best_score:
            best_score = score
            best_match = (action_name, meta)

    if best_match and best_score >= 2:
        return {"action": best_match[0], "meta": best_match[1]}

    return None


def _action_match_score(message: str, action_name: str, meta: dict) -> int:
    """Score how well a user message matches an action."""
    score = 0
    parts = action_name.split("-", 1)
    if len(parts) < 2:
        return 0

    verb = parts[0]
    entity = parts[1].replace("-", " ")

    # Verb synonyms
    verb_map = {
        "add": ["add", "create", "make", "new", "register"],
        "create": ["create", "make", "generate", "derive"],
        "update": ["update", "edit", "change", "modify", "set"],
        "delete": ["delete", "remove", "drop", "erase"],
        "submit": ["submit", "approve", "confirm", "finalize", "post"],
        "cancel": ["cancel", "void", "reverse"],
    }
    for synonym in verb_map.get(verb, [verb]):
        if re.search(rf"\b{re.escape(synonym)}\b", message):
            score += 2
            break

    # Entity match
    if entity in message:
        score += 3
    else:
        # Partial word match (singular/plural)
        for word in entity.split():
            if re.search(rf"\b{re.escape(word)}s?\b", message):
                score += 1

    # Description overlap
    desc = (meta.get("description", "") or "").lower()
    if desc:
        desc_words = set(w for w in desc.split() if len(w) > 3)
        msg_words = set(message.split())
        overlap = desc_words & msg_words
        score += min(len(overlap), 2)

    return score


def extract_params_from_message(
    message: str, action_meta: dict, context: dict
) -> tuple[list[dict], list[str]]:
    """Extract parameter values from the user message.

    Returns (resolved_fields, unresolved_field_names).
    """
    required = action_meta.get("required", [])
    optional = action_meta.get("optional", [])

    resolved = []
    unresolved = []

    for param in required:
        name = param.get("name", "")
        ptype = param.get("type", "string")
        value = _extract_value(message, name, ptype, context)
        if value is not None:
            resolved.append({
                "field": name,
                "value": value,
                "confidence": 0.75,
                "source": "conversation",
                "source_detail": "Extracted from message",
            })
        else:
            unresolved.append(name)

    # Try optional params (limit to avoid overwhelming the card)
    for param in optional[:5]:
        name = param.get("name", "")
        ptype = param.get("type", "string")
        value = _extract_value(message, name, ptype, context)
        if value is not None:
            resolved.append({
                "field": name,
                "value": value,
                "confidence": 0.5,
                "source": "inference",
                "source_detail": "Inferred from message",
            })

    return resolved, unresolved


def _extract_value(
    message: str, param_name: str, param_type: str, context: dict
) -> str | None:
    """Try to extract a value for a parameter from the message text."""

    # Name fields: "named X", "called X", "name is X"
    if "name" in param_name:
        for pattern in [
            r'(?:named?|called?|name\s+(?:is|:))\s+"([^"]+)"',
            r"(?:named?|called?|name\s+(?:is|:))\s+([A-Z][a-zA-Z0-9\s&'.]+?)(?:\s+(?:with|and|for|in)\b|\s*,|\s*$)",
        ]:
            m = re.search(pattern, message, re.IGNORECASE)
            if m:
                return m.group(1).strip()

    # Email
    if "email" in param_name:
        m = re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", message)
        if m:
            return m.group(0)

    # Phone
    if "phone" in param_name or "mobile" in param_name:
        m = re.search(r"[\d\s()+-]{7,}", message)
        if m:
            return m.group(0).strip()

    # Numeric: amount, qty, quantity, price, rate, cost
    if param_type in ("number", "decimal", "integer", "float") or any(
        w in param_name for w in ("amount", "qty", "quantity", "price", "rate", "cost")
    ):
        m = re.search(r"\$?\d+(?:,\d{3})*(?:\.\d{1,2})?", message)
        if m:
            return m.group(0).replace("$", "").replace(",", "")

    # Record ID from current page context
    if param_name in ("record_id", "id") and context.get("record_id"):
        return context["record_id"]

    # Entity reference from resolved entities
    resolved_entities = context.get("resolved_entities", [])
    if resolved_entities and ("_id" in param_name or param_name.endswith("-id")):
        entity_hint = param_name.replace("_id", "").replace("-id", "").replace("_", "").replace("-", "")
        for ent in resolved_entities:
            if entity_hint in ent.get("entity_type", "").lower().replace("_", ""):
                return ent.get("id")

    # Quoted string after param label: param_name: "value" or param_name = "value"
    if param_type in ("string", "text"):
        label = param_name.replace("-", " ").replace("_", " ")
        pattern = rf'{re.escape(label)}\s*[:=]?\s*"([^"]+)"'
        m = re.search(pattern, message, re.IGNORECASE)
        if m:
            return m.group(1)

    return None


def build_composition_text(
    action_name: str, skill: str, resolved: list[dict], unresolved: list[str]
) -> str:
    """Build a complete response with a <composition> block."""
    # Build summary from action name
    verb = action_name.split("-")[0].capitalize()
    entity = " ".join(w.capitalize() for w in action_name.split("-")[1:])
    summary = f"{verb} {entity}"

    # Confirmation message
    if resolved:
        field_summary = ", ".join(
            f"{f['field']}={f['value']}" for f in resolved[:3]
        )
        confirmation = f"{summary} with {field_summary}?"
    else:
        confirmation = f"{summary}?"

    composition = {
        "action": action_name,
        "skill": skill,
        "resolved_fields": resolved,
        "unresolved_fields": unresolved,
        "summary": summary,
        "confirmation": confirmation,
        "show_full_form": len(unresolved) > 3,
    }

    # Build response text
    parts = []
    if unresolved:
        parts.append(f"I'll help you **{summary.lower()}**. Please fill in the required fields below:")
    else:
        parts.append(f"I'll **{summary.lower()}** with the following details. Please review and confirm:")

    parts.append(f"\n<composition>{json.dumps(composition)}</composition>")

    return "\n".join(parts)
