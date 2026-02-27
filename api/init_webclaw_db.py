"""Webclaw database schema — creates all webclaw-owned tables.

Tables:
  webclaw_user          — Web UI user accounts (separate from skill-level users)
  webclaw_session       — JWT refresh token sessions
  webclaw_config        — Key-value config (JWT secret, etc.)
  webclaw_role          — RBAC roles
  webclaw_user_role     — User ↔ role assignments
  webclaw_role_permission — Role ↔ skill/action permissions
  chat_session          — AI chat sessions
  chat_message          — AI chat messages
  audit_log             — POST action audit trail

Idempotent: uses CREATE TABLE IF NOT EXISTS throughout.
"""
import sqlite3

SCHEMA_DDL = """
-- ── Auth ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webclaw_user (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    email           TEXT UNIQUE,
    full_name       TEXT,
    password_hash   TEXT,
    status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','locked')),
    last_login      TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
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
CREATE INDEX IF NOT EXISTS idx_webclaw_session_expires ON webclaw_session(expires_at);

CREATE TABLE IF NOT EXISTS webclaw_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- ── RBAC ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webclaw_role (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    is_system       INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0,1)),
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webclaw_user_role (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES webclaw_user(id) ON DELETE CASCADE,
    role_id         TEXT NOT NULL REFERENCES webclaw_role(id) ON DELETE CASCADE,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_webclaw_user_role_user ON webclaw_user_role(user_id);
CREATE INDEX IF NOT EXISTS idx_webclaw_user_role_role ON webclaw_user_role(role_id);

CREATE TABLE IF NOT EXISTS webclaw_role_permission (
    id              TEXT PRIMARY KEY,
    role_id         TEXT NOT NULL REFERENCES webclaw_role(id) ON DELETE CASCADE,
    skill           TEXT NOT NULL,
    action_pattern  TEXT NOT NULL,
    allowed         INTEGER NOT NULL DEFAULT 1 CHECK(allowed IN (0,1)),
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(role_id, skill, action_pattern)
);

CREATE INDEX IF NOT EXISTS idx_webclaw_role_perm_role ON webclaw_role_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_webclaw_role_perm_skill ON webclaw_role_permission(skill);

-- ── Chat ────────────────────────────────────────────────────────────────────

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

-- ── Audit ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
    id              TEXT PRIMARY KEY,
    timestamp       TEXT DEFAULT (datetime('now')),
    user_id         TEXT,
    skill           TEXT NOT NULL,
    action          TEXT NOT NULL,
    entity_type     TEXT,
    entity_id       TEXT,
    description     TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_skill ON audit_log(skill);
"""


def init_tables(conn: sqlite3.Connection) -> None:
    """Create all webclaw tables if they don't exist. Idempotent."""
    conn.executescript(SCHEMA_DDL)
