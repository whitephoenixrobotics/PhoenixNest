import asyncio
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import find_input_image, decode_image
from app.engine.nodes.ai.face.emotion import happy_probability


def _resolve_threshold(raw: float) -> float:
    """Map saved thresholds onto the 0–1 happy-probability scale.

    The old smile block used a mouth width/height *ratio* (panel range 2–6,
    default 3.5). Any value > 1 is therefore a legacy ratio threshold → fall
    back to the new 0.5 default so saved flows keep behaving sensibly.
    """
    return 0.5 if raw > 1.0 else raw


class SmileHandler(BaseNodeHandler):
    """Smile detection via a facial-expression CNN (HSEmotion 'happy' prob).

    Replaces the old mouth-geometry ratio, which missed open-mouth smiles
    (mouth height grows → ratio falls) and ignored lip-corner lift. Wire an
    image source (Webcam) straight in; it also works downstream of Face Mesh.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        threshold = _resolve_threshold(float(config.get("threshold", 0.5)))

        data = find_input_image(inputs)
        if not data:
            raise ValueError("ไม่มีภาพ input — ต่อ Webcam หรือ block ภาพเข้ามาก่อน")

        prob = await asyncio.to_thread(lambda: happy_probability(decode_image(data)))
        if prob is None:
            return {"is_smiling": False, "score": 0.0, "threshold": round(threshold, 2),
                    "result": False, "on": False, "text": "ไม่พบใบหน้า"}

        is_smiling = prob >= threshold
        return {
            "is_smiling": is_smiling,
            "score": round(prob, 2),
            "threshold": round(threshold, 2),
            "result": is_smiling,   # lets Smile drive logic blocks (If / light / sound)
            "on": is_smiling,
            "text": "😊 ยิ้ม" if is_smiling else "😐 ไม่ยิ้ม",
        }
