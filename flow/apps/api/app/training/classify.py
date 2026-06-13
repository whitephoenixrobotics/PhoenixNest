"""Image-classification training (ultralytics YOLOv8-cls).

Takes a folder of class sub-folders, builds a train/val split, fine-tunes
yolov8n-cls, and returns the path to the best checkpoint.
"""
import os
import uuid
import random
import shutil
from PIL import Image, ImageOps, ImageEnhance, ImageDraw

_IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


def _online_kwargs(types: dict) -> dict:
    """On-the-fly augmentation: map the user's switches to ultralytics params.

    Only the four user-facing transforms are overridden. Structural
    augmentation (mosaic / scale / translate / auto_augment) stays at
    ultralytics' tuned defaults — zeroing those out crippled generalization
    on small datasets (the model memorized the exact training shots).
    """
    kw = {
        "fliplr": 0.5 if types.get("flip") else 0.0,
        "degrees": 15.0 if types.get("rotate") else 0.0,
        "erasing": 0.4 if types.get("erase") else 0.0,
    }
    if types.get("color"):
        kw.update(hsv_h=0.015, hsv_s=0.7, hsv_v=0.4)
    else:
        kw.update(hsv_h=0.0, hsv_s=0.0, hsv_v=0.0)
    return kw


def _list_images(folder: str) -> list[str]:
    return [f for f in os.listdir(folder) if f.lower().endswith(_IMG_EXT)]


def build_split(data_dir: str, out_dir: str, val_ratio: float = 0.2) -> list[str]:
    """Create out_dir/{train,val}/{class}/ from data_dir/{class}/ (deterministic)."""
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)

    classes = sorted(
        d for d in os.listdir(data_dir)
        if os.path.isdir(os.path.join(data_dir, d))
    )
    for c in classes:
        src = os.path.join(data_dir, c)
        imgs = sorted(_list_images(src))   # sorted → reproducible split
        n = len(imgs)
        n_val = max(1, int(n * val_ratio)) if n > 1 else 0
        val = imgs[:n_val]
        train = imgs[n_val:] or imgs       # train must be non-empty
        if not val:                        # tiny class → reuse one for val
            val = train[:1]
        for split, files in (("train", train), ("val", val)):
            dst = os.path.join(out_dir, split, c)
            os.makedirs(dst, exist_ok=True)
            for f in files:
                shutil.copy(os.path.join(src, f), os.path.join(dst, f))
    return classes


def _augment_image(img: "Image.Image", types: dict) -> "Image.Image":
    """Apply the selected random transforms to one image."""
    out = img
    if types.get("flip") and random.random() < 0.5:
        out = ImageOps.mirror(out)
    if types.get("rotate"):
        out = out.rotate(random.uniform(-15, 15), resample=Image.BILINEAR, fillcolor=(127, 127, 127))
    if types.get("color"):
        out = ImageEnhance.Brightness(out).enhance(random.uniform(0.7, 1.3))
        out = ImageEnhance.Color(out).enhance(random.uniform(0.6, 1.4))
        out = ImageEnhance.Contrast(out).enhance(random.uniform(0.8, 1.2))
    if types.get("erase") and random.random() < 0.6:
        out = out.copy()
        w, h = out.size
        ew, eh = int(w * random.uniform(0.1, 0.3)), int(h * random.uniform(0.1, 0.3))
        x, y = random.randint(0, max(0, w - ew)), random.randint(0, max(0, h - eh))
        ImageDraw.Draw(out).rectangle([x, y, x + ew, y + eh], fill=(0, 0, 0))
    return out


def augment_train_split(train_dir: str, factor: int, types: dict) -> None:
    """Create (factor-1) augmented copies per training image, in place."""
    if factor <= 1:
        return
    for cls in os.listdir(train_dir):
        cd = os.path.join(train_dir, cls)
        if not os.path.isdir(cd):
            continue
        originals = [f for f in os.listdir(cd) if f.lower().endswith(_IMG_EXT)]
        for f in originals:
            try:
                img = Image.open(os.path.join(cd, f)).convert("RGB")
            except Exception:
                continue
            for _ in range(factor - 1):
                aug = _augment_image(img, types)
                aug.save(os.path.join(cd, f"aug_{uuid.uuid4().hex}.jpg"), "JPEG", quality=90)


