import re
from app.engine.nodes.base import BaseNodeHandler

_OPS = {
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
    "!=": lambda a, b: a != b,
    "<>": lambda a, b: a != b,
    "==": lambda a, b: a == b,
    "!":  lambda a, b: a != b,
    ">":  lambda a, b: a > b,
    "<":  lambda a, b: a < b,
    "=":  lambda a, b: a == b,
}

# Atom: an operator + a number, e.g. ">16", "!= 19", "!19", "5" (bare = equals)
_ATOM_RE = re.compile(r'^(>=|<=|!=|<>|==|>|<|=|!)?\s*(-?\d+(?:\.\d+)?)$')


def _eval_atom(v: float, atom: str) -> bool:
    atom = atom.strip()
    if not atom:
        return False
    m = _ATOM_RE.match(atom)
    if not m:
        return False
    op = m.group(1) or "="          # bare number → equals
    return _OPS[op](v, float(m.group(2)))


def _class_count(detections: list, class_name: str) -> int:
    name = class_name.lower()
    return sum(1 for d in detections if str(d.get("class", "")).lower() == name)


def _eval_count(data: dict, expr: str) -> bool:
    expr = (expr or "").strip()
    if not expr:
        return int(data.get("count", 0)) > 0
    m = re.match(r'^([a-zA-Z_][a-zA-Z0-9_ ]*?)\s*(>=|<=|<>|>|<|=)\s*(\d+)$', expr)
    if m:
        class_name, op, num = m.group(1).strip(), m.group(2), int(m.group(3))
        detections = data.get("detections", [])
        return _OPS[op](_class_count(detections, class_name), num)
    m2 = re.match(r'^(>=|<=|<>|>|<|=)\s*(\d+)$', expr)
    if m2:
        op, num = m2.group(1), int(m2.group(2))
        return _OPS[op](int(data.get("count", 0)), num)
    try:
        return int(data.get("count", 0)) == int(expr)
    except ValueError:
        return False


def _eval_value(data: dict, expr: str) -> bool:
    """Evaluate a numeric condition, supporting compound expressions:

        > 7              v > 7
        >16 && <18       v > 16 AND v < 18        (&& = and)
        <10 || >20       v < 10 OR  v > 20        (|| = or)
        !19  / != 19     v != 19
        5                v == 5
    """
    expr = (expr or "").strip()
    raw = data.get("value")
    if raw is None: raw = data.get("count")
    if raw is None: raw = data.get("score", 0)
    try:
        v = float(raw)
    except (TypeError, ValueError):
        v = 0.0
    if not expr:
        return v > 0
    # OR of AND-groups: any group whose atoms all pass → True
    for or_group in expr.split("||"):
        atoms = [a for a in or_group.split("&&") if a.strip()]
        if atoms and all(_eval_atom(v, a) for a in atoms):
            return True
    return False


def _eval_text(data: dict, expr: str) -> bool:
    """
    Compare upstream `text` against an expression.

    Formats supported:
      hello             → upstream text contains "hello"  (default)
      = hello           → exact match  (case-insensitive)
      != hello          → not equal
      contains hello    → substring match (explicit)
      starts hello      → text starts with
      ends hello        → text ends with
    """
    expr = (expr or "").strip()
    if not expr:
        return False
    text = str(data.get("text", "")).strip()
    if not text:
        return False

    text_l = text.lower()
    raw = expr.lstrip()

    # Strip surrounding quotes from the target so users can write either with
    # or without quotes
    def _target(s: str) -> str:
        s = s.strip()
        if len(s) >= 2 and s[0] in ('"', "'") and s[-1] == s[0]:
            return s[1:-1]
        return s

    if raw.startswith("!="):
        return text_l != _target(raw[2:]).lower()
    if raw.startswith("="):
        return text_l == _target(raw[1:]).lower()
    low = raw.lower()
    for prefix in ("contains ", "starts ", "ends "):
        if low.startswith(prefix):
            target = _target(raw[len(prefix):]).lower()
            if prefix == "contains ": return target in text_l
            if prefix == "starts ":   return text_l.startswith(target)
            if prefix == "ends ":     return text_l.endswith(target)

    # Default: contains (case-insensitive)
    return _target(raw).lower() in text_l


_CONDITIONS = {
    "any_detected": lambda d, _: int(d.get("count", 0)) > 0,
    "class":        lambda d, v: v.lower() in [c.lower() for c in d.get("classes", [])],
    "count":        _eval_count,
    "value":        _eval_value,
    "text":         _eval_text,
}


def _matches(branch: dict, data: dict) -> bool:
    """Evaluate one branch condition against upstream data."""
    cond = branch.get("condition", "any_detected")
    if cond == "else":
        return True  # else is a catch-all
    fn = _CONDITIONS.get(cond)
    if fn is None:
        return False
    try:
        return bool(fn(data, str(branch.get("value", ""))))
    except Exception:
        return False


