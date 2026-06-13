"""Object-detection training (ultralytics YOLOv8).

Images live in images/, YOLO-format labels in labels/ ({stem}.txt with
`cls cx cy w h` normalized). Only annotated images are used. Builds a
train/val split + data.yaml and fine-tunes yolov8n.pt.
"""
import os
import math
import uuid
import random
import shutil
from PIL import Image, ImageOps, ImageEnhance, ImageDraw
from app.training.classify import _online_kwargs

_IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


def _read_label(path: str) -> list[list[float]]:
    boxes = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            p = line.split()
            if len(p) == 5:
                boxes.append([int(float(p[0])), float(p[1]), float(p[2]), float(p[3]), float(p[4])])
    return boxes


def _rotate_with_boxes(img: "Image.Image", boxes: list, angle: float):
    """Rotate image (CCW) and transform YOLO boxes to new axis-aligned boxes."""
    w, h = img.size
    out = img.rotate(angle, resample=Image.BILINEAR, fillcolor=(127, 127, 127))
    a = math.radians(angle)
    cosA, sinA = math.cos(a), math.sin(a)
    nb = []
    for cls, cx, cy, bw, bh in boxes:
        x0, x1 = (cx - bw / 2) * w, (cx + bw / 2) * w
        y0, y1 = (cy - bh / 2) * h, (cy + bh / 2) * h
        xs, ys = [], []
        for px, py in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
            dx, dy = px - w / 2, py - h / 2
            rx = dx * cosA + dy * sinA          # PIL rotates content CCW
            ry = -dx * sinA + dy * cosA
            xs.append(rx + w / 2)
            ys.append(ry + h / 2)
        nx0, nx1 = max(0, min(xs)), min(w, max(xs))
        ny0, ny1 = max(0, min(ys)), min(h, max(ys))
        ncx, ncy = (nx0 + nx1) / 2 / w, (ny0 + ny1) / 2 / h
        nbw, nbh = (nx1 - nx0) / w, (ny1 - ny0) / h
        if nbw > 0.01 and nbh > 0.01:
            nb.append([cls, ncx, ncy, nbw, nbh])
    return out, nb


def _apply_aug(img: "Image.Image", boxes: list, types: dict):
    """Apply selected transforms to image + boxes together."""
    out = img
    nb = [b[:] for b in boxes]
    if types.get("flip") and random.random() < 0.5:
        out = ImageOps.mirror(out)
        for b in nb:
            b[1] = 1.0 - b[1]
    if types.get("rotate"):
        out, nb = _rotate_with_boxes(out, nb, random.uniform(-12, 12))
    if types.get("color"):
        out = ImageEnhance.Brightness(out).enhance(random.uniform(0.7, 1.3))
        out = ImageEnhance.Color(out).enhance(random.uniform(0.6, 1.4))
        out = ImageEnhance.Contrast(out).enhance(random.uniform(0.8, 1.2))
    if types.get("erase") and random.random() < 0.5:
        out = out.copy()
        w, h = out.size
        ew, eh = int(w * random.uniform(0.08, 0.2)), int(h * random.uniform(0.08, 0.2))
        x, y = random.randint(0, max(0, w - ew)), random.randint(0, max(0, h - eh))
        ImageDraw.Draw(out).rectangle([x, y, x + ew, y + eh], fill=(0, 0, 0))
    return out, nb


def augment_detect_dir(images_dir: str, labels_dir: str, factor: int, types: dict) -> None:
    """Add (factor-1) augmented image+label pairs into the given dirs, in place."""
    if factor <= 1:
        return
    items = _annotated_items(images_dir, labels_dir)
    for img_file, lbl_file in items:
        try:
            img = Image.open(os.path.join(images_dir, img_file)).convert("RGB")
        except Exception:
            continue
        boxes = _read_label(os.path.join(labels_dir, lbl_file))
        for _ in range(factor - 1):
            ai, ab = _apply_aug(img, boxes, types)
            if not ab:
                continue
            stem = f"aug_{uuid.uuid4().hex}"
            ai.save(os.path.join(images_dir, stem + ".jpg"), "JPEG", quality=90)
            with open(os.path.join(labels_dir, stem + ".txt"), "w", encoding="utf-8") as f:
                for cls, cx, cy, bw, bh in ab:
                    f.write(f"{int(cls)} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n")


def _annotated_items(images_dir: str, labels_dir: str) -> list[tuple[str, str]]:
    """Return (image_file, label_file) pairs that have a non-empty label."""
    items = []
    for img in sorted(os.listdir(images_dir)):
        stem, ext = os.path.splitext(img)
        if ext.lower() not in _IMG_EXT:
            continue
        lbl = stem + ".txt"
        lp = os.path.join(labels_dir, lbl)
        if os.path.exists(lp) and os.path.getsize(lp) > 0:
            items.append((img, lbl))
    return items


