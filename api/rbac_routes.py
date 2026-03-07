"""RBAC Management API — admin endpoints for roles, permissions, and users.

All endpoints require System Manager role.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

import db
from auth.jwt_utils import get_signing_secret, verify_token
from auth.passwords import hash_password, validate_password_strength

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _require_system_manager(request: Request) -> tuple[str, None] | tuple[None, JSONResponse]:
    """Verify caller is a System Manager. Returns (user_id, None) or (None, error)."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, JSONResponse({"status": "error", "message": "Authentication required"}, 401)

    conn = db.get_connection()
    secret = get_signing_secret(conn)
    payload = verify_token(auth_header[7:], secret, expected_type="access")
    if not payload:
        return None, JSONResponse({"status": "error", "message": "Invalid or expired token"}, 401)

    user_id = payload["sub"]
    sm = conn.execute(
        """SELECT 1 FROM webclaw_user_role ur
           JOIN webclaw_role r ON r.id = ur.role_id
           WHERE ur.user_id = ? AND r.name = 'System Manager' LIMIT 1""",
        (user_id,),
    ).fetchone()
    if not sm:
        return None, JSONResponse({"status": "error", "message": "System Manager role required"}, 403)

    return user_id, None


# ── Roles ────────────────────────────────────────────────────────────────────

@router.get("/roles")
async def list_roles(request: Request):
    """List all roles with permission counts."""
    _, err = _require_system_manager(request)
    if err:
        return err

    conn = db.get_connection()
    rows = conn.execute(
        """SELECT r.id, r.name, r.description, r.is_system, r.created_at,
                  (SELECT COUNT(*) FROM webclaw_role_permission WHERE role_id = r.id) as perm_count,
                  (SELECT COUNT(*) FROM webclaw_user_role WHERE role_id = r.id) as user_count
           FROM webclaw_role r ORDER BY r.is_system DESC, r.name"""
    ).fetchall()

    roles = []
    for r in rows:
        roles.append({
            "id": r[0], "name": r[1], "description": r[2],
            "is_system": bool(r[3]), "created_at": r[4],
            "permission_count": r[5], "user_count": r[6],
        })
    return {"status": "ok", "roles": roles}


@router.post("/roles")
async def create_role(request: Request):
    """Create a new role."""
    _, err = _require_system_manager(request)
    if err:
        return err

    body = await request.json()
    name = body.get("name", "").strip()
    description = body.get("description", "").strip()

    if not name:
        return JSONResponse({"status": "error", "message": "Role name is required"}, 400)

    conn = db.get_connection()
    existing = conn.execute("SELECT id FROM webclaw_role WHERE name = ?", (name,)).fetchone()
    if existing:
        return JSONResponse({"status": "error", "message": f"Role '{name}' already exists"}, 409)

    role_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO webclaw_role (id, name, description, is_system) VALUES (?, ?, ?, 0)",
        (role_id, name, description),
    )
    conn.commit()
    return {"status": "ok", "role": {"id": role_id, "name": name, "description": description}}


@router.put("/roles/{role_id}")
async def update_role(role_id: str, request: Request):
    """Update a role's name/description."""
    _, err = _require_system_manager(request)
    if err:
        return err

    conn = db.get_connection()
    role = conn.execute("SELECT is_system FROM webclaw_role WHERE id = ?", (role_id,)).fetchone()
    if not role:
        return JSONResponse({"status": "error", "message": "Role not found"}, 404)

    body = await request.json()
    name = body.get("name", "").strip()
    description = body.get("description", "").strip()

    if name:
        conn.execute("UPDATE webclaw_role SET name = ?, description = ? WHERE id = ?",
                      (name, description, role_id))
    else:
        conn.execute("UPDATE webclaw_role SET description = ? WHERE id = ?",
                      (description, role_id))
    conn.commit()
    return {"status": "ok", "message": "Role updated"}


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, request: Request):
    """Delete a role (system roles cannot be deleted)."""
    _, err = _require_system_manager(request)
    if err:
        return err

    conn = db.get_connection()
    role = conn.execute("SELECT name, is_system FROM webclaw_role WHERE id = ?", (role_id,)).fetchone()
    if not role:
        return JSONResponse({"status": "error", "message": "Role not found"}, 404)
    if role[1]:
        return JSONResponse({"status": "error", "message": f"Cannot delete system role '{role[0]}'"}, 403)

    conn.execute("DELETE FROM webclaw_role WHERE id = ?", (role_id,))
    conn.commit()
    return {"status": "ok", "message": "Role deleted"}


# ── Permissions ──────────────────────────────────────────────────────────────

@router.get("/roles/{role_id}/permissions")
async def list_permissions(role_id: str, request: Request):
    """List permissions for a role."""
    _, err = _require_system_manager(request)
    if err:
        return err

    conn = db.get_connection()
    rows = conn.execute(
        "SELECT id, skill, action_pattern, allowed FROM webclaw_role_permission WHERE role_id = ?",
        (role_id,),
    ).fetchall()

    perms = [{"id": r[0], "skill": r[1], "action_pattern": r[2], "allowed": bool(r[3])} for r in rows]
    return {"status": "ok", "permissions": perms}


@router.post("/roles/{role_id}/permissions")
async def add_permission(role_id: str, request: Request):
    """Add a permission to a role."""
    _, err = _require_system_manager(request)
    if err:
        return err

    body = await request.json()
    skill = body.get("skill", "").strip()
    action_pattern = body.get("action_pattern", "").strip()
    allowed = body.get("allowed", True)

    if not skill or not action_pattern:
        return JSONResponse({"status": "error", "message": "skill and action_pattern required"}, 400)

    conn = db.get_connection()
    perm_id = str(uuid.uuid4())
    try:
        conn.execute(
            "INSERT INTO webclaw_role_permission (id, role_id, skill, action_pattern, allowed) VALUES (?, ?, ?, ?, ?)",
            (perm_id, role_id, skill, action_pattern, 1 if allowed else 0),
        )
        conn.commit()
    except Exception:
        return JSONResponse({"status": "error", "message": "Permission already exists"}, 409)

    return {"status": "ok", "permission": {"id": perm_id, "skill": skill, "action_pattern": action_pattern, "allowed": allowed}}


