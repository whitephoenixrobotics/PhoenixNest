"""Map incoming word(s) to other word(s) via from→to rules.

e.g. person→คน, car→รถ. First matching rule wins per word. A list field
(e.g. Detect's classes [car, bus]) is translated item by item → "รถ, บัส".
No match → fall back to the original word / blank / a custom default.
"""
from app.engine.nodes.base import BaseNodeHandler


def _input_words(inputs: dict, source: str = "auto") -> list[str]:
    """The word(s) to translate, as a list (one item per word)."""
    # Specific field chosen (e.g. "class"/"classes") → read exactly that field
    if source and source != "auto":
        for v in inputs.values():
            if isinstance(v, dict) and source in v:
                val = v[source]
                if isinstance(val, list):
                    return [str(x) for x in val if x not in (None, "")]
                return [str(val)] if val not in (None, "") else []
        return []

    # Auto: a list field (e.g. Detect's classes) → translate each item,
    # so every detected object is mapped (not just the first match).
    for v in inputs.values():
        if isinstance(v, dict):
            for k in ("classes", "labels", "tags", "values"):
                val = v.get(k)
                if isinstance(val, list) and val:
                    return [str(x) for x in val if x not in (None, "")]
    # Else the whole text, then a common scalar field
    for v in inputs.values():
        if isinstance(v, dict):
            t = v.get("text")
            if t not in (None, ""):
                return [str(t)]
    for v in inputs.values():
        if isinstance(v, dict):
            for k in ("value", "raw", "label", "name", "class"):
                val = v.get(k)
                if val not in (None, ""):
                    return [str(val)]
    return []


class TextTransformHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        words = _input_words(inputs, str(config.get("source", "auto")))
        rules = config.get("rules") or []
        match = str(config.get("match", "exact"))            # exact | contains
        ci = bool(config.get("case_insensitive", True))
        fallback = str(config.get("fallback", "keep"))        # keep | blank | custom
        default_text = str(config.get("default", ""))

        def translate(word: str) -> tuple[str, bool]:
            cmp_src = word.strip().lower() if ci else word.strip()
            for r in rules:
                frm = str((r or {}).get("from", "")).strip()
                if not frm:
                    continue
                cmp_frm = frm.lower() if ci else frm
                hit = (cmp_frm in cmp_src) if match == "contains" else (cmp_src == cmp_frm)
                if hit:
                    return str((r or {}).get("to", "")), True
            if fallback == "keep":
                return word, False
            if fallback == "custom":
                return default_text, False
            return "", False

        results = [translate(w) for w in words]
        out_list = [t for t, _ in results]
        matched = any(m for _, m in results)
        # Drop empties (e.g. blank fallback) so the joined text stays clean
        out = ", ".join(t for t in out_list if t != "")

        try:
            num = float(out)
        except (TypeError, ValueError):
            num = 0.0
        return {
            "text": out,
            "values": out_list,   # per-word results, for downstream blocks
            "value": num,
            "matched": matched,
            "result": matched,
            "on": matched,
        }
