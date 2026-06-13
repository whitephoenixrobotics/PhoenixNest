from app.engine.nodes.base import BaseNodeHandler


def _find_faces(inputs: dict) -> list | None:
    """Pull `faces` (list of landmark arrays) from any upstream output."""
    for value in inputs.values():
        if isinstance(value, dict) and isinstance(value.get("faces"), list):
            return value["faces"]
    return None


class FaceCountHandler(BaseNodeHandler):
    """Counts faces detected by an upstream Face Mesh block."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        faces = _find_faces(inputs)
        if faces is None:
            raise ValueError("ต้องต่อจาก block 'โครงใบหน้า' ก่อน")
        n = len(faces)
        return {
            "count": n,
            "text": f"{n} ใบหน้า",
        }
