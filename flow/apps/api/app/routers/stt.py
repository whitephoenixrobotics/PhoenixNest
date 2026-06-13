"""Speech-to-text via faster-whisper (offline, local CPU/GPU).

Single endpoint used by both UI modes:
  - Batch    : record fully → POST once → text
  - Near-live: POST the accumulated audio every few seconds → growing text
"""
import os
import asyncio
import tempfile
import threading

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends

from app.config import settings
from app.models.user import User
from app.auth.dependencies import get_approved_user

router = APIRouter(prefix="/stt", tags=["stt"])

# accuracy ↔ speed presets the UI can request
ALLOWED_MODELS = {"tiny", "base", "small", "medium", "large-v3"}

# One model is kept loaded at a time; switching size evicts the previous one so
# GPU memory stays bounded (reloading on change costs a few seconds).
_model = None
_model_name: str | None = None
_lock = threading.Lock()


def _resolve_device() -> str:
    dev = settings.WHISPER_DEVICE
    if dev != "auto":
        return dev
    try:
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _get_model(name: str):
    global _model, _model_name
    if _model is not None and _model_name == name:
        return _model
    with _lock:
        if _model is None or _model_name != name:
            from faster_whisper import WhisperModel
            if _model is not None:  # free the previous model first
                _model = None
                try:
                    import gc
                    import torch
                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass
            device = _resolve_device()
            compute_type = "float16" if device == "cuda" else "int8"
            _model = WhisperModel(name, device=device, compute_type=compute_type)
            _model_name = name
    return _model


def _transcribe_file(path: str, lang: str | None, model_name: str) -> str:
    model = _get_model(model_name)
    for vad in (True, False):  # VAD trims silence; fall back if it errors
        try:
            segments, _info = model.transcribe(path, language=lang or None, vad_filter=vad)
            return "".join(seg.text for seg in segments).strip()
        except Exception:
            if not vad:
                raise
    return ""


@router.post("")
async def transcribe(
    file: UploadFile = File(...),
    lang: str = Form("th"),
    model: str = Form(""),
    user: User = Depends(get_approved_user),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio")

    code = (lang or "th").split("-")[0].lower()  # 'th-TH' -> 'th'
    name = model if model in ALLOWED_MODELS else settings.WHISPER_MODEL
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(data)
        tmp.close()
        text = await asyncio.to_thread(_transcribe_file, tmp.name, code, name)
        return {"text": text, "model": name}
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
