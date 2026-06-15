"""AI assistant — multi-provider.

Assistants can be:
  • Local Ollama models (OpenAI-compatible at localhost:11434/v1) — install,
    switch, delete, or pull a custom one by name.
  • External APIs: "openai" (any OpenAI-compatible endpoint) or "anthropic"
    (Claude — native Messages API). The user supplies base URL / key / model.

The active assistant + the API providers are persisted in data/ai.json so the
choice survives restarts. Env still seeds defaults:
    AI_BASE_URL   default http://localhost:11434/v1   (Ollama OpenAI endpoint)
    AI_MODEL      default qwen2.5-coder:7b             (initial active model)
"""

import asyncio
import json
import os
import re
import secrets
import subprocess

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.paths import DATA_DIR

router = APIRouter(prefix="/api/ai", tags=["ai"])

OLLAMA_V1 = os.environ.get("AI_BASE_URL", "http://localhost:11434/v1").rstrip("/")
OLLAMA_HOST = OLLAMA_V1.removesuffix("/v1")
DEFAULT_MODEL = os.environ.get("AI_MODEL", "qwen2.5-coder:7b")
# The three offered local editions, smallest → largest.
MODEL_CATALOG = ["qwen2.5-coder:1.5b", "qwen2.5-coder:3b", "qwen2.5-coder:7b"]

_CONFIG = DATA_DIR / "ai.json"

SYSTEM_PROMPT = (
    "คุณเป็นผู้ช่วยเขียนโค้ด Python ที่เก่งและกระชับ ตอบเป็นภาษาไทย "
    "อธิบายให้เข้าใจง่าย และใส่โค้ดใน markdown code block (```python) เสมอ"
)


# ── config / active-assistant resolution ──────────────────────────────


