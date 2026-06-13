from app.engine.nodes.base import BaseNodeHandler


class DrawPadHandler(BaseNodeHandler):
    """
    Input source: a free-hand drawing made on a canvas in the browser.
    The drawing is stored as a base64 PNG data URL in the node config
    (black strokes on white — ideal for the MNIST block). Emits it downstream.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        image = config.get("image")
        if not image:
            raise ValueError("ยังไม่ได้วาดรูป (No drawing)")
        return {
            "image": image,            # base64 data URL
            "mime": "image/png",
            "source": "draw",
        }
