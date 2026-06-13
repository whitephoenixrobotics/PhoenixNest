"""Data Table — accumulate rows of values pulled from upstream blocks.

Each column has a header and a `field` selecting which upstream value to
capture. `field` defaults to value1, value2, … so it pairs directly with a
multi-path JSON Extract (its `values[]` become the columns in order). Rows live
in config.rows (persisted with the flow); the UI's "บันทึกแถว" button appends
the current row.
"""
import json
from datetime import datetime
from app.engine.nodes.base import BaseNodeHandler


def _namespace(inputs: dict) -> dict:
    """Flatten upstream outputs into one {name: value} lookup.

    Exposes a JSON Extract's `values[]` as value1, value2, … (+ value = value1),
    plus every top-level field of each upstream output (text, value, raw, …).
    """
    ns: dict = {}
    for v in inputs.values():
        if not isinstance(v, dict):
            continue
        vals = v.get('values')
        if isinstance(vals, list):
            for i, x in enumerate(vals, start=1):
                ns.setdefault(f'value{i}', x)
            if vals:
                ns.setdefault('value', vals[0])
        for k, val in v.items():
            if k == 'values':
                continue
            ns.setdefault(k, val)
    return ns


def _fmt(v) -> str:
    if v is None:
        return ''
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, float):
        s = f'{v:.4f}'.rstrip('0').rstrip('.')
        return s or '0'
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def _scalar(v):
    """Keep only table-friendly scalars; collapse dicts/lists to a JSON string."""
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    return _fmt(v)


def _trigger(inputs: dict) -> bool:
    for v in inputs.values():
        if isinstance(v, dict) and (v.get('result') or v.get('fetched') or v.get('on')):
            return True
    return False


class DataTableHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        columns = config.get('columns') or []
        headers = [
            str((c or {}).get('header') or '').strip() or f'คอลัมน์ {i + 1}'
            for i, c in enumerate(columns)
        ]
        rows = config.get('rows')
        if not isinstance(rows, list):
            rows = []

        # Current row captured from upstream (what "บันทึกแถว" would append).
        # Special fields are computed here so a column can be a running number
        # or a timestamp instead of an upstream value.
        ns = _namespace(inputs)
        now = datetime.now()
        next_no = len(rows) + 1
        current = []
        for i, c in enumerate(columns):
            field = str((c or {}).get('field') or '').strip() or f'value{i + 1}'
            low = field.lower()
            if low in ('#', 'no', 'index', 'ลำดับ'):
                current.append(next_no)                       # running number
            elif low == 'time':
                current.append(now.strftime('%H:%M:%S'))
            elif low == 'date':
                current.append(now.strftime('%Y-%m-%d'))
            elif low in ('datetime', 'now', 'timestamp'):
                current.append(now.strftime('%Y-%m-%d %H:%M:%S'))
            else:
                current.append(_scalar(ns.get(field)))

        # Tab-separated text for Display + structured data for downstream
        lines = []
        if headers:
            lines.append('\t'.join(headers))
        for r in rows:
            cells = r if isinstance(r, list) else []
            lines.append('\t'.join(_fmt(x) for x in cells))
        text = '\n'.join(lines)

        data = []
        for r in rows:
            cells = r if isinstance(r, list) else []
            data.append({
                (headers[i] if i < len(headers) else f'col{i + 1}'): (cells[i] if i < len(cells) else None)
                for i in range(max(len(headers), len(cells)))
            })

        return {
            'headers': headers,
            'rows': rows,
            'current': current,
            'count': len(rows),
            'text': text,
            'data': data,
            'result': _trigger(inputs),
        }
