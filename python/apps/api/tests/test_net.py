"""Internet-reachability probe (app/main._internet_reachable + /api/net) — the
server-side signal the UI uses to gate download actions. Socket calls are
monkeypatched so the tests are deterministic and never hit the real network."""

import app.main as main


def _reset_cache():
    main._NET_CACHE.update(ts=0.0, ok=True)


class _DummyConn:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_reachable_true_when_socket_connects(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(main.socket, "create_connection", lambda *a, **k: _DummyConn())
    assert main._internet_reachable() is True


def test_reachable_false_when_all_hosts_fail(monkeypatch):
    _reset_cache()

    def boom(*a, **k):
        raise OSError("unreachable")

    monkeypatch.setattr(main.socket, "create_connection", boom)
    assert main._internet_reachable() is False


def test_result_is_cached_within_ttl(monkeypatch):
    _reset_cache()
    calls = {"n": 0}

    def conn(*a, **k):
        calls["n"] += 1
        return _DummyConn()

    monkeypatch.setattr(main.socket, "create_connection", conn)
    assert main._internet_reachable() is True
    first = calls["n"]
    # a second call within the TTL must be served from cache (no new probe)
    assert main._internet_reachable() is True
    assert calls["n"] == first


def test_net_endpoint_returns_bool(client, monkeypatch):
    _reset_cache()
    monkeypatch.setattr(main.socket, "create_connection", lambda *a, **k: _DummyConn())
    r = client.get("/api/net")
    assert r.status_code == 200
    assert r.json()["online"] is True
