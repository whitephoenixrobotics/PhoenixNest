"""
Flash the bundled StandardFirmata.hex to an Arduino UNO via avrdude.

Phoenix bundles:
  firmware/avrdude.exe        — official avrdude v8.1 Windows x64 binary
  firmware/avrdude.conf       — avrdude part definitions
  firmware/StandardFirmata.hex — compiled with arduino-cli for arduino:avr:uno

The avrdude invocation matches what the Arduino IDE itself uses to upload to
an UNO: programmer = arduino (STK500v1 over serial), baud = 115200, part =
m328p. We disable auto-erase since the bootloader handles it.
"""
from __future__ import annotations

import logging
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

_HERE = Path(__file__).parent
_FW_DIR = _HERE / "firmware"
AVRDUDE_EXE = _FW_DIR / "avrdude.exe"
AVRDUDE_CONF = _FW_DIR / "avrdude.conf"
FIRMATA_HEX = _FW_DIR / "StandardFirmata.hex"


@dataclass
class FlashResult:
    ok: bool
    log: str        # combined stdout+stderr (useful when ok=False to show user)
    duration_s: float


def check_bundle() -> tuple[bool, str]:
    """Verify required files are present. Used by the /flash endpoint to fail
    fast with a clear message instead of letting subprocess error opaquely."""
    missing = [p.name for p in (AVRDUDE_EXE, AVRDUDE_CONF, FIRMATA_HEX) if not p.exists()]
    if missing:
        return False, f"missing files under firmware/: {', '.join(missing)}"
    return True, "ok"


def flash(port: str) -> FlashResult:
    """Flash StandardFirmata.hex to the UNO on the given port. Blocking — call
    from a thread or asyncio.to_thread()."""
    import time
    ok, msg = check_bundle()
    if not ok:
        return FlashResult(ok=False, log=msg, duration_s=0.0)

    cmd = [
        str(AVRDUDE_EXE),
        "-C", str(AVRDUDE_CONF),
        "-v",
        "-patmega328p",
        "-carduino",
        f"-P{port}",
        "-b115200",
        "-D",  # disable auto-erase (bootloader does it)
        f"-Uflash:w:{FIRMATA_HEX}:i",
    ]
    log.info("[arduino] flashing: %s", " ".join(cmd))

    t0 = time.monotonic()
    try:
        # avrdude prints progress to stderr. Capture both and return combined.
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            # Hide the console window on Windows (avoid pop-up flash in packaged app).
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
    except subprocess.TimeoutExpired:
        return FlashResult(ok=False, log="avrdude timed out after 60s", duration_s=60.0)
    except Exception as e:
        return FlashResult(ok=False, log=f"failed to run avrdude: {e}", duration_s=0.0)

    dur = time.monotonic() - t0
    log_text = (result.stdout or "") + (result.stderr or "")
    if result.returncode != 0:
        return FlashResult(ok=False, log=log_text, duration_s=dur)
    return FlashResult(ok=True, log=log_text, duration_s=dur)
