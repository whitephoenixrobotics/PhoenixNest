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

        active_index = -1
        for i, br in enumerate(branches):
            if _matches(br, data):
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
            "text": custom_text if (result and custom_text)
                    else (f"Branch {active_index}" if result else "ไม่ตรงเงื่อนไข"),
            "custom_text": bool(custom_text),
        }

        # Only emit active_branch for multi-branch (enables routing/skip).
        if is_multi:
            out["active_branch"] = f"branch_{active_index}" if active_index >= 0 else "none"

        return out
