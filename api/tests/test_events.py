"""Tests for SSE event bus and /events endpoint — Sprint B3."""
import asyncio
import json
import os
import sys
import sqlite3
import uuid
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from events import publish, subscribe, unsubscribe
import events


# ---------------------------------------------------------------------------
# Unit tests for pub/sub
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_subscribe_receives_event():
    """Subscriber receives published events."""
    q = await subscribe()
    await publish({"type": "test", "data": "hello"})
    event = q.get_nowait()
    assert event["type"] == "test"
    assert event["data"] == "hello"
    assert "timestamp" in event
    await unsubscribe(q)


@pytest.mark.asyncio
async def test_multiple_subscribers():
    """All subscribers receive the same event."""
    q1 = await subscribe()
    q2 = await subscribe()
    await publish({"type": "multi-test"})
    e1 = q1.get_nowait()
    e2 = q2.get_nowait()
    assert e1["type"] == "multi-test"
    assert e2["type"] == "multi-test"
    await unsubscribe(q1)
    await unsubscribe(q2)


@pytest.mark.asyncio
async def test_unsubscribe_stops_events():
    """Unsubscribed queue no longer receives events."""
    q = await subscribe()
    await unsubscribe(q)
    await publish({"type": "after-unsub"})
    assert q.empty()


@pytest.mark.asyncio
async def test_emit_schema_update():
    """emit_schema_update sends schema-update event."""
    q = await subscribe()
    await events.emit_schema_update("erpclaw-gl")
    event = q.get_nowait()
    assert event["type"] == "schema-update"
    assert event["skill"] == "erpclaw-gl"
    await unsubscribe(q)


@pytest.mark.asyncio
async def test_emit_data_change():
    """emit_data_change sends data-change event with entity."""
    q = await subscribe()
    await events.emit_data_change("erpclaw-selling", "sales_invoice", scope="id", id="INV-001")
    event = q.get_nowait()
    assert event["type"] == "data-change"
    assert event["skill"] == "erpclaw-selling"
    assert event["entity"] == "sales_invoice"
    assert event["id"] == "INV-001"
    await unsubscribe(q)


@pytest.mark.asyncio
async def test_emit_job_status():
    """emit_job_status sends job-status event."""
    q = await subscribe()
    await events.emit_job_status("job-123", "completed", result={"count": 5})
    event = q.get_nowait()
    assert event["type"] == "job-status"
    assert event["job_id"] == "job-123"
    assert event["result"]["count"] == 5
    await unsubscribe(q)


# ---------------------------------------------------------------------------
# /api/v1/events endpoint test (basic)
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    """Fresh test DB for events endpoint tests."""
    db_path = str(tmp_path / "test.sqlite")
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS webclaw_user (
            id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE,
            full_name TEXT, password_hash TEXT, status TEXT DEFAULT 'active',
            company_ids TEXT, last_login TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS webclaw_config (
            key TEXT PRIMARY KEY, value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS webclaw_session (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES webclaw_user(id) ON DELETE CASCADE,
            refresh_token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            last_active_at TEXT DEFAULT (datetime('now')),
            ip_address TEXT, user_agent TEXT
        );
        CREATE TABLE IF NOT EXISTS webclaw_role (
            id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL,
            description TEXT, is_system INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS webclaw_user_role (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES webclaw_user(id),
            role_id TEXT NOT NULL REFERENCES webclaw_role(id), company_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, role_id, company_id)
        );
        CREATE TABLE IF NOT EXISTS webclaw_role_permission (
            id TEXT PRIMARY KEY, role_id TEXT NOT NULL REFERENCES webclaw_role(id),
            skill TEXT NOT NULL, action_pattern TEXT NOT NULL, allowed INTEGER DEFAULT 1,
            UNIQUE(role_id, skill, action_pattern)
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY, user_id TEXT, skill TEXT, action TEXT,
            entity_type TEXT, entity_id TEXT, old_values TEXT, new_values TEXT,
            description TEXT, created_at TEXT DEFAULT (datetime('now'))
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

    monkeypatch.setattr("db.get_connection", mock_get_connection)
    monkeypatch.setenv("WEBCLAW_ENV", "development")
    return db_path


def test_events_endpoint_requires_auth():
    """GET /events without token returns error."""
    from fastapi.testclient import TestClient
    from main import app
    client = TestClient(app)

    # Without token — the SSE endpoint should return 401
    r = client.get("/api/v1/events")
    assert r.status_code == 401
