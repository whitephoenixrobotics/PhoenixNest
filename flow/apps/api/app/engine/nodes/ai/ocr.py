import asyncio
import threading
import numpy as np
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image

_reader = None
_lock = threading.Lock()


def _get_reader():
    """Lazy-init a single EasyOCR reader (Thai + English), cached across calls.

    verbose=False is REQUIRED: EasyOCR's progress bar prints the '█' glyph,
    which crashes on Windows' cp874 console (UnicodeEncodeError).
    """
    global _reader
    if _reader is None:
        with _lock:
            if _reader is None:
                import easyocr
                import torch
                gpu = torch.cuda.is_available()
                print(f"[OCR] init EasyOCR (th,en) gpu={gpu}", flush=True)
                _reader = easyocr.Reader(["th", "en"], gpu=gpu, verbose=False)
    return _reader


def _run(image_data: str) -> dict:
    from PIL import ImageDraw

    img = decode_image(image_data)
    reader = _get_reader()
    results = reader.readtext(np.array(img))  # [(bbox, text, conf), ...]

    lines: list[str] = []
    annotated = img.copy()
    draw = ImageDraw.Draw(annotated)
    for bbox, text, conf in results:
        if conf < 0.3 or not text.strip():
            continue
        lines.append(text.strip())
        pts = [(int(x), int(y)) for x, y in bbox]
        draw.line(pts + [pts[0]], fill=(0, 255, 180), width=2)

    full = "\n".join(lines)
    return {
        "image": encode_image(annotated),
        "text": full,
        "lines": lines,
        "count": len(lines),
    }


class OcrHandler(BaseNodeHandler):
    """AI block: read text from an image (EasyOCR, Thai + English)."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        return await asyncio.to_thread(_run, image_data)
