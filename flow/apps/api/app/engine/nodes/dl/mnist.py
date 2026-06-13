import os
import asyncio
import threading
import urllib.request
import numpy as np
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, find_input_image

_MODEL_DIR = os.path.expanduser("~/.cache/phoenix-flow")
_PATH = os.path.join(_MODEL_DIR, "mnist-12.onnx")
_URL = (
    "https://media.githubusercontent.com/media/onnx/models/main/validated/"
    "vision/classification/mnist/model/mnist-12.onnx"
)
_net = None
_lock = threading.Lock()


def _get_net():
    global _net
    if _net is None:
        with _lock:
            if _net is None:
                import cv2
                if not os.path.exists(_PATH) or os.path.getsize(_PATH) < 5000:
                    os.makedirs(_MODEL_DIR, exist_ok=True)
                    print("[MNIST] downloading model...", flush=True)
                    urllib.request.urlretrieve(_URL, _PATH)
                _net = cv2.dnn.readNetFromONNX(_PATH)
    return _net


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / e.sum()


def _run(image_data: str) -> dict:
    import cv2

    img = decode_image(image_data)
    gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)

    # MNIST expects a WHITE digit on a BLACK background. A photo/drawing is
    # usually dark ink on light paper, so invert when the background is light.
    if gray.mean() > 127:
        gray = 255 - gray
    # Thicken strokes a little so thin pen lines look more like MNIST data
    gray = cv2.dilate(gray, np.ones((3, 3), np.uint8), iterations=1)

    small = cv2.resize(gray, (28, 28)).astype(np.float32)
    net = _get_net()
    net.setInput(small.reshape(1, 1, 28, 28))
    probs = _softmax(net.forward().flatten())
    digit = int(np.argmax(probs))

    return {
        "digit": digit,
        "value": digit,                       # numeric → feed Math / If
        "confidence": round(float(probs[digit]), 2),
        "text": f"เลข {digit}",
    }


class MnistHandler(BaseNodeHandler):
    """Deep Learning block: handwritten digit recognition (MNIST CNN, ONNX)."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        return await asyncio.to_thread(_run, image_data)
