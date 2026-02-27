"""Tests for context resolution engine — Sprint C1."""
import json
import os
import sys
import sqlite3
import uuid
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chat.entity_resolver import resolve_entity
from chat.ai_client import build_system_prompt


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    """Create a test DB with sample data for entity resolution."""
    db_path = str(tmp_path / "test.sqlite")
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")

    conn.executescript("""
        CREATE TABLE customer (
            id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            email TEXT,
            customer_group TEXT
        );
        CREATE TABLE item (
            id TEXT PRIMARY KEY,
            item_name TEXT NOT NULL,
            item_code TEXT,
            item_group TEXT
        );
        CREATE TABLE account (
            id TEXT PRIMARY KEY,
            account_name TEXT NOT NULL,
            account_number TEXT,
            account_type TEXT
        );
        CREATE TABLE company (
            id TEXT PRIMARY KEY,
            company_name TEXT NOT NULL
        );
        CREATE TABLE webclaw_user (
            id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE,
            full_name TEXT, password_hash TEXT, status TEXT DEFAULT 'active',
            company_ids TEXT, last_login TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE webclaw_config (
            key TEXT PRIMARY KEY, value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE webclaw_session (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            refresh_token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            last_active_at TEXT DEFAULT (datetime('now')),
            ip_address TEXT, user_agent TEXT
        );
        CREATE TABLE webclaw_role (
            id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL,
            description TEXT, is_system INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE webclaw_user_role (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            role_id TEXT NOT NULL, company_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, role_id, company_id)
        );
        CREATE TABLE webclaw_role_permission (
            id TEXT PRIMARY KEY, role_id TEXT NOT NULL,
            skill TEXT NOT NULL, action_pattern TEXT NOT NULL,
            allowed INTEGER DEFAULT 1,
            UNIQUE(role_id, skill, action_pattern)
        );
        CREATE TABLE audit_log (
            id TEXT PRIMARY KEY, user_id TEXT, skill TEXT, action TEXT,
            entity_type TEXT, entity_id TEXT, old_values TEXT, new_values TEXT,
            description TEXT, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE chat_session (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            title TEXT, context TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE chat_message (
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
            role TEXT NOT NULL, content TEXT NOT NULL, context TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)

    # Insert sample data
    conn.executemany(
        "INSERT INTO customer (id, customer_name, email, customer_group) VALUES (?, ?, ?, ?)",
        [
            ("c1", "Wayne Enterprises", "bruce@wayne.com", "Corporate"),
            ("c2", "Stark Industries", "tony@stark.com", "Corporate"),
            ("c3", "Wayne Tech Labs", "labs@wayne.com", "Research"),
        ],
    )
    conn.executemany(
        "INSERT INTO item (id, item_name, item_code, item_group) VALUES (?, ?, ?, ?)",
        [
            ("i1", "Arc Reactor", "ARC-001", "Energy"),
            ("i2", "Vibranium Shield", "VIB-001", "Defense"),
            ("i3", "Arc Welding Kit", "ARC-002", "Tools"),
        ],
    )
    conn.executemany(
        "INSERT INTO account (id, account_name, account_number, account_type) VALUES (?, ?, ?, ?)",
        [
            ("a1", "Cash", "1100", "Asset"),
            ("a2", "Revenue", "4000", "Income"),
        ],
    )
    conn.commit()
    conn.close()

    def mock_get_connection(path=None):
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode = WAL")
        c.execute("PRAGMA foreign_keys = ON")
        return c

    monkeypatch.setattr("db.get_connection", mock_get_connection)
    monkeypatch.setattr("db.get_skill_db", lambda skill_name: mock_get_connection())
    monkeypatch.setenv("WEBCLAW_ENV", "development")
    return db_path


# ---------------------------------------------------------------------------
# Entity resolver unit tests
# ---------------------------------------------------------------------------

def test_resolve_exact_match():
    """Exact name match returns confidence 1.0."""
    results = resolve_entity("customer", "Wayne Enterprises")
    assert len(results) >= 1
    assert results[0]["name"] == "Wayne Enterprises"
    assert results[0]["confidence"] == 1.0


def test_resolve_starts_with():
    """Prefix match returns confidence 0.85."""
    results = resolve_entity("customer", "wayne")
    # Should match Wayne Enterprises and Wayne Tech Labs
    assert len(results) >= 2
    names = [r["name"] for r in results]
    assert "Wayne Enterprises" in names
    assert "Wayne Tech Labs" in names


def test_resolve_contains():
    """Substring match returns confidence 0.65."""
    results = resolve_entity("customer", "tech")
    assert len(results) >= 1
    assert results[0]["name"] == "Wayne Tech Labs"


def test_resolve_across_types():
    """Searching without entity_type searches all tables."""
    results = resolve_entity(None, "arc")
    # Should find items: "Arc Reactor" and "Arc Welding Kit"
    assert len(results) >= 2
    types = {r["entity_type"] for r in results}
    assert "item" in types


def test_resolve_empty_query():
    """Empty query returns empty results."""
    assert resolve_entity("customer", "") == []
    assert resolve_entity("customer", "   ") == []


def test_resolve_no_match():
    """Nonexistent entity returns empty results."""
    results = resolve_entity("customer", "zzz_nonexistent_xyz")
    assert len(results) == 0


def test_resolve_confidence_ordering():
    """Results are sorted by confidence descending."""
    results = resolve_entity(None, "arc")
    if len(results) >= 2:
        for i in range(len(results) - 1):
            assert results[i]["confidence"] >= results[i + 1]["confidence"]


def test_resolve_specific_type():
    """Specifying entity_type limits results to that table."""
    results = resolve_entity("account", "cash")
    assert all(r["entity_type"] == "account" for r in results)
    assert results[0]["name"] == "Cash"


# ---------------------------------------------------------------------------
# System prompt enrichment tests
# ---------------------------------------------------------------------------

def test_system_prompt_basic():
    """Basic system prompt includes skill and entity."""
    prompt = build_system_prompt({"skill": "erpclaw-selling", "entity": "sales_invoice"})
    assert "erpclaw-selling" in prompt
    assert "sales_invoice" in prompt


def test_system_prompt_with_resolved_entities():
    """System prompt includes resolved entities when provided."""
    context = {
        "skill": "erpclaw-selling",
        "resolved_entities": [
            {
                "name": "Wayne Enterprises",
                "entity_type": "customer",
                "id": "c1",
                "confidence": 0.95,
            }
        ],
    }
    prompt = build_system_prompt(context)
    assert "Wayne Enterprises" in prompt
    assert "customer" in prompt
    assert "95%" in prompt


# ---------------------------------------------------------------------------
# API endpoint test
# ---------------------------------------------------------------------------

def test_resolve_entity_endpoint(setup_test_db):
    """POST /chat/resolve-entity returns matches."""
    from auth.passwords import hash_password
    from fastapi.testclient import TestClient
    from main import app

    # Create user + get token
    user_id = str(uuid.uuid4())
    conn = sqlite3.connect(setup_test_db)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        "INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status) VALUES (?, ?, ?, ?, ?, 'active')",
        (user_id, "admin", "admin@test.com", "Admin", hash_password("Pass123!")),
    )
    conn.commit()
    conn.close()

    client = TestClient(app)
    r = client.post("/api/v1/auth/login", json={"email": "admin@test.com", "password": "Pass123!"})
    token = r.json()["access_token"]

    r = client.post(
        "/api/v1/chat/resolve-entity",
        json={"query": "Wayne", "entity_type": "customer"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert len(data["matches"]) >= 1
    assert data["matches"][0]["name"] == "Wayne Enterprises"


def test_resolve_entity_requires_auth():
    """POST /chat/resolve-entity without token returns 401."""
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    r = client.post("/api/v1/chat/resolve-entity", json={"query": "test"})
    assert r.status_code == 401
