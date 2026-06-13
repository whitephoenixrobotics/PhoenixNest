import asyncio
import threading
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image

# Cache loaded YOLO models across executions (loading is expensive)
_model_cache: dict = {}
_model_lock = threading.Lock()
_device: str | None = None


def _get_device() -> str:
    """Pick CUDA if available, else CPU. Logged once."""
    global _device
    if _device is None:
        try:
            import torch
            if torch.cuda.is_available():
                _device = "cuda:0"
                print(f"[YOLO] Using GPU: {torch.cuda.get_device_name(0)}", flush=True)
            else:
                _device = "cpu"
                print("[YOLO] Using CPU (no CUDA available)", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[YOLO] CUDA check failed ({e}) — falling back to CPU", flush=True)
            _device = "cpu"
    return _device


def _use_half() -> bool:
    """FP16 inference on CUDA — roughly halves YOLO latency on RTX GPUs."""
    return _get_device().startswith("cuda")


def auto_size() -> str:
    """Best YOLO size for the current hardware.

    Benchmarks (RTX 3060): n/s/m all run ~30ms on GPU — inference is
    overhead-bound there, so the bigger, more accurate model is effectively
    FREE. On CPU size is compute-bound (n≈66ms, s≈133ms), so use the small one.
    """
    return "m" if _get_device().startswith("cuda") else "n"


def auto_model(suffix: str = "") -> str:
    """Auto-sized YOLO26 weights for a task. suffix: '' detect, '-pose', '-seg'."""
    return f"yolo26{auto_size()}{suffix}.pt"


def _get_model(name: str):
    # Lock: concurrent first-use from several worker threads would otherwise
    # load the same multi-hundred-MB model twice.
    with _model_lock:
        if name not in _model_cache:
            from ultralytics import YOLO
            model = YOLO(name)
            # Move model weights onto the chosen device once at load time
            model.to(_get_device())
            _model_cache[name] = model
    return _model_cache[name]


_IMGSZ_CAP = 1920   # safety cap for "original" so huge frames don't OOM


def resolve_imgsz(setting, w: int, h: int) -> int:
    """Inference size from a 3-level choice. fast=640, medium=960,
    original=the frame's own size (rounded to /32, capped)."""
    s = str(setting or "fast")
    if s in ("medium", "960"):
        return 960
    if s == "original":
        m = min(_IMGSZ_CAP, ((max(w, h) + 31) // 32) * 32)
        return max(640, m)
    if s.isdigit():
        return int(s)
    return 640   # fast / default


def _format_result(result) -> dict:
    """Build a Detect output dict from one ultralytics result (shared by the
    single-image path and the batched-video path)."""
    from collections import Counter
    from PIL import Image

    detections = []
    for box in result.boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        xyxy = [round(float(x)) for x in box.xyxy[0].tolist()]
        detections.append({"class": result.names[cls_id], "confidence": round(conf, 3), "bbox": xyxy})

    annotated_b64 = encode_image(Image.fromarray(result.plot()[:, :, ::-1]))
    cls_counts = Counter(d["class"] for d in detections)
    classes = sorted(cls_counts)
    return {
        "detections": detections,
        "count": len(detections),
        "classes": classes,
        "counts": [cls_counts[c] for c in classes],
        "image": annotated_b64,
        "text": (f"พบ {len(detections)} วัตถุ: {', '.join(classes)}" if detections else "ไม่พบวัตถุ"),
    }


def _run_detection(image_data: str, model_name: str, confidence: float, imgsz_setting="fast") -> dict:
    """Synchronous YOLO inference on one image — runs in a worker thread."""
    img = decode_image(image_data)  # PIL RGB image
    model = _get_model(model_name)
    sz = resolve_imgsz(imgsz_setting, *img.size)
    # PIL is treated as RGB by ultralytics (a numpy array would be read as BGR).
    result = model(img, conf=confidence, imgsz=sz, verbose=False, device=_get_device(), half=_use_half())[0]
    return _format_result(result)


def predict_batch(pil_images: list, model_name: str, confidence: float, imgsz_setting="fast") -> list[dict]:
    """Detect on several frames in ONE call. On GPU the per-call overhead
    dominates, so batching N frames is ~2× the throughput of N single calls.
    Public predict() API only — upgrade-safe (no tracker internals)."""
    model = _get_model(model_name)
    sz = resolve_imgsz(imgsz_setting, *pil_images[0].size) if pil_images else 640
    results = model(pil_images, conf=confidence, imgsz=sz, verbose=False,
                    device=_get_device(), half=_use_half())
    return [_format_result(r) for r in results]


# Precomputed batched results, consumed by the Detect handler when the native
# video loop has already run inference for this frame (keyed by a token).
_batch_cache: dict[str, dict] = {}


class DetectHandler(BaseNodeHandler):
    """
    AI block: object detection with YOLO.
    Receives an image from an upstream input block, runs YOLO,
    and returns the detected objects plus an annotated image.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        # Batched-video fast path: the native loop already ran inference for
        # this frame and stashed the result under a token.
        token = config.get("_det_token")
        if token:
            out = _batch_cache.pop(str(token), None)
            if out is not None:
                return out

        # Find an image in any upstream output
        image_data = None
        for value in inputs.values():
            if isinstance(value, dict) and value.get("image"):
                image_data = value["image"]
                break

        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")

        # "" / "auto" → pick the best size for the hardware (m on GPU, n on CPU)
        model_name = config.get("model") or auto_model()
        if model_name == "auto":
            model_name = auto_model()
        confidence = float(config.get("confidence", 0.25))
        imgsz_setting = config.get("imgsz", "fast")

        # Run heavy inference in a thread so the event loop stays responsive
        return await asyncio.to_thread(
            _run_detection, image_data, model_name, confidence, imgsz_setting
        )