def _load_config() -> dict:
    try:
        cfg = json.loads(_CONFIG.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    # migrate the old {"model": "<tag>"} shape
    if "active" not in cfg and "model" in cfg:
        cfg["active"] = f"ollama:{cfg['model']}"
    cfg.setdefault("active", f"ollama:{DEFAULT_MODEL}")
    cfg.setdefault("providers", [])
    return cfg


def _save_config() -> None:
    _CONFIG.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG.write_text(json.dumps(_config, ensure_ascii=False), encoding="utf-8")


_config = _load_config()


def _active() -> dict:
    """Resolve the active assistant to a uniform provider dict with keys:
    kind ('ollama'|'openai'|'anthropic'), id, label, model, base_url, api_key."""
    active = _config["active"]
    if active.startswith("api:"):
        for p in _config["providers"]:
            if p.get("id") == active:
                return p
        # provider vanished → fall back to the default local model
        active = f"ollama:{DEFAULT_MODEL}"
    tag = active.split(":", 1)[1] if ":" in active else DEFAULT_MODEL
    return {
        "kind": "ollama",
        "id": f"ollama:{tag}",
        "label": tag,
        "model": tag,
        "base_url": OLLAMA_V1,
        "api_key": "ollama",
    }


def _has(names: list[str], model: str) -> bool:
    """True if `model` is among Ollama's installed tags (lenient on :latest)."""
    base = model.split(":")[0]
    tag = model.split(":")[1] if ":" in model else ""
    for n in names:
        if n == model or n == f"{model}:latest":
            return True
        if tag and n == f"{base}:{tag}":
            return True
    return False


# ── status ────────────────────────────────────────────────────────────


@router.get("/status")
async def status() -> dict:
    prov = _active()
    online = False
    names: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{OLLAMA_HOST}/api/tags")
            names = [m.get("name", "") for m in r.json().get("models", [])]
        online = True
    except Exception:  # noqa: BLE001
        pass

    if prov["kind"] == "ollama":
        ready = online and _has(names, prov["model"])
    else:  # external API — ready only when it actually has a key
        ready = bool(prov.get("api_key"))

    return {
        "online": online,  # is Ollama up (affects the local-models section)
        "active": _config["active"],
        "kind": prov["kind"],
        "label": prov.get("label"),
        "model": prov.get("model"),
        "model_ready": ready,
        "installed": [m for m in MODEL_CATALOG if _has(names, m)],
        "installed_models": names,
        "providers": [
            {"id": p["id"], "kind": p["kind"], "label": p["label"], "model": p["model"]}
            for p in _config["providers"]
        ],
    }


# ── chat (streaming) ──────────────────────────────────────────────────


class Message(BaseModel):
    role: str
    content: str


class ChatBody(BaseModel):
    messages: list[Message]


@router.post("/chat")
async def chat(body: ChatBody) -> StreamingResponse:
    """Stream a chat completion as SSE (`data: {"t": "<token>"}`)."""
    prov = _active()
    messages = [m.model_dump() for m in body.messages]
    if prov["kind"] == "anthropic":
        gen = _anthropic_stream(prov, messages)
    elif prov["kind"] == "gemini":
        gen = _gemini_stream(prov, messages)
    else:
        gen = _openai_stream(prov, messages)
    return StreamingResponse(gen, media_type="text/event-stream")


async def _openai_stream(prov: dict, messages: list[dict]):
    base = prov["base_url"].rstrip("/")
    payload = {
        "model": prov["model"],
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
        "stream": True,
    }
    headers = {"Authorization": f"Bearer {prov.get('api_key', '')}"}
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", f"{base}/chat/completions", json=payload, headers=headers
            ) as resp:
                if resp.status_code != 200:
                    await resp.aread()
                    yield _sse_err(
                        f"AI ตอบกลับผิดพลาด ({resp.status_code}) — โมเดล {prov['model']} พร้อมหรือยัง?"
                    )
                    return
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        tok = json.loads(data)["choices"][0]["delta"].get("content", "")
                    except (json.JSONDecodeError, KeyError, IndexError):
                        tok = ""
                    if tok:
                        yield f"data: {json.dumps({'t': tok})}\n\n"
    except httpx.ConnectError:
        yield _sse_err("เชื่อมต่อไม่ได้ — เปิด Ollama / ตรวจ Base URL แล้วหรือยัง?")
    except Exception as exc:  # noqa: BLE001
        yield _sse_err(f"เกิดข้อผิดพลาด: {exc}")
    yield "data: [DONE]\n\n"


async def _anthropic_stream(prov: dict, messages: list[dict]):
    """Stream from Claude's native Messages API (SSE: content_block_delta)."""
    base = (prov.get("base_url") or "https://api.anthropic.com").rstrip("/")
    headers = {
        "x-api-key": prov.get("api_key", ""),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": prov["model"],
        "max_tokens": 4096,
        "system": SYSTEM_PROMPT,
        # Claude only accepts user/assistant turns — drop any stray system msg.
        "messages": [m for m in messages if m.get("role") in ("user", "assistant")],
        "stream": True,
    }
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", f"{base}/v1/messages", json=payload, headers=headers
            ) as resp:
                if resp.status_code != 200:
                    await resp.aread()
                    yield _sse_err(
                        f"Claude API ผิดพลาด ({resp.status_code}) — ตรวจ API key / ชื่อโมเดล"
                    )
                    return
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data:
                        continue
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    kind = obj.get("type")
                    if kind == "content_block_delta":
                        delta = obj.get("delta") or {}
                        if delta.get("type") == "text_delta" and delta.get("text"):
                            yield f"data: {json.dumps({'t': delta['text']})}\n\n"
                    elif kind == "error":
                        msg = (obj.get("error") or {}).get("message", "error")
                        yield _sse_err(f"Claude API: {msg}")
                        return
    except httpx.ConnectError:
        yield _sse_err("เชื่อมต่อ Claude API ไม่ได้ — ตรวจอินเทอร์เน็ต / Base URL")
    except Exception as exc:  # noqa: BLE001
        yield _sse_err(f"เกิดข้อผิดพลาด: {exc}")
    yield "data: [DONE]\n\n"


