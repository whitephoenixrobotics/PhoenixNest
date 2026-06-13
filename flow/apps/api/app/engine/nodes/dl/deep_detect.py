import asyncio
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image
from app.engine.nodes.ai.detect import _get_device, _use_half, resolve_imgsz
from app.engine.nodes.dl._models import load_model


def _run(image_data: str, model_id: str, confidence: float, imgsz_setting="fast") -> dict:
    from PIL import Image

    img = decode_image(image_data)
    model = load_model(model_id)
    sz = resolve_imgsz(imgsz_setting, *img.size)
    results = model(img, conf=confidence, imgsz=sz, verbose=False, device=_get_device(), half=_use_half())
    result = results[0]

    if getattr(result, "boxes", None) is None:
        raise ValueError(
            f"โมเดลนี้ใช้ตรวจจับวัตถุไม่ได้ (task = {getattr(model, 'task', '?')})"
        )

    detections = []
    for box in result.boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        xyxy = [round(float(x)) for x in box.xyxy[0].tolist()]
        detections.append({
            "class": result.names[cls_id],
            "confidence": round(conf, 3),
            "bbox": xyxy,
        })

    annotated = Image.fromarray(result.plot()[:, :, ::-1])
    classes = sorted(set(d["class"] for d in detections))
    return {
        "detections": detections,
        "count": len(detections),
        "classes": classes,
        "image": encode_image(annotated),
        "text": (f"พบ {len(detections)} วัตถุ: {', '.join(classes)}"
                 if detections else "ไม่พบวัตถุ"),
    }


class DeepDetectHandler(BaseNodeHandler):
    """Deep Learning block: object detection with a user-uploaded YOLO model."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        model_id = config.get("model_id")
        if not model_id:
            raise ValueError("ยังไม่ได้อัปโหลดไฟล์โมเดล (.pt / .onnx)")
        confidence = float(config.get("confidence", 0.25))
        imgsz_setting = config.get("imgsz", "fast")
        return await asyncio.to_thread(_run, image_data, model_id, confidence, imgsz_setting)
