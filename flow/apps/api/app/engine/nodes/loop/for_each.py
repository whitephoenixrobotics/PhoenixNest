"""For Each — step through a list one item per advance.

The engine runs the graph once per tick, so this block is a cursor over a list:
it emits the first item when the list appears, then moves to the next item on
each rising edge of the `next` trigger (pair it with Interval to auto-step, or a
Button to step manually). With `wrap` on it loops back to the start.

Inputs (by handle):
  • list — the data block whose list field we iterate (e.g. Detect → classes)
  • next — boolean trigger; advances to the next item on a False→True edge
"""
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import read_bool
from app.engine.nodes.state_registry import register

_state: dict[str, dict] = register({})

_PREFERRED = ("list", "values", "items", "classes", "counts", "labels", "tags")


def _is_scalar(x) -> bool:
    return isinstance(x, (str, int, float)) and not isinstance(x, bool)


def _scalar_list(val):
    if isinstance(val, list) and val and all(_is_scalar(x) for x in val):
        return list(val)
    return None


def _num(x) -> float:
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        return float(x)
    try:
        return float(str(x))
    except (TypeError, ValueError):
        return 0.0


def _find_list(inputs: dict, field: str) -> list:
    """The list to iterate: an explicit field, else the first list found.

    Reads the `list` handle first (and its #2… duplicates), then any input.
    """
    dicts = [v for k, v in inputs.items()
             if isinstance(v, dict) and (k == "list" or k.startswith("list#"))]
    dicts += [v for k, v in inputs.items()
              if isinstance(v, dict) and not (k == "list" or k.startswith("list#"))]

    # A specific field was chosen → read exactly that
    if field and field != "auto":
        for d in dicts:
            lst = _scalar_list(d.get(field))
            if lst is not None:
                return lst
        return []

    # Auto: preferred field names first, then any scalar list
    for d in dicts:
        for key in _PREFERRED:
            lst = _scalar_list(d.get(key))
            if lst is not None:
                return lst
    for d in dicts:
        for v in d.values():
            lst = _scalar_list(v)
            if lst is not None:
                return lst
    return []


class ForEachHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        field = str(config.get("field", "auto"))
        wrap = bool(config.get("wrap", True))
        reset_token = config.get("reset", 0)

        items = _find_list(inputs, field)
        n = len(items)
        sig = repr(items)

        # Trigger comes only from the `next` handle (so the list source itself,
        # which may look "truthy", never advances the cursor).
        trigger = any(read_bool(v) for k, v in inputs.items()
                      if k == "next" or k.startswith("next#"))

        s = _state.setdefault(node_id, {
            "index": 0, "prev": False, "reset_token": reset_token,
            "sig": sig, "started": False,
        })
        if s["reset_token"] != reset_token:                 # user pressed reset
            s.update(index=0, prev=False, reset_token=reset_token, sig=sig, started=False)
        if s["sig"] != sig:                                  # list changed → restart
            s.update(index=0, sig=sig, started=False)

        advanced = False
        if n > 0:
            if not s["started"]:
                s["started"] = True
                s["index"] = 0
                advanced = True                              # emit the first item
            elif trigger and not s["prev"]:                  # rising edge → next
                nxt = s["index"] + 1
                if nxt >= n:
                    if wrap:
                        s["index"] = 0
                        advanced = True
                    else:
                        s["index"] = n - 1                   # park on the last item
                else:
                    s["index"] = nxt
                    advanced = True
        s["prev"] = trigger

        idx = s["index"] if n > 0 else 0
        item = items[idx] if n > 0 else ""
        done = n > 0 and not wrap and idx >= n - 1

        return {
            "item": item,
            "text": str(item),
            "value": _num(item),
            "index": idx + 1,        # 1-based for display
            "total": n,
            "done": done,
            "result": advanced,      # pulse True the tick a new item is emitted
            "on": advanced,
        }
