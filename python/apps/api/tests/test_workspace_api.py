"""POST /api/workspaces/create — the path-traversal guard from batch 3. A folder
name must never be able to escape its parent directory."""

import pytest

from app.routers import workspaces as ws_router


@pytest.fixture(autouse=True)
def _no_real_venv(monkeypatch):
    # venv creation is slow + side-effecting; the name guard is what we test.
    monkeypatch.setattr(ws_router, "_ensure_venv", lambda root: True)


@pytest.mark.parametrize("bad", ["../evil", "a/b", "a\\b", "..", ".", "   ", ""])
def test_create_rejects_unsafe_names(client, tmp_path, bad):
    r = client.post(
        "/api/workspaces/create", json={"name": bad, "parent": str(tmp_path)}
    )
    assert r.status_code == 400
    # nothing should have been created on disk
    assert list(tmp_path.iterdir()) == []


def test_create_accepts_normal_name_and_scaffolds(client, tmp_path):
    r = client.post(
        "/api/workspaces/create", json={"name": "myproj", "parent": str(tmp_path)}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "myproj"
    proj = tmp_path / "myproj"
    assert proj.is_dir()
    assert (proj / "main.ipynb").exists()  # starter notebook scaffolded


def test_create_conflict_when_folder_exists(client, tmp_path):
    (tmp_path / "dup").mkdir()
    r = client.post(
        "/api/workspaces/create", json={"name": "dup", "parent": str(tmp_path)}
    )
    assert r.status_code == 409
