"""Webclaw RBAC — Role-Based Access Control.

Permission resolution:
1. If no webclaw_user records exist → allow all (RBAC not enforced)
2. If user has 'System Manager' role → always allow
3. Check webclaw_role_permission for matching (skill, action_pattern)
4. Wildcard patterns: 'submit-*', 'list-*', '*'
5. No matching rule → deny
"""
import fnmatch
import sqlite3


def check_permission(conn: sqlite3.Connection, user_id: str, skill: str, action: str) -> bool:
    """Check if a user has permission to perform an action.

    Returns True if allowed, False if denied.
    Returns True if no users exist (RBAC not yet active).
    """
    # If no users exist, RBAC is not enforced
    row = conn.execute("SELECT COUNT(*) as cnt FROM webclaw_user").fetchone()
    if (row["cnt"] if isinstance(row, dict) else row[0]) == 0:
        return True

    if not user_id:
        return True  # No user context → allow (backward compat)

    # System Manager bypasses all checks
    sm = conn.execute(
        """SELECT 1 FROM webclaw_user_role ur
           JOIN webclaw_role r ON r.id = ur.role_id
           WHERE ur.user_id = ? AND r.name = 'System Manager'
           LIMIT 1""",
        (user_id,),
    ).fetchone()
    if sm is not None:
        return True

    # Get all role IDs for this user
    role_rows = conn.execute(
        "SELECT DISTINCT role_id FROM webclaw_user_role WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    if not role_rows:
        return False  # User has no roles → deny

    role_ids = [r["role_id"] if isinstance(r, dict) else r[0] for r in role_rows]

    # Check permissions for each role
    placeholders = ",".join("?" for _ in role_ids)
    perms = conn.execute(
        f"""SELECT skill, action_pattern, allowed
            FROM webclaw_role_permission
            WHERE role_id IN ({placeholders})""",
        role_ids,
    ).fetchall()

    for perm in perms:
        p_skill = perm["skill"] if isinstance(perm, dict) else perm[0]
        p_pattern = perm["action_pattern"] if isinstance(perm, dict) else perm[1]
        p_allowed = perm["allowed"] if isinstance(perm, dict) else perm[2]

        if p_skill != skill and p_skill != "*":
            continue

        if fnmatch.fnmatch(action, p_pattern):
            return bool(p_allowed)

    return False  # No matching rule → deny
