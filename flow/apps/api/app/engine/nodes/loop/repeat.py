"""Repeat N — fire True up to N times, one per trigger, then stop.

Each rising edge (False→True) of the input counts as one repetition and pulses
result=True for that tick, until N is reached; after that it stays False and
done=True. Reset to run again. Pair with Interval/Button to drive the trigger.
"""
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import any_true as _any_true
from app.engine.nodes.state_registry import register

_state: dict[str, dict] = register({})


class RepeatHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        times = max(0, int(config.get("times", 3) or 0))
        reset_token = config.get("reset", 0)

        s = _state.setdefault(node_id, {"count": 0, "prev": False, "reset_token": reset_token})
        if s["reset_token"] != reset_token:
            s.update(count=0, prev=False, reset_token=reset_token)

        trigger = _any_true(inputs)
        fired = False
        if trigger and not s["prev"] and s["count"] < times:
            s["count"] += 1
            fired = True
        s["prev"] = trigger

        done = s["count"] >= times
        return {
            "result": fired,
            "on": fired,
            "count": s["count"],
            "total": times,
            "done": done,
            "text": f"{s['count']}/{times}" + (" ✓" if done else ""),
        }
