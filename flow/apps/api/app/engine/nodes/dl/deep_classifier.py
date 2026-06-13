import asyncio
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, find_input_image
from app.engine.nodes.ai.detect import _get_device, _use_half
from app.engine.nodes.dl._models import load_model


def _run(image_data: str, model_id: str) -> dict:
    img = decode_image(image_data)
    model = load_model(model_id)
    result = model(img, verbose=False, device=_get_device(), half=_use_half())[0]

    probs = getattr(result, "probs", None)
    if probs is None:
        raise ValueError(
            f"โมเดลนี้ใช้จำแนกภาพไม่ได้ (task = {getattr(model, 'task', '?')})"
        )

    top1 = int(probs.top1)
    label = result.names[top1]
    top5 = [
        {"label": result.names[int(i)],
         "confidence": round(float(probs.data[int(i)]), 3)}
        for i in probs.top5
    ]
    return {
        "label": label,
        "text": label,
        "confidence": round(float(probs.top1conf), 3),
        "top5": top5,
        "matched": True,
    }


class DeepClassifierHandler(BaseNodeHandler):
    """Deep Learning block: image classification with a user-uploaded model."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        model_id = config.get("model_id")
        if not model_id:
            raise ValueError("ยังไม่ได้อัปโหลดไฟล์โมเดล (.pt / .onnx)")
        return await asyncio.to_thread(_run, image_data, model_id)
