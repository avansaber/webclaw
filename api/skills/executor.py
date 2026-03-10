"""Skill subprocess execution — runs db_query.py scripts and returns JSON."""
import asyncio
import json
import os
import re

SKILLS_DIR = os.path.expanduser("~/clawd/skills")
MODULES_DIR = os.path.expanduser("~/.openclaw/erpclaw/modules")

# Skill names must be lowercase alphanumeric with hyphens only (path traversal defense)
_SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def find_skill_dir(skill: str) -> str | None:
    """Resolve the root directory for a skill (top-level or erpclaw module)."""
    if not _SKILL_NAME_RE.match(skill):
        return None
    # Primary: ~/clawd/skills/{skill}/
    primary = os.path.join(SKILLS_DIR, skill)
    if os.path.isdir(primary):
        return primary
    # Fallback: ~/.openclaw/erpclaw/modules/{skill}/
    module = os.path.join(MODULES_DIR, skill)
    if os.path.isdir(module):
        return module
    return None


def find_skill_script(skill: str) -> str | None:
    """Resolve the db_query.py path for a skill."""
    skill_dir = find_skill_dir(skill)
    if not skill_dir:
        return None
    script = os.path.join(skill_dir, "scripts", "db_query.py")
    return script if os.path.exists(script) else None


def build_cli_args(action: str, params: dict) -> list[str]:
    """Convert action + params dict into CLI argument list.

    Boolean values are passed as "1"/"0" strings since erpclaw scripts use
    value-based boolean args (e.g. --exempt-from-sales-tax 1), not store_true.
    False booleans are omitted entirely (absence = false for all erpclaw scripts).
    """
    args = ["--action", action]
    for key, value in params.items():
        if key.startswith("_"):
            continue
        flag = f"--{key.replace('_', '-')}"
        # Handle actual booleans — pass "1" for true, skip for false
        if isinstance(value, bool):
            if value:
                args.extend([flag, "1"])
        # Handle string booleans from form submissions ("true"/"false")
        elif isinstance(value, str) and value.lower() in ("true", "false"):
            if value.lower() == "true":
                args.extend([flag, "1"])
        elif value is not None and str(value).strip():
            args.extend([flag, str(value)])
    return args


async def execute_skill(skill: str, action: str, params: dict) -> dict:
    """Execute a skill action via subprocess and return parsed JSON."""
    script = find_skill_script(skill)
    if not script:
        return {"status": "error", "message": f"Skill not found: {skill}"}

    cmd = ["python3", script] + build_cli_args(action, params)

    # Build PYTHONPATH: include the skill's own scripts dir + any shared libs
    skill_dir = os.path.join(SKILLS_DIR, skill, "scripts")
    python_paths = [skill_dir]
    # Add erpclaw shared lib if it exists (backward-compatible)
    erpclaw_lib = os.path.expanduser("~/.openclaw/erpclaw/lib")
    if os.path.isdir(erpclaw_lib):
        python_paths.append(erpclaw_lib)
    existing = os.environ.get("PYTHONPATH", "")
    if existing:
        python_paths.append(existing)

    # Seed-demo-data can take 60-90s due to many subprocess calls
    timeout = 120 if action == "seed-demo-data" else 30

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "PYTHONPATH": os.pathsep.join(python_paths)},
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        return {"status": "error", "message": f"Action timed out ({timeout}s)"}
    except Exception as e:
        return {"status": "error", "message": f"Subprocess error: {e}"}

    output = stdout.decode("utf-8").strip()
    if not output:
        err = stderr.decode("utf-8").strip()
        # Pattern 1: erpclaw argparse — choices constraint error
        if "error: argument --action: invalid choice:" in err:
            lines = err.split("\n")
            error_line = [l for l in lines if "error: argument --action:" in l]
            msg = error_line[0].split("error: ")[-1] if error_line else "Invalid action"
            choices_match = re.search(r"choose from (.+)\)", err)
            if choices_match:
                actions = [a.strip().strip("'") for a in choices_match.group(1).split(",")]
                return {"status": "error", "message": msg, "available_actions": actions}
            return {"status": "error", "message": msg}
        # Pattern 2: stderr may contain JSON (some skills write errors to stderr)
        # Look for a JSON object in stderr (skip SyntaxWarning lines etc.)
        for line in reversed(err.split("\n")):
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    pass
        if len(err) > 500:
            err = err[:500] + "..."
        return {"status": "error", "message": err or "No output from skill"}

    try:
        result = json.loads(output)
    except json.JSONDecodeError:
        return {"status": "error", "message": f"Invalid JSON: {output[:200]}"}

    # Auto-enrich with _ui directives if skill didn't provide them
    if "_ui" not in result:
        result["_ui"] = _auto_ui(action, result)
    return result


def _auto_ui(action: str, result: dict) -> dict | None:
    """Generate basic _ui directives for skill responses that lack them."""
    ui: dict = {}
    status = result.get("status", "")
    msg = result.get("message", "")

    if status == "error":
        ui["toast"] = {"type": "error", "message": msg or "Action failed", "duration": 0}
    elif action.startswith("add-"):
        name = result.get("name") or result.get("id", "")
        ui["toast"] = {"type": "success", "message": f"Created {name}" if name else "Created successfully"}
    elif action.startswith("submit-"):
        ui["toast"] = {"type": "success", "message": msg or "Submitted successfully"}
    elif action.startswith("cancel-"):
        ui["toast"] = {"type": "warning", "message": msg or "Cancelled"}
    elif action.startswith("delete-"):
        ui["toast"] = {"type": "info", "message": msg or "Deleted"}
    elif action.startswith("update-"):
        ui["toast"] = {"type": "success", "message": msg or "Updated successfully"}

    return ui if ui else None