def build_detect_dataset(images_dir: str, labels_dir: str, out_dir: str,
                         classes: list[str], val_ratio: float = 0.2) -> tuple[str, int, int]:
    """Create YOLO dataset (images/{train,val}, labels/{train,val}, data.yaml)."""
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)

    items = _annotated_items(images_dir, labels_dir)   # already sorted → reproducible
    n = len(items)
    n_val = max(1, int(n * val_ratio)) if n > 1 else 0
    val = items[:n_val]
    train = items[n_val:] or items
    if not val:
        val = train[:1]

    for split, lst in (("train", train), ("val", val)):
        idir = os.path.join(out_dir, "images", split)
        ldir = os.path.join(out_dir, "labels", split)
        os.makedirs(idir, exist_ok=True)
        os.makedirs(ldir, exist_ok=True)
        for img, lbl in lst:
            shutil.copy(os.path.join(images_dir, img), os.path.join(idir, img))
            shutil.copy(os.path.join(labels_dir, lbl), os.path.join(ldir, lbl))

    yaml_path = os.path.join(out_dir, "data.yaml")
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(f"path: {os.path.abspath(out_dir)}\n")
        f.write("train: images/train\n")
        f.write("val: images/val\n")
        f.write("names:\n")
        for i, c in enumerate(classes):
            f.write(f"  {i}: {c}\n")
    return yaml_path, len(train), len(val)


def train_detect(
    images_dir: str,
    labels_dir: str,
    work_dir: str,
    classes: list[str],
    epochs: int,
    imgsz: int,
    device: str,
    progress_cb=None,
    stage_cb=None,
    base_model: str = "yolov8n.pt",
    augment=None,
) -> tuple[str, list[str], float]:
    """Train a detector. Returns (best_ckpt, classes, mAP50)."""
    from ultralytics import YOLO

    def stage(t: str):
        if stage_cb:
            try:
                stage_cb(t)
            except Exception:
                pass

    stage("กำลังเตรียมข้อมูล (แบ่ง train/val)...")
    dataset = os.path.join(work_dir, "_dataset")
    yaml_path, _ntrain, _nval = build_detect_dataset(images_dir, labels_dir, dataset, classes)

    # Augmentation: offline (real copies in train split) or on-the-fly (ultralytics).
    # Default (no choice / offline) keeps ultralytics' tuned online augmentation —
    # disabling it was the main cause of weak real-world detection accuracy.
    online: dict = {}
    if augment:
        if augment.get("mode", "offline") == "offline":
            factor = max(1, min(10, int(augment.get("factor", 1) or 1)))
            if factor > 1:
                stage(f"กำลังสร้างภาพ augmentation (×{factor})...")
                augment_detect_dir(
                    os.path.join(dataset, "images", "train"),
                    os.path.join(dataset, "labels", "train"),
                    factor, augment,
                )
        else:  # on-the-fly
            online = _online_kwargs(augment)

    dev = 0 if "cuda" in (device or "") else "cpu"

    stage("กำลังโหลดโมเดลฐาน...")
    model = YOLO(base_model)
    if progress_cb:
        def _cb(trainer):
            try:
                cur = int(getattr(trainer, "epoch", 0)) + 1
                total = int(getattr(trainer, "epochs", epochs))
                acc = None
                metrics = getattr(trainer, "metrics", None)
                if isinstance(metrics, dict):
                    raw = metrics.get("metrics/mAP50(B)")
                    if raw is not None:
                        acc = round(float(raw), 4)
                if progress_cb(cur, total, acc):
                    trainer.stop = True
            except Exception:
                pass
        model.add_callback("on_fit_epoch_end", _cb)

    stage("กำลัง warmup GPU — epoch แรกอาจช้าหน่อย...")
    runs = os.path.join(work_dir, "_runs")
    results = model.train(
        data=yaml_path, epochs=epochs, imgsz=imgsz, device=dev,
        project=runs, name="train", exist_ok=True, verbose=False, plots=False,
        # workers=0 → no DataLoader subprocesses. On Windows each worker loads
        # CUDA/torch and commits lots of virtual memory, causing
        # "WinError 1455: The paging file is too small".
        workers=0,
        # cache decoded images in RAM — with workers=0 the GPU otherwise idles
        # re-reading/decoding every image each epoch (TrainAI datasets are small)
        cache="ram",
        **online,
    )
    best = os.path.join(runs, "train", "weights", "best.pt")
    m = 0.0
    try:
        m = float(results.box.map50)
    except Exception:
        pass

    # Per-class AP50 from the final validation — tells the user WHICH class
    # is weak (→ add more images of that one) instead of a single number.
    per_class: dict[str, float] = {}
    try:
        idxs = list(results.box.ap_class_index)
        ap50 = list(results.box.ap50)
        for i, ci in enumerate(idxs):
            if i < len(ap50) and int(ci) < len(classes):
                per_class[classes[int(ci)]] = round(float(ap50[i]), 3)
    except Exception:
        pass
    return best, classes, m, per_class
