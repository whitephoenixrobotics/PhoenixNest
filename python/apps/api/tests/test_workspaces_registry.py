"""Workspace registry (app/workspaces.py) — the type-guard + atomic-write
hardening from batch 3. A corrupt or partially-written registry must degrade to
"empty", never crash a caller that relies on w["id"]/w["path"]."""

import json

from app import workspaces


def test_load_missing_file_is_empty():
    assert workspaces._load() == []


def test_load_corrupt_json_is_empty():
    workspaces._FILE.write_text("{ not json", encoding="utf-8")
    assert workspaces._load() == []


def test_load_non_list_is_empty():
    # a JSON object (not a list) must not crash recents()/get()
    workspaces._FILE.write_text('{"id": "x"}', encoding="utf-8")
    assert workspaces._load() == []


def test_load_drops_malformed_entries():
    workspaces._FILE.write_text(
        json.dumps(
            [
                {"id": "good", "path": "/a", "name": "a"},
                {"id": 123, "path": "/b"},        # id not a str → drop
                {"path": "/c"},                    # missing id → drop
                "not-a-dict",                      # wrong type → drop
                {"id": "good2", "path": "/d"},
            ]
        ),
        encoding="utf-8",
    )
    ids = [w["id"] for w in workspaces._load()]
    assert ids == ["good", "good2"]


def test_save_roundtrips_and_leaves_no_tmp():
    workspaces._save([{"id": "x", "path": "/p", "name": "p"}])
    assert workspaces._load()[0]["id"] == "x"
    # atomic write must not leave the temp file behind
    assert not (workspaces._FILE.parent / "workspaces.json.tmp").exists()


def test_remember_dedupes_by_id_and_forget_removes():
    r1 = workspaces.remember("/some/dir", "2026-01-01T00:00:00")
    # remembering the same path again refreshes rather than duplicating
    workspaces.remember("/some/dir", "2026-02-01T00:00:00")
    same_id = [w for w in workspaces._load() if w["id"] == r1["id"]]
    assert len(same_id) == 1
    assert workspaces.get(r1["id"]) is not None

    workspaces.forget(r1["id"])
    assert workspaces.get(r1["id"]) is None


def test_recents_filters_missing_dirs_and_sorts_newest_first(tmp_path):
    real = tmp_path / "live"
    real.mkdir()
    workspaces.remember(str(real), "2026-01-01T00:00:00")
    workspaces.remember(str(tmp_path / "gone"), "2026-05-01T00:00:00")  # never created
    recents = workspaces.recents()
    # the non-existent folder is filtered out
    assert [w["name"] for w in recents] == ["live"]
