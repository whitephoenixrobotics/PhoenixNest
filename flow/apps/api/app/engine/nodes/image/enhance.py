from PIL import Image, ImageEnhance
from app.engine.nodes.image._base import ImageEditHandler, _f


class BrightnessHandler(ImageEditHandler):
    label = "Brightness"

    def process(self, img: Image.Image, config: dict) -> Image.Image:
        return ImageEnhance.Brightness(img).enhance(_f(config, "factor", 1.2))


class ContrastHandler(ImageEditHandler):
    label = "Contrast"

    def process(self, img: Image.Image, config: dict) -> Image.Image:
        return ImageEnhance.Contrast(img).enhance(_f(config, "factor", 1.2))


class SaturationHandler(ImageEditHandler):
    label = "Saturation"

    def process(self, img: Image.Image, config: dict) -> Image.Image:
        return ImageEnhance.Color(img).enhance(_f(config, "factor", 1.2))


class SharpenHandler(ImageEditHandler):
    label = "Sharpen"

    def process(self, img: Image.Image, config: dict) -> Image.Image:
        return ImageEnhance.Sharpness(img).enhance(_f(config, "factor", 2.0))
