from app.engine.nodes.base import BaseNodeHandler


class NumberHandler(BaseNodeHandler):
    """Numeric constant — integer or decimal."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        raw = config.get("value", 0)
        try:
            value = float(raw)
            # Show as int when there's no fractional part
            display = int(value) if value.is_integer() else round(value, 4)
        except (TypeError, ValueError):
            value = 0.0
            display = 0
        return {
            "value": value,
            "text": str(display),
        }