async def _gemini_stream(prov: dict, messages: list[dict]):
    """Stream from Google's Gemini API (generativelanguage). Roles are
    user/model; SSE is requested with ?alt=sse."""
    base = (
        prov.get("base_url") or "https://generativelanguage.googleapis.com"
    ).rstrip("/")
    model = prov["model"].removeprefix("models/")
    url = f"{base}/v1beta/models/{model}:streamGenerateContent?alt=sse"
    headers = {
        "x-goog-api-key": prov.get("api_key", ""),
        "content-type": "application/json",
    }
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": _gemini_contents(messages),
    }
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", url, json=payload, headers=headers
            ) as resp:
                if resp.status_code != 200:
                    await resp.aread()
                    yield _sse_err(
                        f"Gemini API ผิดพลาด ({resp.status_code}) — ตรวจ API key / ชื่อโมเดล"
                    )
                    return
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data:
                        continue
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    for txt in _gemini_texts(obj):
                        yield f"data: {json.dumps({'t': txt})}\n\n"
    except httpx.ConnectError:
        yield _sse_err("เชื่อมต่อ Gemini API ไม่ได้ — ตรวจอินเทอร์เน็ต / Base URL")
    except Exception as exc:  # noqa: BLE001
        yield _sse_err(f"เกิดข้อผิดพลาด: {exc}")
    yield "data: [DONE]\n\n"


def _gemini_contents(messages: list[dict]) -> list[dict]:
    """Map our user/assistant turns to Gemini's user/model contents. Drops any
    stray system turn and coalesces consecutive same-role turns (Gemini rejects
    two user turns in a row)."""
    out: list[dict] = []
    for m in messages:
        role = m.get("role")
        if role not in ("user", "assistant"):
            continue
        g_role = "model" if role == "assistant" else "user"
        if out and out[-1]["role"] == g_role:
            out[-1]["parts"].append({"text": m["content"]})
        else:
            out.append({"role": g_role, "parts": [{"text": m["content"]}]})
    return out


def _gemini_texts(obj: dict) -> list[str]:
    """Pull text chunks out of a Gemini GenerateContentResponse."""
    out: list[str] = []
    for cand in obj.get("candidates") or []:
        for part in (cand.get("content") or {}).get("parts") or []:
            if part.get("text"):
                out.append(part["text"])
    return out


# ── fix (one-shot, returns corrected code) ────────────────────────────


class FixBody(BaseModel):
    code: str
    error: str = ""


def _extract_code(text: str) -> str:
    m = re.search(r"```(?:python)?\s*\n(.*?)```", text, re.DOTALL)
    return (m.group(1) if m else text).strip("\n")


@router.post("/fix")
async def fix(body: FixBody) -> dict:
    prov = _active()
    user = (
        "Fix the following Python code. Reply with ONLY the complete corrected "
        "code inside a ```python code block — no explanation, no extra text.\n\n"
        f"```python\n{body.code}\n```"
    )
    if body.error.strip():
        user += f"\n\nError:\n```\n{body.error}\n```"
    if prov["kind"] == "anthropic":
        return {"code": await _anthropic_fix(prov, user)}
    if prov["kind"] == "gemini":
        return {"code": await _gemini_fix(prov, user)}
    return {"code": await _openai_fix(prov, user)}


async def _openai_fix(prov: dict, user: str) -> str:
    base = prov["base_url"].rstrip("/")
    payload = {
        "model": prov["model"],
        "messages": [{"role": "user", "content": user}],
        "stream": False,
    }
    headers = {"Authorization": f"Bearer {prov.get('api_key', '')}"}
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{base}/chat/completions", json=payload, headers=headers
            )
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="เชื่อมต่อ AI ไม่ได้")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI error {resp.status_code}")
    try:
        content = (resp.json().get("choices") or [{}])[0].get("message", {}).get(
            "content", ""
        )
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="AI ตอบกลับรูปแบบไม่ถูกต้อง")
    return _extract_code(content)


