"""Fetch a public Google Sheets sheet as CSV through the backend.

The frontend can't fetch docs.google.com directly (CORS). This endpoint
accepts any Sheets share/view URL or a raw CSV URL, normalizes it to the
sheet's export?format=csv endpoint, fetches it, and returns the CSV text.

Public sheets only ("Anyone with the link can view"). No auth, no service
account.
"""
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.models.user import User
from app.auth.dependencies import get_approved_user as get_current_user

router = APIRouter(prefix="/sheets", tags=["sheets"])


class CsvRequest(BaseModel):
    url: str


_ID = re.compile(r"/spreadsheets/d/([a-zA-Z0-9-_]+)")
_GID = re.compile(r"[?#&]gid=(\d+)")


def _to_csv_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="ยังไม่ใส่ลิงก์")
    if "docs.google.com/spreadsheets" not in url:
        # Already a direct CSV link (e.g. published-to-web)
        return url
    m = _ID.search(url)
    if not m:
        raise HTTPException(status_code=400, detail="ลิงก์ Google Sheets ไม่ถูกต้อง")
    sheet_id = m.group(1)
    g = _GID.search(url)
    if g:
        return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={g.group(1)}"
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"


@router.post("/csv")
async def fetch_csv(body: CsvRequest, user: User = Depends(get_current_user)) -> dict:
    target = _to_csv_url(body.url)
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(target)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"เชื่อมต่อ Google Sheets ไม่ได้: {str(e)[:120]}")
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=(
            "ดึงไม่สำเร็จ — ตรวจว่าตั้งสิทธิ์ 'ทุกคนที่มีลิงก์ดูได้' แล้ว"
            if resp.status_code in (401, 403, 404) else f"HTTP {resp.status_code}"
        ))
    return {"text": resp.text, "url": target}
