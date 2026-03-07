"""Auth API routes: login, refresh, logout, me, change-password, setup."""
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from .passwords import hash_password, verify_password, validate_password_strength
from .jwt_utils import (
    create_access_token,
    create_refresh_token,
    get_signing_secret,
    hash_token,
    verify_token,
    REFRESH_TOKEN_EXPIRY,
)
import db

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

IS_DEV = os.environ.get("WEBCLAW_ENV", "production") != "production"
# Only set Secure flag when explicitly enabled (i.e., behind HTTPS termination)
USE_SECURE_COOKIE = os.environ.get("WEBCLAW_HTTPS", "").lower() in ("1", "true", "yes")

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)
MAX_SESSIONS_PER_USER = 5


def _set_refresh_cookie(response: Response, token: str):
    """Set the httpOnly refresh token cookie."""
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=USE_SECURE_COOKIE,
        samesite="lax",
        max_age=int(REFRESH_TOKEN_EXPIRY.total_seconds()),
        path="/",
    )


def _clear_refresh_cookie(response: Response):
    """Clear the refresh token cookie."""
    response.delete_cookie(
        key="refresh_token",
        path="/",
        httponly=True,
        secure=USE_SECURE_COOKIE,
        samesite="lax",
    )


def _get_client_info(request: Request) -> tuple[str, str]:
    """Extract IP and user-agent from request."""
    ip = request.headers.get("x-real-ip", request.client.host if request.client else "unknown")
    ua = request.headers.get("user-agent", "")[:256]
    return ip, ua


