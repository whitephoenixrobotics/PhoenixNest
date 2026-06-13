"""
Face detection + 68-point landmarks.
  - Detection: OpenCV YuNet (DNN) — far more accurate than Haar cascade
  - Landmarks: OpenCV LBF Facemark (68 points)
Reliable on Python 3.13 (mediapipe has Windows issues there).
"""
import os
import threading
import urllib.request
import numpy as np
from PIL import Image

_lock = threading.Lock()
_yunet = None
_facemark = None
_sface = None

_MODEL_DIR = os.path.expanduser("~/.cache/phoenix-flow")
_LBF_PATH = os.path.join(_MODEL_DIR, "lbfmodel.yaml")
_YUNET_PATH = os.path.join(_MODEL_DIR, "face_detection_yunet_2023mar.onnx")
_SFACE_PATH = os.path.join(_MODEL_DIR, "face_recognition_sface_2021dec.onnx")

_LBF_URL = "https://raw.githubusercontent.com/kurnianggoro/GSOC2017/master/data/lbfmodel.yaml"
_YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
_SFACE_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_recognition_sface/face_recognition_sface_2021dec.onnx"
)


def _download(url: str, path: str, label: str):
    if not os.path.exists(path):
        os.makedirs(_MODEL_DIR, exist_ok=True)
        print(f"[Face] Downloading {label}...", flush=True)
        urllib.request.urlretrieve(url, path)
        print(f"[Face] {label} ready", flush=True)


def _get_detectors():
    global _yunet, _facemark
    if _yunet is None:
        with _lock:
            if _yunet is None:
                import cv2
                _download(_YUNET_URL, _YUNET_PATH, "YuNet detector")
                _download(_LBF_URL, _LBF_PATH, "LBF landmarks")
                _yunet = cv2.FaceDetectorYN.create(
                    _YUNET_PATH, "", (320, 320),
                    score_threshold=0.7, nms_threshold=0.3, top_k=10,
                )
                fm = cv2.face.createFacemarkLBF()
                fm.loadModel(_LBF_PATH)
                _facemark = fm
    return _yunet, _facemark


def detect_faces(pil_img: Image.Image) -> tuple[list[list[dict]], list[list[int]]]:
    """
    Returns:
      landmarks: per face → 68 landmark dicts {x, y}
      bboxes:    per face → [x, y, w, h]
    """
    import cv2
    arr = np.array(pil_img)              # RGB
    bgr = arr[:, :, ::-1]                # YuNet expects BGR
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    h, w = arr.shape[:2]

    yunet, facemark = _get_detectors()
    with _lock:
        yunet.setInputSize((w, h))
        _retval, faces = yunet.detect(np.ascontiguousarray(bgr))

    if faces is None or len(faces) == 0:
        return [], []

    # YuNet rows: [x, y, w, h, 5x(landmark x,y), score]
    rects = []
    for f in faces:
        x, y, fw, fh = int(f[0]), int(f[1]), int(f[2]), int(f[3])
        x = max(0, x); y = max(0, y)
        rects.append([x, y, fw, fh])

    rects_np = np.array(rects, dtype=np.int32)
    with _lock:
        ok, all_lms = facemark.fit(gray, rects_np)

    landmarks_out: list[list[dict]] = []
    if ok:
        for lms in all_lms:
            pts = lms[0]  # (68, 2)
            landmarks_out.append([{"x": float(p[0]), "y": float(p[1])} for p in pts])

    return landmarks_out, rects


def _get_sface():
    """Lazy-load the SFace recognizer (face-specific 128-d embeddings)."""
    global _sface
    if _sface is None:
        with _lock:
            if _sface is None:
                import cv2
                _download(_SFACE_URL, _SFACE_PATH, "SFace recognizer")
                _sface = cv2.FaceRecognizerSF.create(_SFACE_PATH, "")
    return _sface


def embed_largest_face(pil_img: Image.Image) -> np.ndarray | None:
    """128-d SFace embedding of the largest face in the image, or None.

    Uses YuNet's 5-point landmarks for alignment (alignCrop) — far more
    reliable for identity than embedding a loose crop with a generic model.
    """
    import cv2
    arr = np.array(pil_img)              # RGB
    bgr = np.ascontiguousarray(arr[:, :, ::-1])
    h, w = arr.shape[:2]

    yunet, _ = _get_detectors()
    sface = _get_sface()
    with _lock:
        yunet.setInputSize((w, h))
        _retval, faces = yunet.detect(bgr)
        if faces is None or len(faces) == 0:
            return None
        # Largest face by bbox area — YuNet row: [x,y,w,h, 5x(lm x,y), score]
        row = max(faces, key=lambda f: float(f[2]) * float(f[3]))
        aligned = sface.alignCrop(bgr, row)
        feat = sface.feature(aligned)
    v = np.asarray(feat, dtype=np.float32).reshape(-1)
    n = np.linalg.norm(v)
    return v / n if n > 0 else None


def draw_face_mesh(pil_img: Image.Image, landmarks: list[list[dict]], bboxes: list[list[int]]) -> Image.Image:
    """Draw bounding box + 68 landmarks per face."""
    import cv2
    arr = np.array(pil_img)[:, :, ::-1].copy()  # RGB -> BGR

    for (x, y, w, h) in bboxes:
        cv2.rectangle(arr, (x, y), (x + w, y + h), (255, 220, 0), 2)
    for face in landmarks:
        for p in face:
            cv2.circle(arr, (int(p["x"]), int(p["y"])), 2, (0, 255, 200), -1)

    return Image.fromarray(arr[:, :, ::-1])
