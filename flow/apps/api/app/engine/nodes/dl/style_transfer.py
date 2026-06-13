import os
import asyncio
import threading
import urllib.request
import numpy as np
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image

_MODEL_DIR = os.path.expanduser("~/.cache/phoenix-flow")
_BASE = (
    "https://media.githubusercontent.com/media/onnx/models/main/validated/"
    "vision/style_transfer/fast_neural_style/model/"
)
# config value → onnx file stem
_STYLES = {
    "candy": "candy-9",
    "mosaic": "mosaic-9",
    "rain": "rain-princess-9",
    "udnie": "udnie-9",
    "pointilism": "pointilism-9",
}
_nets: dict = {}
_lock = threading.Lock()
_MAX_SIDE = 512  # downscale long edge for speed (models are fully convolutional)


def _get_net(style: str):
    stem = _STYLES.get(style, "candy-9")
    if stem not in _nets:
        with _lock:
            if stem not in _nets:
                import cv2
                p = os.path.join(_MODEL_DIR, stem + ".onnx")
                if not os.path.exists(p) or os.path.getsize(p) < 5000:
                    os.makedirs(_MODEL_DIR, exist_ok=True)
                    print(f"[Style] downloading {stem}...", flush=True)
                    urllib.request.urlretrieve(_BASE + stem + ".onnx", p)
                _nets[stem] = cv2.dnn.readNetFromONNX(p)
    return _nets[stem]


def _run(image_data: str, style: str) -> dict:
    from PIL import Image

    img = decode_image(image_data)
    w, h = img.size
    scale = min(1.0, _MAX_SIDE / max(w, h))
    if scale < 1.0:
        img = img.resize((int(w * scale), int(h * scale)))

    # fast-neural-style expects RGB, CHW, 0-255, no normalization
    arr = np.array(img).astype(np.float32)            # H,W,3 RGB
    blob = arr.transpose(2, 0, 1)[None]               # 1,3,H,W
    net = _get_net(style)
    net.setInput(blob)
    out = net.forward()[0]                            # 3,H,W
    out = np.clip(out.transpose(1, 2, 0), 0, 255).astype(np.uint8)  # H,W,3 RGB

    return {
        "image": encode_image(Image.fromarray(out)),
        "style": style,
        "text": f"สไตล์ {style}",
    }


class StyleTransferHandler(BaseNodeHandler):
    """Deep Learning block: fast neural style transfer (ONNX via OpenCV DNN)."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        style = str(config.get("style", "candy"))
        return await asyncio.to_thread(_run, image_data, style)
