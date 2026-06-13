import time
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.state_registry import register

# Per-node timer state, keyed by the `_node_id` the executor injects into
# config. Persists across live/auto frames; reset per session/Run and pruned
# when nodes are deleted (see state_registry).
_state: dict[str, float] = register({})


def _bool_from(inputs: dict) -> bool:
    for v in inputs.values():
        if not isinstance(v, dict):
            continue
        if "result" in v: return bool(v["result"])
        if "on" in v:     return bool(v["on"])
        if v.get("count", 0) > 0: return True
    return False


class DelayHandler(BaseNodeHandler):
    """
    Hold input True for `seconds` seconds before output goes True.
    If input drops to False, the timer resets.

    Use case: "When person detected for 3 seconds, sound alarm" — debounces
    momentary False positives.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        seconds = float(config.get("seconds", 2.0))
        # `_node_id` is injected by the executor (see executor.py changes)
        node_id = str(config.get("_node_id", "default"))

        current = _bool_from(inputs)
        now = time.time()
        started = _state.get(node_id)

        if current:
            if started is None:
                _state[node_id] = now
                elapsed = 0.0
            else:
                elapsed = now - started
        else:
            _state.pop(node_id, None)
            elapsed = 0.0

        ready = current and elapsed >= seconds
        remaining = max(0.0, seconds - elapsed) if current else seconds

        return {
            "result": ready,
            "on": ready,
            "elapsed": round(elapsed, 2),
            "remaining": round(remaining, 2),
            "text": "✅ พร้อม" if ready else f"⏳ {remaining:.1f}s",
        }
