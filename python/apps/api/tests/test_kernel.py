"""Kernel manager + the real subprocess protocol (app/kernel.py +
kernel_runner.py). The unit tests cover the non-blocking / keying hardening;
the integration tests spawn an actual kernel to prove the JSON-line protocol."""

import sys
import threading

import pytest

from app.kernel import Kernel, KernelManager, _readline_timeout


# ── unit: timeout + manager bookkeeping (no subprocess) ───────────────
def test_readline_timeout_returns_none_when_blocked():
    class Blocker:
        def readline(self):
            threading.Event().wait()  # never returns

    assert _readline_timeout(Blocker(), 0.2) is None


def test_readline_timeout_reads_available_line():
    import io

    assert _readline_timeout(io.StringIO("hello\n"), 1.0) == "hello\n"


def test_manager_names_none_when_not_running():
    assert KernelManager().names("never-started") is None


def test_shutdown_workspace_only_kills_matching_keys():
    class FakeKernel:
        def __init__(self):
            self.killed = False

        def kill(self):
            self.killed = True

        def alive(self):
            return True

    mgr = KernelManager()
    ws, ws_nb, other, other_nb = (FakeKernel() for _ in range(4))
    mgr._kernels = {
        "ws": ws,
        "ws:main.ipynb": ws_nb,
        "other": other,
        "other:x.ipynb": other_nb,
    }
    mgr.shutdown_workspace("ws")

    assert ws.killed and ws_nb.killed          # both ws kernels killed
    assert not other.killed and not other_nb.killed
    assert "ws" not in mgr._kernels and "ws:main.ipynb" not in mgr._kernels
    assert "other" in mgr._kernels             # untouched


# ── integration: a real kernel subprocess ─────────────────────────────
@pytest.fixture
def kernel(tmp_path):
    k = Kernel(sys.executable, str(tmp_path))
    yield k
    k.kill()


def test_kernel_echoes_last_expression(kernel):
    r = kernel.execute("40 + 2", timeout=15)
    assert r["ok"] is True
    assert r["result"] == "42"


def test_kernel_captures_stdout(kernel):
    r = kernel.execute("print(40 + 2)", timeout=15)
    assert r["ok"] is True
    assert "42" in r["stdout"]


def test_kernel_persists_state_across_cells(kernel):
    kernel.execute("x = 42", timeout=15)
    r = kernel.execute("x", timeout=15)
    assert r["result"] == "42"


def test_kernel_surfaces_user_error(kernel):
    r = kernel.execute("1 / 0", timeout=15)
    assert r["ok"] is False
    assert "ZeroDivisionError" in r["stderr"]


def test_kernel_names_includes_user_variable(kernel):
    kernel.execute("myvar = 1", timeout=15)
    assert "myvar" in kernel.names()
