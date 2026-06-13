"""Math Function — apply one unary function to a numeric input.

√, x², xⁿ, |x|, round/floor/ceil, sin/cos/tan, log/ln/exp, 1/x, −x.
Domain errors (√ of a negative, log of ≤0, 1/0) return 0 instead of raising.
"""
import math
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.math._num import to_number, fmt, finite

_TRIG = {"sin", "cos", "tan"}


class MathFunctionHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        func = str(config.get("func", "sqrt"))
        n = to_number(config.get("n", 2))
        deg = bool(config.get("deg", True))

        # First numeric input wins
        x = 0.0
        for v in inputs.values():
            x = to_number(v)
            break

        try:
            if func == "sqrt":
                value = math.sqrt(x) if x >= 0 else 0.0
            elif func == "sq":
                value = x * x
            elif func == "pow":
                value = x ** n
            elif func == "abs":
                value = abs(x)
            elif func == "round":
                value = float(round(x))
            elif func == "floor":
                value = float(math.floor(x))
            elif func == "ceil":
                value = float(math.ceil(x))
            elif func in _TRIG:
                ang = math.radians(x) if deg else x
                # tan is undefined at its asymptotes (cos≈0, e.g. 90°, 270°);
                # report ∞ instead of a meaningless ~1e16 from float error.
                if func == "tan" and abs(math.cos(ang)) < 1e-12:
                    return {"value": 0.0, "input": x, "func": func, "text": "∞ (ไม่นิยาม)", "undefined": True}
                value = {"sin": math.sin, "cos": math.cos, "tan": math.tan}[func](ang)
            elif func == "log10":
                value = math.log10(x) if x > 0 else 0.0
            elif func == "ln":
                value = math.log(x) if x > 0 else 0.0
            elif func == "exp":
                value = math.exp(x)
            elif func == "inv":
                value = 1.0 / x if x != 0 else 0.0
            elif func == "neg":
                value = -x
            else:
                value = x
        except (ValueError, OverflowError, ZeroDivisionError):
            value = 0.0

        # x*x can overflow to inf silently (only ** raises OverflowError);
        # non-finite floats break JSON downstream.
        value = finite(value)
        # Tidy tiny float dust (e.g. cos(90°) ≈ 6e-17)
        if abs(value) < 1e-12:
            value = 0.0

        return {
            "value": value,
            "input": x,
            "func": func,
            "text": fmt(value),
        }
