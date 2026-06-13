from app.engine.nodes.base import BaseNodeHandler


def _is_truthy(v) -> bool:
    if not isinstance(v, dict):
        return False
    return bool(v.get("result") or v.get("on") or v.get("count", 0) > 0)


class TextToSpeechHandler(BaseNodeHandler):
    """
    Text-to-Speech with two input handles:
      • "text"    — text to speak (overrides config.text when present)
      • "trigger" — boolean signal; speaks on rising edge

    Behavior:
      - Fires only when the trigger handle is True (rising edge) OR the user
        clicks the preview button on the node.
      - Text comes from the text handle if connected and non-empty; otherwise
        falls back to the text typed inside the block.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        text_in    = inputs.get("text") or {}
        trigger_in = inputs.get("trigger") or {}

        # Pull text from the text-input handle
        upstream_text = ""
        if isinstance(text_in, dict) and isinstance(text_in.get("text"), str):
            upstream_text = text_in["text"].strip()

        # Trigger from the trigger-input handle only
        trigger = _is_truthy(trigger_in)

        # Upstream text wins; otherwise speak whatever is typed in the block
        config_text = str(config.get("text", "")).strip()
        text = upstream_text if upstream_text else config_text

        return {
            "should_speak": trigger and bool(text),
            "text": text,
            "trigger": trigger,
        }
