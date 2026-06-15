"""AI router (app/routers/ai.py): provider management, active-assistant
resolution, the Gemini request/response mappers, and atomic ai.json writes.
These paths are network-free (no Ollama / no external API call)."""

import json

from app.routers import ai


# ── pure helpers ──────────────────────────────────────────────────────
def test_has_matches_exact_and_latest():
    assert ai._has(["qwen2.5-coder:7b"], "qwen2.5-coder:7b") is True
    assert ai._has(["llama3:latest"], "llama3") is True
    assert ai._has(["something-else"], "llama3") is False


def test_active_defaults_to_ollama():
    prov = ai._active()
    assert prov["kind"] == "ollama"
    assert prov["id"].startswith("ollama:")


def test_active_resolves_api_provider():
    ai._config["providers"].append(
        {"id": "api:abc", "kind": "anthropic", "label": "Claude",
         "model": "claude-opus-4-8", "api_key": "k", "base_url": "https://x"}
    )
    ai._config["active"] = "api:abc"
    prov = ai._active()
    assert prov["kind"] == "anthropic"
    assert prov["model"] == "claude-opus-4-8"


def test_active_falls_back_when_provider_vanished():
    ai._config["active"] = "api:ghost"  # id not in providers
    prov = ai._active()
    assert prov["kind"] == "ollama"  # graceful fallback, no crash


def test_gemini_contents_drops_system_and_coalesces():
    msgs = [
        {"role": "system", "content": "ignore me"},
        {"role": "user", "content": "a"},
        {"role": "user", "content": "b"},
        {"role": "assistant", "content": "c"},
    ]
    out = ai._gemini_contents(msgs)
    assert out == [
        {"role": "user", "parts": [{"text": "a"}, {"text": "b"}]},
        {"role": "model", "parts": [{"text": "c"}]},
    ]


def test_gemini_texts_extracts_and_tolerates_missing():
    obj = {"candidates": [{"content": {"parts": [{"text": "hi"}, {"text": "!"}]}}]}
    assert ai._gemini_texts(obj) == ["hi", "!"]
    assert ai._gemini_texts({}) == []
    assert ai._gemini_texts({"candidates": [{}]}) == []


# ── provider endpoints ────────────────────────────────────────────────
def test_add_provider_rejects_unknown_kind(client):
    r = client.post("/api/ai/providers", json={"kind": "banana", "model": "x"})
    assert r.status_code == 400


def test_add_openai_requires_base_url(client):
    r = client.post("/api/ai/providers", json={"kind": "openai", "model": "gpt-4o"})
    assert r.status_code == 400


def test_add_anthropic_fills_default_base_and_persists(client):
    r = client.post(
        "/api/ai/providers",
        json={"kind": "anthropic", "model": "claude-opus-4-8", "api_key": "secret"},
    )
    assert r.status_code == 200
    pid = r.json()["id"]
    assert pid.startswith("api:")
    prov = next(p for p in ai._config["providers"] if p["id"] == pid)
    assert prov["base_url"] == "https://api.anthropic.com"

    # written atomically: real file present, temp gone, valid JSON
    assert ai._CONFIG.exists()
    assert not (ai._CONFIG.parent / "ai.json.tmp").exists()
    saved = json.loads(ai._CONFIG.read_text(encoding="utf-8"))
    assert any(p["id"] == pid for p in saved["providers"])


def test_add_gemini_fills_default_base(client):
    r = client.post(
        "/api/ai/providers",
        json={"kind": "gemini", "model": "gemini-2.5-flash", "api_key": "k"},
    )
    assert r.status_code == 200
    prov = ai._config["providers"][-1]
    assert prov["base_url"] == "https://generativelanguage.googleapis.com"


def test_select_unknown_api_provider_404(client):
    r = client.post("/api/ai/select", json={"model": "api:does-not-exist"})
    assert r.status_code == 404


def test_select_bare_tag_is_treated_as_ollama(client):
    r = client.post("/api/ai/select", json={"model": "qwen2.5-coder:3b"})
    assert r.status_code == 200
    assert r.json()["active"] == "ollama:qwen2.5-coder:3b"


def test_delete_provider_resets_active(client):
    add = client.post(
        "/api/ai/providers",
        json={"kind": "anthropic", "model": "claude-opus-4-8", "api_key": "k"},
    )
    pid = add.json()["id"]
    client.post("/api/ai/select", json={"model": pid})
    assert ai._config["active"] == pid

    r = client.delete(f"/api/ai/providers/{pid}")
    assert r.status_code == 200
    assert ai._config["active"].startswith("ollama:")  # reset off the deleted one
    assert all(p["id"] != pid for p in ai._config["providers"])
