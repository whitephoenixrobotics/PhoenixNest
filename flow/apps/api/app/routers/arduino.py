"""
Arduino UNO extension — REST + WebSocket endpoints.

Layout:
  GET  /arduino/ports       — list serial ports (heuristic-marked likely Arduinos)
  POST /arduino/connect     — open pyfirmata2 session on the given port
  POST /arduino/disconnect  — close current session
  GET  /arduino/status      — current connection state
  POST /arduino/flash       — flash bundled StandardFirmata.hex via avrdude
  WS   /ws/arduino/pin      — live sensor stream (subscribe to pins, push reads)
"""
from __future__ import annotations

import asyncio
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.auth.dependencies import get_approved_user as get_current_user
from app.auth.ws import authenticate_ws
from app.extensions.arduino import get_manager
from app.extensions.arduino.flash import check_bundle, flash as _flash_blocking
from app.extensions.arduino.manager import list_ports
from app.models.user import User

log = logging.getLogger(__name__)

router = APIRouter(prefix="/arduino", tags=["arduino"])
ws_router = APIRouter(tags=["arduino"])


# ── Request models ────────────────────────────────────────────────────────────
class ConnectBody(BaseModel):
    port: str = Field(..., min_length=2, max_length=64)


class FlashBody(BaseModel):
    port: str = Field(..., min_length=2, max_length=64)


# ── REST ──────────────────────────────────────────────────────────────────────
@router.get("/ports")
async def get_ports(_user: User = Depends(get_current_user)):
    ports = list_ports()
    return {
        "ports": [
            {
                "device": p.device,
                "description": p.description,
                "vid": p.vid,
                "pid": p.pid,
                "likely_arduino": p.likely_arduino,
            }
            for p in ports
        ]
    }


@router.get("/status")
async def get_status(_user: User = Depends(get_current_user)):
    s = get_manager().status()
    bundle_ok, bundle_msg = check_bundle()
    return {
        "connected": s.connected,
        "port": s.port,
        "firmware_name": s.firmware_name,
        "firmware_version": s.firmware_version,
        "pin_modes": s.pin_modes,
        "firmware_bundle_ok": bundle_ok,
        "firmware_bundle_msg": bundle_msg,
    }


@router.post("/connect")
async def connect(body: ConnectBody, _user: User = Depends(get_current_user)):
    mgr = get_manager()
    try:
        # pyfirmata2.Arduino() blocks ~2-3 s during handshake — keep loop responsive.
        s = await asyncio.to_thread(mgr.connect, body.port)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "ok": True,
        "port": s.port,
        "firmware_name": s.firmware_name,
        "firmware_version": s.firmware_version,
    }


@router.post("/disconnect")
async def disconnect(_user: User = Depends(get_current_user)):
    await asyncio.to_thread(get_manager().disconnect)
    return {"ok": True}


@router.post("/flash")
async def flash(body: FlashBody, _user: User = Depends(get_current_user)):
    bundle_ok, bundle_msg = check_bundle()
    if not bundle_ok:
        raise HTTPException(status_code=500, detail=bundle_msg)

    # If we're holding the port open via pyfirmata, avrdude can't claim it.
    mgr = get_manager()
    if mgr.is_connected and mgr.status().port == body.port:
        await asyncio.to_thread(mgr.disconnect)

    result = await asyncio.to_thread(_flash_blocking, body.port)
    return {
        "ok": result.ok,
        "duration_s": round(result.duration_s, 2),
        "log": result.log[-4000:],  # cap so a huge log doesn't break the JSON viewer
    }


# ── WebSocket: live pin reads ────────────────────────────────────────────────
PinMode = Literal["digital_in", "analog_in"]


@ws_router.websocket("/ws/arduino/pin")
async def ws_pin_reads(ws: WebSocket):
    """Subscribe to one or more pin reads. Client sends:
        {"subscribe": [{"pin": 0, "mode": "analog_in"}, ...], "interval_ms": 100}
    and we emit:
        {"values": {"a:0": 512, "d:7": 1}, "t": <ms>}
    every interval_ms while the board is connected. Re-send subscribe to change.
    """
    user = await authenticate_ws(ws)
    if user is None:
        await ws.close(code=4401)
        return
    await ws.accept()

    subs: list[tuple[int, PinMode]] = []
    interval_ms = 100

    async def _emit_loop() -> None:
        import time
        mgr = get_manager()
        while True:
            if not mgr.is_connected or not subs:
                await asyncio.sleep(0.1)
                continue
            values: dict[str, int | bool | None] = {}
            for pin, mode in subs:
                try:
                    if mode == "analog_in":
                        values[f"a:{pin}"] = mgr.read_analog(pin)
                    else:
                        values[f"d:{pin}"] = mgr.read_digital(pin)
                except Exception as e:
                    values[f"err:{mode}:{pin}"] = str(e)  # type: ignore[assignment]
            try:
                await ws.send_json({"values": values, "t": int(time.time() * 1000)})
            except Exception:
                return
            await asyncio.sleep(interval_ms / 1000)

    emitter = asyncio.create_task(_emit_loop())
    try:
        while True:
            msg = await ws.receive_json()
            new_subs = msg.get("subscribe")
            if isinstance(new_subs, list):
                subs.clear()
                for s in new_subs:
                    try:
                        pin = int(s["pin"])
                        mode = s["mode"]
                        if mode in ("digital_in", "analog_in"):
                            subs.append((pin, mode))
                    except (KeyError, ValueError, TypeError):
                        continue
            iv = msg.get("interval_ms")
            if isinstance(iv, (int, float)) and 20 <= iv <= 5000:
                interval_ms = int(iv)
    except WebSocketDisconnect:
        pass
    finally:
        emitter.cancel()
