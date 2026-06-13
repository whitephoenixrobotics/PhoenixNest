"""Auth dependencies — authenticate via Supabase access tokens.

The Supabase project owns login + the approval workflow (profiles table + RLS).
Here we verify the access token, mirror the user into the local DB (so resource
ownership / FKs keep working), and return that User. Approval is enforced in the
frontend; the backend just needs a valid identity.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.auth.supabase import verify_token
from app.models.user import User

security = HTTPBearer()


async def _mirror_user(db: AsyncSession, payload: dict) -> User:
    uid = payload.get("sub")
    email = payload.get("email") or ""
    meta = payload.get("user_metadata") or {}
    name = meta.get("full_name") or meta.get("name") or (email.split("@")[0] if email else "user")
    picture = meta.get("avatar_url") or meta.get("picture")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(id=uid, email=email, name=name, picture=picture, status="approved")
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
        except IntegrityError:
            # Two first requests from a brand-new user can race here — the
            # loser of the unique-constraint race just reads the winner's row.
            await db.rollback()
            result = await db.execute(select(User).where(User.id == uid))
            user = result.scalar_one()
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )
    return await _mirror_user(db, payload)


# Approval is enforced in the frontend (Supabase) — identity-only here.
async def get_approved_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user  # admin management handled in Supabase
