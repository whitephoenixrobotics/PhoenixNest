import os
from pathlib import Path

# Per-install data dir. Projects (each with its own files + venv) live under
# data/projects/<slug>/. Kept inside apps/api for now; a packaged build would
# point this at a per-user app-data path.
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
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
