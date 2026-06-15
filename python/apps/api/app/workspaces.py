"""Workspace registry — maps a stable id to an absolute folder path the user
has opened (VS Code "Open Folder" model). The folders live anywhere on disk;
we only remember them as recents, never copy or own them.
"""

import hashlib
import json
from pathlib import Path

from app.paths import DATA_DIR

_FILE = DATA_DIR / "workspaces.json"


def _norm(path: str) -> str:
    return str(Path(path).resolve())


def workspace_id(path: str) -> str:
    return hashlib.sha1(_norm(path).lower().encode("utf-8")).hexdigest()[:12]


def _load() -> list[dict]:
    if _FILE.exists():
        try:
            return json.loads(_FILE.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            return []
    return []


def _save(items: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _FILE.write_text(
        json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def recents() -> list[dict]:
    """Registered workspaces whose folder still exists, newest first."""
    items = [w for w in _load() if Path(w["path"]).is_dir()]
    items.sort(key=lambda w: w.get("opened_at", ""), reverse=True)
    return items


def get(wsid: str) -> dict | None:
    return next((w for w in _load() if w["id"] == wsid), None)


def remember(path: str, opened_at: str) -> dict:
    """Add/refresh a workspace and return its record."""
    norm = _norm(path)
    wid = workspace_id(norm)
    items = [w for w in _load() if w["id"] != wid]
    rec = {"id": wid, "path": norm, "name": Path(norm).name, "opened_at": opened_at}
    items.append(rec)
    _save(items)
    return rec


def forget(wsid: str) -> None:
    _save([w for w in _load() if w["id"] != wsid])
