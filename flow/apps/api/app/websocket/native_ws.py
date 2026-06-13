"""Backend-native processing — the professional path.

Instead of the browser sending one frame at a time and waiting for each result
(the live-detect round-trip), the BACKEND owns the source: it opens the camera
or video file directly (OpenCV), grabs every frame at full GPU speed, runs the
whole flow per frame, and streams only the results to the UI. Like running
`yolo track source=...` in a terminal — no per-frame upload, nothing skipped.

Client → server (JSON):
    first:  { "definition": <flow>, "source_id": "<source node id>",
              "source": {"type":"video","file_id":"x.mp4"} | {"type":"webcam","index":0} }
    later:  { "definition": <flow> }   # on flow edits
            { "stop": true }           # stop processing

Server → client (JSON), per processed frame:
    { "ok": true, "outputs": { node_id: {...} }, "progress": {"frame":i,"total":n} }
    { "ok": true, "done": true }       # video reached its end
"""
import os
import json
import time
import uuid
import base64
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.engine.executor import FlowExecutor
from app.engine.nodes.state_registry import reset_nodes
from app.auth.ws import authenticate_ws, WS_UNAUTHORIZED
from app.paths import VIDEO_DIR

router = APIRouter()

_MAX_DIM = 960            # downscale large frames before inference (YOLO uses 640)
_JPEG_Q = 70


def _video_path(file_id: str) -> str | None:
    name = os.path.basename(file_id or "")
    if not name:
        return None
    path = os.path.join(VIDEO_DIR, name)
    return path if os.path.exists(path) else None


def _max_dim_for(definition: dict) -> int:
    """Frame downscale cap from the AI blocks' detail setting — keep full(er)
    resolution when any block asks for 'original'."""
    for n in definition.get("nodes", []):
        if str(n.get("data", {}).get("config", {}).get("imgsz")) == "original":
            return 1920
    return _MAX_DIM


def _frame_to_dataurl(frame_bgr, max_dim: int = _MAX_DIM) -> str | None:
    import cv2
    h, w = frame_bgr.shape[:2]
    scale = min(1.0, max_dim / max(h, w))
    if scale < 1.0:
        frame_bgr = cv2.resize(frame_bgr, (int(w * scale), int(h * scale)))
    ok, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, _JPEG_Q])
    if not ok:
        return None
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def _inject(definition: dict, source_id: str, data_url: str,
            det_id: str | None = None, det_token: str | None = None) -> dict:
    nodes = []
    for n in definition.get("nodes", []):
        if n.get("id") == source_id:
            n = {**n, "data": {**n.get("data", {}), "config": {
                **n.get("data", {}).get("config", {}),
                "image": data_url, "mime": "image/jpeg",
            }}}
        elif det_id and n.get("id") == det_id:
            # Tell the Detect block to use the pre-batched result for this frame
            n = {**n, "data": {**n.get("data", {}), "config": {
                **n.get("data", {}).get("config", {}), "_det_token": det_token,
            }}}
        nodes.append(n)
    return {**definition, "nodes": nodes}


def _frame_pair(frame_bgr, max_dim: int = _MAX_DIM):
    """A downscaled frame as (jpeg data url for injection, RGB PIL for batch detect)."""
    import cv2
    from PIL import Image
    h, w = frame_bgr.shape[:2]
    scale = min(1.0, max_dim / max(h, w))
    if scale < 1.0:
        frame_bgr = cv2.resize(frame_bgr, (int(w * scale), int(h * scale)))
    ok, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, _JPEG_Q])
    data = ("data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()) if ok else None
    return data, Image.fromarray(frame_bgr[:, :, ::-1])


def _batchable_detect(definition: dict, source_id: str):
    """Return the Detect node iff it can be safely batched: exactly one detect
    block whose image comes DIRECTLY from the source (no transform in between,
    which would make batching the raw frame wrong). Else None → per-frame."""
    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])
    dets = [n for n in nodes if n.get("type") == "detect"]
    if len(dets) != 1:
        return None
    d = dets[0]
    incoming = [e for e in edges if e.get("target") == d.get("id")]
    if not incoming or any(e.get("source") != source_id for e in incoming):
        return None
    return d


def _open_capture(source: dict):
    import cv2
    if source.get("type") == "video":
        path = _video_path(source.get("file_id", ""))
        if not path:
            return None, "ไม่พบไฟล์วิดีโอ — อัปโหลดใหม่"
        cap = cv2.VideoCapture(path)
    else:
        idx = int(source.get("index", 0) or 0)
        # CAP_DSHOW opens far faster on Windows
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW) if os.name == "nt" else cv2.VideoCapture(idx)
    if not cap or not cap.isOpened():
        return None, "เปิดแหล่งภาพไม่ได้ (กล้องถูกใช้งานอยู่ หรือไฟล์เสีย)"
    return cap, None


