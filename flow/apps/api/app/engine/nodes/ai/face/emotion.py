import os
import asyncio
import threading
import urllib.request
import numpy as np
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image
from app.engine.nodes.ai.face._engine import detect_faces

_MODEL_DIR = os.path.expanduser("~/.cache/phoenix-flow")
_PATH = os.path.join(_MODEL_DIR, "enet_b0_8_best_vgaf.onnx")
# HSEmotion EfficientNet-B0 (AffectNet-8) — much stronger than the 2017 FER+
# model this block used before (color 224px input vs 64px grayscale).
_URL = (
    "https://github.com/av-savchenko/face-emotion-recognition/raw/main/"
    "models/affectnet_emotions/onnx/enet_b0_8_best_vgaf.onnx"
)

# HSEmotion output order (AffectNet-8, alphabetical)
_EMO_TH = ["โกรธ", "ดูถูก", "ขยะแขยง", "กลัว", "มีความสุข", "เฉยๆ", "เศร้า", "ประหลาดใจ"]
_EMO_EMOJI = ["😠", "😏", "🤢", "😨", "😄", "😐", "😢", "😲"]
_EMO_EN = ["angry", "contempt", "disgust", "fear", "happy", "neutral", "sad", "surprise"]

_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_session = None
_lock = threading.Lock()


def _get_session():
    global _session
    if _session is None:
        with _lock:
            if _session is None:
                import onnxruntime as ort
                if not os.path.exists(_PATH) or os.path.getsize(_PATH) < 1_000_000:
                    os.makedirs(_MODEL_DIR, exist_ok=True)
                    print("[Emotion] downloading HSEmotion model...", flush=True)
                    urllib.request.urlretrieve(_URL, _PATH)
                    print("[Emotion] HSEmotion ready", flush=True)
                _session = ort.InferenceSession(_PATH, providers=["CPUExecutionProvider"])
    return _session


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / e.sum()


def _classify_face(rgb_crop: np.ndarray) -> np.ndarray:
    """Probabilities over the 8 emotions for one RGB face crop."""
    import cv2
    face = cv2.resize(rgb_crop, (224, 224)).astype(np.float32) / 255.0
    face = (face - _IMAGENET_MEAN) / _IMAGENET_STD
    blob = face.transpose(2, 0, 1)[None]            # 1x3x224x224
    sess = _get_session()
    logits = sess.run(None, {sess.get_inputs()[0].name: blob})[0].flatten()
    return _softmax(logits)


_HAPPY_INDEX = _EMO_EN.index("happy")


def happy_probability(pil_img) -> float | None:
    """P(happy) for the largest face in the image, or None if no face.

    Reused by the Smile block — a CNN expression read is far more robust than
    mouth-landmark geometry (handles open/closed smiles, angles, lighting).
    """
    arr = np.array(pil_img)
    _lm, bboxes = detect_faces(pil_img)
    if not bboxes:
        return None
    ih, iw = arr.shape[:2]
    x, y, w, h = max(bboxes, key=lambda b: b[2] * b[3])
    pad = int(0.1 * max(w, h))
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(iw, x + w + pad), min(ih, y + h + pad)
    crop = arr[y0:y1, x0:x1]
    if crop.size == 0:
        return None
    return float(_classify_face(crop)[_HAPPY_INDEX])


def _run(image_data: str) -> dict:
    import cv2
    from PIL import Image

    img = decode_image(image_data)
    _landmarks, bboxes = detect_faces(img)
    arr = np.array(img)  # RGB

    if not bboxes:
        return {"emotion": None, "emoji": "", "confidence": 0.0,
                "faces": [], "count": 0, "image": encode_image(img),
                "text": "ไม่พบใบหน้า"}

    ih, iw = arr.shape[:2]
    bgr = arr[:, :, ::-1].copy()
    faces_out: list[dict] = []

    for (x, y, w, h) in bboxes:
        # Small margin around the face helps the AffectNet-trained model
        pad = int(0.1 * max(w, h))
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(iw, x + w + pad), min(ih, y + h + pad)
        crop = arr[y0:y1, x0:x1]
        if crop.size == 0:
            continue
        probs = _classify_face(crop)
        idx = int(np.argmax(probs))
        faces_out.append({
            "emotion": _EMO_TH[idx],
            "emoji": _EMO_EMOJI[idx],
            "confidence": round(float(probs[idx]), 2),
        })
        cv2.rectangle(bgr, (x, y), (x + w, y + h), (0, 200, 255), 2)
        cv2.putText(bgr, _EMO_EN[idx], (x, max(18, y - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 255), 2)

    top = faces_out[0] if faces_out else None
    return {
        "image": encode_image(Image.fromarray(bgr[:, :, ::-1])),
        "emotion": top["emotion"] if top else None,
        "emoji": top["emoji"] if top else "",
        "confidence": top["confidence"] if top else 0.0,
        "faces": faces_out,
        "count": len(faces_out),
        "text": f"{top['emoji']} {top['emotion']}" if top else "ไม่พบใบหน้า",
    }


class EmotionHandler(BaseNodeHandler):
    """AI · face block: facial emotion recognition (HSEmotion ONNX)."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        return await asyncio.to_thread(_run, image_data)
