import asyncio
import colorsys
from PIL import Image
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image


def _color_name(r: int, g: int, b: int) -> str:
    """Map an RGB value to a coarse Thai colour name via HSV."""
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if v < 0.15:
        return "ดำ"
    if s < 0.12:
        return "ขาว" if v > 0.85 else "เทา"
    hd = h * 360
    if hd < 15 or hd >= 345:
        return "แดง"
    if hd < 45:
        return "ส้ม"
    if hd < 70:
        return "เหลือง"
    if hd < 160:
        return "เขียว"
    if hd < 200:
        return "ฟ้า"
    if hd < 255:
        return "น้ำเงิน"
    if hd < 290:
        return "ม่วง"
    return "ชมพู"


def _run(image_data: str) -> dict:
    img = decode_image(image_data).resize((96, 96))

    # Reduce to a small palette, then take the most-used colour as "dominant"
    q = img.quantize(colors=5, method=Image.Quantize.MEDIANCUT)
    palette = q.getpalette()
    top_index = max(q.getcolors(), key=lambda c: c[0])[1]
    r, g, b = palette[top_index * 3: top_index * 3 + 3]

    hex_val = f"#{r:02x}{g:02x}{b:02x}"
    name = _color_name(r, g, b)
    swatch = Image.new("RGB", (160, 90), (r, g, b))

    return {
        "image": encode_image(swatch),   # solid swatch for Display
        "color": hex_val,
        "hex": hex_val,
        "rgb": {"r": r, "g": g, "b": b},
        "name": name,
        "value": hex_val,
        "text": f"{name} {hex_val}",
    }


class ColorDetectHandler(BaseNodeHandler):
    """AI block: find the dominant colour in an image (hex + Thai name)."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        return await asyncio.to_thread(_run, image_data)
