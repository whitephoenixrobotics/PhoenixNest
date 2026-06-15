"""File operations through the API: create / list / rename / move (drag-into-
folder) / copy-path (forward-slashed abspath) / delete, plus the protected-name
guards. These back the file-tree kebab menu + drag-and-drop features."""


def test_create_file_and_folder(project):
    client, wid, root = project
    r = client.post(f"/api/projects/{wid}/files/create", json={"path": "a.py"})
    assert r.status_code == 200
    assert (root / "a.py").is_file()

    r = client.post(
        f"/api/projects/{wid}/files/create", json={"path": "pkg", "is_dir": True}
    )
    assert r.status_code == 200
    assert (root / "pkg").is_dir()


def test_create_conflict(project):
    client, wid, root = project
    (root / "dup.py").write_text("", encoding="utf-8")
    r = client.post(f"/api/projects/{wid}/files/create", json={"path": "dup.py"})
    assert r.status_code == 409


def test_list_files_hides_dotfiles_by_default(project):
    client, wid, root = project
    (root / "visible.py").write_text("", encoding="utf-8")
    (root / ".hidden").write_text("", encoding="utf-8")
    names = [e["name"] for e in client.get(f"/api/projects/{wid}/files").json()]
    assert "visible.py" in names
    assert ".hidden" not in names


def test_save_and_read_back_content(project):
    client, wid, _ = project
    client.post(f"/api/projects/{wid}/files/create", json={"path": "note.txt"})
    client.put(
        f"/api/projects/{wid}/files/content",
        json={"path": "note.txt", "content": "เนื้อหา"},
    )
    got = client.get(
        f"/api/projects/{wid}/files/content", params={"path": "note.txt"}
    ).json()
    assert got["content"] == "เนื้อหา"


def test_rename_file(project):
    client, wid, root = project
    (root / "old.py").write_text("x = 1", encoding="utf-8")
    r = client.post(
        f"/api/projects/{wid}/files/rename",
        json={"path": "old.py", "new_name": "new.py"},
    )
    assert r.status_code == 200
    assert not (root / "old.py").exists()
    assert (root / "new.py").read_text(encoding="utf-8") == "x = 1"


def test_move_into_folder(project):
    client, wid, root = project
    (root / "f.py").write_text("", encoding="utf-8")
    (root / "sub").mkdir()
    r = client.post(
        f"/api/projects/{wid}/files/move", json={"path": "f.py", "dest_dir": "sub"}
    )
    assert r.status_code == 200
    assert r.json()["path"] == "sub/f.py"  # forward-slashed
    assert (root / "sub" / "f.py").exists()


def test_move_folder_into_itself_rejected(project):
    client, wid, root = project
    (root / "dir").mkdir()
    (root / "dir" / "inner").mkdir()
    r = client.post(
        f"/api/projects/{wid}/files/move",
        json={"path": "dir", "dest_dir": "dir/inner"},
    )
    assert r.status_code == 400


def test_abspath_is_forward_slashed(project):
    client, wid, root = project
    (root / "img.jpg").write_bytes(b"x")
    r = client.get(f"/api/projects/{wid}/files/abspath", params={"path": "img.jpg"})
    assert r.status_code == 200
    p = r.json()["path"]
    assert "\\" not in p           # usable as a string literal in code
    assert p.endswith("/img.jpg")


def test_delete_file(project):
    client, wid, root = project
    (root / "gone.py").write_text("", encoding="utf-8")
    r = client.delete(f"/api/projects/{wid}/files", params={"path": "gone.py"})
    assert r.status_code == 200
    assert not (root / "gone.py").exists()


def test_delete_protected_name_forbidden(project):
    client, wid, root = project
    (root / "project.json").write_text("{}", encoding="utf-8")
    r = client.delete(f"/api/projects/{wid}/files", params={"path": "project.json"})
    assert r.status_code == 403


def test_rename_protected_name_forbidden(project):
    client, wid, root = project
    (root / "notebook.json").write_text("{}", encoding="utf-8")
    r = client.post(
        f"/api/projects/{wid}/files/rename",
        json={"path": "notebook.json", "new_name": "x.json"},
    )
    assert r.status_code == 403


def test_delete_project_removes_folder_from_disk(project):
    # Backs the home page's "ลบไฟล์ถาวร" choice — must actually rmtree the folder.
    client, wid, root = project
    (root / "a.py").write_text("x = 1", encoding="utf-8")
    assert root.exists()
    r = client.delete(f"/api/projects/{wid}")
    assert r.status_code == 200
    assert not root.exists()