def train_classify(
    data_dir: str,
    work_dir: str,
    epochs: int,
    imgsz: int,
    device: str,
    progress_cb=None,
    base_model: str = "yolov8n-cls.pt",
    stage_cb=None,
    augment=None,
) -> tuple[str, list[str], float]:
    """Train a classifier from `base_model`. Returns (best_ckpt, classes, top1)."""
    from ultralytics import YOLO

    def stage(text: str):
        if stage_cb:
            try:
                stage_cb(text)
            except Exception:
                pass

    stage("กำลังเตรียมข้อมูล (แบ่ง train/val)...")
    dataset = os.path.join(work_dir, "_dataset")
    classes = build_split(data_dir, dataset)

    # Augmentation: offline (real copies, downloadable) or on-the-fly (ultralytics).
    # No explicit choice (or offline mode) → keep ultralytics' default online
    # augmentation; it's the main defense against overfitting tiny datasets.
    online: dict = {}
    if augment:
        if augment.get("mode", "offline") == "offline":
            factor = max(1, min(10, int(augment.get("factor", 1) or 1)))
            if factor > 1:
                stage(f"กำลังสร้างภาพ augmentation (×{factor})...")
                augment_train_split(os.path.join(dataset, "train"), factor, augment)
        else:  # on-the-fly
            online = _online_kwargs(augment)

    # ultralytics wants device=0 / 'cpu' (not 'cuda:0')
    dev = 0 if "cuda" in (device or "") else "cpu"

    stage("กำลังโหลดโมเดลฐาน...")
    model = YOLO(base_model)
    if getattr(model, "task", "classify") != "classify":
        raise ValueError(f"โมเดลฐานต้องเป็นชนิด classify (ได้ '{model.task}')")
    if progress_cb:
        def _cb(trainer):
            try:
                cur = int(getattr(trainer, "epoch", 0)) + 1
                total = int(getattr(trainer, "epochs", epochs))
                acc = None
                metrics = getattr(trainer, "metrics", None)
                if isinstance(metrics, dict):
                    raw = metrics.get("metrics/accuracy_top1")
                    if raw is not None:
                        acc = round(float(raw), 4)
                # progress_cb returns True when the user requested an early stop
                if progress_cb(cur, total, acc):
                    trainer.stop = True
            except Exception:
                pass
        model.add_callback("on_fit_epoch_end", _cb)

    stage("กำลัง warmup GPU — epoch แรกอาจช้าหน่อย...")
    runs = os.path.join(work_dir, "_runs")
    results = model.train(
        data=dataset,
        epochs=epochs,
        imgsz=imgsz,
        device=dev,
        project=runs,
        name="train",
        exist_ok=True,
        verbose=False,
        plots=False,
        workers=0,           # avoid Windows "paging file too small" (WinError 1455)
        # no cache: ultralytics force-disables cache_ram for classify (memory
        # leak, ultralytics#9824) — passing it only spams warnings
        **online,
    )

    best = os.path.join(runs, "train", "weights", "best.pt")
    acc = 0.0
    try:
        acc = float(getattr(results, "top1", 0.0) or 0.0)
    except Exception:
        pass

    # Per-class report on the val split: accuracy per class + which images
    # were misclassified (true → predicted), so the user knows what to fix.
    per_class: dict[str, dict] = {}
    mistakes: list[dict] = []
    try:
        stage("กำลังประเมินผลรายคลาส...")
        bm = YOLO(best)
        val_dir = os.path.join(dataset, "val")
        for cls in classes:
            cd = os.path.join(val_dir, cls)
            files = sorted(_list_images(cd)) if os.path.isdir(cd) else []
            correct = 0
            for f in files:
                r = bm(os.path.join(cd, f), verbose=False, device=dev)[0]
                pred = r.names[int(r.probs.top1)]
                if pred == cls:
                    correct += 1
                elif len(mistakes) < 12:
                    mistakes.append({"file": f, "true": cls, "pred": pred})
            per_class[cls] = {"correct": correct, "total": len(files)}
    except Exception:
        pass
    return best, classes, acc, {"per_class": per_class, "mistakes": mistakes}
