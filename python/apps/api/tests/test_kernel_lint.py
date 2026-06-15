"""Kernel-aware cell linting — the feature this project was built around: a name
defined in another cell must NOT be flagged F821 (undefined), but a genuinely
missing name still is. Requires ruff in the backend venv."""

import pytest

from app.routers.tools import _RUFF

pytestmark = pytest.mark.skipif(not _RUFF.exists(), reason="ruff not in backend venv")


def _codes(diags):
    return [d["code"] for d in diags]


def test_no_kernel_suppresses_all_undefined_names(project):
    client, wid, _ = project
    # No cell has executed yet → no kernel → we can't know what's defined, so
    # F821 is suppressed entirely (never show false positives up front).
    r = client.post(f"/api/projects/{wid}/kernel/lint", json={"code": "mystery_name\n"})
    assert r.status_code == 200
    assert "F821" not in _codes(r.json())


def test_name_defined_in_another_cell_is_not_flagged(project):
    client, wid, _ = project
    # define the name in the live kernel...
    client.post(
        f"/api/projects/{wid}/kernel/execute", json={"code": "defined_in_cell = 1"}
    )
    # ...then lint a different cell that uses it → must NOT be F821
    r = client.post(
        f"/api/projects/{wid}/kernel/lint",
        json={"code": "print(defined_in_cell)\n"},
    )
    assert r.status_code == 200
    assert "F821" not in _codes(r.json())


def test_genuinely_undefined_name_stays_flagged(project):
    client, wid, _ = project
    client.post(f"/api/projects/{wid}/kernel/execute", json={"code": "warm = 1"})
    r = client.post(
        f"/api/projects/{wid}/kernel/lint",
        json={"code": "print(totally_undefined_xyz)\n"},
    )
    assert r.status_code == 200
    diags = r.json()
    assert "F821" in _codes(diags)
    assert any("totally_undefined_xyz" in d["message"] for d in diags)
