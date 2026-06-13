"""line_push_image — push an image to LINE on the input's rising edge.

`image_url` accepts {value} substitution so an upstream "current frame URL"
block (or a sheets/HTTP block returning a hosted URL) can drive the push.
LINE requires HTTPS — we surface a friendly error if the URL is http://.
"""
from __future__ import annotations

import asyncio

from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.hardware._shared import first_input_value, to_bool
from app.engine.nodes.state_registry import register
from app.extensions.line import get_manager

_state: dict[str, dict] = register({})


class LinePushImageHandler(BaseNodeHandler):
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

        url_tpl = str(config.get("image_url", "")).strip()
        prev_tpl = str(config.get("preview_url", "")).strip()
        try:
            url  = url_tpl.format(value=raw)
            prev = prev_tpl.format(value=raw) if prev_tpl else ""
        except (KeyError, IndexError, ValueError):
            url, prev = url_tpl, prev_tpl

        if not url:
            return {"ok": False, "sent": False, "error": "image URL ว่าง", "trigger": trigger}

        try:
            await asyncio.to_thread(
                get_manager().push_image, url, prev, str(config.get("to", "")).strip(),
            )
        except RuntimeError as e:
            return {"ok": False, "sent": False, "error": str(e), "trigger": trigger}
        return {"ok": True, "sent": True, "trigger": trigger, "url": url}
