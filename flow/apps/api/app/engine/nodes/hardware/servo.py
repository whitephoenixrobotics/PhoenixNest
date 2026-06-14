"""arduino_servo — drive a hobby servo (0..180 degrees)."""
from __future__ import annotations

from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.hardware._shared import first_input_value, to_float
from app.extensions.arduino import get_manager


class ArduinoServoHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        pin = int(config.get("pin", 9))
        # Optional safety clamp — some servos can't physically swing 0-180.
        min_angle = float(config.get("min_angle", 0))
        max_angle = float(config.get("max_angle", 180))

        mgr = get_manager()
        if not mgr.is_connected:
            return {"ok": False, "error": "Arduino not connected", "pin": pin, "angle": 0}

        raw = first_input_value(inputs)
        angle = to_float(raw, default=float(config.get("default", 90)))
        angle = max(min_angle, min(max_angle, angle))

        try:
            await mgr.awrite_servo(pin, angle)
        except Exception as e:
            return {"ok": False, "error": str(e), "pin": pin, "angle": angle}

        return {"ok": True, "pin": pin, "angle": round(angle, 1)}
