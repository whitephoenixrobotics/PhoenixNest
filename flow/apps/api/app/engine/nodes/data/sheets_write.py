"""Write an upstream Data Table to a Google Sheet via the user's Apps Script Web App.

Writing to Sheets needs authorization, so the user deploys a tiny Apps Script
bound to their sheet (published as a Web App, "Anyone" access) and pastes its
URL here. This handler POSTs the table to that URL; their script appends/replaces.

Sends when the "ส่งขึ้น Sheet" button is pressed (send_token changes) or, with
auto on, on the rising edge of an upstream trigger (e.g. an Interval pulse).
Default mode = replace (mirror the whole table — idempotent, no duplicates).
"""
import httpx
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.state_registry import register

_state: dict[str, dict] = register({})


def _find_table(inputs: dict):
    for v in inputs.values():
        if isinstance(v, dict) and isinstance(v.get("headers"), list) and isinstance(v.get("rows"), list):
            return v["headers"], v["rows"]
    return None, None


def _trigger(inputs: dict) -> bool:
    for v in inputs.values():
        if isinstance(v, dict) and (v.get("result") or v.get("on") or v.get("fetched")):
            return True
    return False


class SheetsWriteHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        url = str(config.get("url", "")).strip()
        mode = str(config.get("mode", "replace"))
        send_token = config.get("send_token", 0)
        auto = bool(config.get("auto", False))

        st = _state.setdefault(node_id, {"prev_token": send_token, "prev_trig": False,
                                         "text": "", "ok": False})

        clicked = send_token != st["prev_token"]
        st["prev_token"] = send_token
        trig = _trigger(inputs)
        rising = trig and not st["prev_trig"]
        st["prev_trig"] = trig

        headers, rows = _find_table(inputs)
        idle = {"sent": False, "result": False, "on": False,
                "text": st.get("text", ""), "ok": st.get("ok", False)}

        if not (clicked or (auto and rising)):
            return idle
        if not url:
            return {**idle, "error": "ยังไม่ใส่ลิงก์ Web App"}
        if headers is None:
            return {**idle, "error": "ต่อบล็อกตารางข้อมูลเข้ามาก่อน"}

        payload = {"mode": mode, "headers": headers, "rows": rows}
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                resp = await client.post(url, json=payload)
            ok = 200 <= resp.status_code < 300
            st["ok"] = ok
            st["text"] = f"✅ ส่งแล้ว {len(rows)} แถว" if ok else f"❌ HTTP {resp.status_code}"
            return {"sent": True, "result": ok, "on": ok, "ok": ok,
                    "text": st["text"], "status": resp.status_code, "rows_sent": len(rows),
                    **({} if ok else {"error": f"Apps Script ตอบ HTTP {resp.status_code}"})}
        except Exception as e:  # noqa: BLE001
            st["text"] = f"❌ ส่งไม่สำเร็จ"
            return {**idle, "ok": False, "text": st["text"], "error": str(e)[:120]}
