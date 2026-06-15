"""Script runner (app/routers/run.py): the /api/run snippet endpoint, the
execute() helper's stdin + timeout handling, and the per-file run endpoint."""

import sys

from app.routers.run import execute


def test_run_snippet_endpoint(client):
    r = client.post("/api/run", json={"code": "print(40 + 2)"})
    assert r.status_code == 200
    body = r.json()
    assert "42" in body["stdout"]
    assert body["exit_code"] == 0
    assert body["timed_out"] is False


def test_execute_feeds_stdin(tmp_path):
    script = tmp_path / "echo.py"
    script.write_text("print(input())", encoding="utf-8")
    res = execute(
        [sys.executable, "-I", "-X", "utf8", "-u", str(script)],
        str(tmp_path),
        timeout=15,
        stdin="ping\n",
    )
    assert "ping" in res.stdout
    assert res.exit_code == 0


def test_execute_times_out(tmp_path):
    script = tmp_path / "slow.py"
    script.write_text("import time; time.sleep(5)", encoding="utf-8")
    res = execute(
        [sys.executable, "-I", "-X", "utf8", "-u", str(script)],
        str(tmp_path),
        timeout=0.3,
    )
    assert res.timed_out is True
    assert res.exit_code is None


def test_run_file_endpoint(project):
    client, wid, root = project
    (root / "hello.py").write_text("print('ran ok')", encoding="utf-8")
    r = client.post(f"/api/projects/{wid}/run-file", params={"path": "hello.py"})
    assert r.status_code == 200
    assert "ran ok" in r.json()["stdout"]


def test_run_file_missing_404(project):
    client, wid, _ = project
    r = client.post(f"/api/projects/{wid}/run-file", params={"path": "nope.py"})
    assert r.status_code == 404
