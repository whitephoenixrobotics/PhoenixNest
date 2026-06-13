"""Interval — pulse True for one tick every N seconds/minutes/hours.

A periodic trigger source (unlike Delay, which is a debounce that stays True).
Pairs with the Data Table's auto-capture to log a row on a fixed interval.

Only advances while the flow keeps running (Auto/Live), since it's driven by
the pipeline tick. Resets per session, so it fires once on the first tick of a
new Auto/Live run, then every N.
"""
import time
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.state_registry import register

# node_id -> timestamp of last fire
_state: dict[str, float] = register({})

_UNIT = {"s": 1.0, "m": 60.0, "h": 3600.0}


class IntervalHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        every = float(config.get("every", 5) or 0)
        unit = str(config.get("unit", "m"))
        interval = max(1.0, every * _UNIT.get(unit, 60.0))

        now = time.time()
        last = _state.get(node_id)

        if last is None:
            # First tick of a run → fire immediately, then every `interval`.
            _state[node_id] = now
            fire = True
            remaining = interval
        elif now - last >= interval:
            _state[node_id] = now
            fire = True
            remaining = interval
        else:
            fire = False
            remaining = interval - (now - last)

        mm, ss = divmod(int(remaining), 60)
        return {
            "result": fire,
            "on": fire,
            "remaining": round(remaining, 1),
            "text": "⚡ ครบรอบ!" if fire else f"⏳ อีก {mm:02d}:{ss:02d}",
        }
