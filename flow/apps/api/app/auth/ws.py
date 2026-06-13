"""WebSocket authentication via Supabase access tokens.

Browsers can't set Authorization headers on WebSocket connections, so the
Supabase access token is passed as a `?token=` query parameter. We verify it the
same way the REST dependencies do and mirror the user into the local DB.
"""
from fastapi import WebSocket

from app.database import AsyncSessionLocal
from app.auth.supabase import verify_token
from app.auth.dependencies import _mirror_user
from app.models.user import User

# Custom close codes (4000-4999 are app-defined per the WebSocket spec).
WS_UNAUTHORIZED = 4401
WS_NOT_APPROVED = 4403


async def authenticate_ws(websocket: WebSocket) -> User | None:
    """Return the User for this socket, or None if it should be rejected.

    On None, the caller should `await websocket.close(code=WS_UNAUTHORIZED)`.
    """
    token = websocket.query_params.get("token")
    payload = verify_token(token) if token else None
    if not payload:
        return None
    async with AsyncSessionLocal() as db:
        return await _mirror_user(db, payload)
