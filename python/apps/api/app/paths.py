import os
from pathlib import Path

# Per-install data dir. Projects (each with its own files + venv) live under
# data/projects/<slug>/. Defaults to apps/api/data in a dev checkout; the bundled
# desktop build sets PHOENIXPY_DATA_DIR to a per-user app-data path so workspaces/
# settings survive module updates (the bundle folder is replaced on update).
DATA_DIR = Path(
    os.environ.get("PHOENIXPY_DATA_DIR")
    or (Path(__file__).resolve().parent.parent / "data")
)
PROJECTS_DIR = DATA_DIR / "projects"


def ensure_dirs() -> None:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


def _venv_interp(venv_dir: Path) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def venv_python(root: Path) -> Path:
    """Default venv interpreter path (root/venv) — used when creating one."""
    return _venv_interp(root / "venv")


def find_venv_python(root: Path) -> Path | None:
    """Locate an existing interpreter in the folder: venv/ or .venv/ (VS Code
    convention). Returns None if neither exists."""
    for name in ("venv", ".venv"):
        interp = _venv_interp(root / name)
        if interp.exists():
            return interp
    return None
