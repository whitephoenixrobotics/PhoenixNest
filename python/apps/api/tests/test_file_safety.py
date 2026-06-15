"""File-access safety in app/routers/projects.py:
- _safe_path refuses anything resolving outside the project root.
- _ensure_writable refuses writes to app-managed metadata (.phoenix/, protected
  names).
- get_file_content classifies binary/missing cleanly (and never 500s)."""

import pytest
from fastapi import HTTPException

from app import workspaces
from app.routers.projects import _ensure_writable, _safe_path


# ── _safe_path ────────────────────────────────────────────────────────
def test_safe_path_blocks_traversal(tmp_path):
    with pytest.raises(HTTPException) as exc:
        _safe_path(tmp_path, "../outside.txt")
    assert exc.value.status_code == 400


def test_safe_path_allows_subpath(tmp_path):
    p = _safe_path(tmp_path, "sub/file.txt")
    assert str(tmp_path.resolve()) in str(p)


# ── _ensure_writable ──────────────────────────────────────────────────
def test_ensure_writable_blocks_phoenix_dir(tmp_path):
    with pytest.raises(HTTPException) as exc:
        _ensure_writable(tmp_path, tmp_path / ".phoenix" / "project.json")
    assert exc.value.status_code == 403


def test_ensure_writable_blocks_protected_name(tmp_path):
    with pytest.raises(HTTPException):
        _ensure_writable(tmp_path, tmp_path / "project.json")


def test_ensure_writable_allows_normal_file(tmp_path):
    _ensure_writable(tmp_path, tmp_path / "script.py")  # must not raise


# ── get_file_content (integration through the API) ────────────────────
@pytest.fixture
def project(tmp_path):
    """Register a workspace pointing at a temp folder and return (client, id)."""
    from fastapi.testclient import TestClient

    from app.main import app

    rec = workspaces.remember(str(tmp_path), "2026-01-01T00:00:00")
    return TestClient(app), rec["id"], tmp_path


def test_get_text_file(project):
    client, wid, root = project
    (root / "hello.txt").write_text("สวัสดี", encoding="utf-8")
    r = client.get(f"/api/projects/{wid}/files/content", params={"path": "hello.txt"})
    assert r.status_code == 200
    body = r.json()
    assert body["editable"] is True
    assert body["content"] == "สวัสดี"


def test_get_binary_file_marked_not_editable(project):
    client, wid, root = project
    (root / "blob.bin").write_bytes(b"\xff\xfe\x00\x01\x02")
    r = client.get(f"/api/projects/{wid}/files/content", params={"path": "blob.bin"})
    assert r.status_code == 200
    body = r.json()
    assert body["editable"] is False
    assert body["reason"] == "binary"


def test_get_missing_file_404(project):
    client, wid, _ = project
    r = client.get(f"/api/projects/{wid}/files/content", params={"path": "nope.txt"})
    assert r.status_code == 404


def test_get_file_traversal_blocked(project):
    client, wid, _ = project
    r = client.get(
        f"/api/projects/{wid}/files/content", params={"path": "../../secret"}
    )
    assert r.status_code == 400
