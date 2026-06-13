"""Object Tracking + counting block.

Each frame is run through YOLO with ultralytics' built-in **ByteTrack**, which
assigns every object a persistent ID (Kalman prediction + two-stage matching —
robust through occlusion and crowded scenes). Objects are then counted against
any number of user-drawn LINES (crossings, in/out) and ZONES (occupancy + total
that entered) placed in the same block.

A ByteTrack tracker lives on a per-node model instance (persist=True), so IDs
stay stable across frames; per-region tallies + per-track crossing state live
in state_registry, reset per Run/session or when the `reset` token changes.
"""
import asyncio
import threading
import time
from app.engine.nodes.base import BaseNodeHandler
from app.engine.image_utils import decode_image, encode_image, find_input_image
from app.engine.nodes.ai.detect import _get_device, _use_half, auto_model, resolve_imgsz
from app.engine.nodes.dl._models import resolve_path
from app.engine.nodes.state_registry import register

_state: dict[str, dict] = register({})

_MAX_MISSED = 60        # forget a per-track counting record after this many unseen frames

# A separate ByteTrack-enabled model instance per node (its tracker must not be
# shared between nodes). Registered with state_registry so a deleted node's
# model is freed when the live/preview session prunes removed nodes.
_track_models: dict = register({})   # node_id → (weights_key, YOLO model)
_tm_lock = threading.Lock()


def _get_track_model(model_name: str, model_id: str, node_id: str):
    weights = model_id or model_name
    entry = _track_models.get(node_id)
    if entry is None or entry[0] != weights:
        with _tm_lock:
            entry = _track_models.get(node_id)
            if entry is None or entry[0] != weights:
                from ultralytics import YOLO
                path = resolve_path(model_id) if model_id else model_name
                m = YOLO(path)
                m.to(_get_device())
                _track_models[node_id] = (weights, m)
                entry = _track_models[node_id]
    return entry[1]


def _drop_track_model(node_id: str) -> None:
    """Forget this node's tracker (e.g. on reset) so ByteTrack starts fresh."""
    _track_models.pop(node_id, None)


def _side(px, py, a, b) -> int:
    """Which side of line a→b the point is on (sign of the cross product)."""
    cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])
    return 1 if cross >= 0 else -1


