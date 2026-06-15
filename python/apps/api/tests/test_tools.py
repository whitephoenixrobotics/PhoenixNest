"""Code tools (app/routers/tools.py): Ruff lint / format / fix and Jedi
completion. Skipped automatically if the tool isn't in the backend venv."""

import pytest

from app.routers.tools import _RUFF

ruff_only = pytest.mark.skipif(not _RUFF.exists(), reason="ruff not in backend venv")


def _codes(diags):
    return [d["code"] for d in diags]


@ruff_only
def test_lint_flags_unused_import(client):
    r = client.post("/api/lint", json={"code": "import os\n"})
    assert r.status_code == 200
    assert "F401" in _codes(r.json())  # unused import


@ruff_only
def test_lint_flags_undefined_name(client):
    r = client.post("/api/lint", json={"code": "print(nope_undefined)\n"})
    assert "F821" in _codes(r.json())


@ruff_only
def test_cell_mode_silences_cell_noise(client):
    # In a notebook cell, imports/names resolve across cells → F401 is silenced.
    r = client.post("/api/lint", json={"code": "import os\n", "cell": True})
    assert "F401" not in _codes(r.json())


@ruff_only
def test_format_adds_spacing(client):
    r = client.post("/api/format", json={"code": "x=1\n"})
    body = r.json()
    assert body["ok"] is True
    assert "x = 1" in body["code"]


@ruff_only
def test_fix_removes_unused_import(client):
    r = client.post(
        "/api/fix", json={"code": "import os\nimport sys\nprint(sys.version)\n"}
    )
    body = r.json()
    assert body["ok"] is True
    assert "import os" not in body["code"]  # unused → stripped
    assert "import sys" in body["code"]      # used → kept


def test_complete_returns_attributes(client):
    try:
        import jedi  # noqa: F401
    except ImportError:
        pytest.skip("jedi not installed")
    # complete the "pat" prefix → a small, deterministic result set
    r = client.post(
        "/api/complete", json={"code": "import os\nos.pat", "line": 2, "column": 6}
    )
    assert r.status_code == 200
    labels = [c["label"] for c in r.json()]
    assert "path" in labels  # os.path
