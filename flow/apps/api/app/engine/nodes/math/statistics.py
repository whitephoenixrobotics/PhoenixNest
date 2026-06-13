"""Statistics — avg / min / max / sum / count / median over the inputs.

Gathers numbers from every connected input (a numeric list field like `counts`
expands into its items), then reduces them with the chosen operation.
"""
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.math._num import numbers_from, fmt, finite


class StatisticsHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        op = str(config.get("op", "avg"))

        nums: list[float] = []
        for v in inputs.values():
            nums.extend(numbers_from(v))

        n = len(nums)
        if n == 0:
            value = 0.0
        elif op == "sum":
            value = sum(nums)
        elif op == "min":
            value = min(nums)
        elif op == "max":
            value = max(nums)
        elif op == "count":
            value = float(n)
        elif op == "median":
            s = sorted(nums)
            mid = n // 2
            value = s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2
        else:  # avg
            value = sum(nums) / n

        value = finite(value)  # sum of huge finite values can overflow to inf
        return {
            "value": value,
            "count": n,
            "op": op,
            "text": fmt(value),
        }
