from app.engine.nodes.base import BaseNodeHandler


class ButtonHandler(BaseNodeHandler):
    """Momentary button — True only while pressed (frontend toggles 'pressed')."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        pressed = bool(config.get("pressed", False))
        return {
            "result": pressed,
            "on": pressed,
            "text": "กด" if pressed else "ปล่อย",
        }
