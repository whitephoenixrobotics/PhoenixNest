"""
Shared helpers for reading boolean trigger signals from upstream node outputs.
A block is considered "truthy" if it emits result=True, on=True, or count>0.
Used by logic, time, and input blocks that react to a True signal.
"""


def read_bool(v) -> bool:
    """Extract a boolean from a single upstream output dict."""
    if not isinstance(v, dict):
        return False
    if "result" in v:
        return bool(v["result"])
    if "on" in v:
        return bool(v["on"])
    if v.get("count", 0) > 0:
        return True
    return False


def any_true(inputs: dict) -> bool:
    """True if ANY upstream input is truthy."""
    return any(read_bool(v) for v in inputs.values())
