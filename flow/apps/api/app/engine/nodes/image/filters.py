from PIL import Image, ImageOps, ImageFilter
from app.engine.nodes.image._base import ImageEditHandler, _f


class GrayscaleHandler(ImageEditHandler):
    label = "Grayscale"

    def process(self, img: Image.Image, config: dict) -> Image.Image:
        # Convert to grayscale but keep 3 channels so downstream stays RGB
        return ImageOps.grayscale(img).convert("RGB")


class InvertHandler(ImageEditHandler):
    label = "Invert"

    def process(self, img: Image.Image, config: dict) -> Image.Image:
        return ImageOps.invert(img)


class BlurHandler(ImageEditHandler):
    label = "Blur"

    def process(self, img: Image.Image, config: dict) -> Image.Image:
        radius = _f(config, "radius", 2.0)
        return img.filter(ImageFilter.GaussianBlur(radius=radius))
