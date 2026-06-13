"""Map Range — remap a value from one range to another.

e.g. a sensor 0–1023 → 0–100%. Optionally clamps the result to the output
range so out-of-range inputs don't overshoot.
"""
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.math._num import to_number, fmt, finite


class MapRangeHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        in_min = to_number(config.get("in_min", 0))
        in_max = to_number(config.get("in_max", 100))
        out_min = to_number(config.get("out_min", 0))
        out_max = to_number(config.get("out_max", 1))
        clamp = bool(config.get("clamp", True))

        x = 0.0
        for v in inputs.values():
            x = to_number(v)
            break

        span = in_max - in_min
        t = 0.0 if span == 0 else (x - in_min) / span
        if clamp:
            t = max(0.0, min(1.0, t))
        value = finite(out_min + t * (out_max - out_min))

        return {
            "value": value,
            "input": x,
            "text": fmt(value),
        }
