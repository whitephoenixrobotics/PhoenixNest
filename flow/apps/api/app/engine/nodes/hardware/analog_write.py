"""arduino_analog_write — PWM output (0..255 from the user's POV).

Input is normalised — accept 0..1 floats *or* 0..255 ints by auto-detecting
the range. Output to pyfirmata is always 0.0..1.0.
"""
from __future__ import annotations

from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.hardware._shared import first_input_value, to_float
from app.extensions.arduino import get_manager


# UNO PWM-capable pins (~ marked on the silkscreen)
PWM_PINS = {3, 5, 6, 9, 10, 11}


class ArduinoAnalogWriteHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        pin = int(config.get("pin", 9))
        if pin not in PWM_PINS:
            return {
                "ok": False,
                "error": f"pin {pin} ไม่รองรับ PWM (ใช้พินที่มีเครื่องหมาย ~ บนบอร์ด: {sorted(PWM_PINS)})",
                "pin": pin,
                "value": 0,
            }

        mgr = get_manager()
        if not mgr.is_connected:
            return {"ok": False, "error": "Arduino not connected", "pin": pin, "value": 0}

        raw = first_input_value(inputs)
        v = to_float(raw, default=float(config.get("default", 0)))

        # Auto-detect 0..1 vs 0..255 by magnitude. Frontend config can also lock
        # the scale by setting `scale: "0-1"` or `"0-255"`.
        scale = config.get("scale", "auto")
        if scale == "0-255" or (scale == "auto" and v > 1.0):
            normalised = max(0.0, min(1.0, v / 255.0))
            display = int(round(v))
        else:
            normalised = max(0.0, min(1.0, v))
            display = int(round(normalised * 255))

        try:
            await mgr.awrite_pwm(pin, normalised)
        except Exception as e:
            return {"ok": False, "error": str(e), "pin": pin, "value": display}

        return {"ok": True, "pin": pin, "value": display, "duty": round(normalised, 3)}
