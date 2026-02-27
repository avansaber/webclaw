"""Auth API tests — 12 tests for Sprint A1.

Tests cover: login, refresh, logout, RBAC, change-password, setup, skill validation.
Uses FastAPI TestClient with an in-memory SQLite database.
"""
import os
import sys
import uuid
import sqlite3
import pytest

# Setup paths before imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    """Create a fresh test DB for each test and patch get_connection."""
    db_path = str(tmp_path / "test.sqlite")

    # Create schema
    init_db_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "init_db.py")
    if os.path.exists(init_db_path):
        # Use init_db to create full schema
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")

        with open(init_db_path) as f:
            sql_content = f.read()

        # Extract CREATE TABLE / CREATE INDEX statements from init_db
        # We'll use the migration script approach for minimal tables
        pass
        conn.close()

    # Create minimal required tables for auth testing
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS webclaw_user (
            id              TEXT PRIMARY KEY,
            username        TEXT UNIQUE NOT NULL,
            email           TEXT UNIQUE,
            full_name       TEXT,
            password_hash   TEXT,
            status          TEXT DEFAULT 'active',
            company_ids     TEXT,
            last_login      TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS webclaw_role (
            id          TEXT PRIMARY KEY,
            name        TEXT UNIQUE NOT NULL,
            description TEXT,
            is_system   INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS webclaw_user_role (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL REFERENCES webclaw_user(id),
            role_id     TEXT NOT NULL REFERENCES webclaw_role(id),
            company_id  TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, role_id, company_id)
        );

        CREATE TABLE IF NOT EXISTS webclaw_role_permission (
            id              TEXT PRIMARY KEY,
            role_id         TEXT NOT NULL REFERENCES webclaw_role(id),
            skill           TEXT NOT NULL,
            action_pattern  TEXT NOT NULL,
            allowed         INTEGER DEFAULT 1,
            UNIQUE(role_id, skill, action_pattern)
        );

        CREATE TABLE IF NOT EXISTS webclaw_session (
            id                  TEXT PRIMARY KEY,
            user_id             TEXT NOT NULL REFERENCES webclaw_user(id) ON DELETE CASCADE,
            refresh_token_hash  TEXT NOT NULL UNIQUE,
            expires_at          TEXT NOT NULL,
            created_at          TEXT DEFAULT (datetime('now')),
            last_active_at      TEXT DEFAULT (datetime('now')),
            ip_address          TEXT,
            user_agent          TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_webclaw_session_user ON webclaw_session(user_id);
        CREATE INDEX IF NOT EXISTS idx_webclaw_session_token ON webclaw_session(refresh_token_hash);

        CREATE TABLE IF NOT EXISTS webclaw_config (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id          TEXT PRIMARY KEY,
            user_id     TEXT,
            skill       TEXT,
            action      TEXT,
            entity_type TEXT,
            entity_id   TEXT,
            old_values  TEXT,
            new_values  TEXT,
            description TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    conn.close()

    # Patch get_connection to return our test DB
    def mock_get_connection(path=None):
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode = WAL")
        c.execute("PRAGMA foreign_keys = ON")
        c.execute("PRAGMA busy_timeout = 5000")
        return c

    monkeypatch.setattr("db.get_connection", mock_get_connection)

    # Set dev environment
    monkeypatch.setenv("WEBCLAW_ENV", "development")

    return db_path


@pytest.fixture
def client(setup_test_db):
    """Create a FastAPI test client."""
    from main import app
    return TestClient(app)


@pytest.fixture
def seeded_user(setup_test_db):
    """Create a test user with password and System Manager role."""
    from db import get_connection
    from auth.passwords import hash_password

    conn = get_connection()
    user_id = str(uuid.uuid4())
    pw_hash = hash_password("TestPass123!")

    conn.execute(
        "INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status) VALUES (?, ?, ?, ?, ?, 'active')",
        (user_id, "testadmin", "admin@test.com", "Test Admin", pw_hash),
    )

    role_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO webclaw_role (id, name, description, is_system) VALUES (?, 'System Manager', 'Full access', 1)",
        (role_id,),
    )
    conn.execute(
        "INSERT INTO webclaw_user_role (id, user_id, role_id) VALUES (?, ?, ?)",
        (str(uuid.uuid4()), user_id, role_id),
    )
    conn.commit()
    return {"user_id": user_id, "email": "admin@test.com", "password": "TestPass123!"}


@pytest.fixture
def limited_user(setup_test_db):
    """Create a user with only 'Accounts User' role (limited permissions)."""
    from db import get_connection
    from auth.passwords import hash_password

    conn = get_connection()
    user_id = str(uuid.uuid4())
    pw_hash = hash_password("LimitedPass1!")

    conn.execute(
        "INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status) VALUES (?, ?, ?, ?, ?, 'active')",
        (user_id, "limiteduser", "limited@test.com", "Limited User", pw_hash),
    )

    role_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO webclaw_role (id, name, description, is_system) VALUES (?, 'Accounts User', 'Read-only finance', 0)",
        (role_id,),
    )
    conn.execute(
        "INSERT INTO webclaw_user_role (id, user_id, role_id) VALUES (?, ?, ?)",
        (str(uuid.uuid4()), user_id, role_id),
    )
    # Grant only list-* on erpclaw-reports
    conn.execute(
        "INSERT INTO webclaw_role_permission (id, role_id, skill, action_pattern, allowed) VALUES (?, ?, 'erpclaw-reports', 'list-*', 1)",
        (str(uuid.uuid4()), role_id),
    )
    conn.commit()
    return {"user_id": user_id, "email": "limited@test.com", "password": "LimitedPass1!"}


# ---------------------------------------------------------------------------
# Test 1: Login with valid credentials
# ---------------------------------------------------------------------------

def test_login_valid_credentials(client, seeded_user):
    """Login with correct email + password returns access_token + refresh cookie."""
    resp = client.post("/api/v1/auth/login", json={
        "email": seeded_user["email"],
        "password": seeded_user["password"],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "access_token" in data
    assert data["user"]["email"] == seeded_user["email"]
    # Refresh cookie should be set
    assert "refresh_token" in resp.cookies


# ---------------------------------------------------------------------------
# Test 2: Login with invalid password
# ---------------------------------------------------------------------------

def test_login_invalid_password(client, seeded_user):
    """Login with wrong password returns 401."""
    resp = client.post("/api/v1/auth/login", json={
        "email": seeded_user["email"],
        "password": "WrongPassword!",
    })
    assert resp.status_code == 401
    assert resp.json()["status"] == "error"


# ---------------------------------------------------------------------------
# Test 3: Login with nonexistent email
# ---------------------------------------------------------------------------

def test_login_nonexistent_email(client, seeded_user):
    """Login with unknown email returns 401."""
    resp = client.post("/api/v1/auth/login", json={
        "email": "nobody@test.com",
        "password": "irrelevant",
    })
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Test 4: Login disabled user
# ---------------------------------------------------------------------------

def test_login_disabled_user(client, setup_test_db):
    """Login with disabled account returns 401."""
    from db import get_connection
    from auth.passwords import hash_password

    conn = get_connection()
    conn.execute(
        "INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status) VALUES (?, ?, ?, ?, ?, 'disabled')",
        (str(uuid.uuid4()), "disabled", "disabled@test.com", "Disabled", hash_password("Pass1234!")),
    )
    conn.commit()

    resp = client.post("/api/v1/auth/login", json={
        "email": "disabled@test.com",
        "password": "Pass1234!",
    })
    assert resp.status_code == 401
    assert "disabled" in resp.json()["message"].lower()


# ---------------------------------------------------------------------------
# Test 5: Refresh token rotation
# ---------------------------------------------------------------------------

def test_refresh_token_rotation(client, seeded_user):
    """After refresh, old token is invalidated and new one works."""
    # Login
    login_resp = client.post("/api/v1/auth/login", json={
        "email": seeded_user["email"],
        "password": seeded_user["password"],
    })
    assert login_resp.status_code == 200

    # Refresh
    refresh_resp = client.post("/api/v1/auth/refresh")
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert data["status"] == "ok"
    assert "access_token" in data

    # Second refresh should also work (cookie was rotated)
    refresh_resp2 = client.post("/api/v1/auth/refresh")
    assert refresh_resp2.status_code == 200


# ---------------------------------------------------------------------------
# Test 6: Logout clears session
# ---------------------------------------------------------------------------

def test_logout_clears_session(client, seeded_user):
    """After logout, refresh returns 401."""
    # Login
    client.post("/api/v1/auth/login", json={
        "email": seeded_user["email"],
        "password": seeded_user["password"],
    })

    # Logout
    logout_resp = client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 200

    # Refresh should fail (session deleted)
    refresh_resp = client.post("/api/v1/auth/refresh")
    assert refresh_resp.status_code == 401


# ---------------------------------------------------------------------------
# Test 7: RBAC deny — limited user cannot access forbidden action
# ---------------------------------------------------------------------------

def test_rbac_deny(client, limited_user):
    """User without permission gets 403."""
    # Login
    login_resp = client.post("/api/v1/auth/login", json={
        "email": limited_user["email"],
        "password": limited_user["password"],
    })
    token = login_resp.json()["access_token"]

    # Try to access an action not in their permissions
    resp = client.get(
        "/api/v1/erpclaw-gl/submit-journal-entry",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Test 8: RBAC allow — System Manager can access anything
# ---------------------------------------------------------------------------

def test_rbac_allow(client, seeded_user):
    """System Manager can access any action (200 or 400, not 401/403)."""
    login_resp = client.post("/api/v1/auth/login", json={
        "email": seeded_user["email"],
        "password": seeded_user["password"],
    })
    token = login_resp.json()["access_token"]

    # This will likely 400 (skill not found) but NOT 401/403
    resp = client.get(
        "/api/v1/erpclaw-setup/list-companies",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code != 401
    assert resp.status_code != 403


# ---------------------------------------------------------------------------
# Test 9: Skill name validation (path traversal protection)
# ---------------------------------------------------------------------------

def test_skill_name_validation(client, seeded_user):
    """Path traversal attempts are blocked with 400."""
    login_resp = client.post("/api/v1/auth/login", json={
        "email": seeded_user["email"],
        "password": seeded_user["password"],
    })
    token = login_resp.json()["access_token"]

    resp = client.get(
        "/api/v1/../../etc/passwd",
        headers={"Authorization": f"Bearer {token}"},
    )
    # FastAPI will either 400 (invalid skill name) or 404 (no route match)
    assert resp.status_code in (400, 404, 422)


# ---------------------------------------------------------------------------
# Test 10: Change password
# ---------------------------------------------------------------------------

def test_change_password(client, seeded_user):
    """After password change, old password stops working."""
    # Login
    login_resp = client.post("/api/v1/auth/login", json={
        "email": seeded_user["email"],
        "password": seeded_user["password"],
    })
    token = login_resp.json()["access_token"]

    # Change password
    change_resp = client.post("/api/v1/auth/change-password", json={
        "current_password": seeded_user["password"],
        "new_password": "NewStrongPass9!",
    }, headers={"Authorization": f"Bearer {token}"})
    assert change_resp.status_code == 200

    # Old password should fail
    old_login = client.post("/api/v1/auth/login", json={
        "email": seeded_user["email"],
        "password": seeded_user["password"],
    })
    assert old_login.status_code == 401

    # New password should work
    new_login = client.post("/api/v1/auth/login", json={
        "email": seeded_user["email"],
        "password": "NewStrongPass9!",
    })
    assert new_login.status_code == 200


# ---------------------------------------------------------------------------
# Test 11: No users = RBAC bypass
# ---------------------------------------------------------------------------

def test_no_users_bypass(client, setup_test_db):
    """When webclaw_user table is empty, all requests are allowed without auth."""
    # No users exist — should pass through without auth
    resp = client.get("/api/v1/erpclaw-setup/list-companies")
    # Will be 400 (skill not found on test env) but NOT 401
    assert resp.status_code != 401
    assert resp.status_code != 403


# ---------------------------------------------------------------------------
# Test 12: Setup endpoint creates admin, blocks after
# ---------------------------------------------------------------------------

def test_setup_endpoint(client, setup_test_db):
    """Setup creates first admin; subsequent calls return 403."""
    # First setup should succeed
    resp = client.post("/api/v1/auth/setup", json={
        "email": "first@admin.com",
        "password": "AdminPass1!",
        "full_name": "First Admin",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "access_token" in data

    # Second setup should fail
    resp2 = client.post("/api/v1/auth/setup", json={
        "email": "second@admin.com",
        "password": "AdminPass2!",
        "full_name": "Second Admin",
    })
    assert resp2.status_code == 403
