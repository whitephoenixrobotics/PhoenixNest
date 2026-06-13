import os
import io
import uuid
import base64
import shutil
import asyncio
import tempfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import Optional
from PIL import Image
from app.models.user import User
from app.auth.dependencies import get_approved_user as get_current_user
from app.engine.nodes.dl._models import MODELS_DIR
from app.engine.nodes.ai.detect import _get_device, _get_model, _use_half
from app.engine.image_utils import decode_image, encode_image
# Reuse the filesystem helpers from the classification trainer
from app.routers.train import _proj_dir, _read_meta, _write_meta, _STOP, _RUNNING, _IMG_EXT

router = APIRouter(prefix="/train/det", tags=["train-detect"])


# ───────────────────────── schemas ──────────────────────────
class ClassesBody(BaseModel):
    classes: list[str]


class ImagesBody(BaseModel):
    images: list[str]                 # base64 data URLs


class Box(BaseModel):
    cls: int
    cx: float
    cy: float
    w: float
    h: float


class AnnBody(BaseModel):
    img_id: str
    boxes: list[Box]


class AutoLabelBody(BaseModel):
    img_id: str


class PredictBody(BaseModel):
    image: str                        # base64 data URL


class DetTrainBody(BaseModel):
    epochs: Optional[int] = 50
    target_acc: Optional[float] = None    # mAP50 0-1
    augment: Optional[dict] = None        # {flip,rotate,color,erase,mode,factor}
    model_size: Optional[str] = None      # n | s | m → YOLO26 base size


# Pretrained base per size — YOLO26 (2025): NMS-free end-to-end, faster on CPU
# and slightly more accurate than v8/11 at the same size.
_DET_SIZES = {"n": "yolo26n.pt", "s": "yolo26s.pt", "m": "yolo26m.pt"}


class AugDatasetBody(BaseModel):
    augment: Optional[dict] = None


class AutoLabelAllBody(BaseModel):
    mapping: dict[str, int]      # COCO class name → project class index
    overwrite: bool = False      # also re-label images that already have boxes


# ───────────────────────── helpers ──────────────────────────
def _dirs(proj: str) -> tuple[str, str]:
    img = os.path.join(proj, "images")
    lbl = os.path.join(proj, "labels")
    os.makedirs(img, exist_ok=True)
    os.makedirs(lbl, exist_ok=True)
    return img, lbl


def _read_boxes(label_path: str) -> list[dict]:
    boxes = []
    if os.path.exists(label_path):
        with open(label_path, encoding="utf-8") as f:
            for line in f:
                p = line.split()
                if len(p) == 5:
                    boxes.append({"cls": int(float(p[0])), "cx": float(p[1]),
                                  "cy": float(p[2]), "w": float(p[3]), "h": float(p[4])})
    return boxes


def _safe_id(img_id: str) -> str:
    return os.path.basename(img_id or "")


