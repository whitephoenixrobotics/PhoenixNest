from PIL import Image
from app.engine.nodes.image._base import ImageEditHandler, _f


class RGBAdjustHandler(ImageEditHandler):
    """Multiply each RGB channel by an independent factor (0 = remove, 1 = keep)."""

    label = "RGB Adjust"

    def process(self, img: Image.Image, config: dict) -> Image.Image:
        rf = _f(config, "r", 1.0)
        gf = _f(config, "g", 1.0)
        bf = _f(config, "b", 1.0)

        r, g, b = img.split()
        r = r.point(lambda v: max(0, min(255, int(v * rf))))
        g = g.point(lambda v: max(0, min(255, int(v * gf))))
        b = b.point(lambda v: max(0, min(255, int(v * bf))))
        return Image.merge("RGB", (r, g, b))
