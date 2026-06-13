"""line_push_sticker — push a LINE sticker on the input's rising edge.

Sticker IDs from https://developers.line.biz/en/docs/messaging-api/sticker-list/.
We default to package 446 / sticker 1988 (Brown's thumbs-up) — universally
available and recognisable.
"""
from __future__ import annotations

import asyncio

from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.hardware._shared import first_input_value, to_bool
from app.engine.nodes.state_registry import register
from app.extensions.line import get_manager

_state: dict[str, dict] = register({})


class LinePushStickerHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        reset_token = config.get("reset", 0)
        s = _state.setdefault(node_id, {"prev": False, "reset_token": reset_token})
        if s["reset_token"] != reset_token:
            s["prev"] = False
            s["reset_token"] = reset_token

        raw = first_input_value(inputs)
        trigger = to_bool(raw) if raw is not None else False
        rising = trigger and not s["prev"]
        s["prev"] = trigger
        if not rising:
            return {"ok": True, "sent": False, "trigger": trigger}

        try:
            pkg = int(config.get("package_id", 446))
            sid = int(config.get("sticker_id", 1988))
        except (TypeError, ValueError):
            return {"ok": False, "sent": False, "error": "package_id / sticker_id ต้องเป็นตัวเลข"}

        try:
            await asyncio.to_thread(
                get_manager().push_sticker, pkg, sid, str(config.get("to", "")).strip(),
            )
        except RuntimeError as e:
            return {"ok": False, "sent": False, "error": str(e), "trigger": trigger}
        return {"ok": True, "sent": True, "trigger": trigger, "package_id": pkg, "sticker_id": sid}
