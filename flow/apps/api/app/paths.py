"""Central, writable storage locations for user data (models + TrainAI).

The SQLite DB already lives in a per-user writable dir in packaged builds (set
via DATABASE_URL in phoenix_api_entry.py). This module does the same for the
file-based `storage/` tree (uploaded models + TrainAI datasets/checkpoints):

- Dev (no PHOENIX_DATA_DIR): `apps/api/storage/` — unchanged.
- Packaged (PHOENIX_DATA_DIR set by the entry point to %LOCALAPPDATA%\\PhoenixFlow):
  `<data_dir>/storage/` — survives uninstall/update and is always writable.

`migrate_legacy_storage()` moves a v0.2.0-style in-install `storage/` to the new
per-user location once, so existing users don't lose trained models on upgrade.
"""
import os
import shutil


def _relative_storage() -> str:
    """storage/ next to the api package.

    Dev: `apps/api/storage`. In a packaged build this points at the *legacy*
    location bundled inside the install dir (what v0.2.0 used).
    """
    api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../apps/api
    return os.path.join(api_dir, "storage")


_data_dir = os.environ.get("PHOENIX_DATA_DIR")
STORAGE_DIR = os.path.join(_data_dir, "storage") if _data_dir else _relative_storage()
MODELS_DIR = os.path.join(STORAGE_DIR, "models")
TRAIN_ROOT = os.path.join(STORAGE_DIR, "train")
# Uploaded source videos for backend-native processing (decoded server-side)
VIDEO_DIR = os.path.join(STORAGE_DIR, "videos")


def migrate_legacy_storage() -> bool:
    """One-time move of an old in-install storage/ into the per-user dir.

    No-op in dev (legacy == STORAGE_DIR) or when the destination already holds
    data. Returns True only when data was actually migrated.
    """
    legacy = _relative_storage()
    if os.path.abspath(legacy) == os.path.abspath(STORAGE_DIR):
        return False  # dev — same location
    if not os.path.isdir(legacy) or not os.listdir(legacy):
        return False  # nothing to migrate
    if os.path.isdir(STORAGE_DIR) and os.listdir(STORAGE_DIR):
        return False  # destination already populated — never clobber

    os.makedirs(os.path.dirname(STORAGE_DIR), exist_ok=True)
    if os.path.isdir(STORAGE_DIR):
        os.rmdir(STORAGE_DIR)  # empty placeholder → remove so move can rename in
    shutil.move(legacy, STORAGE_DIR)
    return True