def _within_segment(px, py, a, b) -> bool:
    """Is the point's projection within the drawn segment span (not the
    infinite line)? Keeps a one-lane line from counting the next lane."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return True
    t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2
    return -0.05 <= t <= 1.05


def _fresh_state(reset_token) -> dict:
    # tstate: per-ByteTrack-id record {cx,cy,bbox,cls,hits,missed,sides,insides,
    #         hist,speed,zenter,zalert}
    # regions: per-region tallies (line→in/out, zone→entered)
    # events: timestamps of every count, for throughput-per-minute
    return {"tstate": {}, "regions": {}, "events": [], "reset_token": reset_token}


def _migrate_regions(config: dict) -> list:
    """Regions list from config, converting the old single line/zone if needed."""
    regions = config.get("regions")
    if isinstance(regions, list):
        return regions   # may be empty → nothing to count yet
    mode = str(config.get("mode", "line"))
    if mode == "zone":
        z = config.get("zone") or {"x": 0.3, "y": 0.3, "w": 0.4, "h": 0.4}
        return [{"id": "r0", "kind": "zone", **z}]
    line = config.get("line") or {"x1": 0.2, "y1": 0.5, "x2": 0.8, "y2": 0.5}
    return [{"id": "r0", "kind": "line", **line}]


_QMAP = {"fast": "yolo26n.pt", "balanced": "yolo26s.pt", "accurate": "yolo26m.pt"}


class ObjectTrackingHandler(BaseNodeHandler):
    """Deep Learning block: ByteTrack multi-object tracking + line/zone counting."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        image_data = find_input_image(inputs)
        if not image_data:
            raise ValueError("ไม่มีภาพ input — เชื่อมต่อแหล่งภาพ (กล้อง/วิดีโอ) เข้ามาก่อน")

        node_id = str(config.get("_node_id", "default"))
        model_id = config.get("model_id") or ""
        confidence = float(config.get("confidence", 0.3))
        regions = _migrate_regions(config)
        class_filter = config.get("classes", "")
        reset_token = config.get("reset", 0)
        quality = str(config.get("quality", "auto"))
        model_name = _QMAP.get(quality) or auto_model()
        imgsz_setting = config.get("imgsz", "fast")
        show_path = str(config.get("trajectory", "off")) == "on"   # draw movement trails
        dwell_alert = float(config.get("dwell_alert", 0) or 0)      # seconds in a zone → trigger (0=off)

        s = _state.get(node_id)
        if s is None or s.get("reset_token") != reset_token:
            _drop_track_model(node_id)     # restart ByteTrack from scratch
            s = _fresh_state(reset_token)
            _state[node_id] = s

        def work():
            import cv2
            import numpy as np
            from PIL import Image

            img = decode_image(image_data)
            arr = np.array(img)
            h, w = arr.shape[:2]

            model = _get_track_model(model_name, model_id, node_id)
            sz = resolve_imgsz(imgsz_setting, w, h)
            res = model.track(img, conf=confidence, iou=0.5, imgsz=sz, persist=True,
                              tracker="bytetrack.yaml", verbose=False,
                              device=_get_device(), half=_use_half())[0]

            wanted = {c.strip().lower() for c in str(class_filter or "").split(",") if c.strip()}
            cur = []
            if res.boxes is not None and res.boxes.id is not None:
                ids = res.boxes.id.int().cpu().tolist()
                xyxy = res.boxes.xyxy.cpu().numpy()
                cls = res.boxes.cls.cpu().numpy()
                for tid, (x1, y1, x2, y2), c in zip(ids, xyxy, cls):
                    name = str(res.names[int(c)])
                    if wanted and name.lower() not in wanted:
                        continue
                    cur.append({"id": int(tid), "cls": name,
                                "cx": float((x1 + x2) / 2), "cy": float((y1 + y2) / 2),
                                "bbox": (float(x1), float(y1), float(x2), float(y2))})

            # Per-id persistent record (ByteTrack owns association)
            now = time.perf_counter()
            tstate = s["tstate"]
            cur_ids = set()
            for d in cur:
                tid = d["id"]
                cur_ids.add(tid)
                st = tstate.setdefault(tid, {"hits": 0, "missed": 0, "sides": {}, "insides": {},
                                            "hist": [], "speed": 0.0, "zenter": {}, "zalert": {}})
                # speed (px/s, EMA) from the previous position + trail history
                if st["hist"]:
                    t0, x0, y0 = st["hist"][-1]
                    dt = now - t0
                    if dt > 1e-3:
                        inst = ((d["cx"] - x0) ** 2 + (d["cy"] - y0) ** 2) ** 0.5 / dt
                        st["speed"] = 0.6 * st["speed"] + 0.4 * inst
                st["hist"].append((now, d["cx"], d["cy"]))
                if len(st["hist"]) > 32:
                    st["hist"].pop(0)
                st["hits"] += 1
                st["missed"] = 0
                st.update(cx=d["cx"], cy=d["cy"], bbox=d["bbox"], cls=d["cls"])
            for tid in list(tstate):
                if tid not in cur_ids:
                    tstate[tid]["missed"] += 1
                    if tstate[tid]["missed"] > _MAX_MISSED:
                        del tstate[tid]

            tracks = [tstate[d["id"]] for d in cur]   # records of objects seen this frame

            event = False
            region_out = []
            for idx, rg in enumerate(regions):
                rid = str(rg.get("id") or f"r{idx}")
                kind = rg.get("kind", "line")
                rs = s["regions"].setdefault(rid, {"in": 0, "out": 0, "entered": 0})
                if kind == "zone":
                    zx, zy = rg["x"] * w, rg["y"] * h
                    zw, zh = rg["w"] * w, rg["h"] * h
                    inside_now = 0
                    for tr in tracks:
                        if tr.get("hits", 0) < 3:
                            continue
                        inside = (zx <= tr["cx"] <= zx + zw) and (zy <= tr["cy"] <= zy + zh)
                        ins = tr["insides"]
                        if inside and not ins.get(rid):
                            rs["entered"] += 1
                            tr["zenter"][rid] = now          # start dwell timer
                            s["events"].append(now)          # throughput event
                            event = True
                        elif not inside:
                            tr["zenter"].pop(rid, None)
                            tr["zalert"].pop(rid, None)
                        ins[rid] = inside
                        # Dwell alert — fire once when an object has stayed too long
                        if inside and dwell_alert > 0 and rid in tr["zenter"]:
                            if now - tr["zenter"][rid] >= dwell_alert and not tr["zalert"].get(rid):
                                tr["zalert"][rid] = True
                                event = True
                        if inside:
                            inside_now += 1
                    region_out.append({"id": rid, "kind": "zone", "name": rg.get("name", ""),
                                       "inside": inside_now, "total": rs["entered"]})
                else:  # line
                    a = (rg["x1"] * w, rg["y1"] * h)
                    b = (rg["x2"] * w, rg["y2"] * h)
                    for tr in tracks:
                        cur_s = _side(tr["cx"], tr["cy"], a, b)
                        prev = tr["sides"].get(rid)
                        if (prev is not None and cur_s != prev and tr.get("hits", 0) >= 3
                                and _within_segment(tr["cx"], tr["cy"], a, b)):
                            rs["in" if cur_s > 0 else "out"] += 1
                            s["events"].append(now)          # throughput event
                            event = True
                        tr["sides"][rid] = cur_s
                    region_out.append({"id": rid, "kind": "line", "name": rg.get("name", ""),
                                       "in": rs["in"], "out": rs["out"]})

            total_in = sum(r.get("in", 0) for r in region_out)
            total_out = sum(r.get("out", 0) for r in region_out)
            total_inside = sum(r.get("inside", 0) for r in region_out)
            total_entered = sum(r.get("total", 0) for r in region_out)

            # Throughput — counts in the last 60s = per-minute rate
            s["events"] = [t for t in s["events"] if now - t <= 60.0]
            rate_per_min = len(s["events"])

            # ── annotate (boxes + speed + trail + every region's counts) ──
            bgr = arr[:, :, ::-1].copy()
            for d in cur:
                st = tstate[d["id"]]
                x1, y1, x2, y2 = (int(v) for v in d["bbox"])
                in_any = any(st["insides"].values())
                col = (60, 220, 60) if in_any else (0, 220, 255)
                if show_path and len(st["hist"]) > 1:
                    pts = np.array([[int(x), int(y)] for _, x, y in st["hist"]], np.int32)
                    cv2.polylines(bgr, [pts], False, col, 1)
                cv2.rectangle(bgr, (x1, y1), (x2, y2), col, 2)
                label = f"#{d['id']} {d['cls']} {int(st['speed'])}/s"
                cv2.putText(bgr, label, (x1, max(14, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 1)
                # dwell seconds when sitting in a zone
                if st["zenter"]:
                    dwell = now - min(st["zenter"].values())
                    cv2.putText(bgr, f"{dwell:.1f}s", (x1, min(int(y2) + 14, h - 4)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, col, 1)
                cv2.circle(bgr, (int(d["cx"]), int(d["cy"])), 3, col, -1)

            for ro, rg in zip(region_out, regions):
                if rg.get("kind") == "zone":
                    zx, zy = int(rg["x"] * w), int(rg["y"] * h)
                    zw, zh = int(rg["w"] * w), int(rg["h"] * h)
                    cv2.rectangle(bgr, (zx, zy), (zx + zw, zy + zh), (180, 80, 255), 2)
                    cv2.putText(bgr, f"{ro['inside']}/{ro['total']}", (zx + 3, zy + 16),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 170, 255), 1)
                else:
                    ax, ay = int(rg["x1"] * w), int(rg["y1"] * h)
                    bx, by = int(rg["x2"] * w), int(rg["y2"] * h)
                    cv2.line(bgr, (ax, ay), (bx, by), (180, 80, 255), 2)
                    cv2.putText(bgr, f"{ro['in']}/{ro['out']}", (ax, max(12, ay - 4)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 170, 255), 1)

            image_url = encode_image(Image.fromarray(bgr[:, :, ::-1]))

            boxes = []
            for d in cur:
                st = tstate[d["id"]]
                bx1, by1, bx2, by2 = d["bbox"]
                boxes.append({"id": d["id"], "cls": d["cls"],
                              "x": bx1 / w, "y": by1 / h,
                              "w": (bx2 - bx1) / w, "h": (by2 - by1) / h,
                              "speed": round(st["speed"]),
                              "inside": any(st["insides"].values())})

            speeds = [round(tstate[d["id"]]["speed"]) for d in cur]
            max_speed = max(speeds) if speeds else 0

            has_zone = any(r["kind"] == "zone" for r in region_out)
            if has_zone and total_in == 0 and total_out == 0:
                text = f"ในพื้นที่ {total_inside} · รวม {total_entered} · {rate_per_min}/นาที"
            else:
                text = f"เข้า {total_in} · ออก {total_out} · {rate_per_min}/นาที"

            return {
                "image": image_url,
                "boxes": boxes,
                "regions": region_out,
                "count": total_in + total_entered,
                "total": total_in + total_out + total_entered,
                "inside": total_inside,
                "in_count": total_in,
                "out_count": total_out,
                "rate_per_min": rate_per_min,   # throughput (objects counted in last 60s)
                "max_speed": max_speed,         # px/s of the fastest tracked object
                "tracked": len(cur),
                "result": event,        # crossed/entered/dwell-alert this frame → trigger
                "on": event,
                "text": text,
            }

        return await asyncio.to_thread(work)
