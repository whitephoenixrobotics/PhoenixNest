"""Shared numeric helpers for the math blocks."""
import math


def finite(value: float) -> float:
    """Clamp NaN/±inf to 0 — non-finite floats serialize to invalid JSON
    (json.dumps emits bare `Infinity`, which browsers refuse to parse)."""
    return value if math.isfinite(value) else 0.0


def to_number(v) -> float:
    """Extract a numeric value from a raw value or an upstream output dict."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return finite(float(v))
    if isinstance(v, dict):
        for k in ("value", "count", "score", "text"):
            if k in v:
                try:
                    return finite(float(v[k]))
                except (TypeError, ValueError):
                    pass
    try:
        return finite(float(v))
    except (TypeError, ValueError):
        return 0.0


def numbers_from(v) -> list[float]:
    """All numbers carried by one input: a numeric list field if present,
    else the single resolved number. Used by Statistics."""
    if isinstance(v, dict):
        for key in ("numbers", "values", "counts", "list", "items"):
            val = v.get(key)
            if isinstance(val, list) and val and all(
                isinstance(x, (int, float)) and not isinstance(x, bool) for x in val
            ):
                return [float(x) for x in val]
    return [to_number(v)]


def fmt(value) -> str:
    """Human-friendly number: drop the .0 for integers, else round to 4 dp."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return str(value)
    if f.is_integer():
        return str(int(f))
    return str(round(f, 4))
