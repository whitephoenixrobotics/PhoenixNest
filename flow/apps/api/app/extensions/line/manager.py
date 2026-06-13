"""
LINE Messaging API connector — singleton config holder.

We persist the Channel Access Token + (optional) default `to` target on disk
under STORAGE_DIR/extensions/line.json so the user doesn't have to re-enter it
every session. The token never leaves the local machine.

Push goes through `requests` (sync) wrapped in asyncio.to_thread() at the
router/handler layer.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import asdict, dataclass
from typing import Any

import requests

from app.paths import STORAGE_DIR

log = logging.getLogger(__name__)

_CONFIG_DIR = os.path.join(STORAGE_DIR, "extensions")
_CONFIG_PATH = os.path.join(_CONFIG_DIR, "line.json")

LINE_API_BASE = "https://api.line.me/v2/bot"


@dataclass
class LineConfig:
    """What gets persisted."""
    token: str = ""              # Channel Access Token (long-lived)
    default_to: str = ""         # default user/group/room ID for Push blocks
    bot_name: str = ""           # cached from /info — used by the UI badge
    bot_user_id: str = ""        # cached from /info


@dataclass
class LineStatus:
    """What the UI sees (token redacted)."""
    configured: bool
    has_token: bool
    default_to: str
    bot_name: str
    bot_user_id: str


class LineManager:
    def __init__(self) -> None:
        self._cfg = LineConfig()
        self._lock = threading.RLock()
        self._load()

    # ── Persistence ───────────────────────────────────────────────────────────
    def _load(self) -> None:
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._cfg = LineConfig(**{k: data.get(k, "") for k in LineConfig.__dataclass_fields__})
        except FileNotFoundError:
            pass
        except Exception:
            log.exception("[line] failed to load %s — starting with empty config", _CONFIG_PATH)

    def _save(self) -> None:
        os.makedirs(_CONFIG_DIR, exist_ok=True)
        tmp = _CONFIG_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(asdict(self._cfg), f, ensure_ascii=False, indent=2)
        os.replace(tmp, _CONFIG_PATH)

    # ── Public API ────────────────────────────────────────────────────────────
    @property
    def is_configured(self) -> bool:
        return bool(self._cfg.token)

    def status(self) -> LineStatus:
        with self._lock:
            return LineStatus(
                configured=self.is_configured,
                has_token=bool(self._cfg.token),
                default_to=self._cfg.default_to,
                bot_name=self._cfg.bot_name,
                bot_user_id=self._cfg.bot_user_id,
            )

    def configure(self, token: str, default_to: str = "") -> dict[str, Any]:
        """Save token + default target. Hits /v2/bot/info to verify the token
        works and to cache the bot name for the UI."""
        token = (token or "").strip()
        if not token:
            raise ValueError("token is required")

        # Verify before persisting — bad token = HTTP 401.
        info = self._call("GET", "/info", token=token)
        with self._lock:
            self._cfg.token = token
            self._cfg.default_to = (default_to or "").strip()
            self._cfg.bot_name = info.get("displayName", "")
            self._cfg.bot_user_id = info.get("userId", "")
            self._save()
        return info

    def disconnect(self) -> None:
        with self._lock:
            self._cfg = LineConfig()
            try:
                os.remove(_CONFIG_PATH)
            except FileNotFoundError:
                pass

    def push_text(self, text: str, to: str = "") -> dict[str, Any]:
        """Send a text message. `to` overrides the default target."""
        return self._push(to, {"type": "text", "text": str(text)[:5000]})

    def push_image(self, image_url: str, preview_url: str = "", to: str = "") -> dict[str, Any]:
        """Send an image. Both URLs must be HTTPS (LINE rejects http://)."""
        original = image_url.strip()
        if not original:
            raise RuntimeError("image URL ว่าง")
        if not original.startswith("https://"):
            raise RuntimeError("LINE รับเฉพาะ HTTPS URL สำหรับรูปภาพ")
        preview = preview_url.strip() or original
        return self._push(to, {
            "type": "image",
            "originalContentUrl": original,
            "previewImageUrl": preview,
        })

    def push_sticker(self, package_id: int, sticker_id: int, to: str = "") -> dict[str, Any]:
        """Send a sticker by LINE packageId + stickerId.
        See https://developers.line.biz/en/docs/messaging-api/sticker-list/."""
        return self._push(to, {
            "type": "sticker",
            "packageId": str(package_id),
            "stickerId": str(sticker_id),
        })

    def push_flex(self, alt_text: str, contents: dict, to: str = "") -> dict[str, Any]:
        """Send a Flex Message. `contents` is the parsed JSON object from the
        Flex Message Simulator (the bubble or carousel root)."""
        if not isinstance(contents, dict) or not contents.get("type"):
            raise RuntimeError("flex contents ต้องเป็น JSON object ที่มี field 'type' (bubble/carousel)")
        return self._push(to, {
            "type": "flex",
            "altText": (alt_text or "Phoenix Flow notification")[:400],
            "contents": contents,
        })

    def _push(self, to: str, message: dict) -> dict[str, Any]:
        """Shared push: pick target, wrap message, POST /message/push."""
        if not self.is_configured:
            raise RuntimeError("LINE ยังไม่ได้ตั้งค่า — เปิด Connector แล้วใส่ Channel Access Token")
        target = (to or self._cfg.default_to).strip()
        if not target:
            raise RuntimeError("ต้องระบุ user/group/room ID (ไม่มีใน config และไม่ได้ส่งมา)")
        return self._call("POST", "/message/push", json={"to": target, "messages": [message]})

    # ── HTTP plumbing ─────────────────────────────────────────────────────────
    def _call(self, method: str, path: str, *, token: str | None = None,
              json: dict[str, Any] | None = None) -> dict[str, Any]:
        t = token or self._cfg.token
        if not t:
            raise RuntimeError("no token")
        headers = {"Authorization": f"Bearer {t}"}
        if json is not None:
            headers["Content-Type"] = "application/json"
        try:
            resp = requests.request(
                method, LINE_API_BASE + path,
                headers=headers, json=json, timeout=10,
            )
        except requests.RequestException as e:
            raise RuntimeError(f"LINE API request failed: {e}") from e

        if resp.status_code == 401:
            raise RuntimeError("Token ไม่ถูกต้องหรือหมดอายุ (HTTP 401)")
        if resp.status_code >= 400:
            # LINE returns {"message": "...", "details": [...]}
            try:
                err = resp.json()
                msg = err.get("message", resp.text[:200])
            except Exception:
                msg = resp.text[:200]
            raise RuntimeError(f"LINE API error {resp.status_code}: {msg}")
        # Some endpoints (push) return empty body on success — treat as {}.
        if not resp.content:
            return {}
        try:
            return resp.json()
        except Exception:
            return {"raw": resp.text}


_manager: LineManager | None = None
_singleton_lock = threading.Lock()


def get_manager() -> LineManager:
    global _manager
    with _singleton_lock:
        if _manager is None:
            _manager = LineManager()
        return _manager
