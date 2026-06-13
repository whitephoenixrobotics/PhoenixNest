import random
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import any_true as _any_true

# Per-node state — remembers the current rolled value and trigger history
_state: dict[str, dict] = {}


def _to_int(raw, default: int) -> int:
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return default


class RandomNumberHandler(BaseNodeHandler):
    """
    Integer random number in [min, max].

    Triggers a new roll when EITHER:
      • Any input has a rising edge (False → True)
      • The roll_token in config changes (user clicked the dice)

    Otherwise the previously rolled value is kept — no continuous re-rolls.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        lo = _to_int(config.get("min", 0), 0)
        hi = _to_int(config.get("max", 100), 100)
        if lo > hi:
            lo, hi = hi, lo
        roll_token = config.get("roll_token", 0)

        s = _state.setdefault(node_id, {
            "value": None,
            "prev_input": False,
            "prev_roll_token": roll_token,
        })

        # Detect triggers
        current = _any_true(inputs) if inputs else False
        rising_edge = current and not s["prev_input"]
        roll_clicked = roll_token != s["prev_roll_token"]
        s["prev_input"] = current
        s["prev_roll_token"] = roll_token

        # Roll only on trigger (or first run when value is None)
        if rising_edge or roll_clicked or s["value"] is None:
            s["value"] = random.randint(lo, hi)

        return {
            "value": float(s["value"]),
            "text": str(s["value"]),
            "rolled": rising_edge or roll_clicked,
        }
