from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.math._num import finite


def _to_number(v) -> float:
    """Extract a numeric value from any upstream output."""
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, dict):
        if "value" in v:
            try: return float(v["value"])
            except (TypeError, ValueError): pass
        if "count" in v:
            try: return float(v["count"])
            except (TypeError, ValueError): pass
        if "score" in v:
            try: return float(v["score"])
            except (TypeError, ValueError): pass
        if "text" in v:
            try: return float(v["text"])
            except (TypeError, ValueError): pass
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


class MathOpHandler(BaseNodeHandler):
    """
    Arithmetic between two numeric inputs (a, b).
    Operators: +, -, *, /, %
    Division/modulo by zero return 0 instead of raising.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        op = config.get("operator", "+")

        # Pull inputs by handle, fallback to positional
        a_val = inputs.get("a")
        b_val = inputs.get("b")
        if a_val is None or b_val is None:
            dicts = list(inputs.values())
            a_val = a_val if a_val is not None else (dicts[0] if dicts else 0)
            b_val = b_val if b_val is not None else (dicts[1] if len(dicts) > 1 else 0)

        a = _to_number(a_val)
        b = _to_number(b_val)

        try:
            if op == "+": value = a + b
            elif op == "-": value = a - b
            elif op == "*": value = a * b
            elif op == "/": value = a / b if b != 0 else 0.0
            elif op == "%": value = a % b if b != 0 else 0.0
            else: value = 0.0
        except (ZeroDivisionError, OverflowError):
            value = 0.0

        # +,-,* overflow to inf silently (no exception) — inf breaks JSON downstream
        value = finite(value)
        display = int(value) if value.is_integer() else round(value, 4)

        return {
            "value": value,
            "a": a,
            "b": b,
            "operator": op,
            "text": str(display),
        }
