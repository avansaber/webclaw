"""JWT token creation and verification (PyJWT, HS256)."""
import hashlib
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

import jwt

ACCESS_TOKEN_EXPIRY = timedelta(minutes=15)
REFRESH_TOKEN_EXPIRY = timedelta(days=7)
ALGORITHM = "HS256"


def get_signing_secret(conn: sqlite3.Connection) -> str:
    """Get or auto-generate the JWT signing secret from the config table."""
    row = conn.execute("SELECT value FROM webclaw_config WHERE key = 'jwt_secret'").fetchone()
    if row:
        return row[0] if isinstance(row, tuple) else row["value"]
    # First time: generate and store
    secret = secrets.token_hex(32)  # 256-bit
    conn.execute(
        "INSERT INTO webclaw_config (key, value) VALUES ('jwt_secret', ?)", (secret,)
    )
    conn.commit()
    return secret


def create_access_token(user_id: str, email: str, secret: str) -> str:
    """Create a short-lived access token (15 min)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "iat": now,
        "exp": now + ACCESS_TOKEN_EXPIRY,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def create_refresh_token(user_id: str, secret: str) -> tuple[str, str]:
    """Create a refresh token (7 day). Returns (raw_token, token_hash)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": now,
        "exp": now + REFRESH_TOKEN_EXPIRY,
        "jti": str(uuid.uuid4()),
    }
    raw_token = jwt.encode(payload, secret, algorithm=ALGORITHM)
    token_hash = hash_token(raw_token)
    return raw_token, token_hash


def verify_token(token: str, secret: str, expected_type: str = "access") -> dict | None:
    """Verify and decode a JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
        if payload.get("type") != expected_type:
            return None
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def hash_token(token: str) -> str:
    """SHA-256 hash of a token for DB storage."""
    return hashlib.sha256(token.encode()).hexdigest()
