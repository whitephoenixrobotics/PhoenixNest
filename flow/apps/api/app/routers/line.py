"""LINE Messaging extension — REST endpoints (no WS, since LINE Push is fire-and-forget)."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.dependencies import get_approved_user as get_current_user
from app.extensions.line import get_manager
from app.models.user import User

router = APIRouter(prefix="/line", tags=["line"])


class ConfigureBody(BaseModel):
    token: str = Field(..., min_length=10)
    default_to: str = Field("", max_length=64)


class TestBody(BaseModel):
    to: str = Field("", max_length=64)
    text: str = Field("ทดสอบจาก Phoenix Flow ✅", max_length=500)


@router.get("/status")
async def get_status(_user: User = Depends(get_current_user)):
    s = get_manager().status()
    return {
        "configured": s.configured,
        "has_token": s.has_token,
        "default_to": s.default_to,
        "bot_name": s.bot_name,
        "bot_user_id": s.bot_user_id,
    }


@router.post("/configure")
async def configure(body: ConfigureBody, _user: User = Depends(get_current_user)):
    mgr = get_manager()
    try:
        info = await asyncio.to_thread(mgr.configure, body.token, body.default_to)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "bot": info}


@router.post("/disconnect")
async def disconnect(_user: User = Depends(get_current_user)):
    await asyncio.to_thread(get_manager().disconnect)
    return {"ok": True}


@router.post("/test")
async def test_push(body: TestBody, _user: User = Depends(get_current_user)):
    mgr = get_manager()
    try:
        await asyncio.to_thread(mgr.push_text, body.text, body.to)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}
