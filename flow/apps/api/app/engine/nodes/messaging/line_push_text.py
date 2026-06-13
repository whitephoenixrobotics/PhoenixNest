"""line_push_text — push a LINE message when the upstream signal is truthy.

Behaviour mirrors the other "trigger on rising edge" output blocks (TTS,
play_sound): we fire once when the input goes False → True, NOT every tick,
otherwise a held-True input would spam the LINE API.

Template substitution: the config `text` can include `{value}` and it'll be
replaced with the upstream payload. Useful for AI flows ("ตรวจพบ {value} คน").
"""
from __future__ import annotations

import asyncio

from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.hardware._shared import first_input_value, to_bool
from app.engine.nodes.state_registry import register
from app.extensions.line import get_manager

# Per-node edge-state cache, scoped per Run / live session by state_registry.
_state: dict[str, dict] = register({})


class LinePushTextHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        reset_token = config.get("reset", 0)

        s = _state.setdefault(node_id, {"prev": False, "last_id": "", "reset_token": reset_token})
        if s["reset_token"] != reset_token:
            s["prev"] = False
            s["last_id"] = ""
            s["reset_token"] = reset_token

        raw = first_input_value(inputs)
        trigger = to_bool(raw) if raw is not None else False

        # Edge detect: only fire on False → True.
        rising = trigger and not s["prev"]
        s["prev"] = trigger

        if not rising:
            return {"ok": True, "sent": False, "trigger": trigger}

        # Build the message text — config text wins if set, else stringify input.
        template = str(config.get("text", "")).strip()
        if template:
            try:
                text = template.format(value=raw, **(_format_dict(raw)))
            except (KeyError, IndexError, ValueError):
                text = template  # bad placeholder → send template as-is
        else:
            text = str(raw)
        if not text:
            return {"ok": True, "sent": False, "trigger": trigger, "skipped": "empty text"}

        to = str(config.get("to", "")).strip()
        mgr = get_manager()
        try:
            await asyncio.to_thread(mgr.push_text, text, to)
        except RuntimeError as e:
            return {"ok": False, "sent": False, "error": str(e), "trigger": trigger}

        s["last_id"] = node_id  # not used yet; reserved for retry/dedupe later
        return {"ok": True, "sent": True, "trigger": trigger, "text": text}


def _format_dict(v) -> dict:
    """Allow `{key}` lookups when the upstream payload is itself a dict."""
    return v if isinstance(v, dict) else {}
