"""Pydantic request models for input validation."""
import re

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class SetupRequest(BaseModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=8)
    full_name: str = ""

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


# Shell metacharacter pattern — reject keys containing these
_SHELL_META_RE = re.compile(r"[;|&`$(){}\\]")
MAX_PARAM_VALUE_LENGTH = 10 * 1024  # 10 KB


def sanitize_skill_params(params: dict) -> dict:
    """Sanitize skill action parameters: strip whitespace, reject dangerous keys, limit value length."""
    clean = {}
    for key, value in params.items():
        # Strip whitespace from keys
        key = str(key).strip()
        if not key:
            continue
        # Reject keys with shell metacharacters
        if _SHELL_META_RE.search(key):
            continue
        # Limit value length for strings
        if isinstance(value, str):
            value = value.strip()
            if len(value) > MAX_PARAM_VALUE_LENGTH:
                value = value[:MAX_PARAM_VALUE_LENGTH]
        clean[key] = value
    return clean
