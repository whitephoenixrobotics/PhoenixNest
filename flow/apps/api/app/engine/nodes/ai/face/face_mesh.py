import asyncio
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image
from app.engine.nodes.ai.face._engine import detect_faces, draw_face_mesh


class FaceMeshHandler(BaseNodeHandler):
    """
    Core face block: detects faces and produces 68 landmarks per face.
    Downstream blocks (count, direction, smile) read `faces` from inputs.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        data = find_input_image(inputs)
        if not data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")

        def _run():
            img = decode_image(data)
            faces, bboxes = detect_faces(img)
            annotated = draw_face_mesh(img, faces, bboxes)
            return faces, bboxes, encode_image(annotated), img.size  # (w, h)

        faces, bboxes, image_url, (img_w, img_h) = await asyncio.to_thread(_run)
        return {
            "image": image_url,
            "faces": faces,
            "bboxes": bboxes,
            "image_size": {"w": img_w, "h": img_h},
            "count": len(faces) if faces else len(bboxes),
            "text": f"พบ {len(bboxes)} ใบหน้า" if bboxes else "ไม่พบใบหน้า",
        }
