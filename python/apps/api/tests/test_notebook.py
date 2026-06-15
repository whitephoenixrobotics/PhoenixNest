"""Notebook endpoints: default-cell fallback, save/load roundtrip, and the
kernel execute / vars / restart flow (spawns a real kernel)."""


def test_get_notebook_returns_default_cells_when_absent(project):
    client, wid, _ = project
    r = client.get(f"/api/projects/{wid}/notebook")
    assert r.status_code == 200
    cells = r.json()["cells"]
    # DEFAULT_CELLS: a markdown intro + a code cell
    assert [c["kind"] for c in cells] == ["markdown", "code"]


def test_notebook_save_load_roundtrip(project):
    client, wid, root = project
    payload = {"cells": [{"id": "c1", "kind": "code", "source": "a = 1\na + 1"}]}
    assert client.put(f"/api/projects/{wid}/notebook", json=payload).status_code == 200

    got = client.get(f"/api/projects/{wid}/notebook").json()["cells"]
    assert len(got) == 1
    assert got[0]["source"] == "a = 1\na + 1"
    # persisted as a real .ipynb on disk
    assert (root / "main.ipynb").exists()


def test_kernel_execute_endpoint(project):
    client, wid, _ = project
    r = client.post(f"/api/projects/{wid}/kernel/execute", json={"code": "6 * 7"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["result"] == "42"


def test_kernel_vars_endpoint(project):
    client, wid, _ = project
    client.post(f"/api/projects/{wid}/kernel/execute", json={"code": "kv = 99"})
    vars_ = client.get(f"/api/projects/{wid}/kernel/vars").json()
    assert any(v["name"] == "kv" for v in vars_)


def test_kernel_restart_endpoint(project):
    client, wid, _ = project
    r = client.post(f"/api/projects/{wid}/kernel/restart")
    assert r.status_code == 200
    assert r.json()["ok"] is True
