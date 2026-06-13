"""Aggregate one column of an upstream Data Table → min/max/avg/sum/count/last.

Numeric ops coerce values; non-numeric cells are skipped. `count` counts
non-empty cells regardless of type; `last` returns the last non-empty value.
"""
from app.engine.nodes.base import BaseNodeHandler


def _find_table(inputs: dict):
    for v in inputs.values():
        if isinstance(v, dict) and isinstance(v.get("headers"), list) and isinstance(v.get("rows"), list):
            return v["headers"], v["rows"]
    return None, None


def _column_values(headers, rows, col: str) -> list:
    if not headers or not rows:
        return []
    if col in headers:
        idx = headers.index(col)
    else:
        try:
            idx = int(col)
        except (TypeError, ValueError):
            idx = 0
    out = []
    for r in rows:
        if isinstance(r, list) and 0 <= idx < len(r):
            out.append(r[idx])
    return out


def _to_num(v):
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        s = f"{v:.4f}".rstrip("0").rstrip(".")
        return s or "0"
    return str(v)


class AggregateHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        headers, rows = _find_table(inputs)
        op = str(config.get("op", "avg")).lower()
        col = str(config.get("column", "")).strip()

        base = {"value": 0.0, "text": "", "result": False, "on": False, "raw": None,
                "headers": headers or [], "count": 0}
        if headers is None:
            return {**base, "error": "ต่อบล็อกตารางข้อมูลเข้ามาก่อน"}

        cells = _column_values(headers, rows, col or (headers[0] if headers else ""))
        nonempty = [c for c in cells if c is not None and str(c) != ""]

        if op == "count":
            value = float(len(nonempty))
            text = _fmt(value)
            return {**base, "value": value, "text": text, "raw": int(value),
                    "result": value > 0, "on": value > 0, "count": len(rows)}

        if op == "last":
            raw = nonempty[-1] if nonempty else None
            text = _fmt(raw)
            num = _to_num(raw) if raw is not None else None
            return {**base, "value": (num if num is not None else 0.0), "text": text,
                    "raw": raw, "result": text != "", "on": text != "", "count": len(rows)}

        nums = [n for n in (_to_num(c) for c in cells) if n is not None]
        if not nums:
            return {**base, "error": "คอลัมน์นี้ไม่มีค่าที่เป็นตัวเลข", "count": len(rows)}

        if op == "min":
            v = min(nums)
        elif op == "max":
            v = max(nums)
        elif op == "sum":
            v = sum(nums)
        else:  # avg / mean
            v = sum(nums) / len(nums)
            op = "avg"

        text = _fmt(v)
        return {
            "value": v,
            "text": text,
            "raw": v,
            "result": True,
            "on": True,
            "headers": headers,
            "count": len(rows),
            "op": op,
            "column": col,
        }
