"""line_push_flex — push a LINE Flex Message on the input's rising edge.

The `contents` config is the JSON object the user pastes from the LINE Flex
Message Simulator (https://developers.line.biz/flex-simulator/) — the bubble
or carousel root, NOT the wrapper that includes "type":"flex". The Simulator's
"Show Code" output is the right shape.
"""
from __future__ import annotations

import asyncio
import json

from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.hardware._shared import first_input_value, to_bool
from app.engine.nodes.state_registry import register
from app.extensions.line import get_manager

_state: dict[str, dict] = register({})


class LinePushFlexHandler(BaseNodeHandler):
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

        contents_raw = config.get("contents")
        # Allow either a dict (from a future structured editor) or a JSON
        # string (current text-area input).
        try:
            if isinstance(contents_raw, dict):
                contents = contents_raw
            else:
                contents = json.loads(str(contents_raw or ""))
        except json.JSONDecodeError as e:
            return {"ok": False, "sent": False, "error": f"JSON ไม่ถูกต้อง: {e.msg}", "trigger": trigger}

        alt_tpl = str(config.get("alt_text", "Phoenix Flow notification"))
        try:
            alt_text = alt_tpl.format(value=raw)
        except (KeyError, IndexError, ValueError):
            alt_text = alt_tpl

        try:
            await asyncio.to_thread(
                get_manager().push_flex, alt_text, contents, str(config.get("to", "")).strip(),
            )
        except RuntimeError as e:
            return {"ok": False, "sent": False, "error": str(e), "trigger": trigger}
        return {"ok": True, "sent": True, "trigger": trigger, "alt_text": alt_text}
