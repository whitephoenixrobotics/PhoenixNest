"""Read one cell from a Data Table and cast it to a type for downstream use.

Pick a column (by header) and a row (last / first / a specific index), choose a
type (text / number / boolean), and the value is emitted as `value` (number),
`text` (string) and `result`/`on` (boolean) so it plugs into If, Compare, Math,
Display, etc.
"""
from app.engine.nodes.base import BaseNodeHandler


def _find_table(inputs: dict):
    for v in inputs.values():
        if isinstance(v, dict) and isinstance(v.get("headers"), list) and isinstance(v.get("rows"), list):
            return v["headers"], v["rows"]
    return None, None


def _to_number(v):
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def _to_bool(v) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    s = str(v).strip().lower()
    if s in ("true", "1", "yes", "on", "y", "จริง", "ใช่"):
        return True
    if s in ("false", "0", "no", "off", "n", "", "เท็จ", "ไม่"):
        return False
    return True  # any other non-empty text → truthy


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        s = f"{v:.4f}".rstrip("0").rstrip(".")
        return s or "0"
    return str(v)


class TableReadHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        headers, rows = _find_table(inputs)
        base = {"value": 0.0, "text": "", "result": False, "on": False,
                "raw": None, "headers": headers or [], "count": len(rows or [])}
        if headers is None:
            return {**base, "error": "ต่อบล็อกตารางข้อมูลเข้ามาก่อน"}
        if not rows:
            return {**base, "error": "ตารางยังไม่มีข้อมูล"}

        # ── select row ──
        rowsel = str(config.get("row", "last"))
        if rowsel == "first":
            ridx = 0
        elif rowsel == "index":
            try:
                ridx = int(config.get("rowIndex", 0))
            except (TypeError, ValueError):
                ridx = 0
            if ridx < 0:
                ridx = len(rows) + ridx
        else:  # last
            ridx = len(rows) - 1
        ridx = max(0, min(ridx, len(rows) - 1))
        row = rows[ridx] if isinstance(rows[ridx], list) else []

        # ── select column (by header name, else by index) ──
        col = str(config.get("column", "")).strip()
        if col == "":
            cidx = 0
        elif col in headers:
            cidx = headers.index(col)
        else:
            try:
                cidx = int(col)
            except (TypeError, ValueError):
                cidx = 0
        raw = row[cidx] if 0 <= cidx < len(row) else None

        # ── cast to the chosen type ──
        typ = str(config.get("type", "text"))
        num = _to_number(raw)
        if typ == "number":
            value = num if num is not None else 0.0
            text = _fmt(value)
            result = value != 0
        elif typ == "boolean":
            result = _to_bool(raw)
            value = 1.0 if result else 0.0
            text = "true" if result else "false"
        else:  # text
            text = _fmt(raw)
            value = num if num is not None else 0.0
            result = bool(text)

        return {
            "value": value,
            "text": text,
            "result": result,
            "on": result,
            "raw": raw,
            "headers": headers,
            "row_index": ridx,
            "count": len(rows),
        }
