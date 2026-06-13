"""
Image Classifier — few-shot image classification with CLIP embeddings.

Each block stores up to 5 reference images and one label. At inference time,
the input image is embedded and compared (cosine similarity) against the
mean embedding of the reference images. If the similarity exceeds the
threshold, the block outputs the label; otherwise the output is empty.
"""
import io
import asyncio
import base64
import threading
import numpy as np
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, find_input_image

_lock = threading.Lock()
_model = None
_preprocess = None
_device: str | None = None


def _get_clip():
    """Lazy-load OpenCLIP ViT-B/32 (small + fast). Picks GPU if available.

    NOTE: newer embedders (SigLIP2) benchmark better, but their cosine scale
    sits much higher across the board — every threshold users tuned on saved
    projects would over-match. Don't swap without a score recalibration plan.
    """
    global _model, _preprocess, _device
    if _model is None:
        with _lock:
            if _model is None:
                import torch
                import open_clip

                _device = "cuda" if torch.cuda.is_available() else "cpu"
                model, _, preprocess = open_clip.create_model_and_transforms(
                    "ViT-B-32", pretrained="laion2b_s34b_b79k"
                )
                model.eval().to(_device)
                _model = model
                _preprocess = preprocess
                print(
                    f"[Classifier] CLIP loaded on {_device}",
                    flush=True,
                )
    return _model, _preprocess, _device


def _decode_data_url(data_url: str):
    raw = data_url.split(",", 1)[1] if "," in data_url else data_url
    return base64.b64decode(raw)


def _embed_one(model, preprocess, device, data_url: str) -> np.ndarray:
    """Return a normalized 512-d CLIP embedding."""
    import torch
    from PIL import Image

    img = Image.open(io.BytesIO(_decode_data_url(data_url))).convert("RGB")
    tensor = preprocess(img).unsqueeze(0).to(device)
    with torch.no_grad():
        feat = model.encode_image(tensor)
        feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat.cpu().numpy()[0]


class ClassifierHandler(BaseNodeHandler):
    """
    Config:
        label:      str  — the label this block recognizes
        examples:   list[str]  — up to 5 reference image data URLs
        threshold:  float  — cosine similarity threshold (default 0.75)

    Output:
        text:       label if similarity >= threshold, else ""
        score:      similarity score (0-1)
        matched:    bool
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        label = str(config.get("label", "")).strip()
        examples = config.get("examples", []) or []
        threshold = float(config.get("threshold", 0.75))

        data = find_input_image(inputs)
        if not data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        if not label or not examples:
            return {"text": "", "score": 0.0, "matched": False, "label": label}

        def _run():
            model, preprocess, device = _get_clip()
            # Embed input + examples; compute similarity against the mean reference
            input_emb = _embed_one(model, preprocess, device, data)
            ref_embs = np.stack([
                _embed_one(model, preprocess, device, ex) for ex in examples
            ])
            ref_mean = ref_embs.mean(axis=0)
            ref_mean = ref_mean / np.linalg.norm(ref_mean)
            score = float(np.dot(input_emb, ref_mean))
            return score

        score = await asyncio.to_thread(_run)
        matched = score >= threshold

        return {
            "text": label if matched else "",
            "label": label,
            "score": round(score, 3),
            "threshold": threshold,
            "matched": matched,
        }
