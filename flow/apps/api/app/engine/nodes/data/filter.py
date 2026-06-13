"""Filter rows of an upstream Data Table by a condition on one column.

Outputs the same {headers, rows, data, text, count} shape as Data Table, so
Display renders it as a table and Read/Aggregate can chain off it.

Operators:  =  !=  >  <  >=  <=   (numeric where possible, else string)
            contains   starts   ends   (case-insensitive)
"""
from app.engine.nodes.base import BaseNodeHandler


def _find_table(inputs: dict):
    for v in inputs.values():
        if isinstance(v, dict) and isinstance(v.get("headers"), list) and isinstance(v.get("rows"), list):
            return v["headers"], v["rows"]
    return None, None


def _to_num(v):
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def _matches(cell, op: str, value: str) -> bool:
    op = (op or "=").strip()
    target = (value or "").strip()
    cs = "" if cell is None else str(cell)

    if op in (">", "<", ">=", "<="):
        an, bn = _to_num(cell), _to_num(target)
        if an is None or bn is None:
            return False
        return (an > bn if op == ">" else an < bn if op == "<"
                else an >= bn if op == ">=" else an <= bn)

    if op == "contains":
        return target.lower() in cs.lower()
    if op == "starts":
        return cs.lower().startswith(target.lower())
    if op == "ends":
        return cs.lower().endswith(target.lower())

    # Equality: number-aware when both sides parse as numbers
    an, bn = _to_num(cell), _to_num(target)
    if an is not None and bn is not None:
        return (an == bn) if op == "=" else (an != bn)
    eq = cs.strip().lower() == target.lower()
    return eq if op == "=" else not eq


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        s = f"{v:.4f}".rstrip("0").rstrip(".")
        return s or "0"
    return str(v)


class FilterHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        headers, rows = _find_table(inputs)
        if headers is None:
            return {"headers": [], "rows": [], "data": [], "count": 0,
                    "text": "", "result": False, "error": "ต่อบล็อกตารางข้อมูลเข้ามาก่อน"}

        col = str(config.get("column", "")).strip()
        op = str(config.get("operator", "=")).strip() or "="
        value = str(config.get("value", "")).strip()

        if col in headers:
            cidx = headers.index(col)
        elif col == "":
            cidx = 0
        else:
            try:
                cidx = int(col)
            except (TypeError, ValueError):
                cidx = 0

        out_rows: list = []
        for r in rows:
            if not isinstance(r, list):
                continue
            cell = r[cidx] if 0 <= cidx < len(r) else None
            if _matches(cell, op, value):
                out_rows.append(r)

        data = [
            {headers[i] if i < len(headers) else f"col{i + 1}": (r[i] if i < len(r) else None)
             for i in range(max(len(headers), len(r)))}
            for r in out_rows
        ]
        lines = ["\t".join(headers)]
        for r in out_rows:
            lines.append("\t".join(_fmt(x) for x in r))
        text = "\n".join(lines)

        return {
            "headers": headers,
            "rows": out_rows,
            "data": data,
            "count": len(out_rows),
            "text": text,
            "result": len(out_rows) > 0,
        }
