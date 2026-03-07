"""Tests for RBAC management API — D4.

14 tests covering role CRUD, permission CRUD, user CRUD, role assignment,
System Manager guard, and system role deletion prevention.
"""
import os
import sys
import uuid
import sqlite3

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from auth.passwords import hash_password


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    """Create a fresh test DB with auth + RBAC tables."""
    db_path = str(tmp_path / "test.sqlite")
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
            failed_login_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until    TEXT,
            company_ids     TEXT,
            last_login      TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS webclaw_role (
            id          TEXT PRIMARY KEY,
            name        TEXT UNIQUE NOT NULL,
            description TEXT,
            is_system   INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS webclaw_user_role (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL REFERENCES webclaw_user(id) ON DELETE CASCADE,
            role_id     TEXT NOT NULL REFERENCES webclaw_role(id) ON DELETE CASCADE,
            created_at  TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, role_id)
        );

        CREATE TABLE IF NOT EXISTS webclaw_role_permission (
            id              TEXT PRIMARY KEY,
            role_id         TEXT NOT NULL REFERENCES webclaw_role(id) ON DELETE CASCADE,
            skill           TEXT NOT NULL,
            action_pattern  TEXT NOT NULL,
            allowed         INTEGER NOT NULL DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now')),
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

        CREATE TABLE IF NOT EXISTS webclaw_config (
            key TEXT PRIMARY KEY, value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    conn.close()

    def mock_get_connection(path=None):
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode = WAL")
        c.execute("PRAGMA foreign_keys = ON")
        c.execute("PRAGMA busy_timeout = 5000")
        return c

    monkeypatch.setenv("WEBCLAW_DB_PATH", db_path)
    monkeypatch.setattr("db.get_connection", mock_get_connection)

    return db_path


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


def _seed_admin(db_path: str) -> dict:
    """Create admin user with System Manager role, return credentials."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    user_id = str(uuid.uuid4())
    role_id = str(uuid.uuid4())
    pw_hash = hash_password("AdminPass1!")

    conn.execute(
        "INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status) VALUES (?, ?, ?, ?, ?, 'active')",
        (user_id, "admin", "admin@test.com", "Admin", pw_hash),
    )
    conn.execute(
        "INSERT INTO webclaw_role (id, name, description, is_system) VALUES (?, 'System Manager', 'Full access', 1)",
        (role_id,),
    )
    conn.execute(
        "INSERT INTO webclaw_user_role (id, user_id, role_id) VALUES (?, ?, ?)",
        (str(uuid.uuid4()), user_id, role_id),
    )
    conn.commit()
    conn.close()
    return {"user_id": user_id, "email": "admin@test.com", "password": "AdminPass1!", "role_id": role_id}


def _seed_non_admin(db_path: str) -> dict:
    """Create a regular user (no System Manager role)."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    user_id = str(uuid.uuid4())
    role_id = str(uuid.uuid4())
    pw_hash = hash_password("UserPass1!")

    conn.execute(
        "INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status) VALUES (?, ?, ?, ?, ?, 'active')",
        (user_id, "regular", "regular@test.com", "Regular User", pw_hash),
    )
    conn.execute(
        "INSERT INTO webclaw_role (id, name, description, is_system) VALUES (?, 'Viewer', 'Read only', 0)",
        (role_id,),
    )
    conn.execute(
        "INSERT INTO webclaw_user_role (id, user_id, role_id) VALUES (?, ?, ?)",
        (str(uuid.uuid4()), user_id, role_id),
    )
    conn.commit()
    conn.close()
    return {"user_id": user_id, "email": "regular@test.com", "password": "UserPass1!"}


def _login(client, email, password) -> str:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# System Manager guard (2)
# ---------------------------------------------------------------------------

def test_non_admin_gets_403(client, setup_test_db):
    """Non-admin users get 403 on admin endpoints."""
    _seed_admin(setup_test_db)
    user = _seed_non_admin(setup_test_db)
    token = _login(client, user["email"], user["password"])
    r = client.get("/api/v1/admin/roles", headers=_headers(token))
    assert r.status_code == 403


def test_no_auth_gets_401(client, setup_test_db):
    """No auth header returns 401."""
    r = client.get("/api/v1/admin/roles")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Role CRUD (4)
# ---------------------------------------------------------------------------

def test_list_roles(client, setup_test_db):
    """Admin can list all roles."""
    admin = _seed_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])
    r = client.get("/api/v1/admin/roles", headers=_headers(token))
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert len(data["roles"]) >= 1
    assert data["roles"][0]["name"] == "System Manager"


def test_create_role(client, setup_test_db):
    """Admin can create a new role."""
    admin = _seed_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])
    r = client.post("/api/v1/admin/roles", headers=_headers(token),
                    json={"name": "Accountant", "description": "Finance access"})
    assert r.status_code == 200
    assert r.json()["role"]["name"] == "Accountant"


def test_update_role(client, setup_test_db):
    """Admin can update a role."""
    admin = _seed_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])
    # Create a role first
    r = client.post("/api/v1/admin/roles", headers=_headers(token),
                    json={"name": "Editor", "description": "Can edit"})
    role_id = r.json()["role"]["id"]
    # Update it
    r = client.put(f"/api/v1/admin/roles/{role_id}", headers=_headers(token),
                   json={"name": "Senior Editor", "description": "Can edit everything"})
    assert r.status_code == 200


def test_delete_system_role_blocked(client, setup_test_db):
    """Cannot delete system roles."""
    admin = _seed_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])
    r = client.delete(f"/api/v1/admin/roles/{admin['role_id']}", headers=_headers(token))
    assert r.status_code == 403
    assert "Cannot delete system role" in r.json()["message"]