@router.post("/login")
async def login(request: Request):
    """Authenticate with email + password, return access token + refresh cookie."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"status": "error", "message": "Invalid request body"}, 400)

    from models import LoginRequest
    from pydantic import ValidationError
    try:
        req = LoginRequest(**body)
    except ValidationError as e:
        return JSONResponse({"status": "error", "message": str(e.errors()[0]["msg"])}, 400)

    email = req.email
    password = req.password

    conn = db.get_connection()

    # Lookup user
    user = conn.execute(
        "SELECT id, email, full_name, password_hash, status, failed_login_attempts, locked_until FROM webclaw_user WHERE email = ?",
        (email,),
    ).fetchone()

    if not user:
        return JSONResponse({"status": "error", "message": "Invalid credentials"}, 401)

    user_id = user[0] if isinstance(user, tuple) else user["id"]
    user_email = user[1] if isinstance(user, tuple) else user["email"]
    full_name = user[2] if isinstance(user, tuple) else user["full_name"]
    pw_hash = user[3] if isinstance(user, tuple) else user["password_hash"]
    status = user[4] if isinstance(user, tuple) else user["status"]
    failed_attempts = (user[5] if isinstance(user, tuple) else user["failed_login_attempts"]) or 0
    locked_until = user[6] if isinstance(user, tuple) else user["locked_until"]

    if status != "active":
        return JSONResponse({"status": "error", "message": "Account is disabled"}, 401)

    # Check lockout
    if locked_until:
        lock_time = datetime.fromisoformat(locked_until)
        if datetime.now(timezone.utc) < lock_time:
            return JSONResponse({"status": "error", "message": "Account temporarily locked. Try again later."}, 429)
        # Lockout expired — reset
        conn.execute(
            "UPDATE webclaw_user SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
            (user_id,),
        )
        conn.commit()
        failed_attempts = 0

    if not pw_hash:
        return JSONResponse({"status": "error", "message": "No web password set for this account"}, 401)

    if not verify_password(password, pw_hash):
        failed_attempts += 1
        if failed_attempts >= MAX_FAILED_ATTEMPTS:
            lock_until = (datetime.now(timezone.utc) + LOCKOUT_DURATION).isoformat()
            conn.execute(
                "UPDATE webclaw_user SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
                (failed_attempts, lock_until, user_id),
            )
        else:
            conn.execute(
                "UPDATE webclaw_user SET failed_login_attempts = ? WHERE id = ?",
                (failed_attempts, user_id),
            )
        conn.commit()
        return JSONResponse({"status": "error", "message": "Invalid credentials"}, 401)

    # Reset failed attempts on successful login
    if failed_attempts > 0:
        conn.execute(
            "UPDATE webclaw_user SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
            (user_id,),
        )

    # Create tokens
    secret = get_signing_secret(conn)
    access_token = create_access_token(user_id, user_email, secret)
    raw_refresh, refresh_hash = create_refresh_token(user_id, secret)

    # Store session
    ip, ua = _get_client_info(request)
    conn.execute(
        """INSERT INTO webclaw_session (id, user_id, refresh_token_hash, expires_at, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            str(uuid.uuid4()),
            user_id,
            refresh_hash,
            (datetime.now(timezone.utc) + REFRESH_TOKEN_EXPIRY).isoformat(),
            ip,
            ua,
        ),
    )
    conn.execute(
        "UPDATE webclaw_user SET last_login = ? WHERE id = ?",
        (datetime.now(timezone.utc).isoformat(), user_id),
    )

    # Session cap — evict oldest sessions beyond limit
    sessions = conn.execute(
        "SELECT id FROM webclaw_session WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    if len(sessions) > MAX_SESSIONS_PER_USER:
        old_ids = [s[0] if isinstance(s, tuple) else s["id"] for s in sessions[MAX_SESSIONS_PER_USER:]]
        placeholders = ",".join("?" for _ in old_ids)
        conn.execute(f"DELETE FROM webclaw_session WHERE id IN ({placeholders})", old_ids)

    conn.commit()

    response = JSONResponse({
        "status": "ok",
        "access_token": access_token,
        "user": {"user_id": user_id, "email": user_email, "full_name": full_name},
    })
    _set_refresh_cookie(response, raw_refresh)
    return response


@router.post("/refresh")
async def refresh(request: Request):
    """Rotate refresh token, return new access token."""
    raw_token = request.cookies.get("refresh_token")
    if not raw_token:
        return JSONResponse({"status": "error", "message": "No refresh token"}, 401)

    conn = db.get_connection()
    secret = get_signing_secret(conn)

    # Verify JWT signature + expiry
    payload = verify_token(raw_token, secret, expected_type="refresh")
    if not payload:
        response = JSONResponse({"status": "error", "message": "Invalid or expired refresh token"}, 401)
        _clear_refresh_cookie(response)
        return response

    # Lookup session by token hash
    token_hash = hash_token(raw_token)
    session = conn.execute(
        "SELECT id, user_id FROM webclaw_session WHERE refresh_token_hash = ?", (token_hash,)
    ).fetchone()

    if not session:
        response = JSONResponse({"status": "error", "message": "Session not found (token revoked)"}, 401)
        _clear_refresh_cookie(response)
        return response

    session_id = session[0] if isinstance(session, tuple) else session["id"]
    user_id = session[1] if isinstance(session, tuple) else session["user_id"]

    # Get user info
    user = conn.execute(
        "SELECT email, full_name, status FROM webclaw_user WHERE id = ?", (user_id,)
    ).fetchone()

    if not user or (user[2] if isinstance(user, tuple) else user["status"]) != "active":
        conn.execute("DELETE FROM webclaw_session WHERE id = ?", (session_id,))
        conn.commit()
        response = JSONResponse({"status": "error", "message": "Account disabled"}, 401)
        _clear_refresh_cookie(response)
        return response

    user_email = user[0] if isinstance(user, tuple) else user["email"]

    # Rotate: delete old session, create new
    conn.execute("DELETE FROM webclaw_session WHERE id = ?", (session_id,))

    new_access = create_access_token(user_id, user_email, secret)
    new_raw_refresh, new_refresh_hash = create_refresh_token(user_id, secret)

    ip, ua = _get_client_info(request)
    conn.execute(
        """INSERT INTO webclaw_session (id, user_id, refresh_token_hash, expires_at, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            str(uuid.uuid4()),
            user_id,
            new_refresh_hash,
            (datetime.now(timezone.utc) + REFRESH_TOKEN_EXPIRY).isoformat(),
            ip,
            ua,
        ),
    )
    conn.commit()

    response = JSONResponse({"status": "ok", "access_token": new_access})
    _set_refresh_cookie(response, new_raw_refresh)
    return response


@router.post("/logout")
async def logout(request: Request):
    """Delete session, clear refresh cookie."""
    raw_token = request.cookies.get("refresh_token")
    if raw_token:
        conn = db.get_connection()
        token_hash = hash_token(raw_token)
        conn.execute("DELETE FROM webclaw_session WHERE refresh_token_hash = ?", (token_hash,))
        conn.commit()

    response = JSONResponse({"status": "ok", "message": "Logged out"})
    _clear_refresh_cookie(response)
    return response


@router.get("/me")
async def me(request: Request):
    """Return current user info + roles. Requires Bearer token."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse({"status": "error", "message": "Authentication required"}, 401)

    conn = db.get_connection()
    secret = get_signing_secret(conn)
    payload = verify_token(auth_header[7:], secret, expected_type="access")
    if not payload:
        return JSONResponse({"status": "error", "message": "Invalid or expired token"}, 401)

    user_id = payload["sub"]
    user = conn.execute(
        "SELECT id, email, full_name, username, status FROM webclaw_user WHERE id = ?",
        (user_id,),
    ).fetchone()

    if not user:
        return JSONResponse({"status": "error", "message": "User not found"}, 404)

    # Get roles
    roles = conn.execute(
        """SELECT r.name as role_name
           FROM webclaw_user_role ur JOIN webclaw_role r ON ur.role_id = r.id
           WHERE ur.user_id = ?""",
        (user_id,),
    ).fetchall()

    role_list = [
        {"role_name": r[0] if isinstance(r, tuple) else r["role_name"]}
        for r in roles
    ]

    return {
        "status": "ok",
        "user": {
            "user_id": user[0] if isinstance(user, tuple) else user["id"],
            "email": user[1] if isinstance(user, tuple) else user["email"],
            "full_name": user[2] if isinstance(user, tuple) else user["full_name"],
            "username": user[3] if isinstance(user, tuple) else user["username"],
            "roles": role_list,
        },
    }


@router.post("/change-password")
async def change_password(request: Request):
    """Change password. Requires Bearer token + current password."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse({"status": "error", "message": "Authentication required"}, 401)

    conn = db.get_connection()
    secret = get_signing_secret(conn)
    payload = verify_token(auth_header[7:], secret, expected_type="access")
    if not payload:
        return JSONResponse({"status": "error", "message": "Invalid or expired token"}, 401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"status": "error", "message": "Invalid request body"}, 400)

    from models import ChangePasswordRequest
    from pydantic import ValidationError
    try:
        req = ChangePasswordRequest(**body)
    except ValidationError as e:
        return JSONResponse({"status": "error", "message": str(e.errors()[0]["msg"])}, 400)

    current_pw = req.current_password
    new_pw = req.new_password

    pw_err = validate_password_strength(new_pw)
    if pw_err:
        return JSONResponse({"status": "error", "message": pw_err}, 400)

    user_id = payload["sub"]
    user = conn.execute(
        "SELECT password_hash FROM webclaw_user WHERE id = ?", (user_id,)
    ).fetchone()

    if not user:
        return JSONResponse({"status": "error", "message": "User not found"}, 404)

    pw_hash = user[0] if isinstance(user, tuple) else user["password_hash"]
    if not verify_password(current_pw, pw_hash):
        return JSONResponse({"status": "error", "message": "Current password is incorrect"}, 401)

    # Update password + invalidate all sessions
    new_hash = hash_password(new_pw)
    conn.execute(
        "UPDATE webclaw_user SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        (new_hash, user_id),
    )
    conn.execute("DELETE FROM webclaw_session WHERE user_id = ?", (user_id,))
    conn.commit()

    return {"status": "ok", "message": "Password changed. Please log in again."}


@router.post("/setup")
async def setup(request: Request):
    """Create first admin user. Only works when no users exist."""
    conn = db.get_connection()

    user_count = conn.execute("SELECT COUNT(*) FROM webclaw_user").fetchone()[0]
    if user_count > 0:
        return JSONResponse(
            {"status": "error", "message": "Setup already complete. Use /auth/login."},
            403,
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"status": "error", "message": "Invalid request body"}, 400)

    from models import SetupRequest
    from pydantic import ValidationError
    try:
        req = SetupRequest(**body)
    except ValidationError as e:
        return JSONResponse({"status": "error", "message": str(e.errors()[0]["msg"])}, 400)

    email = req.email
    password = req.password
    full_name = req.full_name

    pw_err = validate_password_strength(password)
    if pw_err:
        return JSONResponse({"status": "error", "message": pw_err}, 400)

    user_id = str(uuid.uuid4())
    username = email.split("@")[0]  # derive username from email

    # Create user
    conn.execute(
        """INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status)
           VALUES (?, ?, ?, ?, ?, 'active')""",
        (user_id, username, email, full_name or username, hash_password(password)),
    )

    # Ensure System Manager role exists
    role = conn.execute("SELECT id FROM webclaw_role WHERE name = 'System Manager'").fetchone()
    if not role:
        role_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO webclaw_role (id, name, description, is_system) VALUES (?, 'System Manager', 'Full system access', 1)",
            (role_id,),
        )
    else:
        role_id = role[0] if isinstance(role, tuple) else role["id"]

    # Assign System Manager role
    conn.execute(
        "INSERT INTO webclaw_user_role (id, user_id, role_id) VALUES (?, ?, ?)",
        (str(uuid.uuid4()), user_id, role_id),
    )

    # Create tokens
    secret = get_signing_secret(conn)
    access_token = create_access_token(user_id, email, secret)
    raw_refresh, refresh_hash = create_refresh_token(user_id, secret)

    ip, ua = _get_client_info(request)
    conn.execute(
        """INSERT INTO webclaw_session (id, user_id, refresh_token_hash, expires_at, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            str(uuid.uuid4()),
            user_id,
            refresh_hash,
            (datetime.now(timezone.utc) + REFRESH_TOKEN_EXPIRY).isoformat(),
            ip,
            ua,
        ),
    )
    conn.commit()

    response = JSONResponse({
        "status": "ok",
        "access_token": access_token,
        "user": {"user_id": user_id, "email": email, "full_name": full_name or username},
        "message": "Admin account created. You are now logged in.",
    })
    _set_refresh_cookie(response, raw_refresh)
    return response


@router.get("/check-setup")
async def check_setup():
    """Check if initial setup is needed (no users exist)."""
    conn = db.get_connection()
    user_count = conn.execute("SELECT COUNT(*) FROM webclaw_user").fetchone()[0]
    return {"status": "ok", "needs_setup": user_count == 0}
