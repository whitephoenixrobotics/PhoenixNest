from app.engine.nodes.base import BaseNodeHandler


class LightBulbHandler(BaseNodeHandler):
    """
    Visual output block — ON when upstream result is truthy, OFF otherwise.
    Reads `result` (bool) or falls back to checking `count` > 0.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        state = False
        for v in inputs.values():
            if not isinstance(v, dict):
                continue
            if "result" in v:
                state = bool(v["result"])
                break
            if "is_smiling" in v:
                state = bool(v["is_smiling"])
                break
            if v.get("count", 0) > 0:
                state = True
                break

        return {
            "on": state,
            "text": "💡 ติด" if state else "🌑 ดับ",
        }
