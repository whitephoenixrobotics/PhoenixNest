from app.engine.nodes.base import BaseNodeHandler


def _find_detections(inputs: dict) -> list | None:
    """Pull the `detections` list from any upstream output (e.g. Detect/YOLO)."""
    for value in inputs.values():
        if isinstance(value, dict) and isinstance(value.get("detections"), list):
            return value["detections"]
    return None


class ObjectCountHandler(BaseNodeHandler):
    """
    Counts objects from an upstream Detect (YOLO) block.

    config.class_name:
      - empty  → count ALL detected objects
      - "person" / "car" / ... → count only that class
    Outputs a number (value/count) so it can feed Math / If / Display / Light.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        dets = _find_detections(inputs)
        if dets is None:
            raise ValueError("ต้องต่อจาก block 'Detect (YOLO)' ก่อน")

        target = str(config.get("class_name", "")).strip().lower()
        if target:
            n = sum(1 for d in dets if str(d.get("class", "")).lower() == target)
            label = target
        else:
            n = len(dets)
            label = "ทั้งหมด"

        return {
            "count": n,
            "value": n,          # numeric output for Math / If
            "result": n > 0,     # boolean output for logic / light
            "class_name": label,
            "text": f"{label}: {n}",
        }
