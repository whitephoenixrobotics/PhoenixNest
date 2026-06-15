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


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
