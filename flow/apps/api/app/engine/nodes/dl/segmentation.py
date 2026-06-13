import asyncio
import numpy as np
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image
# Reuse the shared YOLO loader / device picker from the Detect block
from app.engine.nodes.ai.detect import _get_model, _get_device, _use_half


def _run(image_data: str, bg: str, confidence: float) -> dict:
    import cv2
    from PIL import Image

    img = decode_image(image_data)
    arr = np.array(img)            # RGB
    h, w = arr.shape[:2]

    from app.engine.nodes.ai.detect import auto_model
    model = _get_model(auto_model("-seg"))
    result = model(img, conf=confidence, verbose=False, device=_get_device(), half=_use_half())[0]

    classes: list[str] = []
    if result.masks is not None and len(result.masks) > 0:
        masks = result.masks.data.cpu().numpy()        # (N, mh, mw) 0..1
        combined = np.max(masks, axis=0)               # union of all objects
        combined = cv2.resize(combined, (w, h))
        mask = (combined > 0.5).astype(np.uint8)
        names = result.names
        classes = sorted(set(names[int(c)] for c in result.boxes.cls.cpu().numpy()))
    else:
        mask = np.zeros((h, w), np.uint8)

    # Background replacement
    if bg == "blur":
        background = cv2.GaussianBlur(arr, (0, 0), 15)
    elif bg == "black":
        background = np.zeros_like(arr)
    else:  # white
        background = np.full_like(arr, 255)

    out = np.where(mask[:, :, None] == 1, arr, background).astype(np.uint8)
    count = int(len(result.boxes)) if result.boxes is not None else 0

    return {
        "image": encode_image(Image.fromarray(out)),
        "count": count,
        "classes": classes,
        "text": f"แยก {count} วัตถุออกจากฉากหลัง" if count else "ไม่พบวัตถุ",
    }


class SegmentationHandler(BaseNodeHandler):
    """Deep Learning block: instance segmentation / background removal (YOLOv8-seg)."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        bg = str(config.get("background", "blur"))
        confidence = float(config.get("confidence", 0.25))
        return await asyncio.to_thread(_run, image_data, bg, confidence)