# ───────────────────────── endpoints ─────────────────────────
@router.get("/{pid}")
async def get_detect(pid: str, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    img_dir, lbl_dir = _dirs(proj)
    meta = _read_meta(proj)
    images = []
    for f in sorted(os.listdir(img_dir)):
        stem, ext = os.path.splitext(f)
        if ext.lower() not in _IMG_EXT:
            continue
        boxes = _read_boxes(os.path.join(lbl_dir, stem + ".txt"))
        images.append({"id": f, "annotated": len(boxes) > 0, "boxes": boxes})
    meta["det_classes"] = meta.get("det_classes", [])
    meta["images"] = images
    return meta


@router.post("/{pid}/classes")
async def set_classes(pid: str, body: ClassesBody, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    new = [c.strip() for c in body.classes if c.strip()][:50]
    old = meta.get("det_classes", [])
    # Label files store class *indices*. Once images are annotated, removing a
    # class would silently re-map every later index to the wrong class name.
    _, lbl_dir = _dirs(proj)
    has_labels = any(
        f.endswith(".txt") and os.path.getsize(os.path.join(lbl_dir, f)) > 0
        for f in os.listdir(lbl_dir)
    )
    if has_labels and len(new) < len(old):
        raise HTTPException(
            status_code=400,
            detail="ลบคลาสหลังตีกรอบแล้วไม่ได้ (กรอบที่ตีไว้จะชี้ผิดคลาส) — เปลี่ยนชื่อคลาสแทน หรือลบกรอบทั้งหมดก่อน",
        )
    meta["det_classes"] = new
    _write_meta(proj, meta)
    return {"ok": True, "det_classes": meta["det_classes"]}


@router.post("/{pid}/images")
async def add_images(pid: str, body: ImagesBody, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    img_dir, _ = _dirs(proj)
    ids = []
    for data_url in body.images:
        try:
            raw = data_url.split(",", 1)[1] if "," in data_url else data_url
            img = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")
            fid = f"{uuid.uuid4().hex}.jpg"
            img.save(os.path.join(img_dir, fid), "JPEG", quality=92)
            ids.append(fid)
        except Exception:
            continue
    return {"ok": True, "ids": ids}


@router.get("/{pid}/image/{img_id}")
async def get_image(pid: str, img_id: str, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    path = os.path.join(proj, "images", _safe_id(img_id))
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ไม่พบรูป")
    return FileResponse(path, media_type="image/jpeg")


@router.delete("/{pid}/image/{img_id}")
async def delete_image(pid: str, img_id: str, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    sid = _safe_id(img_id)
    stem = os.path.splitext(sid)[0]
    for p in (os.path.join(proj, "images", sid), os.path.join(proj, "labels", stem + ".txt")):
        if os.path.exists(p):
            os.remove(p)
    return {"ok": True}


@router.post("/{pid}/annotations")
async def set_annotations(pid: str, body: AnnBody, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    _, lbl_dir = _dirs(proj)
    stem = os.path.splitext(_safe_id(body.img_id))[0]
    lp = os.path.join(lbl_dir, stem + ".txt")
    if not body.boxes:
        if os.path.exists(lp):
            os.remove(lp)
        return {"ok": True, "count": 0}
    with open(lp, "w", encoding="utf-8") as f:
        for b in body.boxes:
            f.write(f"{int(b.cls)} {b.cx:.6f} {b.cy:.6f} {b.w:.6f} {b.h:.6f}\n")
    return {"ok": True, "count": len(body.boxes)}


@router.post("/{pid}/autolabel")
async def autolabel(pid: str, body: AutoLabelBody, user: User = Depends(get_current_user)):
    """Run a base YOLO to propose boxes; user assigns their own class."""
    proj = _proj_dir(user, pid)
    path = os.path.join(proj, "images", _safe_id(body.img_id))
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ไม่พบรูป")

    def _run():
        # yolo26s: bigger than the old yolov8n → noticeably better proposals,
        # and YOLO26 is end-to-end (fewer duplicate boxes by design).
        model = _get_model("yolo26s.pt")
        # agnostic_nms: suppress overlapping boxes ACROSS classes too — the
        # class here is only a hint (user assigns their own), so a model
        # hesitating between two classes shouldn't double-box one object.
        res = model(Image.open(path).convert("RGB"), conf=0.3, iou=0.5,
                    agnostic_nms=True, verbose=False,
                    device=_get_device(), half=_use_half())[0]
        out = []
        if res.boxes is not None:
            xywhn = res.boxes.xywhn.cpu().numpy()
            cls = res.boxes.cls.cpu().numpy()
            for (cx, cy, w, h), c in zip(xywhn, cls):
                out.append({"cx": float(cx), "cy": float(cy), "w": float(w), "h": float(h),
                            "hint": res.names[int(c)]})
        return out

    return {"ok": True, "boxes": await asyncio.to_thread(_run)}


@router.post("/{pid}/autolabel-all")
async def autolabel_all(pid: str, body: AutoLabelAllBody, user: User = Depends(get_current_user)):
    """Batch auto-label: run YOLO over every (unannotated) image in background.

    Only proposals whose COCO class appears in `mapping` are written, with the
    mapped project class index. Progress is stored in meta["autolabel"] and
    polled by the frontend via GET /{pid}.
    """
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    if meta.get("status") == "training" and proj in _RUNNING:
        raise HTTPException(status_code=409, detail="กำลังเทรนอยู่ — รอให้เสร็จก่อน")
    if (meta.get("autolabel") or {}).get("running"):
        raise HTTPException(status_code=409, detail="AI กำลังตีกรอบอยู่แล้ว")

    classes = meta.get("det_classes", [])
    mapping = {str(k).strip().lower(): int(v) for k, v in (body.mapping or {}).items()
               if isinstance(v, int) and 0 <= int(v) < len(classes)}
    if not mapping:
        raise HTTPException(status_code=400, detail="ต้องจับคู่คลาสอย่างน้อย 1 คู่")

    img_dir, lbl_dir = _dirs(proj)
    targets = []
    for f in sorted(os.listdir(img_dir)):
        stem, ext = os.path.splitext(f)
        if ext.lower() not in _IMG_EXT:
            continue
        lp = os.path.join(lbl_dir, stem + ".txt")
        if not body.overwrite and os.path.exists(lp) and os.path.getsize(lp) > 0:
            continue                       # keep human-made labels
        targets.append(f)
    if not targets:
        raise HTTPException(status_code=400, detail="ไม่มีรูปที่ยังไม่ได้ตีกรอบ")

    meta["autolabel"] = {"running": True, "done": 0, "total": len(targets), "labeled": 0}
    _write_meta(proj, meta)

    def _write_progress(done: int, labeled: int, running: bool):
        m = _read_meta(proj)
        m["autolabel"] = {"running": running, "done": done, "total": len(targets), "labeled": labeled}
        _write_meta(proj, m)

    def _run_all():
        model = _get_model("yolo26s.pt")
        labeled = 0
        for i, f in enumerate(targets, start=1):
            try:
                res = model(Image.open(os.path.join(img_dir, f)).convert("RGB"),
                            conf=0.3, iou=0.5, agnostic_nms=True, verbose=False,
                            device=_get_device(), half=_use_half())[0]
                lines = []
                if res.boxes is not None:
                    xywhn = res.boxes.xywhn.cpu().numpy()
                    cls = res.boxes.cls.cpu().numpy()
                    for (cx, cy, w, h), c in zip(xywhn, cls):
                        hint = str(res.names[int(c)]).lower()
                        if hint in mapping:
                            lines.append(f"{mapping[hint]} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
                if lines:
                    stem = os.path.splitext(f)[0]
                    with open(os.path.join(lbl_dir, stem + ".txt"), "w", encoding="utf-8") as fp:
                        fp.write("\n".join(lines) + "\n")
                    labeled += 1
            except Exception:
                pass                       # one bad image must not kill the batch
            # Progress every few images — meta writes hit the disk
            if i % 5 == 0 or i == len(targets):
                _write_progress(i, labeled, running=(i < len(targets)))
        return labeled

    async def _runner():
        try:
            await asyncio.to_thread(_run_all)
        except Exception:
            _write_progress(0, 0, running=False)

    from app.engine.executor import spawn_background
    spawn_background(_runner())
    return {"ok": True, "total": len(targets)}


@router.post("/{pid}/predict")
async def predict(pid: str, body: PredictBody, user: User = Depends(get_current_user)):
    """Run the trained detector on one image; return an annotated image."""
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    mid = meta.get("model_id")
    if not mid:
        raise HTTPException(status_code=400, detail="ยังไม่มีโมเดล (เทรนให้เสร็จก่อน)")

    def _run():
        from app.engine.nodes.dl._models import load_model
        from PIL import Image
        model = load_model(mid)
        img = decode_image(body.image)
        r = model(img, conf=0.25, verbose=False, device=_get_device(), half=_use_half())[0]
        annotated = Image.fromarray(r.plot()[:, :, ::-1])
        n = int(len(r.boxes)) if r.boxes is not None else 0
        classes = (sorted(set(r.names[int(c)] for c in r.boxes.cls.cpu().numpy()))
                   if r.boxes is not None and n else [])
        return {"image": encode_image(annotated), "count": n, "classes": classes}

    try:
        return await asyncio.to_thread(_run)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(e)[:200])


@router.post("/{pid}/train")
async def start_training(pid: str, body: DetTrainBody, user: User = Depends(get_current_user)):
    proj = _proj_dir(user, pid)
    meta = _read_meta(proj)
    if meta.get("status") == "training" and proj in _RUNNING:
        raise HTTPException(status_code=409, detail="กำลังเทรนอยู่แล้ว")
    # status=="training" but no live task → stale leftover; allow a fresh start

    classes = meta.get("det_classes", [])
    if not classes:
        raise HTTPException(status_code=400, detail="ต้องมีอย่างน้อย 1 คลาส")

    _, lbl_dir = _dirs(proj)
    n_annotated = len([f for f in os.listdir(lbl_dir)
                       if f.endswith(".txt") and os.path.getsize(os.path.join(lbl_dir, f)) > 0])
    if n_annotated < 3:
        raise HTTPException(status_code=400, detail="ต้องตีกรอบอย่างน้อย 3 รูป")

    epochs = max(1, min(300, int(body.epochs or 50)))
    target = body.target_acc
    if target is not None:
        target = max(0.0, min(1.0, float(target))) or None

    # Uploaded base model wins, else the chosen YOLO26 size
    base = _DET_SIZES.get(body.model_size or "n", _DET_SIZES["n"])
    bid = meta.get("base_model_id")
    if bid:
        from app.engine.nodes.dl._models import resolve_path
        try:
            base = resolve_path(bid)
        except Exception:
            raise HTTPException(status_code=400, detail="ไม่พบไฟล์โมเดลฐาน")

    aug_mode = (body.augment or {}).get("mode") if body.augment else None
    _STOP.discard(proj)
    _RUNNING.add(proj)
    meta.update(status="training", progress={"epoch": 0, "total": epochs, "accuracy": None},
                stage="กำลังเริ่ม...", target_acc=target, aug_mode=aug_mode, error=None)
    _write_meta(proj, meta)

    from app.engine.executor import spawn_background
    spawn_background(_run_detect_training(proj, meta["name"], classes, epochs, target, base, body.augment))
    return {"ok": True, "status": "training", "epochs": epochs}


@router.post("/{pid}/augment-dataset")
async def augment_dataset(pid: str, body: AugDatasetBody, user: User = Depends(get_current_user)):
    """Generate an augmented detection dataset .zip on demand (no training)."""
    proj = _proj_dir(user, pid)
    img_dir, lbl_dir = _dirs(proj)
    from app.training.detect import _annotated_items, augment_detect_dir
    if not _annotated_items(img_dir, lbl_dir):
        raise HTTPException(status_code=400, detail="ต้องตีกรอบอย่างน้อย 1 รูปก่อน")

    aug = body.augment or {}
    factor = max(1, min(10, int(aug.get("factor", 1) or 1)))

    def _build() -> str:
        work = tempfile.mkdtemp(prefix="augdet_")
        out = os.path.join(work, "dataset")
        oi, ol = os.path.join(out, "images"), os.path.join(out, "labels")
        shutil.copytree(img_dir, oi)
        shutil.copytree(lbl_dir, ol)
        if factor > 1:
            augment_detect_dir(oi, ol, factor, aug)
        base = os.path.join(work, "augmented")
        shutil.make_archive(base, "zip", out)
        return base + ".zip"

    zip_path = await asyncio.to_thread(_build)
    work_dir = os.path.dirname(zip_path)
    meta = _read_meta(proj)
    name = f"{meta.get('name', 'dataset')}_augmented.zip"
    return FileResponse(zip_path, filename=name, media_type="application/zip",
                        background=BackgroundTask(lambda: shutil.rmtree(work_dir, ignore_errors=True)))


async def _run_detect_training(proj, name, classes, epochs, target_acc, base_model, augment=None):
    from app.training.detect import train_detect

    def progress(cur, total, acc=None) -> bool:
        m = _read_meta(proj)
        m["progress"] = {"epoch": cur, "total": total, "accuracy": acc}
        m["stage"] = f"กำลังเทรน (epoch {cur}/{total})"
        _write_meta(proj, m)
        if proj in _STOP:
            return True
        if target_acc and acc is not None and acc >= target_acc:
            return True
        return False

    def set_stage(text):
        m = _read_meta(proj)
        m["stage"] = text
        _write_meta(proj, m)

    try:
        img_dir = os.path.join(proj, "images")
        lbl_dir = os.path.join(proj, "labels")
        best, _classes, m50, per_class = await asyncio.to_thread(
            train_detect, img_dir, lbl_dir, proj, classes, epochs, 640,
            _get_device(), progress, set_stage, base_model, augment,
        )
        if not os.path.exists(best):
            raise RuntimeError("เทรนเสร็จแต่ไม่พบไฟล์โมเดล")
        os.makedirs(MODELS_DIR, exist_ok=True)
        model_id = f"{uuid.uuid4().hex}.pt"
        shutil.copy(best, os.path.join(MODELS_DIR, model_id))
        m = _read_meta(proj)
        m.update(status="done", model_id=model_id, model_name=f"{name}.pt",
                 accuracy=round(m50, 3), per_class=per_class, stage=None, error=None)
        _write_meta(proj, m)
    except Exception as e:  # noqa: BLE001
        m = _read_meta(proj)
        m.update(status="failed", stage=None, error=str(e)[:300])
        _write_meta(proj, m)
    finally:
        _STOP.discard(proj)
        _RUNNING.discard(proj)
