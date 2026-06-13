from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import any_true as _any_true
from app.engine.nodes.state_registry import register

_state: dict[str, dict] = register({})


class TriggerOnceHandler(BaseNodeHandler):
    """
    Fires True ONCE on the first rising edge, then locks False forever.
    Useful for "do this once" actions like a startup notification.
    Reset with the reset button (changes reset token in config).
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        reset_token = config.get("reset", 0)

        s = _state.setdefault(node_id, {"fired": False, "prev": False, "reset_token": reset_token})

        if s["reset_token"] != reset_token:
            s["fired"] = False
            s["prev"] = False
            s["reset_token"] = reset_token

        current = _any_true(inputs)
        # Fire on the rising edge, but only if not already fired
        fire_now = current and not s["prev"] and not s["fired"]
        if fire_now:
            s["fired"] = True
        s["prev"] = current

        # Output True ONLY for the single execution where we just fired
        return {
            "result": fire_now,
            "on": fire_now,
            "fired": s["fired"],
            "text": "🔥 ยิงแล้ว" if s["fired"] else "⏸ รอ",
        }
