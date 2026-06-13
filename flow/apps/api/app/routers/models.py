import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from app.models.user import User
from app.auth.dependencies import get_approved_user as get_current_user
from app.engine.nodes.dl._models import MODELS_DIR

router = APIRouter(prefix="/models", tags=["models"])

_ALLOWED = {".pt", ".onnx"}
_MAX_BYTES = 300 * 1024 * 1024  # 300 MB


@router.post("/upload")
async def upload_model(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Save an externally-trained model file to disk; return its model_id."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED:
        raise HTTPException(status_code=400, detail="รองรับเฉพาะไฟล์ .pt และ .onnx")

    os.makedirs(MODELS_DIR, exist_ok=True)
    model_id = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(MODELS_DIR, model_id)

    size = 0
    try:
        with open(path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_BYTES:
                    raise HTTPException(status_code=413, detail="ไฟล์ใหญ่เกิน 300MB")
                out.write(chunk)
    except HTTPException:
        if os.path.exists(path):
            os.remove(path)
        raise

    return {
        "model_id": model_id,
        "filename": file.filename,
        "size_mb": round(size / 1e6, 1),
    }
