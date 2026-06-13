"""Chart — surface an upstream Data Table so the node can plot it.

The drawing happens in the frontend; this handler just forwards the table's
headers + rows (like Display) so the chart node can read them from its output.
"""
from app.engine.nodes.base import BaseNodeHandler


class ChartHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        headers, rows = [], []
        for v in inputs.values():
            if isinstance(v, dict) and isinstance(v.get("headers"), list) and isinstance(v.get("rows"), list):
                headers, rows = v["headers"], v["rows"]
                break
        return {"headers": headers, "rows": rows, "count": len(rows), "displayed": True}
