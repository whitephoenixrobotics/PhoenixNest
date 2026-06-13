import asyncio
import math
import numpy as np
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image
# Reuse the shared YOLO loader / device picker from the Detect block
from app.engine.nodes.ai.detect import _get_model, _get_device, _use_half

# COCO-17 keypoint indices (what YOLOv8-pose returns)
L_SHO, R_SHO = 5, 6
L_ELB, R_ELB = 7, 8
L_WRI, R_WRI = 9, 10
L_HIP, R_HIP = 11, 12
L_KNE, R_KNE = 13, 14
L_ANK, R_ANK = 15, 16
_KP_CONF = 0.3  # ignore low-confidence keypoints


def _angle(a, b, c) -> float | None:
    """Angle (degrees) at vertex b formed by points a-b-c. None if degenerate."""
    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])
    na = math.hypot(*ba)
    nc = math.hypot(*bc)
    if na == 0 or nc == 0:
        return None
    cos = (ba[0] * bc[0] + ba[1] * bc[1]) / (na * nc)
    cos = max(-1.0, min(1.0, cos))
    return math.degrees(math.acos(cos))


def _analyze(kxy: np.ndarray, kc: np.ndarray) -> dict:
    """Derive a set of single-frame gestures for one person from keypoints.

    Note on left/right: these follow YOLO's anatomical labels (the person's
    own left/right). A mirrored selfie webcam may visually swap them.
    """
    def ok(*idx) -> bool:
        return all(kc[i] >= _KP_CONF for i in idx)

    gestures: list[str] = []

    # Shoulder width — the scale reference for "how far is far"
    sho_w = (math.hypot(*(kxy[L_SHO] - kxy[R_SHO]))
             if ok(L_SHO, R_SHO) else 0.0)

    # ── Hands raised (wrist above its shoulder) ─────────────────────
    # The webcam feed is mirrored (selfie view), so YOLO's anatomical
    # left/right are flipped versus what the user sees. Swap the labels so
    # "ยกมือซ้าย" matches the hand the user actually raised on screen.
    left_up = ok(R_WRI, R_SHO) and kxy[R_WRI][1] < kxy[R_SHO][1]
    right_up = ok(L_WRI, L_SHO) and kxy[L_WRI][1] < kxy[L_SHO][1]
    if left_up:
        gestures.append("ยกมือซ้าย")
    if right_up:
        gestures.append("ยกมือขวา")

    # ── T-pose: both arms reaching out near shoulder height ─────────
    # An arm is "level" when the elbow is fairly straight, the wrist reaches
    # outward horizontally, and stays near shoulder height.
    def arm_level(sho, elb, wri) -> bool:
        if sho_w == 0 or not ok(sho, wri):
            return False
        dx = (kxy[wri][0] - kxy[sho][0]) / sho_w   # outward reach
        dy = (kxy[wri][1] - kxy[sho][1]) / sho_w   # height vs shoulder
        straight = True
        if ok(elb):
            ang = _angle(kxy[sho], kxy[elb], kxy[wri])
            straight = ang is None or ang >= 145
        return straight and abs(dx) > 0.6 and abs(dy) < 0.5

    t_pose = arm_level(L_SHO, L_ELB, L_WRI) and arm_level(R_SHO, R_ELB, R_WRI)
    if t_pose:
        gestures.append("กางแขน (T-pose)")

    # ── Standing vs sitting from knee angle ─────────────────────────
    posture = None
    knee_angles = []
    if ok(L_HIP, L_KNE, L_ANK):
        a = _angle(kxy[L_HIP], kxy[L_KNE], kxy[L_ANK])
        if a is not None:
            knee_angles.append(a)
    if ok(R_HIP, R_KNE, R_ANK):
        a = _angle(kxy[R_HIP], kxy[R_KNE], kxy[R_ANK])
        if a is not None:
            knee_angles.append(a)
    if knee_angles:
        avg = sum(knee_angles) / len(knee_angles)
        if avg >= 150:
            posture = "ยืน"
        elif avg <= 125:
            posture = "นั่ง"
    if posture:
        gestures.append(posture)

    return {
        "left_hand_up": bool(left_up),
        "right_hand_up": bool(right_up),
        "hands_up": int(left_up) + int(right_up),
        "t_pose": bool(t_pose),
        "posture": posture,          # None / "ยืน" / "นั่ง"
        "gestures": gestures,
    }


def _run(image_data: str, confidence: float, trigger: str) -> dict:
    from PIL import Image

    img = decode_image(image_data)
    from app.engine.nodes.ai.detect import auto_model
    model = _get_model(auto_model("-pose"))
    results = model(img, conf=confidence, verbose=False, device=_get_device(), half=_use_half())
    result = results[0]

    persons: list[dict] = []
    kpts = result.keypoints
    if kpts is not None and kpts.xy is not None and len(kpts.xy) > 0:
        xy = kpts.xy.cpu().numpy()                       # (N, 17, 2)
        conf = (kpts.conf.cpu().numpy() if kpts.conf is not None
                else np.ones((xy.shape[0], xy.shape[1])))  # (N, 17)
        for i in range(len(xy)):
            persons.append(_analyze(xy[i], conf[i]))

    # Skeleton drawn by ultralytics (BGR numpy -> RGB)
    annotated = Image.fromarray(result.plot()[:, :, ::-1])

    n = len(persons)
    total_hands_up = sum(p["hands_up"] for p in persons)
    # Aggregate booleans across all people (true if ANY person does it)
    left_up = any(p["left_hand_up"] for p in persons)
    right_up = any(p["right_hand_up"] for p in persons)
    t_pose = any(p["t_pose"] for p in persons)
    is_standing = any(p["posture"] == "ยืน" for p in persons)
    is_sitting = any(p["posture"] == "นั่ง" for p in persons)

    # Unique, order-preserving list of all detected gesture labels
    gestures: list[str] = []
    for p in persons:
        for g in p["gestures"]:
            if g not in gestures:
                gestures.append(g)

    if n:
        text = f"พบ {n} คน" + (f" · {', '.join(gestures)}" if gestures else "")
    else:
        text = "ไม่พบคน"

    # `result` is the single boolean that drives downstream Light/Logic blocks.
    # Which gesture it reflects is chosen via the `trigger` config.
    trigger_map = {
        "hands": total_hands_up > 0,
        "left": left_up,
        "right": right_up,
        "tpose": t_pose,
        "stand": is_standing,
        "sit": is_sitting,
    }
    result = trigger_map.get(trigger, total_hands_up > 0)

    return {
        "image": encode_image(annotated),
        "count": n,
        "persons": persons,
        "hands_up": total_hands_up,
        "left_hand_up": left_up,
        "right_hand_up": right_up,
        "t_pose": t_pose,
        "is_standing": is_standing,
        "is_sitting": is_sitting,
        "any_hand_up": total_hands_up > 0,
        "result": result,   # boolean so it can drive logic / light
        "gestures": gestures,
        "text": text,
    }


class PoseHandler(BaseNodeHandler):
    """AI block: human body pose (YOLOv8-pose, 17 keypoints) with single-frame
    gesture detection — hands raised (L/R), T-pose, stand/sit."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อ block ภาพเข้ามาก่อน")
        confidence = float(config.get("confidence", 0.25))
        trigger = str(config.get("trigger", "hands"))
        return await asyncio.to_thread(_run, image_data, confidence, trigger)
