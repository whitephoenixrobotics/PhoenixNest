import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.engine.context import ExecutionContext
from app.auth.ws import authenticate_ws, WS_UNAUTHORIZED

router = APIRouter()


@router.websocket("/ws/executions/{execution_id}")
async def execution_websocket(websocket: WebSocket, execution_id: str):
    await websocket.accept()

    user = await authenticate_ws(websocket)
    if not user:
        await websocket.close(code=WS_UNAUTHORIZED)
        return

    queue = ExecutionContext.get_global_queue(execution_id)

    try:
        while True:
            # Wait for messages with timeout
            try:
                message = await asyncio.wait_for(queue.get(), timeout=60.0)
                await websocket.send_text(json.dumps(message))

                if message.get("type") == "execution_finished":
                    break

            except asyncio.TimeoutError:
                # Send ping to keep alive
                await websocket.send_text(json.dumps({"type": "ping"}))

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        # Consumed to completion — clean up the buffered queue now
        ExecutionContext.remove_global_queue(execution_id)
        try:
            await websocket.close()
        except Exception:
            pass
