import asyncio
from PIL import Image
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image


class ImageEditHandler(BaseNodeHandler):
    """
    Base for image-editing blocks.
    Subclasses implement process(img, config) -> PIL.Image and set `label`.
    """

    label: str = "edit"

    def process(self, img: Image.Image, config: dict) -> Image.Image:  # noqa: D401
        raise NotImplementedError

    async def execute(self, config: dict, inputs: dict) -> dict:
        data = find_input_image(inputs)
        if not data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")

        def _run() -> str:
            img = decode_image(data)
            out = self.process(img, config)
            # Lossless between edit blocks — chained edits don't degrade.
            return encode_image(out, lossless=True)

        image_url = await asyncio.to_thread(_run)
        return {"image": image_url, "text": f"{self.label} ✓"}


def _f(config: dict, key: str, default: float) -> float:
    """Safely read a float config value (config inputs may arrive as strings)."""
    try:
        return float(config.get(key, default))
    except (TypeError, ValueError):
        return default
