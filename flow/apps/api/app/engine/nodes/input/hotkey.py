from app.engine.nodes.base import BaseNodeHandler


class HotkeyHandler(BaseNodeHandler):
    """Keyboard hotkey — frontend listens and toggles 'pressed' in config."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        pressed = bool(config.get("pressed", False))
        key = str(config.get("key", "Space"))
        return {
            "result": pressed,
            "on": pressed,
            "key": key,
            "text": key if pressed else "",
        }
