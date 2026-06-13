"""Shared storage + loader for user-uploaded (externally trained) models.

Model files are uploaded via POST /models/upload and saved to MODELS_DIR with a
random id. Deep* blocks reference them by `model_id` and load them through
ultralytics (which supports .pt and ultralytics-exported .onnx, auto-detecting
the task: detect / classify / segment / pose).
"""
import os
import threading
from app.engine.nodes.ai.detect import _get_device
# Storage location (per-user writable dir in packaged builds). Re-exported so
# existing `from ..._models import MODELS_DIR` imports keep working.
from app.paths import MODELS_DIR

_cache: dict = {}
_lock = threading.Lock()


def resolve_path(model_id: str) -> str:
    """Map a model_id to a safe absolute path inside MODELS_DIR (no traversal)."""
    name = os.path.basename(model_id or "")     # strip any path components
    if not name:
        raise ValueError("ยังไม่ได้อัปโหลดไฟล์โมเดล")
    path = os.path.join(MODELS_DIR, name)
    if not os.path.exists(path):
        raise ValueError("ไม่พบไฟล์โมเดล — กรุณาอัปโหลดใหม่")
    return path


def load_model(model_id: str):
    """Load (and cache) an ultralytics model from an uploaded file."""
    path = resolve_path(model_id)
    if path not in _cache:
        with _lock:
            if path not in _cache:
                from ultralytics import YOLO
                model = YOLO(path)
                model.to(_get_device())
                _cache[path] = model
    return _cache[path]
