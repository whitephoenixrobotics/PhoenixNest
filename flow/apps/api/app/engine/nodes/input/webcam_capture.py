from app.engine.nodes.base import BaseNodeHandler


class WebcamCaptureHandler(BaseNodeHandler):
    """
    Input source: a still frame captured from the user's webcam/camera.
    The frame is grabbed in the browser and stored as a base64 data URL
    in the node config. This handler simply emits it downstream.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        image = config.get("image")
        if not image:
            raise ValueError("ยังไม่ได้ถ่ายภาพจากกล้อง (No image captured)")

        return {
            "image": image,                       # base64 data URL
            "mime": config.get("mime", "image/png"),
            "source": "webcam",
        }
