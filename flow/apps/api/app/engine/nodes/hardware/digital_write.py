"""arduino_digital_write — turn a pin HIGH/LOW based on the upstream signal."""
from __future__ import annotations

from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.hardware._shared import first_input_value, to_bool
from app.extensions.arduino import get_manager


class ArduinoDigitalWriteHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        pin = int(config.get("pin", 13))
        # See digital_read.py — the panel stores invert as a "true"/"false" string.
        invert = to_bool(config.get("invert", False))

        mgr = get_manager()
        if not mgr.is_connected:
            return {"ok": False, "error": "Arduino not connected", "pin": pin, "value": False}

        v = first_input_value(inputs)
        on = to_bool(v) if v is not None else bool(config.get("default", False))
        if invert:
            on = not on

        try:
            # Submitted to the single serial-worker thread and awaited via a
            # Future bridge — never blocks the event loop, never touches the
            # shared default ThreadPoolExecutor, and rapid Auto-Run ticks
            # coalesce to the latest value (no backlog / drain-flicker).
            await mgr.awrite_digital(pin, on)
        except Exception as e:
            return {"ok": False, "error": str(e), "pin": pin, "value": on}

        return {"ok": True, "pin": pin, "value": on, "text": "HIGH" if on else "LOW"}
