from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import read_bool


def _collect(inputs: dict) -> list[bool]:
    """Collect all boolean values from upstream outputs."""
    return [read_bool(v) for v in inputs.values() if isinstance(v, dict)]


def _out(result: bool) -> dict:
    return {"result": result, "on": result, "text": "True" if result else "False"}


class ANDGate(BaseNodeHandler):
    async def execute(self, config, inputs):
        vals = _collect(inputs)
        return _out(all(vals) if vals else False)

class ORGate(BaseNodeHandler):
    async def execute(self, config, inputs):
        vals = _collect(inputs)
        return _out(any(vals) if vals else False)

class NOTGate(BaseNodeHandler):
    async def execute(self, config, inputs):
        vals = _collect(inputs)
        return _out(not vals[0] if vals else True)

class NANDGate(BaseNodeHandler):
    async def execute(self, config, inputs):
        vals = _collect(inputs)
        return _out(not (all(vals)) if vals else True)

class NORGate(BaseNodeHandler):
    async def execute(self, config, inputs):
        vals = _collect(inputs)
        return _out(not (any(vals)) if vals else True)

class XORGate(BaseNodeHandler):
    async def execute(self, config, inputs):
        vals = _collect(inputs)
        return _out(vals.count(True) % 2 == 1 if vals else False)

class XNORGate(BaseNodeHandler):
    async def execute(self, config, inputs):
        vals = _collect(inputs)
        return _out(vals.count(True) % 2 == 0 if vals else True)