@router.delete("/roles/{role_id}/permissions/{perm_id}")
async def remove_permission(role_id: str, perm_id: str, request: Request):
    """Remove a permission from a role."""
    _, err = _require_system_manager(request)
    if err:
        return err

    conn = db.get_connection()
    conn.execute("DELETE FROM webclaw_role_permission WHERE id = ? AND role_id = ?", (perm_id, role_id))
    conn.commit()
    return {"status": "ok", "message": "Permission removed"}


# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(request: Request):
    """List all users with their roles."""
    _, err = _require_system_manager(request)
    if err:
        return err

    conn = db.get_connection()
    users = conn.execute(
        "SELECT id, username, email, full_name, status, last_login, created_at FROM webclaw_user ORDER BY created_at"
    ).fetchall()

    result = []
    for u in users:
        user_id = u[0]
        roles = conn.execute(
            "SELECT r.id, r.name FROM webclaw_user_role ur JOIN webclaw_role r ON r.id = ur.role_id WHERE ur.user_id = ?",
            (user_id,),
        ).fetchall()
        result.append({
            "id": user_id, "username": u[1], "email": u[2], "full_name": u[3],
            "status": u[4], "last_login": u[5], "created_at": u[6],
            "roles": [{"id": r[0], "name": r[1]} for r in roles],
        })

    return {"status": "ok", "users": result}


@router.post("/users")
async def create_user(request: Request):
    """Create a new user with optional role assignments."""
    _, err = _require_system_manager(request)
    if err:
        return err

    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    full_name = body.get("full_name", "").strip()
    role_ids = body.get("role_ids", [])

    if not email or not password:
        return JSONResponse({"status": "error", "message": "Email and password required"}, 400)

    pw_err = validate_password_strength(password)
    if pw_err:
        return JSONResponse({"status": "error", "message": pw_err}, 400)

    conn = db.get_connection()
    existing = conn.execute("SELECT id FROM webclaw_user WHERE email = ?", (email,)).fetchone()
    if existing:
        return JSONResponse({"status": "error", "message": "Email already registered"}, 409)

    user_id = str(uuid.uuid4())
    username = email.split("@")[0]
    now = datetime.now(timezone.utc).isoformat()

    conn.execute(
        "INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)",
        (user_id, username, email, full_name or username, hash_password(password), now),
    )

    for rid in role_ids:
        try:
            conn.execute(
                "INSERT INTO webclaw_user_role (id, user_id, role_id) VALUES (?, ?, ?)",
                (str(uuid.uuid4()), user_id, rid),
            )
        except Exception:
            pass

    conn.commit()
    return {"status": "ok", "user": {"id": user_id, "email": email, "full_name": full_name or username}}


@router.put("/users/{user_id}")
async def update_user(user_id: str, request: Request):
    """Update user details (name, status, password reset)."""
    _, err = _require_system_manager(request)
    if err:
        return err

    conn = db.get_connection()
    user = conn.execute("SELECT id FROM webclaw_user WHERE id = ?", (user_id,)).fetchone()
    if not user:
        return JSONResponse({"status": "error", "message": "User not found"}, 404)

    body = await request.json()
    full_name = body.get("full_name")
    status = body.get("status")
    new_password = body.get("password")

    if full_name is not None:
        conn.execute("UPDATE webclaw_user SET full_name = ? WHERE id = ?", (full_name.strip(), user_id))
    if status and status in ("active", "disabled"):
        conn.execute("UPDATE webclaw_user SET status = ? WHERE id = ?", (status, user_id))
    if new_password:
        pw_err = validate_password_strength(new_password)
        if pw_err:
            return JSONResponse({"status": "error", "message": pw_err}, 400)
        conn.execute("UPDATE webclaw_user SET password_hash = ? WHERE id = ?",
                      (hash_password(new_password), user_id))
        conn.execute("DELETE FROM webclaw_session WHERE user_id = ?", (user_id,))

    conn.commit()
    return {"status": "ok", "message": "User updated"}


@router.post("/users/{user_id}/roles")
async def assign_role(user_id: str, request: Request):
    """Assign a role to a user."""
    _, err = _require_system_manager(request)
    if err:
        return err

    body = await request.json()
    role_id = body.get("role_id", "").strip()
    if not role_id:
        return JSONResponse({"status": "error", "message": "role_id required"}, 400)

    conn = db.get_connection()
    try:
        conn.execute(
            "INSERT INTO webclaw_user_role (id, user_id, role_id) VALUES (?, ?, ?)",
            (str(uuid.uuid4()), user_id, role_id),
        )
        conn.commit()
    except Exception:
        return JSONResponse({"status": "error", "message": "Role already assigned or not found"}, 409)

    return {"status": "ok", "message": "Role assigned"}


@router.delete("/users/{user_id}/roles/{role_id}")
async def remove_role(user_id: str, role_id: str, request: Request):
    """Remove a role from a user."""
    _, err = _require_system_manager(request)
    if err:
        return err

    conn = db.get_connection()
    conn.execute("DELETE FROM webclaw_user_role WHERE user_id = ? AND role_id = ?", (user_id, role_id))
    conn.commit()
    return {"status": "ok", "message": "Role removed"}
