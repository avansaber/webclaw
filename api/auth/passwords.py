"""Password hashing with PBKDF2-HMAC-SHA256 (600K iterations, stdlib only).

Format: pbkdf2:600000$<hex-salt>$<hex-hash>

Compatible with erpclaw_lib.passwords — same algorithm and format, so hashes
created by either module are interchangeable.
"""
import hashlib
import secrets

ITERATIONS = 600_000
HASH_ALGO = "sha256"
KEY_LENGTH = 32  # bytes


def hash_password(plain: str) -> str:
    """Hash a password. Returns 'pbkdf2:600000$salt$hash'."""
    salt = secrets.token_hex(16)  # 16 bytes = 32 hex chars
    dk = hashlib.pbkdf2_hmac(
        HASH_ALGO, plain.encode("utf-8"), salt.encode("utf-8"), ITERATIONS, dklen=KEY_LENGTH
    )
    return f"pbkdf2:{ITERATIONS}${salt}${dk.hex()}"


def validate_password_strength(password: str) -> str | None:
    """Return an error message if password is too weak, else None."""
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return "Password must contain at least one uppercase letter"
    if not any(c.islower() for c in password):
        return "Password must contain at least one lowercase letter"
    if not any(c.isdigit() for c in password):
        return "Password must contain at least one digit"
    return None


def verify_password(plain: str, stored: str) -> bool:
    """Verify a plaintext password against a stored PBKDF2 hash."""
    try:
        prefix, salt, expected_hash = stored.split("$")
        iterations = int(prefix.split(":")[1])
        dk = hashlib.pbkdf2_hmac(
            HASH_ALGO, plain.encode("utf-8"), salt.encode("utf-8"), iterations, dklen=KEY_LENGTH
        )
        return secrets.compare_digest(dk.hex(), expected_hash)
    except (ValueError, IndexError):
        return False
