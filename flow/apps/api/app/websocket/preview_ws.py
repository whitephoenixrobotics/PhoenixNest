import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.engine.executor import FlowExecutor
from app.engine.nodes.state_registry import reset_nodes, prune_removed
from app.auth.ws import authenticate_ws, WS_UNAUTHORIZED

router = APIRouter()


@router.websocket("/ws/preview")
async def preview_ws(websocket: WebSocket):
    """Auto-Run preview channel.

    The Auto-mode preview path (no live camera frame). The client sends
    {"definition": <flow>} when the flow changed, or {} as a cheap tick;
    the server re-runs the cached definition and returns the node outputs.

    Keeping the definition server-side avoids re-uploading multi-MB base64
    images every 250–300ms (the old HTTP /flows/preview did exactly that).

    Server reply per message:
        { "ok": true, "outputs": { node_id: {...}, ... } }
    """
    await websocket.accept()

    user = await authenticate_ws(websocket)
    if not user:
        await websocket.close(code=WS_UNAUTHORIZED)
        return

    cached_definition: dict | None = None

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                req = json.loads(raw)
            except json.JSONDecodeError:
                continue

            incoming = req.get("definition")
            if incoming and incoming.get("nodes"):
                new_ids = {n.get("id") for n in incoming["nodes"]}
                if cached_definition is None:
                    # New auto session → stateful blocks start fresh
                    reset_nodes(new_ids)
                else:
                    # Mid-session flow edit → drop state of removed nodes only
                    prev_ids = {n.get("id") for n in cached_definition.get("nodes", [])}
                    prune_removed(prev_ids, new_ids)
                cached_definition = incoming

            if not (cached_definition and cached_definition.get("nodes")):
                await websocket.send_text(json.dumps({"ok": False, "error": "no definition"}))
                continue

            try:
                outputs = await FlowExecutor.run_preview(cached_definition)
                await websocket.send_text(json.dumps({"ok": True, "outputs": outputs}))
            except Exception as e:  # noqa: BLE001
                await websocket.send_text(json.dumps({"ok": False, "error": str(e)}))

    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        pass
