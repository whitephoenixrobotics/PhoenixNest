import os
import io
import json
import uuid
import base64
import shutil
import asyncio
import zipfile
import tempfile
import threading
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import Optional
from PIL import Image
from app.models.user import User
from app.auth.dependencies import get_approved_user as get_current_user
from app.engine.nodes.dl._models import MODELS_DIR
from app.engine.nodes.ai.detect import _get_device, _use_half
from app.paths import TRAIN_ROOT as _TRAIN_ROOT

router = APIRouter(prefix="/train", tags=["train"])

_meta_lock = threading.Lock()
_IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
_STOP: set[str] = set()          # project dirs with a pending early-stop request
_RUNNING: set[str] = set()       # project dirs with a live in-process training task
# meta.json's status="training" alone can't be trusted: if the app is closed or
# crashes mid-train it stays "training" forever and every retry would 409.


# ───────────────────────── helpers ──────────────────────────
def _safe(name: str) -> str:
    s = (name or "").strip().replace("/", "_").replace("\\", "_").replace("..", "_")
    return s[:40] or "untitled"


def _user_dir(user: User) -> str:
    return os.path.join(_TRAIN_ROOT, str(user.id))


def _proj_dir(user: User, pid: str) -> str:
    # pid is a uuid we generated, but guard anyway
    d = os.path.join(_user_dir(user), os.path.basename(pid))
    if not os.path.isdir(d):
        raise HTTPException(status_code=404, detail="ไม่พบโปรเจกต์เทรน")
    return d


def _read_meta(proj: str) -> dict:
    with _meta_lock:
        with open(os.path.join(proj, "meta.json"), encoding="utf-8") as f:
            return json.load(f)