def _slot_num(x):
    """Coerce a value (incl. a numeric string like '13.0') to float, else None."""
    if isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    if isinstance(x, str):
        try:
            return float(x.strip())
        except ValueError:
            return None
    return None


# Value comparators between two slots (the previous term's value vs this term's).
# 'not' is kept as a legacy alias for '!=' (≠).
_CMP = {
    "=":   lambda a, b: a == b,
    "==":  lambda a, b: a == b,
    "!=":  lambda a, b: a != b,
    "not": lambda a, b: a != b,
    ">":   lambda a, b: a > b,
    "<":   lambda a, b: a < b,
    ">=":  lambda a, b: a >= b,
    "<=":  lambda a, b: a <= b,
}


def _cmp(op: str, lv, rv) -> bool:
    """Compare two slot values. Ordering (>, <, >=, <=) needs both numeric;
    equality (=, !=) compares numerically when both are numbers, else as text."""
    fn = _CMP.get(op)
    if fn is None:
        return False
    ln, rn = _slot_num(lv), _slot_num(rv)
    if op in (">", "<", ">=", "<="):
        if ln is None or rn is None:
            return False
        return fn(ln, rn)
    if ln is not None and rn is not None:
        return fn(ln, rn)
    return fn("" if lv is None else str(lv), "" if rv is None else str(rv))


def _input_slots(inputs: dict) -> list[dict]:
    """Ordered, named view of each incoming value so a branch can target a
    specific input: value1/value2 for numbers, text1/text2 for text (a source
    with BOTH a number and a distinct text contributes both slots). Detection
    sources stay a single 'detect' slot.

    Each entry: {slot, type, raw, display, label} — `raw` is for evaluation,
    `display` is the short string shown on the node chip."""
    out: list[dict] = []
    nv = nt = nc = 0
    for v in inputs.values():
        if not isinstance(v, dict):
            nt += 1
            out.append({"slot": f"text{nt}", "type": "text", "raw": str(v), "display": str(v), "label": ""})
            continue
        label = str(v.get("_block") or "")
        # Detection source (YOLO / counter): has detections or classes list.
        # Check FIRST — its summary `text` would otherwise mask it as plain text.
        if isinstance(v.get("detections"), list) or isinstance(v.get("classes"), list):
            out.append({"slot": "detect", "type": "detect", "raw": v,
                        "display": v.get("text") or f"{v.get('count', 0)} objects", "label": label})
            continue
        # JSON Extract (or any block exposing a `values` list) → give each
        # extracted path its OWN slot so a branch can target them separately:
        # value1/value2 for numbers (numeric strings coerced), text1/text2 for
        # the rest. This is what lets the If/Else dropdown list them by path.
        vals = v.get("values")
        if isinstance(vals, list) and any(x is not None for x in vals):
            for item in vals:
                if item is None:
                    continue
                n = _slot_num(item)
                if n is not None:
                    disp = int(n) if float(n).is_integer() else round(float(n), 4)
                    nv += 1
                    out.append({"slot": f"value{nv}", "type": "number", "raw": float(n),
                                "display": str(disp), "label": label})
                else:
                    nt += 1
                    t = " ".join(str(item).split())
                    out.append({"slot": f"text{nt}", "type": "text", "raw": t, "display": t, "label": label})
            continue
        # A source can carry BOTH a number and a text (JSON Extract value1 +
        # name via template) — emit both slots. Skip text that's merely the
        # number's own string form (a Number block: value 10, text "10").
        emitted = False
        num = v.get("value")
        num_str = None
        if isinstance(num, (int, float)) and not isinstance(num, bool):
            disp = int(num) if float(num).is_integer() else round(float(num), 4)
            num_str = str(disp)
            nv += 1
            out.append({"slot": f"value{nv}", "type": "number", "raw": float(num),
                        "display": str(disp), "label": label})
            emitted = True
        text = v.get("text")
        if text not in (None, ""):
            t = " ".join(str(text).split())
            if num_str is None or t != num_str:
                nt += 1
                out.append({"slot": f"text{nt}", "type": "text", "raw": t, "display": t, "label": label})
                emitted = True
        if not emitted:
            if v.get("count") is not None:
                nc += 1
                out.append({"slot": f"count{nc}", "type": "count", "raw": v.get("count"),
                            "display": str(v.get("count")), "label": label})
            elif v.get("result") is not None or v.get("on") is not None:
                flag = v.get("result") if v.get("result") is not None else v.get("on")
                out.append({"slot": "bool", "type": "bool", "raw": bool(flag),
                            "display": str(bool(flag)), "label": label})
    return out


