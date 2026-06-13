"""Shared helpers for Arduino-output handlers.

`_first_truthy` walks the incoming-handle map and returns the first non-None
value; mirrors the convention used by other input-driven blocks in the engine.
"""
from __future__ import annotations
from typing import Any


def first_input_value(inputs: dict) -> Any:
    """Return the first non-None payload from upstream nodes.

    Each `inputs` value is the upstream node's output dict; we walk its values
    looking for a usable payload (number/bool/string).
    """
    for handle, payload in inputs.items():
        if payload is None:
            continue
        if isinstance(payload, dict):
            # Common output keys, in priority order.
            for k in ("value", "result", "number", "n", "on", "out"):
                if k in payload and payload[k] is not None:
                    return payload[k]
            # fall back to first non-None value in the dict
            for v in payload.values():
                if v is not None:
                    return v
        else:
            return payload
    return None


def to_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "on", "yes", "high")
    return bool(v)


def to_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default
