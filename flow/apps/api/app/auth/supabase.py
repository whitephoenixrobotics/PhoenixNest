"""Verify Supabase access tokens (ES256, asymmetric) via the project's JWKS.

The backend runs on each user's machine, so we only ever hold Supabase's PUBLIC
keys (fetched from JWKS) — tokens cannot be forged with them. Approval gating
lives in the frontend / Supabase RLS; here we just authenticate identity.
"""
import time
import threading

import httpx
from jose import jwt
from jose.exceptions import JWTError

from app.config import settings

_JWKS_TTL = 3600.0
_cache: dict = {"keys": None, "ts": 0.0}
_lock = threading.Lock()


def _jwks_url() -> str:
    return f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"


def _get_jwks(force: bool = False) -> list:
    now = time.time()
    if not force and _cache["keys"] and now - _cache["ts"] < _JWKS_TTL:
        return _cache["keys"]
    with _lock:
        if not force and _cache["keys"] and now - _cache["ts"] < _JWKS_TTL:
            return _cache["keys"]
        with httpx.Client(timeout=10) as client:
            resp = client.get(_jwks_url())
            resp.raise_for_status()
            keys = resp.json().get("keys", [])
        _cache["keys"] = keys
        _cache["ts"] = now
        return keys


def verify_token(token: str) -> dict | None:
    """Return the validated JWT claims, or None if the token is invalid."""
    if not token or not settings.SUPABASE_URL:
        return None
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except JWTError:
        return None

    key = next((k for k in _get_jwks() if k.get("kid") == kid), None)
    if key is None:  # key may have rotated — refresh once
        key = next((k for k in _get_jwks(force=True) if k.get("kid") == kid), None)
    if key is None:
        return None

    try:
        return jwt.decode(
            token,
            key,
            algorithms=["ES256"],
            audience="authenticated",
        )
    except JWTError:
        return None
