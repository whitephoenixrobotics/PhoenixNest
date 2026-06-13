"""arduino_analog_read — sample an analog input pin (0..1023, 10-bit ADC).

Optional `output_range` config remaps the raw value:
  - "raw"     → 0..1023 (default)
  - "0-1"     → 0.0..1.0 float
  - "voltage" → 0.0..5.0 V (assuming 5V reference)
  - "percent" → 0..100
"""
from __future__ import annotations

from app.engine.nodes.base import BaseNodeHandler
from app.extensions.arduino import get_manager


class ArduinoAnalogReadHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        pin = int(config.get("pin", 0))  # A0..A5 → 0..5
        output_range = config.get("output_range", "raw")

        mgr = get_manager()
        if not mgr.is_connected:
            return {"ok": False, "error": "Arduino not connected", "pin": pin, "value": 0, "raw": 0}

        try:
            raw = mgr.read_analog(pin)
        except Exception as e:
            return {"ok": False, "error": str(e), "pin": pin, "value": 0, "raw": 0}

        raw_value = 0 if raw is None else int(raw)

        if output_range == "0-1":
            value: float | int = round(raw_value / 1023.0, 4)
        elif output_range == "voltage":
            value = round(raw_value * 5.0 / 1023.0, 3)
        elif output_range == "percent":
            value = round(raw_value * 100.0 / 1023.0, 2)
        else:
            value = raw_value

        return {
            "ok": True,
            "pin": pin,
            "raw": raw_value,
            "value": value,
            "number": value,         # so number-driven blocks pick it up
            "text": str(value),
        }
