from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import any_true as _any_true
from app.engine.nodes.state_registry import register

_state: dict[str, dict] = register({})


class ToggleHandler(BaseNodeHandler):
    """
    Flip-flop: every rising edge (False → True) of input flips the output.
    Like a push-button lamp switch — press once = on, press again = off.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        reset_token = config.get("reset", 0)

        s = _state.setdefault(node_id, {"on": False, "prev": False, "reset_token": reset_token})

        if s["reset_token"] != reset_token:
            s["on"] = False
            s["reset_token"] = reset_token

        current = _any_true(inputs)
        if current and not s["prev"]:
            s["on"] = not s["on"]
        s["prev"] = current

        return {
            "result": s["on"],
            "on": s["on"],
            "text": "ON" if s["on"] else "OFF",
        }
