from app.engine.nodes.base import BaseNodeHandler


def _to_text(v: dict) -> str:
    """Extract a comparable text value from any upstream output."""
    if "text" in v: return str(v["text"])
    if "name" in v: return str(v["name"])
    if "label" in v: return str(v["label"])
    if "count" in v: return str(v["count"])
    return ""


class CompareHandler(BaseNodeHandler):
    """
    Compare 2 inputs (a, b) by string equality, contains, or numeric.
    Operators: '=', '!=', 'contains', '>', '<'
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        op = config.get("operator", "=")
        # Static value can be entered instead of plugging in input B
        static_b = str(config.get("value", "")).strip()

        # Pull inputs by handle, falling back to first 2 dicts found
        a_val = inputs.get("a")
        b_val = inputs.get("b")
        if a_val is None or b_val is None:
            dicts = [v for v in inputs.values() if isinstance(v, dict)]
            a_val = a_val if a_val is not None else (dicts[0] if dicts else {})
            b_val = b_val if b_val is not None else (dicts[1] if len(dicts) > 1 else None)

        a_txt = _to_text(a_val) if isinstance(a_val, dict) else str(a_val or "")
        b_txt = (_to_text(b_val) if isinstance(b_val, dict) else str(b_val or "")) if b_val is not None else static_b

        result = False
        if op == "=":
            result = a_txt.strip().lower() == b_txt.strip().lower()
        elif op == "!=":
            result = a_txt.strip().lower() != b_txt.strip().lower()
        elif op == "contains":
            result = b_txt.strip().lower() in a_txt.lower() if b_txt.strip() else False
        elif op in (">", "<", ">=", "<="):
            try:
                an, bn = float(a_txt), float(b_txt)
                result = (
                    an > bn if op == ">" else
                    an < bn if op == "<" else
                    an >= bn if op == ">=" else
                    an <= bn
                )
            except ValueError:
                result = False

        return {
            "result": result,
            "on": result,
            "a": a_txt,
            "b": b_txt,
            "text": "True" if result else "False",
        }
