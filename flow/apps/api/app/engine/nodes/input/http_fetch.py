import json as _json
import httpx
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.state_registry import register

# Cache last response per node so we don't re-fetch on every Auto Run tick
_cache: dict[str, dict] = register({})


def _trigger(inputs: dict) -> bool:
    """True if an upstream block is signalling (e.g. an Interval pulse)."""
    for v in inputs.values():
        if isinstance(v, dict) and (v.get("result") or v.get("on") or v.get("fetched") or v.get("count", 0) > 0):
            return True
    return False


def _parse_headers(text: str) -> dict:
    """Parse a 'Key: Value' per line block into a headers dict."""
    headers: dict = {}
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith('#') or ':' not in line:
            continue
        k, _, v = line.partition(':')
        k = k.strip()
        if k:
            headers[k] = v.strip()
    return headers


class HttpFetchHandler(BaseNodeHandler):
    """
    HTTP request block (GET/POST) with optional headers and JSON body.

    Fetches when the Fetch button is clicked (fetch_token changes), when the
    request changes (URL / method / headers / body edited), or on the rising
    edge of an upstream trigger (e.g. an Interval block → re-fetch every N min).
    Otherwise the cached last response is returned, so it's cheap under
    Auto/Live. Use the Headers field for an API key (e.g. `Authorization: Bearer …`).
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        node_id = str(config.get("_node_id", "default"))
        url = str(config.get("url", "")).strip()
        method = str(config.get("method", "GET")).upper().strip() or "GET"
        headers = _parse_headers(str(config.get("headers", "")))
        body = str(config.get("body", "")).strip()
        fetch_token = config.get("fetch_token", 0)

        state = _cache.setdefault(node_id, {
            "result": {"text": "", "data": None, "status": 0, "ok": False, "error": ""},
            "prev_token": fetch_token,
            "prev_trig": False,
            "sig": None,
        })

        clicked = fetch_token != state["prev_token"]
        state["prev_token"] = fetch_token

        # Rising edge of an upstream trigger → re-fetch (periodic refresh)
        trig = _trigger(inputs)
        rising = trig and not state.get("prev_trig", False)
        state["prev_trig"] = trig

        if not url:
            state["result"] = {"text": "", "data": None, "status": 0, "ok": False, "error": "ยังไม่ตั้ง URL"}
            return {**state["result"], "result": False, "fetched": False}

        # Re-fetch on button, request change, or an upstream trigger pulse
        sig = (method, url, tuple(sorted(headers.items())), body)
        fetch_now = clicked or rising or sig != state.get("sig")
        if not fetch_now:
            return {**state["result"], "result": False, "fetched": False}

        state["sig"] = sig
        try:
            kwargs: dict = {"headers": headers}
            if method == "POST" and body:
                if not any(k.lower() == "content-type" for k in headers):
                    headers["Content-Type"] = "application/json"
                kwargs["content"] = body.encode("utf-8")
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.request(method, url, **kwargs)
            text = resp.text
            data = None
            try:
                data = _json.loads(text)
            except (_json.JSONDecodeError, ValueError):
                pass
            state["result"] = {
                "text": text,
                "data": data,
                "status": resp.status_code,
                "ok": 200 <= resp.status_code < 300,
                "error": "" if 200 <= resp.status_code < 300 else f"HTTP {resp.status_code}",
            }
        except Exception as e:  # noqa: BLE001
            state["result"] = {"text": "", "data": None, "status": 0, "ok": False, "error": str(e)[:140]}

        # result=True only on the tick we actually fetched — propagates the edge
        # downstream so e.g. TTS re-fires on each new fetch.
        return {**state["result"], "result": True, "fetched": True}
