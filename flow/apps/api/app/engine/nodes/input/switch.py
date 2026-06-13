from app.engine.nodes.base import BaseNodeHandler


class SwitchHandler(BaseNodeHandler):
    """Boolean source — outputs the switch's on/off state."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        on = bool(config.get("on", False))
        return {
            "result": on,
            "on": on,
            "text": "ON" if on else "OFF",
        }