def _write_meta(proj: str, meta: dict) -> None:
    with _meta_lock:
        with open(os.path.join(proj, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)


def _class_counts(proj: str) -> dict[str, int]:
    data = os.path.join(proj, "data")
    counts: dict[str, int] = {}
    if os.path.isdir(data):
        for c in sorted(os.listdir(data)):
            cd = os.path.join(data, c)
            if os.path.isdir(cd):
                counts[c] = len([f for f in os.listdir(cd) if f.lower().endswith(_IMG_EXT)])
    return counts


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def reset_interrupted_trainings() -> int:
    """Recover projects stuck in status='training' from a previous process.

    Called once at startup. Without this, a crash/quit mid-train leaves the
    project un-trainable (every start gets 409 "กำลังเทรนอยู่แล้ว").
    """
    n = 0
    if not os.path.isdir(_TRAIN_ROOT):
        return 0
    for uid in os.listdir(_TRAIN_ROOT):
        udir = os.path.join(_TRAIN_ROOT, uid)
        if not os.path.isdir(udir):
            continue
        for pid in os.listdir(udir):
            proj = os.path.join(udir, pid)
            if not os.path.isfile(os.path.join(proj, "meta.json")):
                continue
            try:
                meta = _read_meta(proj)
            except Exception:
                continue
            if meta.get("status") == "training":
                meta.update(status="failed", stage=None,
                            error="การเทรนถูกขัดจังหวะ (โปรแกรมปิดระหว่างเทรน) — กดเทรนใหม่ได้เลย")
                _write_meta(proj, meta)
                n += 1
    if n:
        print(f"[train] reset {n} interrupted training project(s)", flush=True)
    return n


# ───────────────────────── schemas ──────────────────────────
class CreateProject(BaseModel):
    name: str
    task: str = "classify"           # 'classify' | 'detect'


class ClassBody(BaseModel):
    name: str


class ImagesBody(BaseModel):
    class_name: str
    images: list[str]                # base64 data URLs


class TrainBody(BaseModel):
    epochs: Optional[int] = 30
    target_acc: Optional[float] = None     # 0-1; stop early when val acc reaches it
    augment: Optional[dict] = None         # {flip,rotate,color,erase} or None = off
    model_size: Optional[str] = None       # n | s | m → YOLO26-cls base size


# Pretrained base per size — YOLO26 (2025): NMS-free end-to-end, faster on CPU
# and slightly more accurate than v8/11 at the same size.
_CLS_SIZES = {"n": "yolo26n-cls.pt", "s": "yolo26s-cls.pt", "m": "yolo26m-cls.pt"}


class BaseModelBody(BaseModel):
    model_id: Optional[str] = None      # None → reset to default yolov8n-cls.pt
    model_name: Optional[str] = None


class AugDatasetBody(BaseModel):
    augment: Optional[dict] = None      # {flip,rotate,color,erase,factor}


class PredictBody(BaseModel):
    image: str                          # base64 data URL


# ───────────────────────── endpoints ─────────────────────────
@router.post("/projects")
async def create_project(body: CreateProject, user: User = Depends(get_current_user)):
    pid = uuid.uuid4().hex
    proj = os.path.join(_user_dir(user), pid)
    os.makedirs(os.path.join(proj, "data"), exist_ok=True)
    meta = {
        "id": pid,
        "name": body.name.strip() or "Untitled",
        "task": body.task,
        "created_at": _now(),
        "status": "draft",
        "progress": {"epoch": 0, "total": 0},
        "stage": None,                # human-readable "what's happening now"
        "det_classes": [],            # ordered class list (detection only)
        "base_model_id": None,        # None → default yolov8n-cls.pt
        "base_model_name": None,
        "model_id": None,
        "model_name": None,
        "accuracy": None,
        "error": None,
    }
    _write_meta(proj, meta)
    return meta


@router.get("/projects")
async def list_projects(task: Optional[str] = None, user: User = Depends(get_current_user)):
    root = _user_dir(user)
    out = []
    if os.path.isdir(root):
        for pid in os.listdir(root):
            mp = os.path.join(root, pid, "meta.json")
            if os.path.isfile(mp):
                try:
                    with open(mp, encoding="utf-8") as f:
                        meta = json.load(f)
                except Exception:
                    continue
                if task and meta.get("task") != task:
                    continue
                if meta.get("task") == "detect":
                    # detection: classes are an ordered list, images live in images/
                    names = meta.get("det_classes", [])
                    meta["classes"] = {c: 0 for c in names}
                    idir = os.path.join(root, pid, "images")
                    meta["num_images"] = (
                        len([f for f in os.listdir(idir) if f.lower().endswith(_IMG_EXT)])
                        if os.path.isdir(idir) else 0
                    )
                else:
                    meta["classes"] = _class_counts(os.path.join(root, pid))
                out.append(meta)
    out.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return out


@router.get("/projects/{pid}")
async def get_project(pid: str, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    meta["classes"] = _class_counts(proj)
    return meta


@router.get("/projects/{pid}/photo/{cls}/{fname}")
async def get_photo(pid: str, cls: str, fname: str, user: User = Depends(get_current_user)):
    """Serve one dataset image (e.g. for the misclassified-examples gallery)."""
    proj = _proj_dir(user, pid)
    path = os.path.join(proj, "data", _safe(cls), os.path.basename(fname))
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ไม่พบรูป")
    return FileResponse(path)


@router.delete("/projects/{pid}")
async def delete_project(pid: str, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    shutil.rmtree(proj, ignore_errors=True)
    return {"ok": True}


@router.post("/projects/{pid}/classes")
async def add_class(pid: str, body: ClassBody, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    name = _safe(body.name)
    os.makedirs(os.path.join(proj, "data", name), exist_ok=True)
    return {"ok": True, "classes": _class_counts(proj)}


@router.delete("/projects/{pid}/classes/{name}")
async def delete_class(pid: str, name: str, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    shutil.rmtree(os.path.join(proj, "data", _safe(name)), ignore_errors=True)
    return {"ok": True, "classes": _class_counts(proj)}


@router.post("/projects/{pid}/images")
async def add_images(pid: str, body: ImagesBody, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    cls_dir = os.path.join(proj, "data", _safe(body.class_name))
    os.makedirs(cls_dir, exist_ok=True)
    saved = 0
    for data_url in body.images:
        try:
            raw = data_url.split(",", 1)[1] if "," in data_url else data_url
            img = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")
            img.save(os.path.join(cls_dir, f"{uuid.uuid4().hex}.jpg"), "JPEG", quality=90)
            saved += 1
        except Exception:
            continue
    return {"ok": True, "saved": saved, "classes": _class_counts(proj)}


@router.post("/projects/{pid}/base-model")
async def set_base_model(pid: str, body: BaseModelBody, user: User = Depends(get_current_user)):
    """Set (or clear) the base model to fine-tune from. None → yolov8n-cls.pt."""
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    meta["base_model_id"] = body.model_id
    meta["base_model_name"] = body.model_name
    _write_meta(proj, meta)
    return {"ok": True}


@router.post("/projects/{pid}/import-zip")
async def import_zip(pid: str, file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Import a .zip whose sub-folders are classes (folder name → class, images inside)."""
    proj = _proj_dir(user, pid)
    data = os.path.join(proj, "data")

    # Stream to a temp file (avoid loading a big zip fully into memory)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    size = 0
    try:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > 500 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="ไฟล์ ZIP ใหญ่เกิน 500MB")
            tmp.write(chunk)
        tmp.close()

        added: dict[str, int] = {}
        try:
            zf = zipfile.ZipFile(tmp.name)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="ไฟล์ไม่ใช่ ZIP ที่ถูกต้อง")
        with zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                if os.path.splitext(info.filename)[1].lower() not in _IMG_EXT:
                    continue
                # class = the folder directly containing the image (handles a
                # single wrapping folder automatically). Never use the zip path
                # for writing → no zip-slip.
                cls = _safe(os.path.basename(os.path.dirname(info.filename)))
                if not cls:
                    continue
                try:
                    img = Image.open(io.BytesIO(zf.read(info))).convert("RGB")
                except Exception:
                    continue
                cd = os.path.join(data, cls)
                os.makedirs(cd, exist_ok=True)
                img.save(os.path.join(cd, f"{uuid.uuid4().hex}.jpg"), "JPEG", quality=90)
                added[cls] = added.get(cls, 0) + 1
    finally:
        if os.path.exists(tmp.name):
            os.remove(tmp.name)

    if not added:
        raise HTTPException(status_code=400, detail="ไม่พบรูปในโฟลเดอร์ย่อยของ ZIP")
    return {"ok": True, "added": added, "classes": _class_counts(proj)}


@router.post("/projects/{pid}/augment-dataset")
async def augment_dataset(pid: str, body: AugDatasetBody, user: User = Depends(get_current_user)):
    """Generate an augmented dataset .zip on demand (no training needed)."""
    proj = _proj_dir(user, pid)
    data = os.path.join(proj, "data")
    counts = _class_counts(proj)
    if not any(counts.values()):
        raise HTTPException(status_code=400, detail="ยังไม่มีรูปในคลาส")

    aug = body.augment or {}
    factor = max(1, min(10, int(aug.get("factor", 1) or 1)))

    def _build() -> str:
        from app.training.classify import augment_train_split
        work = tempfile.mkdtemp(prefix="augds_")
        out = os.path.join(work, "dataset")
        shutil.copytree(data, out)               # classes + original images
        if factor > 1:
            augment_train_split(out, factor, aug)  # adds augmented copies in place
        base = os.path.join(work, "augmented")
        shutil.make_archive(base, "zip", out)
        return base + ".zip"

    zip_path = await asyncio.to_thread(_build)
    work_dir = os.path.dirname(zip_path)
    meta = _read_meta(proj)
    name = f"{meta.get('name', 'dataset')}_augmented.zip"
    return FileResponse(
        zip_path,
        filename=name,
        media_type="application/zip",
        background=BackgroundTask(lambda: shutil.rmtree(work_dir, ignore_errors=True)),
    )


@router.get("/projects/{pid}/download-dataset")
async def download_dataset(pid: str, user: User = Depends(get_current_user)):
    """Download the prepared dataset (train+val, incl. offline-augmented copies)."""
    proj = _proj_dir(user, pid)
    ds = os.path.join(proj, "_dataset")
    if not os.path.isdir(ds):
        raise HTTPException(status_code=404, detail="ยังไม่มี dataset (เทรนแบบ Offline ก่อน)")
    meta = _read_meta(proj)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp.close()
    base = tmp.name[:-4]
    shutil.make_archive(base, "zip", ds)   # writes base + '.zip' (== tmp.name)
    name = f"{meta.get('name', 'dataset')}_augmented.zip"
    return FileResponse(
        tmp.name,
        filename=name,
        media_type="application/zip",
        background=BackgroundTask(lambda: os.path.exists(tmp.name) and os.remove(tmp.name)),
    )


@router.post("/projects/{pid}/predict")
async def predict(pid: str, body: PredictBody, user: User = Depends(get_current_user)):
    """Run the trained classifier on one image (for the in-app model tester)."""
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    mid = meta.get("model_id")
    if not mid:
        raise HTTPException(status_code=400, detail="ยังไม่มีโมเดล (เทรนให้เสร็จก่อน)")

    def _run():
        from app.engine.nodes.dl._models import load_model
        model = load_model(mid)
        raw = body.image.split(",", 1)[1] if "," in body.image else body.image
        img = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")
        r = model(img, verbose=False, device=_get_device(), half=_use_half())[0]
        probs = getattr(r, "probs", None)
        if probs is None:
            raise ValueError("โมเดลนี้ไม่ใช่โมเดลจำแนกภาพ")
        top1 = int(probs.top1)
        top5 = [{"label": r.names[int(i)], "confidence": round(float(probs.data[int(i)]), 3)}
                for i in probs.top5]
        return {"label": r.names[top1], "confidence": round(float(probs.top1conf), 3), "top5": top5}

    try:
        return await asyncio.to_thread(_run)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(e)[:200])


@router.get("/projects/{pid}/status")
async def status(pid: str, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    meta["classes"] = _class_counts(proj)
    return meta


@router.post("/projects/{pid}/train")
async def start_training(
    pid: str,
    body: TrainBody = Body(default=TrainBody()),
    user: User = Depends(get_current_user),
):
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    if meta.get("status") == "training" and proj in _RUNNING:
        raise HTTPException(status_code=409, detail="กำลังเทรนอยู่แล้ว")
    # status=="training" but no live task → stale leftover; allow a fresh start

    counts = _class_counts(proj)
    classes = [c for c, n in counts.items() if n > 0]
    if len(classes) < 2:
        raise HTTPException(status_code=400, detail="ต้องมีอย่างน้อย 2 คลาส (แต่ละคลาสมีรูป)")
    if any(counts[c] < 2 for c in classes):
        raise HTTPException(status_code=400, detail="แต่ละคลาสต้องมีรูปอย่างน้อย 2 รูป")

    epochs = max(1, min(200, int(body.epochs or 30)))

    # Resolve base model: uploaded one wins, else the chosen YOLO26-cls size
    base = _CLS_SIZES.get(body.model_size or "n", _CLS_SIZES["n"])
    bid = meta.get("base_model_id")
    if bid:
        from app.engine.nodes.dl._models import resolve_path
        try:
            base = resolve_path(bid)
        except Exception:
            raise HTTPException(status_code=400, detail="ไม่พบไฟล์โมเดลฐาน — อัปโหลดใหม่")

    target_acc = body.target_acc
    if target_acc is not None:
        target_acc = max(0.0, min(1.0, float(target_acc))) or None

    aug_mode = (body.augment or {}).get("mode") if body.augment else None

    _STOP.discard(proj)
    _RUNNING.add(proj)
    meta.update(
        status="training",
        progress={"epoch": 0, "total": epochs, "accuracy": None},
        stage="กำลังเริ่ม...",
        target_acc=target_acc,
        aug_mode=aug_mode,            # 'onfly' | 'offline' | None
        error=None,
    )
    _write_meta(proj, meta)

    from app.engine.executor import spawn_background
    spawn_background(_run_training(proj, meta["name"], epochs, base, target_acc, body.augment))
    return {"ok": True, "status": "training", "epochs": epochs}


@router.post("/projects/{pid}/stop")
async def stop_training(pid: str, user: User = Depends(get_current_user)):
    """Request an early stop — training finishes the current epoch and keeps best."""
    proj = _proj_dir(user, pid)
    _STOP.add(proj)
    return {"ok": True}


@router.get("/projects/{pid}/download")
async def download_model(pid: str, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    mid = meta.get("model_id")
    if not mid:
        raise HTTPException(status_code=404, detail="ยังไม่มีโมเดล (เทรนให้เสร็จก่อน)")
    path = os.path.join(MODELS_DIR, os.path.basename(mid))
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์โมเดล")
    return FileResponse(
        path,
        filename=meta.get("model_name") or "model.pt",
        media_type="application/octet-stream",
    )


async def _run_training(
    proj: str, name: str, epochs: int,
    base_model: str = "yolov8n-cls.pt", target_acc: float | None = None,
    augment: dict | None = None,
):
    from app.training.classify import train_classify

    def progress(cur: int, total: int, acc=None) -> bool:
        m = _read_meta(proj)
        m["progress"] = {"epoch": cur, "total": total, "accuracy": acc}
        m["stage"] = f"กำลังเทรน (epoch {cur}/{total})"
        _write_meta(proj, m)
        if proj in _STOP:                                   # manual stop
            return True
        if target_acc and acc is not None and acc >= target_acc:  # reached goal
            return True
        return False                                        # → classify._cb sets trainer.stop

    def set_stage(text: str):
        m = _read_meta(proj)
        m["stage"] = text
        _write_meta(proj, m)

    try:
        data_dir = os.path.join(proj, "data")
        best, classes, acc, report = await asyncio.to_thread(
            train_classify, data_dir, proj, epochs, 224, _get_device(), progress, base_model, set_stage, augment
        )
        set_stage("กำลังบันทึกโมเดล...")
        if not os.path.exists(best):
            raise RuntimeError("เทรนเสร็จแต่ไม่พบไฟล์โมเดล")

        os.makedirs(MODELS_DIR, exist_ok=True)
        model_id = f"{uuid.uuid4().hex}.pt"
        shutil.copy(best, os.path.join(MODELS_DIR, model_id))

        m = _read_meta(proj)
        m.update(
            status="done",
            model_id=model_id,
            model_name=f"{name}.pt",
            accuracy=round(acc, 3),
            classes_trained=classes,
            per_class=report.get("per_class") or {},
            mistakes=report.get("mistakes") or [],
            stage=None,
            error=None,
        )
        _write_meta(proj, m)
    except Exception as e:  # noqa: BLE001
        m = _read_meta(proj)
        m.update(status="failed", stage=None, error=str(e)[:300])
        _write_meta(proj, m)
    finally:
        _STOP.discard(proj)
        _RUNNING.discard(proj)
