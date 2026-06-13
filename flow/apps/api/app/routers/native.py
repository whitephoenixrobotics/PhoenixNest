"""Upload a source video for backend-native processing.

The file is stored under VIDEO_DIR and referenced by a random id; the native
WebSocket loop (/ws/native) decodes it server-side, frame by frame.
"""
import os
import uuid
import shutil
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from app.models.user import User
from app.auth.dependencies import get_approved_user as get_current_user
from app.paths import VIDEO_DIR

router = APIRouter(prefix="/native", tags=["native"])

_ALLOWED = (".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v")


@router.post("/video")
async def upload_video(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED:
        raise HTTPException(status_code=400, detail=f"ชนิดไฟล์ไม่รองรับ ({ext or 'ไม่มีนามสกุล'})")
    os.makedirs(VIDEO_DIR, exist_ok=True)
    file_id = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(VIDEO_DIR, file_id)
    with open(path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    return {"file_id": file_id, "filename": file.filename}


@router.delete("/video/{file_id}")
async def delete_video(file_id: str, user: User = Depends(get_current_user)):
    path = os.path.join(VIDEO_DIR, os.path.basename(file_id or ""))
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}
