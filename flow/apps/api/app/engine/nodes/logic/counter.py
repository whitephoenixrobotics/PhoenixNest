from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import any_true as _any_true
from app.engine.nodes.state_registry import register

# Per-node state — persists across live/auto frames, reset per session/Run
_state: dict[str, dict] = register({})


class CounterHandler(BaseNodeHandler):
    """
    Counts rising edges (False → True) of any input.
    Config:
        reset: int — if changed (different from previous value), counter resets to 0
                     (use this as a config-controlled reset)
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        reset_token = config.get("reset", 0)

        s = _state.setdefault(node_id, {"count": 0, "prev": False, "reset_token": reset_token})

        # If the reset token changed (user pressed reset), zero out
        if s["reset_token"] != reset_token:
            s["count"] = 0
            s["reset_token"] = reset_token

        current = _any_true(inputs)
        # Rising edge only — increment when input transitions from False → True
        if current and not s["prev"]:
            s["count"] += 1
        s["prev"] = current

        return {
            "count": s["count"],
            "text": str(s["count"]),
            "result": s["count"] > 0,
            "on": s["count"] > 0,
        }
