from app.engine.nodes.base import BaseNodeHandler


class ImageUploadHandler(BaseNodeHandler):
    """
    Input source: an image uploaded from the user's machine.
    The image is captured in the browser and stored as a base64 data URL
    in the node config. This handler simply emits it downstream.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        image = config.get("image")
        if not image:
            raise ValueError("ยังไม่ได้อัปโหลดภาพ (No image uploaded)")

        return {
            "image": image,                       # base64 data URL
            "mime": config.get("mime", "image/png"),
            "filename": config.get("filename", ""),
            "source": "upload",
        }