async def _anthropic_fix(prov: dict, user: str) -> str:
    base = (prov.get("base_url") or "https://api.anthropic.com").rstrip("/")
    headers = {
        "x-api-key": prov.get("api_key", ""),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": prov["model"],
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": user}],
    }
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(f"{base}/v1/messages", json=payload, headers=headers)
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="เชื่อมต่อ Claude API ไม่ได้")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Claude API error {resp.status_code}")
    blocks = resp.json().get("content", [])
    text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
    return _extract_code(text)


async def _gemini_fix(prov: dict, user: str) -> str:
    base = (
        prov.get("base_url") or "https://generativelanguage.googleapis.com"
    ).rstrip("/")
    model = prov["model"].removeprefix("models/")
    url = f"{base}/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": prov.get("api_key", ""),
        "content-type": "application/json",
    }
    payload = {"contents": [{"role": "user", "parts": [{"text": user}]}]}
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="เชื่อมต่อ Gemini API ไม่ได้")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Gemini API error {resp.status_code}")
    text = "".join(_gemini_texts(resp.json()))
    return _extract_code(text)


def _sse_err(msg: str) -> str:
    return f"data: {json.dumps({'error': msg})}\n\n"


# ── hardware detection / recommendation ───────────────────────────────


def _run(cmd: list[str]) -> str | None:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=6)
        if p.returncode == 0:
            return p.stdout.strip()
    except Exception:  # noqa: BLE001
        pass
    return None


def _gpu_info() -> tuple[str | None, int | None]:
    out = _run(
        ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]
    )
    if not out:
        return None, None
    parts = [p.strip() for p in out.splitlines()[0].split(",")]
    name = parts[0] if parts and parts[0] else None
    try:
        vram = int(parts[1])
    except (IndexError, ValueError):
        vram = None
    return name, vram


def _ram_mb() -> int | None:
    try:
        import psutil

        return int(psutil.virtual_memory().total / 1024 / 1024)
    except Exception:  # noqa: BLE001
        pass
    if os.name == "nt":
        try:
            import ctypes

            class _MS(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            ms = _MS()
            ms.dwLength = ctypes.sizeof(_MS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms))
            return int(ms.ullTotalPhys / 1024 / 1024)
        except Exception:  # noqa: BLE001
            pass
    return None


def _recommend(vram_mb: int | None, ram_mb: int | None) -> str:
    if vram_mb and vram_mb >= 6000:
        return "qwen2.5-coder:7b"
    if vram_mb and vram_mb >= 4000:
        return "qwen2.5-coder:3b"
    if vram_mb and vram_mb >= 2000:
        return "qwen2.5-coder:1.5b"
    if ram_mb and ram_mb >= 32000:
        return "qwen2.5-coder:3b"
    return "qwen2.5-coder:1.5b"


@router.get("/hardware")
async def hardware() -> dict:
    name, vram = await asyncio.to_thread(_gpu_info)
    ram = await asyncio.to_thread(_ram_mb)
    return {
        "gpu": name,
        "vram_mb": vram,
        "ram_mb": ram,
        "recommended": _recommend(vram, ram),
    }


# ── install / delete / select (local Ollama) ──────────────────────────


class ModelBody(BaseModel):
    model: str


