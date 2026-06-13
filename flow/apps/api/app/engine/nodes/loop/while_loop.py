"""While — keep firing True every tick while the condition stays True.

In the tick-based engine this is a gate that passes the condition through and
counts how many consecutive ticks it has been True (the iteration count). When
the condition drops to False it emits done=True for that one tick and resets.
"""
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import any_true as _any_true
from app.engine.nodes.state_registry import register

_state: dict[str, dict] = register({})


class WhileHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        reset_token = config.get("reset", 0)

        s = _state.setdefault(node_id, {"count": 0, "was": False, "reset_token": reset_token})
        if s["reset_token"] != reset_token:
            s.update(count=0, was=False, reset_token=reset_token)

        cond = _any_true(inputs)
        if cond:
            s["count"] += 1
        done = s["was"] and not cond     # just stopped this tick
        if not cond:
            s["count"] = 0
        s["was"] = cond

        return {
            "result": cond,
            "on": cond,
            "count": s["count"],     # consecutive True ticks so far
            "done": done,
            "text": f"♾️ วน {s['count']}" if cond else ("✓ จบ" if done else "⏸ รอเงื่อนไข"),
        }
