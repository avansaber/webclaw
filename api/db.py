"""Database connection helper for Webclaw.

Provides connections to:
1. Webclaw's own DB (auth, sessions, chat, config, audit)
2. Skill-specific DBs (for entity resolution, read from SKILL.md)

Replaces erpclaw_lib.db — webclaw has zero dependency on any skill's shared lib.
"""
import glob
import os
import sqlite3
import stat

import yaml

SKILLS_DIR = os.path.expanduser("~/clawd/skills")
DEFAULT_WEBCLAW_DB = os.path.expanduser("~/.openclaw/webclaw/webclaw.sqlite")

# Cache: skill_name → db_path (from SKILL.md webclaw.database)
_skill_db_cache: dict[str, str] = {}
_tables_initialized = False


def _apply_pragmas(conn: sqlite3.Connection) -> None:
    """Apply standard SQLite PRAGMAs for safety and performance."""
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")


def _ensure_dir(path: str) -> None:
    """Create parent directory if it doesn't exist."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def get_connection(db_path: str | None = None) -> sqlite3.Connection:
    """Get a connection to webclaw's own database.

    This database stores auth (users, sessions, roles), chat history,
    config, and audit logs — independent of any skill's database.

    Args:
        db_path: Override path. Defaults to WEBCLAW_DB_PATH env var
                 or ~/.openclaw/webclaw/webclaw.sqlite.

    Returns:
        sqlite3.Connection with row_factory=sqlite3.Row.
    """
    global _tables_initialized
    path = db_path or os.environ.get("WEBCLAW_DB_PATH", DEFAULT_WEBCLAW_DB)
    _ensure_dir(path)
    is_new = not os.path.exists(path)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    _apply_pragmas(conn)

    # Auto-initialize tables on first use
    if not _tables_initialized:
        try:
            from init_webclaw_db import init_tables
            init_tables(conn)
        except Exception as e:
            import sys
            print(f"WARNING: webclaw schema init: {e}", file=sys.stderr)
        _tables_initialized = True

    if is_new:
        try:
            os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)  # 0o600
        except OSError as e:
            import sys
            print(f"WARNING: could not set DB permissions: {e}", file=sys.stderr)
    return conn


def get_skill_db(skill_name: str) -> sqlite3.Connection | None:
    """Get a DB connection for a specific skill's data.

    Reads webclaw.database from the skill's SKILL.md frontmatter.
    Falls back to the default erpclaw DB if no webclaw.database is specified.

    Args:
        skill_name: The skill directory name (e.g., 'erpclaw-gl', 'auditclaw-grc').

    Returns:
        sqlite3.Connection or None if the DB doesn't exist.
    """
    db_path = _resolve_skill_db_path(skill_name)
    if not db_path or not os.path.exists(db_path):
        return None

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    _apply_pragmas(conn)
    return conn


def _resolve_skill_db_path(skill_name: str) -> str | None:
    """Resolve the database path for a skill from its SKILL.md."""
    if skill_name in _skill_db_cache:
        return _skill_db_cache[skill_name]

    skill_md = os.path.join(SKILLS_DIR, skill_name, "SKILL.md")
    db_path = None

    try:
        with open(skill_md, "r") as f:
            content = f.read()
        if content.startswith("---"):
            end = content.index("---", 3)
            frontmatter = yaml.safe_load(content[3:end])
            if frontmatter:
                webclaw = frontmatter.get("webclaw", {})
                if isinstance(webclaw, dict) and webclaw.get("database"):
                    db_path = os.path.expanduser(webclaw["database"])
    except Exception:
        pass

    # Fallback: try the default erpclaw database
    if not db_path:
        default = os.path.expanduser("~/.openclaw/erpclaw/data.sqlite")
        if os.path.exists(default):
            db_path = default

    _skill_db_cache[skill_name] = db_path
    return db_path


def get_all_skill_db_paths() -> dict[str, str]:
    """Discover all skill DB paths from installed skills.

    Returns:
        Dict of skill_name → db_path for all skills with discoverable databases.
    """
    paths: dict[str, str] = {}
    for skill_md in sorted(glob.glob(os.path.join(SKILLS_DIR, "*/SKILL.md"))):
        skill_name = os.path.basename(os.path.dirname(skill_md))
        db_path = _resolve_skill_db_path(skill_name)
        if db_path:
            paths[skill_name] = db_path
    return paths
