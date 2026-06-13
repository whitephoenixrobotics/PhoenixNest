import io
import base64
from PIL import Image


def decode_image(data_url: str) -> Image.Image:
    """Decode a base64 data URL into a PIL RGB image."""
    raw = data_url.split(",", 1)[1] if "," in data_url else data_url
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")


def encode_image(img: Image.Image, lossless: bool = False) -> str:
    """Encode a PIL image into a base64 data URL.

    Default JPEG q=80: ~10x faster than PNG with negligible visual difference
    for a single hop — right for real-time sources (webcam, Detect overlays).
    lossless=True → PNG: used by the image-EDIT chain so stacking blocks
    (Brightness → Contrast → Sharpen) doesn't compound JPEG loss each step.
    """
    buf = io.BytesIO()
    if lossless:
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    img.save(buf, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def find_input_image(inputs: dict) -> str | None:
    """Return the first image data URL found in upstream outputs."""
    for value in inputs.values():
        if isinstance(value, dict) and value.get("image"):
            return value["image"]
    return None
