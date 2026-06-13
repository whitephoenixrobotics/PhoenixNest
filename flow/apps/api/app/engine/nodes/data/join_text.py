"""Build one string from a template that pulls scalar fields from upstream blocks.

Each upstream output exposes its scalar fields ({value}, {text}, {value1}, …)
and explicit input-handle aliases when wired by handle name (a, b, c, in).
Empty placeholders resolve to "" so a missing input doesn't break the message.
"""
import re
from app.engine.nodes.base import BaseNodeHandler


_PLACEHOLDER = re.compile(r'\{([^{}]+)\}')


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        s = f"{v:.4f}".rstrip("0").rstrip(".")
        return s or "0"
    return str(v)


def _is_scalar(x) -> bool:
    return isinstance(x, (str, int, float)) and not isinstance(x, bool)


def _scalar_list(val):
    """Return the list if it's a non-empty list of scalars, else None."""
    if isinstance(val, list) and val and all(_is_scalar(x) for x in val):
        return val
    return None


def _scalar(val):
    """Return a scalar string/number for a value, or None if not templatable."""
    if _is_scalar(val):
        return val
    lst = _scalar_list(val)
    if lst is not None:
        return ", ".join(str(x) for x in lst)  # e.g. Detect's classes → "cat, dog"
    return None


def _namespace(inputs: dict) -> tuple[dict, dict]:
    """Build (flat, qualified) lookups.

    flat:      {field: value} — first input wins on a name clash ({text}).
    qualified: {"Block.field": value} — disambiguates clashes ({Detect.text}).
    Each input carries its source block label in `_block` (injected by the executor).
    """
    flat: dict = {}
    qualified: dict = {}
    for v in inputs.values():
        if not isinstance(v, dict):
            continue
        block = str(v.get("_block") or "")
        vals = v.get("values")
        if isinstance(vals, list):
            for i, x in enumerate(vals, start=1):
                flat.setdefault(f"value{i}", x)
                if block:
                    qualified[f"{block}.value{i}"] = x
            if vals:
                flat.setdefault("value", vals[0])
        for k, val in v.items():
            if k == "_block":
                continue
            s = _scalar(val)
            if s is not None:
                flat.setdefault(k, s)
                if block:
                    qualified[f"{block}.{k}"] = s
            # List field → also expose each element by 1-based index: {classes.1}
            lst = _scalar_list(val)
            if lst is not None:
                for i, x in enumerate(lst, start=1):
                    flat.setdefault(f"{k}.{i}", x)
                    if block:
                        qualified[f"{block}.{k}.{i}"] = x
    if "classes" in flat:
        flat.setdefault("class", flat["classes"])
    return flat, qualified


class JoinTextHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        template = str(config.get("template", "")).strip()
        flat, qualified = _namespace(inputs)

        if not template:
            # No template → join every text-like input with the separator.
            sep = str(config.get("separator", " "))
            parts = []
            for v in inputs.values():
                if isinstance(v, dict) and v.get("text"):
                    parts.append(str(v["text"]))
            text = sep.join(parts)
        else:
            def repl(m: re.Match) -> str:
                key = m.group(1).strip()
                if key in qualified:      # {Block.field} — exact, disambiguated
                    return _fmt(qualified[key])
                if key in flat:           # {field} — short form
                    return _fmt(flat[key])
                return ""
            text = _PLACEHOLDER.sub(repl, template)

        return {
            "text": text,
            "value": float(len(text)),
            "result": bool(text),
            "on": bool(text),
        }
