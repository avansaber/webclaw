"""Chat API tests — 8 tests for Sprint A3.

Tests cover: session CRUD, auth enforcement, ownership isolation,
message persistence (with mocked AI), context storage.
"""
import json
import os
import sys
import uuid
import sqlite3
import pytest
from unittest.mock import patch, AsyncMock

# Setup paths before imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    """Create a fresh test DB with all needed tables."""
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

        CREATE TABLE IF NOT EXISTS chat_session (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL REFERENCES webclaw_user(id) ON DELETE CASCADE,
            title       TEXT,
            context     TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_chat_session_user ON chat_session(user_id);

        CREATE TABLE IF NOT EXISTS chat_message (
            id          TEXT PRIMARY KEY,
            session_id  TEXT NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
            role        TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content     TEXT NOT NULL,
            context     TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_chat_message_session ON chat_message(session_id);
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


@pytest.fixture
def client(setup_test_db):
    """Create a FastAPI test client."""
    from main import app
    return TestClient(app)


@pytest.fixture
def auth_header(setup_test_db):
    """Create a test user and return an auth header with a valid access token."""
    conn = sqlite3.connect(setup_test_db)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    user_id = str(uuid.uuid4())
    from auth.passwords import hash_password
    pw_hash = hash_password("testpassword123")

    conn.execute(
        """INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status)
           VALUES (?, ?, ?, ?, ?, 'active')""",
        (user_id, "testuser", "test@test.com", "Test User", pw_hash),
    )
    conn.commit()
    conn.close()

    # Get access token via login
    from main import app
    tc = TestClient(app)
    r = tc.post("/api/v1/auth/login", json={"email": "test@test.com", "password": "testpassword123"})
    data = r.json()
    token = data.get("access_token")
    return {"Authorization": f"Bearer {token}"}, user_id


# ---------------------------------------------------------------------------
# Test 1: Create session
# ---------------------------------------------------------------------------

def test_create_session(client, auth_header):
    """POST /chat/sessions creates a new session."""
    headers, user_id = auth_header
    r = client.post(
        "/api/v1/chat/sessions",
        json={"title": "Test Chat", "context": {"skill": "erpclaw-gl"}},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["session"]["title"] == "Test Chat"
    assert data["session"]["id"]
    assert data["session"]["context"]["skill"] == "erpclaw-gl"


# ---------------------------------------------------------------------------
# Test 2: List sessions
# ---------------------------------------------------------------------------

def test_list_sessions(client, auth_header):
    """GET /chat/sessions returns user's sessions."""
    headers, user_id = auth_header
    # Create 2 sessions
    r1 = client.post("/api/v1/chat/sessions", json={"title": "Chat 1"}, headers=headers)
    r2 = client.post("/api/v1/chat/sessions", json={"title": "Chat 2"}, headers=headers)
    assert r1.json()["status"] == "ok"
    assert r2.json()["status"] == "ok"

    r = client.get("/api/v1/chat/sessions", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert len(data["sessions"]) >= 2
    titles = [s["title"] for s in data["sessions"]]
    assert "Chat 1" in titles
    assert "Chat 2" in titles


# ---------------------------------------------------------------------------
# Test 3: Get messages (empty session)
# ---------------------------------------------------------------------------

def test_get_messages_empty(client, auth_header):
    """GET /chat/sessions/{id}/messages returns empty list for new session."""
    headers, _ = auth_header
    r = client.post("/api/v1/chat/sessions", json={"title": "Empty"}, headers=headers)
    session_id = r.json()["session"]["id"]

    r = client.get(f"/api/v1/chat/sessions/{session_id}/messages", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["messages"] == []


# ---------------------------------------------------------------------------
# Test 4: Delete session cascades to messages
# ---------------------------------------------------------------------------

def test_delete_session_cascades(client, auth_header, setup_test_db):
    """DELETE /chat/sessions/{id} removes session and its messages."""
    headers, _ = auth_header
    r = client.post("/api/v1/chat/sessions", json={"title": "ToDelete"}, headers=headers)
    session_id = r.json()["session"]["id"]

    # Insert a message via the API's DB connection (to avoid FK issues with separate connections)
    from db import get_connection
    conn = get_connection()
    conn.execute(
        "INSERT INTO chat_message (id, session_id, role, content) VALUES (?, ?, 'user', 'hello')",
        (str(uuid.uuid4()), session_id),
    )
    conn.commit()

    # Verify message exists
    count = conn.execute(
        "SELECT COUNT(*) FROM chat_message WHERE session_id = ?", (session_id,)
    ).fetchone()[0]
    assert count == 1

    # Delete session
    r = client.delete(f"/api/v1/chat/sessions/{session_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    # Verify messages are gone (use fresh connection to see committed state)
    conn2 = get_connection()
    count = conn2.execute(
        "SELECT COUNT(*) FROM chat_message WHERE session_id = ?", (session_id,)
    ).fetchone()[0]
    assert count == 0


# ---------------------------------------------------------------------------
# Test 5: Stream requires auth
# ---------------------------------------------------------------------------

def test_stream_requires_auth(client):
    """POST /chat/stream without token returns 401."""
    r = client.post("/api/v1/chat/stream", json={"message": "hello"})
    assert r.status_code == 401
    data = r.json()
    assert data["status"] == "error"
    assert "Authentication" in data["message"] or "auth" in data["message"].lower()


# ---------------------------------------------------------------------------
# Test 6: Session belongs to user (ownership)
# ---------------------------------------------------------------------------

def test_session_ownership(client, auth_header, setup_test_db):
    """Can't access another user's session."""
    headers, user_id = auth_header

    # Create a session owned by a different user
    other_user_id = str(uuid.uuid4())
    other_session_id = str(uuid.uuid4())
    conn = sqlite3.connect(setup_test_db)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        """INSERT INTO webclaw_user (id, username, email, full_name, password_hash, status)
           VALUES (?, 'other', 'other@test.com', 'Other User', 'hash', 'active')""",
        (other_user_id,),
    )
    conn.execute(
        "INSERT INTO chat_session (id, user_id, title) VALUES (?, ?, 'Other Chat')",
        (other_session_id, other_user_id),
    )
    conn.commit()
    conn.close()

    # Try to access other user's session
    r = client.get(f"/api/v1/chat/sessions/{other_session_id}/messages", headers=headers)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Test 7: Message persistence after stream (mocked AI)
# ---------------------------------------------------------------------------

def test_message_persistence(client, auth_header, setup_test_db):
    """After streaming, both user and assistant messages are saved."""
    headers, _ = auth_header

    # Mock the AI client to yield a fixed response (async generator)
    async def mock_stream_chat(messages, context):
        for chunk in ["Hello, ", "I can help!"]:
            yield chunk

    with patch("chat.routes.stream_chat", new=mock_stream_chat):
        r = client.post(
            "/api/v1/chat/stream",
            json={"message": "Hi there", "context": {"skill": "erpclaw-gl"}},
            headers=headers,
        )
        # Read the full SSE response (TestClient consumes it)
        assert r.status_code == 200
        # The response is SSE text — verify it contains expected data
        body = r.text
        assert "Hello, " in body or "I can help!" in body

    # Check messages in DB
    from db import get_connection
    conn = get_connection()
    rows = conn.execute(
        "SELECT role, content FROM chat_message ORDER BY created_at ASC"
    ).fetchall()

    assert len(rows) >= 2
    # Find user and assistant messages
    user_msgs = [r for r in rows if (r["role"] if isinstance(r, dict) else r[0]) == "user"]
    asst_msgs = [r for r in rows if (r["role"] if isinstance(r, dict) else r[0]) == "assistant"]
    assert len(user_msgs) >= 1
    assert len(asst_msgs) >= 1
    user_content = user_msgs[-1]["content"] if isinstance(user_msgs[-1], dict) else user_msgs[-1][1]
    asst_content = asst_msgs[-1]["content"] if isinstance(asst_msgs[-1], dict) else asst_msgs[-1][1]
    assert user_content == "Hi there"
    assert "Hello, I can help!" in asst_content


# ---------------------------------------------------------------------------
# Test 8: Context passed through and stored
# ---------------------------------------------------------------------------

def test_context_stored(client, auth_header, setup_test_db):
    """Context object is stored with messages."""
    headers, _ = auth_header

    async def mock_stream_chat(messages, context):
        for chunk in ["Response"]:
            yield chunk

    ctx = {"skill": "erpclaw-selling", "entity": "sales_invoice", "view": "detail"}

    with patch("chat.routes.stream_chat", new=mock_stream_chat):
        r = client.post(
            "/api/v1/chat/stream",
            json={"message": "Tell me about this invoice", "context": ctx},
            headers=headers,
        )
        assert r.status_code == 200

    # Check context is stored
    from db import get_connection
    conn = get_connection()
    rows = conn.execute(
        "SELECT context FROM chat_message WHERE role = 'user'"
    ).fetchall()

    assert len(rows) >= 1
    ctx_str = rows[-1]["context"] if isinstance(rows[-1], dict) else rows[-1][0]
    stored_ctx = json.loads(ctx_str)
    assert stored_ctx["skill"] == "erpclaw-selling"
    assert stored_ctx["entity"] == "sales_invoice"
    assert stored_ctx["view"] == "detail"
