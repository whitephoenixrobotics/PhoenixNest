from app.engine.nodes.base import BaseNodeHandler


class TextInputHandler(BaseNodeHandler):
    """Simple text source — outputs whatever text is typed in the node config."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        text = str(config.get("text", ""))
        return {
            "text": text,
            "length": len(text),
        }
