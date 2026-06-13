"""Clamp — keep a value within [min, max]."""
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.math._num import to_number, fmt


class ClampHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        lo = to_number(config.get("min", 0))
        hi = to_number(config.get("max", 100))
        if lo > hi:
            lo, hi = hi, lo

        x = 0.0
        for v in inputs.values():
            x = to_number(v)
            break

        value = max(lo, min(hi, x))
        return {
            "value": value,
            "input": x,
            "clamped": value != x,
            "text": fmt(value),
        }