@router.websocket("/ws/native")
async def native_run(websocket: WebSocket):
    await websocket.accept()
    user = await authenticate_ws(websocket)
    if not user:
        await websocket.close(code=WS_UNAUTHORIZED)
        return

    state: dict = {"definition": None, "source_id": None, "source": None, "stop": False}

    async def receiver():
        try:
            while True:
                msg = json.loads(await websocket.receive_text())
                if msg.get("stop"):
                    state["stop"] = True
                    return
                if msg.get("definition"):
                    state["definition"] = msg["definition"]
                if "source_id" in msg:
                    state["source_id"] = msg["source_id"]
                if msg.get("source"):
                    state["source"] = msg["source"]
        except (WebSocketDisconnect, json.JSONDecodeError, RuntimeError):
            state["stop"] = True

    async def processor():
        # Wait for the opening message (definition + source)
        while not (state["definition"] and state["source"]) and not state["stop"]:
            await asyncio.sleep(0.03)
        if state["stop"]:
            return

        source = state["source"]
        reset_nodes({n.get("id") for n in state["definition"].get("nodes", [])})

        import cv2
        cap, err = await asyncio.to_thread(_open_capture, source)
        if err:
            await websocket.send_text(json.dumps({"ok": False, "error": err}))
            return

        is_video = source.get("type") == "video"
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if is_video else 0
        mirror = bool(source.get("mirror"))                    # webcam: flip horizontally
        try:
            speed = float(source.get("speed", 1.0) or 1.0)     # video playback rate (every frame still processed)
        except (TypeError, ValueError):
            speed = 1.0
        if speed <= 0:                                          # zero/negative would skip pacing entirely
            speed = 1.0
        # Pace the loop to play at `speed`× real time. EVERY frame is still
        # processed (accurate) — speed only throttles how fast results stream,
        # so a fast clip can be watched at 0.25× without skipping anything.
        vid_fps = cap.get(cv2.CAP_PROP_FPS) if is_video else 0.0
        period = (1.0 / (vid_fps * speed)) if (is_video and vid_fps and vid_fps > 0 and speed > 0) else 0.0

        # Batch-detect fast path (video + source→detect direct): run YOLO on
        # several frames per call — ~2× throughput. Public predict() API only.
        # We RE-CHECK the snapshot each iteration so an edit during processing
        # (user moves a counting line / adds a transform) is honored safely
        # instead of stuck with the opening definition.
        next_t = time.perf_counter()
        i = 0

        async def emit_and_pace(outputs):
            nonlocal next_t
            out_msg = {"ok": True, "outputs": outputs}
            if total:
                out_msg["progress"] = {"frame": i, "total": total}
            await websocket.send_text(json.dumps(out_msg))
            if period:
                next_t += period
                delay = next_t - time.perf_counter()
                if delay > 0:
                    await asyncio.sleep(delay)
                elif delay < -0.5:
                    next_t = time.perf_counter()

        try:
            from app.engine.nodes.ai.detect import predict_batch, auto_model, _batch_cache
            BATCH = 8
            while not state["stop"]:
                # Re-evaluate every iteration — definition may have changed
                defn = state["definition"]
                src_id = state["source_id"]
                max_dim = _max_dim_for(defn)
                bd = _batchable_detect(defn, src_id) if is_video else None

                if bd:
                    bcfg = bd.get("data", {}).get("config", {})
                    mname = bcfg.get("model") or auto_model()
                    if mname == "auto":
                        mname = auto_model()
                    mconf = float(bcfg.get("confidence", 0.25))
                    misz = bcfg.get("imgsz", "fast")
                    pairs = []
                    for _ in range(BATCH):
                        ok, frame = await asyncio.to_thread(cap.read)
                        if not ok:
                            break
                        if mirror:
                            frame = await asyncio.to_thread(cv2.flip, frame, 1)
                        pairs.append(await asyncio.to_thread(_frame_pair, frame, max_dim))
                    if not pairs:
                        await websocket.send_text(json.dumps({"ok": True, "done": True}))
                        break
                    pils = [p for _, p in pairs]
                    try:
                        det_outs = await asyncio.to_thread(predict_batch, pils, mname, mconf, misz)
                    except Exception as e:  # noqa: BLE001
                        det_outs = [{"error": str(e)[:200]}] * len(pils)
                    if len(_batch_cache) > 512:
                        _batch_cache.clear()
                    for (data_url, _), det_out in zip(pairs, det_outs):
                        if state["stop"]:
                            break
                        i += 1
                        token = uuid.uuid4().hex
                        _batch_cache[token] = det_out
                        # Use the freshest snapshot for THIS frame (an edit
                        # between batches lands on the next frame, not lost)
                        patched = _inject(state["definition"], state["source_id"], data_url, bd.get("id"), token)
                        try:
                            outputs = await FlowExecutor.run_preview(patched)
                        except Exception as e:  # noqa: BLE001
                            outputs = {"_error": str(e)[:200]}
                        _batch_cache.pop(token, None)
                        await emit_and_pace(outputs)
                else:
                    ok, frame = await asyncio.to_thread(cap.read)
                    if not ok:
                        if is_video:
                            await websocket.send_text(json.dumps({"ok": True, "done": True}))
                            break
                        await asyncio.sleep(0.05)   # transient camera hiccup
                        continue
                    i += 1
                    if mirror:
                        frame = await asyncio.to_thread(cv2.flip, frame, 1)
                    data_url = await asyncio.to_thread(_frame_to_dataurl, frame, max_dim)
                    if not data_url:
                        continue
                    patched = _inject(state["definition"], state["source_id"], data_url)
                    try:
                        outputs = await FlowExecutor.run_preview(patched)
                    except Exception as e:  # noqa: BLE001
                        outputs = {"_error": str(e)[:200]}
                    await emit_and_pace(outputs)
        finally:
            await asyncio.to_thread(cap.release)

    recv = asyncio.create_task(receiver())
    proc = asyncio.create_task(processor())
    try:
        done, pending = await asyncio.wait({recv, proc}, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
    except Exception:  # noqa: BLE001
        recv.cancel()
        proc.cancel()
