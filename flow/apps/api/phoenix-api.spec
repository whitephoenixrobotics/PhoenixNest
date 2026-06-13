# PyInstaller spec for the Phoenix Flow backend (FastAPI + AI stack).
# Build:  venv\Scripts\pyinstaller --clean -y phoenix-api.spec
# Output: dist/phoenix-api/  (onedir — preserves CUDA DLLs and ML datafiles)

from PyInstaller.utils.hooks import (
    collect_submodules,
    collect_data_files,
    collect_dynamic_libs,
    copy_metadata,
)

block_cipher = None

# ── Hidden imports ───────────────────────────────────────────────────────────
# Things PyInstaller's static analysis misses because they're imported by name,
# by alembic, by uvicorn workers, by node-handler discovery, etc.
hidden = [
    # Web stack — uvicorn / fastapi pieces that get pulled in dynamically
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan.on",
    "websockets.legacy",
    "websockets.legacy.client",
    "websockets.legacy.server",

    # DB
    "aiosqlite",

    # Auth
    "jose.backends.cryptography_backend",
    "passlib.handlers.bcrypt",

    # Engine: every node-handler module (lazy-imported by name in some places)
    *collect_submodules("app.engine.nodes"),
    *collect_submodules("app.engine"),

    # AI/ML — these all have C/Fortran extensions PyInstaller often misses
    *collect_submodules("torch"),
    *collect_submodules("torchvision"),
    *collect_submodules("ultralytics"),
    *collect_submodules("easyocr"),
    *collect_submodules("open_clip"),
    *collect_submodules("mediapipe"),
    *collect_submodules("faster_whisper"),
    *collect_submodules("ctranslate2"),
    *collect_submodules("cv2"),
    *collect_submodules("PIL"),
    *collect_submodules("numpy"),
    *collect_submodules("scipy"),
    *collect_submodules("skimage"),
    *collect_submodules("sklearn"),
    *collect_submodules("shapely"),
    *collect_submodules("av"),
    *collect_submodules("onnxruntime"),
    *collect_submodules("tokenizers"),
    *collect_submodules("huggingface_hub"),
    *collect_submodules("sympy"),
]

# ── Data files (model weights, configs, .pyi, etc.) ───────────────────────────
datas = []
for pkg in (
    "ultralytics",
    "easyocr",
    "open_clip",
    "mediapipe",
    "faster_whisper",
    "cv2",
    "torch",
    "torchvision",
    "skimage",
    "sklearn",
    "scipy",
):
    datas += collect_data_files(pkg)

# Some packages need their dist-info present for importlib.metadata lookups.
for pkg in ("torch", "ultralytics", "easyocr", "faster_whisper", "ctranslate2"):
    try:
        datas += copy_metadata(pkg)
    except Exception:
        pass

# ── Native libs (.dll / .pyd for Windows) ─────────────────────────────────────
binaries = []
for pkg in (
    "torch",
    "torchvision",
    "cv2",
    "av",
    "ctranslate2",
    "onnxruntime",
    "numpy",
    "scipy",
):
    binaries += collect_dynamic_libs(pkg)


a = Analysis(
    ["phoenix_api_entry.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Trim things we don't ship (saves hundreds of MB)
        "tkinter",
        "matplotlib.tests",
        "numpy.tests",
        "scipy.tests",
        "PIL.tests",
        "pytest",
        "IPython",
        "notebook",
    ],
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="phoenix-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,           # UPX corrupts torch's DLLs — leave off
    console=True,        # keep console for first build; switch to False later
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="phoenix-api",
)
