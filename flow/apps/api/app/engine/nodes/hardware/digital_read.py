"""arduino_digital_read — sample a digital input pin (button / switch)."""
from __future__ import annotations

from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.hardware._shared import to_bool
from app.extensions.arduino import get_manager


class ArduinoDigitalReadHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        pin = int(config.get("pin", 7))
        # The frontend stores invert as the string "true"/"false" (it's a
        # <select>), so the naive bool() cast would treat "false" as truthy.
        invert = to_bool(config.get("invert", False))

        mgr = get_manager()
        if not mgr.is_connected:
            return {"ok": False, "error": "Arduino not connected", "pin": pin, "value": False, "result": False}

        try:
            v = mgr.read_digital(pin)
        except Exception as e:
            return {"ok": False, "error": str(e), "pin": pin, "value": False, "result": False}

        # Until the first sample arrives, pyfirmata returns None. Treat as LOW
        # to keep downstream logic deterministic.
        on = False if v is None else bool(v)
        if invert:
            on = not on

        return {
            "ok": True,
            "pin": pin,
            "value": on,
            "result": on,            # so logic_gate / if_else pick it up
            "text": "HIGH" if on else "LOW",
        }
