from app.engine.nodes.base import BaseNodeHandler


class SpeechToTextHandler(BaseNodeHandler):
    """Speech to Text — frontend captures via Web Speech API and stores transcript."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        transcript = str(config.get("transcript", "")).strip()
        return {
            "text": transcript,
            "length": len(transcript),
            "result": bool(transcript),
        }