def _branch_matches(branch: dict, data: dict, slot_map: dict) -> bool:
    """A branch matches when its terms evaluate true: the main condition plus
    any extra `terms`, each joined by AND / OR / NOT.

      • AND / OR — logical combine of the two terms' conditions, as OR-of-AND
        groups (a new group starts at each OR; terms in a group are AND-ed).
      • a comparator (=, !=, >, <, >=, <=) — compares the PREVIOUS term's value
        with this term's value (e.g. "value1 > value2"). A comparator term is a
        bare slot (no expression); its boolean joins the current AND-group.

    Each term targets its own input slot."""
    if branch.get("condition") == "else":
        return True

    terms = [branch, *(branch.get("terms") or [])]

    def term_bool(t: dict) -> bool:
        # A slot used purely as a value (empty expression) is neutral-true — it
        # only provides a value for a NOT comparison, not a filter of its own.
        expr = str(t.get("value") or "").strip()
        if not expr and t.get("condition") in ("value", "text"):
            return True
        return _matches(t, _data_for_branch(t, data, slot_map))

    groups: list[list[bool]] = []
    cur: list[bool] = []
    for k, t in enumerate(terms):
        op = (t.get("op") or "and") if k > 0 else "and"
        if op == "or":
            groups.append(cur)
            cur = [term_bool(t)]
        elif op == "and":
            cur.append(term_bool(t))
        else:  # value comparator (=, !=, >, <, >=, <=; legacy 'not' = ≠)
            prev = terms[k - 1]
            lv = (slot_map.get(prev.get("source")) or {}).get("raw")
            rv = (slot_map.get(t.get("source")) or {}).get("raw")
            cur.append(_cmp(op, lv, rv))
    groups.append(cur)
    return any(all(g) for g in groups if g)


def _data_for_branch(branch: dict, data: dict, slot_map: dict) -> dict:
    """If a branch targets a specific input slot (value2, text1, …), present
    that slot's value to the condition as the canonical value/text/count, so
    `_eval_value`/`_eval_text` compare against the chosen input — not whichever
    one happened to win the merge."""
    src = branch.get("source")
    if not src or src not in slot_map:
        return data
    s = slot_map[src]
    d = dict(data)
    if s["type"] == "number":
        d["value"] = s["raw"]
    elif s["type"] == "text":
        d["text"] = s["raw"]
    elif s["type"] == "count":
        d["count"] = s["raw"]
    return d


class IfElseHandler(BaseNodeHandler):
    """
    Multi-branch conditional (if / else if … / else).

    Config:
      branches: [
        { "condition": "class",          "value": "person" },   # IF
        { "condition": "class",          "value": "cat" },      # ELSE IF
        { "condition": "value",          "value": "> 7" },      # ELSE IF
        { "condition": "else" },                                # ELSE (catch-all)
      ]

    Output:
      result:        True if any branch matched
      active_index:  index of the first matching branch, or -1
      active_branch: "branch_<i>"  →  used by the executor to skip
                                       downstream of inactive branches.

    Backward-compat: if config has the old { condition, value } shape,
    it's treated as a single-branch IF.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        data: dict = {}
        for v in inputs.values():
            if isinstance(v, dict):
                data.update(v)

        # Normalize: prefer branches[], fall back to legacy single-branch
        branches = config.get("branches")
        if not isinstance(branches, list) or not branches:
            branches = [{
                "condition": config.get("condition", "any_detected"),
                "value": config.get("value", ""),
            }]

        slots = _input_slots(inputs)
        slot_map = {s["slot"]: s for s in slots}

        active_index = -1
        for i, br in enumerate(branches):
            if _branch_matches(br, data, slot_map):
                active_index = i
                break

        is_multi = len(branches) > 1
        result = active_index >= 0

        # If the matched branch has a custom output_text, emit it.
        # Otherwise emit a default label so downstream still receives something.
        custom_text = ""
        if result:
            custom_text = str(branches[active_index].get("output_text", "")).strip()

        # Surface the scalar/text the conditions actually evaluated, so the node
        # can show the live incoming value next to the branch that lit up.
        input_value = data.get("value")
        if input_value is None:
            input_value = data.get("count")
        if input_value is None:
            input_value = data.get("score")

        out: dict = {
            "result": result,
            "active_index": active_index,
            "value": data,
            "input_value": input_value,
            "input_text": data.get("text"),
            "inputs_preview": [
                {"label": s["label"], "value": s["display"], "type": s["type"], "slot": s["slot"]}
                for s in slots
            ],
            "text": custom_text if (result and custom_text)
                    else (f"Branch {active_index}" if result else "ไม่ตรงเงื่อนไข"),
            "custom_text": bool(custom_text),
        }

        # active_branch drives the executor's per-branch routing/skip. Emit it
        # ONLY in multi-output mode — in single-output mode the one handle isn't
        # a "branch_N" handle, so emitting it would make the executor skip the
        # (correctly) downstream node. Single-output just passes `text`/`result`.
        multi_output = bool(config.get("multi_output", False))
        if is_multi and multi_output:
            out["active_branch"] = f"branch_{active_index}" if active_index >= 0 else "none"

        return out