# ---------------------------------------------------------------------------
# Permission CRUD (3)
# ---------------------------------------------------------------------------

def test_add_and_list_permissions(client, setup_test_db):
    """Admin can add and list permissions for a role."""
    admin = _seed_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])

    # Create a role
    r = client.post("/api/v1/admin/roles", headers=_headers(token),
                    json={"name": "Sales Rep", "description": "Sales access"})
    role_id = r.json()["role"]["id"]

    # Add permission
    r = client.post(f"/api/v1/admin/roles/{role_id}/permissions", headers=_headers(token),
                    json={"skill": "erpclaw", "action_pattern": "*", "allowed": True})
    assert r.status_code == 200
    perm_id = r.json()["permission"]["id"]

    # List permissions
    r = client.get(f"/api/v1/admin/roles/{role_id}/permissions", headers=_headers(token))
    assert r.status_code == 200
    perms = r.json()["permissions"]
    assert len(perms) == 1
    assert perms[0]["skill"] == "erpclaw"


def test_remove_permission(client, setup_test_db):
    """Admin can remove a permission from a role."""
    admin = _seed_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])

    r = client.post("/api/v1/admin/roles", headers=_headers(token),
                    json={"name": "Temp", "description": ""})
    role_id = r.json()["role"]["id"]

    r = client.post(f"/api/v1/admin/roles/{role_id}/permissions", headers=_headers(token),
                    json={"skill": "*", "action_pattern": "list-*"})
    perm_id = r.json()["permission"]["id"]

    r = client.delete(f"/api/v1/admin/roles/{role_id}/permissions/{perm_id}", headers=_headers(token))
    assert r.status_code == 200

    # Verify empty
    r = client.get(f"/api/v1/admin/roles/{role_id}/permissions", headers=_headers(token))
    assert len(r.json()["permissions"]) == 0


def test_duplicate_permission_rejected(client, setup_test_db):
    """Adding a duplicate permission returns 409."""
    admin = _seed_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])

    r = client.post("/api/v1/admin/roles", headers=_headers(token),
                    json={"name": "Dup Test", "description": ""})
    role_id = r.json()["role"]["id"]

    body = {"skill": "erpclaw", "action_pattern": "*"}
    client.post(f"/api/v1/admin/roles/{role_id}/permissions", headers=_headers(token), json=body)
    r = client.post(f"/api/v1/admin/roles/{role_id}/permissions", headers=_headers(token), json=body)
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# User CRUD (3)
# ---------------------------------------------------------------------------

def test_list_users(client, setup_test_db):
    """Admin can list all users with roles."""
    admin = _seed_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])
    r = client.get("/api/v1/admin/users", headers=_headers(token))
    assert r.status_code == 200
    users = r.json()["users"]
    assert len(users) >= 1
    assert users[0]["roles"][0]["name"] == "System Manager"


def test_create_user_with_role(client, setup_test_db):
    """Admin can create a user and assign roles."""
    admin = _seed_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])

    # Create a role first
    r = client.post("/api/v1/admin/roles", headers=_headers(token),
                    json={"name": "Cashier", "description": ""})
    role_id = r.json()["role"]["id"]

    r = client.post("/api/v1/admin/users", headers=_headers(token),
                    json={"email": "cashier@test.com", "password": "CashPass1!", "full_name": "Cash Person", "role_ids": [role_id]})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "cashier@test.com"


def test_update_user_status(client, setup_test_db):
    """Admin can disable a user."""
    admin = _seed_admin(setup_test_db)
    _seed_non_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])

    # Get user list to find the non-admin
    r = client.get("/api/v1/admin/users", headers=_headers(token))
    users = r.json()["users"]
    non_admin = [u for u in users if u["email"] == "regular@test.com"][0]

    r = client.put(f"/api/v1/admin/users/{non_admin['id']}", headers=_headers(token),
                   json={"status": "disabled"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Role Assignment (2)
# ---------------------------------------------------------------------------

def test_assign_and_remove_role(client, setup_test_db):
    """Admin can assign and remove roles from users."""
    admin = _seed_admin(setup_test_db)
    _seed_non_admin(setup_test_db)
    token = _login(client, admin["email"], admin["password"])

    # Create a new role
    r = client.post("/api/v1/admin/roles", headers=_headers(token),
                    json={"name": "Auditor", "description": ""})
    new_role_id = r.json()["role"]["id"]

    # Get non-admin user
    r = client.get("/api/v1/admin/users", headers=_headers(token))
    non_admin = [u for u in r.json()["users"] if u["email"] == "regular@test.com"][0]

    # Assign role
    r = client.post(f"/api/v1/admin/users/{non_admin['id']}/roles", headers=_headers(token),
                    json={"role_id": new_role_id})
    assert r.status_code == 200

    # Verify user now has 2 roles
    r = client.get("/api/v1/admin/users", headers=_headers(token))
    user = [u for u in r.json()["users"] if u["email"] == "regular@test.com"][0]
    assert len(user["roles"]) == 2

    # Remove the new role
    r = client.delete(f"/api/v1/admin/users/{non_admin['id']}/roles/{new_role_id}", headers=_headers(token))
    assert r.status_code == 200

    # Verify back to 1 role
    r = client.get("/api/v1/admin/users", headers=_headers(token))
    user = [u for u in r.json()["users"] if u["email"] == "regular@test.com"][0]
    assert len(user["roles"]) == 1