@router.post("/pull")
async def pull(body: ModelBody) -> StreamingResponse:
    """Download an Ollama model (catalog edition OR a custom name), streaming
    progress as SSE (`data: {"status": "...", "pct": 0-100}`)."""
    name = body.model.strip()
    if not name:
        raise HTTPException(status_code=400, detail="ต้องใส่ชื่อโมเดล")

    async def gen():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_HOST}/api/pull",
                    json={"name": name, "stream": True},
                ) as resp:
                    if resp.status_code != 200:
                        await resp.aread()
                        yield _sse_err(f"ดาวน์โหลดไม่สำเร็จ ({resp.status_code})")
                        return
                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if obj.get("error"):
                            yield _sse_err(obj["error"])
                            return
                        completed = obj.get("completed")
                        total = obj.get("total")
                        pct = (
                            int(completed / total * 100)
                            if completed and total
                            else None
                        )
                        yield (
                            "data: "
                            + json.dumps({"status": obj.get("status", ""), "pct": pct})
                            + "\n\n"
                        )
        except httpx.ConnectError:
            yield _sse_err("เชื่อมต่อ Ollama ไม่ได้ — เปิดโปรแกรม Ollama แล้วหรือยัง?")
        except Exception as exc:  # noqa: BLE001
            yield _sse_err(f"เกิดข้อผิดพลาด: {exc}")
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/delete")
async def delete_model(body: ModelBody) -> dict:
    """Remove an installed Ollama model."""
    name = body.model.strip()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.request(
                "DELETE", f"{OLLAMA_HOST}/api/delete", json={"name": name}
            )
        if r.status_code not in (200, 404):
            raise HTTPException(status_code=502, detail=f"ลบไม่สำเร็จ ({r.status_code})")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="เชื่อมต่อ Ollama ไม่ได้")
    # reset the active pointer if it referenced the removed model — match the
    # same lenient tag rules as _has() (covers :latest / untagged aliases).
    active = _config["active"]
    if active.startswith("ollama:") and _has([active.split(":", 1)[1]], name):
        _config["active"] = f"ollama:{DEFAULT_MODEL}"
        _save_config()
    return {"ok": True}


@router.post("/select")
async def select(body: ModelBody) -> dict:
    """Set the active assistant. Accepts an assistant id (`ollama:<tag>` or
    `api:<id>`) or a bare Ollama tag (treated as local)."""
    mid = body.model.strip()
    if mid.startswith("api:"):
        if not any(p["id"] == mid for p in _config["providers"]):
            raise HTTPException(status_code=404, detail="ไม่พบผู้ช่วยนี้")
    elif not mid.startswith("ollama:"):
        mid = f"ollama:{mid}"
    _config["active"] = mid
    _save_config()
    return {"ok": True, "active": mid}


# ── external API providers (OpenAI-compatible / Claude) ───────────────


class ProviderBody(BaseModel):
    kind: str  # "openai" | "anthropic"
    label: str = ""
    model: str
    api_key: str = ""
    base_url: str = ""


@router.post("/providers")
async def add_provider(body: ProviderBody) -> dict:
    if body.kind not in ("openai", "anthropic", "gemini"):
        raise HTTPException(status_code=400, detail="ชนิดผู้ให้บริการไม่ถูกต้อง")
    model = body.model.strip()
    if not model:
        raise HTTPException(status_code=400, detail="ต้องใส่ชื่อโมเดล")
    base = body.base_url.strip()
    if body.kind == "anthropic" and not base:
        base = "https://api.anthropic.com"
    if body.kind == "gemini" and not base:
        base = "https://generativelanguage.googleapis.com"
    if body.kind == "openai" and not base:
        raise HTTPException(status_code=400, detail="ต้องใส่ Base URL (เช่น https://api.openai.com/v1)")
    pid = "api:" + secrets.token_hex(4)
    _config["providers"].append(
        {
            "id": pid,
            "kind": body.kind,
            "label": body.label.strip() or model,
            "model": model,
            "api_key": body.api_key.strip(),
            "base_url": base,
        }
    )
    _save_config()
    return {"id": pid}


@router.delete("/providers/{pid}")
async def delete_provider(pid: str) -> dict:
    _config["providers"] = [p for p in _config["providers"] if p.get("id") != pid]
    if _config["active"] == pid:
        _config["active"] = f"ollama:{DEFAULT_MODEL}"
    _save_config()
    return {"ok": True}
