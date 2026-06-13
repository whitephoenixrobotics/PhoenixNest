import time
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import any_true as _any_true
from app.engine.nodes.state_registry import register

_state: dict[str, float] = register({})


class HoldHandler(BaseNodeHandler):
    """
    Once True is seen, hold the output True for `seconds` seconds even if
    the input drops to False. Each new True extends the hold (retrigger).
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        seconds = float(config.get("seconds", 3.0))
        now = time.time()

        current = _any_true(inputs)
        last_true = _state.get(node_id, 0.0)

        if current:
            _state[node_id] = now
            last_true = now

        elapsed = now - last_true
        active = elapsed <= seconds and last_true > 0
        remaining = max(0.0, seconds - elapsed) if active else 0.0

        return {
            "result": active,
            "on": active,
            "remaining": round(remaining, 2),
            "text": f"⏱ {remaining:.1f}s" if active else "OFF",
        }
