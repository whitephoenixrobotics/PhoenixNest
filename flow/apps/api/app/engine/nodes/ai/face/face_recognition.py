"""
Face Recognition block — few-shot face matching against reference photos.

For each input image:
  1. YuNet detects faces; pick the LARGEST one.
  2. SFace aligns (5-point landmarks) and embeds it (128-d, face-specific) —
     far more discriminative than a generic image embedder on face crops.
  3. Compare against the mean embedding of the reference photos.
  4. If cosine similarity ≥ threshold → output the configured name.

SFace cosine scale (per OpenCV docs): same person ≈ 0.4–0.7, different
person ≈ ≤ 0.2; recommended threshold 0.363.
"""
import io
import asyncio
import base64
import numpy as np
from PIL import Image
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import find_input_image
from app.engine.nodes.ai.face._engine import embed_largest_face


def _decode(data_url: str) -> Image.Image:
    raw = data_url.split(",", 1)[1] if "," in data_url else data_url
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")


def _resolve_threshold(raw: float) -> float:
    """Map saved thresholds onto the SFace cosine scale.

    Configs saved before the SFace upgrade used the CLIP scale (panel range
    0.5–0.95, default 0.78). SFace thresholds live around 0.2–0.6, so any
    value ≥ 0.6 must be legacy — remap [0.6, 0.95] → [0.3, 0.5] linearly.
    """
    if raw >= 0.6:
        return 0.3 + (min(raw, 0.95) - 0.6) * (0.5 - 0.3) / (0.95 - 0.6)
    return raw


class FaceRecognitionHandler(BaseNodeHandler):
    """
    Config:
        name:       str  — the name of the person this block recognizes
        examples:   list[str]  — up to 5 reference face image data URLs
        threshold:  float  — SFace cosine threshold (default 0.36)

    Output:
        text:       name if matched, else ""
        name:       the configured name (always)
        score:      similarity score
        matched:    bool
        face_found: was a face detected in the input?
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        name = str(config.get("name", "")).strip()
        examples = config.get("examples", []) or []
        threshold = _resolve_threshold(float(config.get("threshold", 0.36)))

        data = find_input_image(inputs)
        if not data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        if not name or not examples:
            return {
                "text": "", "name": name, "score": 0.0,
                "matched": False, "face_found": False,
                "result": False,
            }

        def _run():
            input_emb = embed_largest_face(_decode(data))
            if input_emb is None:
                return False, 0.0

            ref_embs = []
            for ex in examples:
                emb = embed_largest_face(_decode(ex))
                if emb is not None:
                    ref_embs.append(emb)
            if not ref_embs:
                return True, 0.0     # face in input, but no usable reference

            ref_mean = np.stack(ref_embs).mean(axis=0)
            n = np.linalg.norm(ref_mean)
            if n == 0:
                return True, 0.0
            score = float(np.dot(input_emb, ref_mean / n))
            return True, score

        face_found, score = await asyncio.to_thread(_run)
        matched = face_found and score >= threshold

        return {
            "text": name if matched else "",
            "name": name,
            "score": round(score, 3),
            "threshold": round(threshold, 3),
            "matched": matched,
            "face_found": face_found,
            "result": matched,
        }
