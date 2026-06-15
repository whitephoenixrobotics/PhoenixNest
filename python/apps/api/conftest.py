"""Shared pytest fixtures.

Every test runs against temp-dir copies of the on-disk stores (workspaces.json /
ai.json) so the suite never touches real user data and each test starts clean.
"""

import sys
from pathlib import Path

import pytest

# Make `import app...` resolve no matter how/where pytest is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import workspaces  # noqa: E402
from app.routers import ai as ai_router  # noqa: E402


@pytest.fixture(autouse=True)
def isolate_data(tmp_path, monkeypatch):
    """Redirect persistent stores into a per-test temp dir and reset the in-memory
    AI config to a clean default."""
    monkeypatch.setattr(workspaces, "_FILE", tmp_path / "workspaces.json")
    monkeypatch.setattr(ai_router, "_CONFIG", tmp_path / "ai.json")
    monkeypatch.setattr(
        ai_router,
        "_config",
        {"active": f"ollama:{ai_router.DEFAULT_MODEL}", "providers": []},
    )
    yield


@pytest.fixture(autouse=True)
def _kill_kernels():
    """Tests that exercise the kernel spawn real subprocesses on the shared
    manager. Kill any that are left running so they don't leak across the suite."""
    yield
    from app.kernel import manager

    for k in list(manager._kernels.values()):
        try:
            k.kill()
        except Exception:  # noqa: BLE001
            pass
    manager._kernels.clear()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture
def project(tmp_path, client):
    """A workspace registered against a temp folder → (client, workspace_id, root).
    The project root is a subdir so the redirected workspaces.json / ai.json (which
    live in tmp_path itself) never show up in file listings."""
    root = tmp_path / "proj"
    root.mkdir()
    rec = workspaces.remember(str(root), "2026-01-01T00:00:00")
    return client, rec["id"], root
