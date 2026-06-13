"""Play Sound — play a recorded/uploaded audio clip when triggered.

The audio itself lives in the node config as a data URL and is played by the
BROWSER (frontend detects the False→True edge of `trigger`, same pattern as
Text-to-Speech). The handler just resolves the trigger signal.
"""
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes._signals import any_true


class PlaySoundHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        trigger = any_true(inputs)
        has_audio = bool(config.get("audio"))

        return {
            "trigger": trigger,
            "should_play": trigger and has_audio,
            "result": trigger,
            "on": trigger,
            "text": ("🔊 เล่น" if trigger else "⏸ รอ True") if has_audio else "ยังไม่มีเสียง",
        }
