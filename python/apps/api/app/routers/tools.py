"""Code tools — lint / format / auto-fix via Ruff (no AI). Ruff ships with the
backend venv and analyses code from stdin, so it works regardless of whether
the user's project venv has it installed.
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["tools"])

_RUFF = Path(sys.executable).parent / ("ruff.exe" if os.name == "nt" else "ruff")

# Codes treated as errors (red); everything else is a warning (yellow).
_ERROR_CODES = {"E999", "F821", "F822", "F823", "F811", "F706", "F707"}


class CodeBody(BaseModel):
    code: str
    # Notebook cells are partial: names/imports resolve across cells, so silence
    # those rules (undefined name, unused/redefined import) to avoid noise.
    cell: bool = False


class CompleteBody(BaseModel):
    code: str
    line: int  # 1-based
    column: int  # 0-based char offset on the line


class Completion(BaseModel):
    label: str
    type: str = ""


_CELL_IGNORE = "F401,F811,F821,F823"


class Diagnostic(BaseModel):
    line: int
    column: int
    end_line: int
    end_column: int
    code: str
    message: str
    severity: str  # "error" | "warning"


class FormatResult(BaseModel):
    code: str
    ok: bool
    error: str = ""


def _ruff(args: list[str], code: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(_RUFF), *args, "--stdin-filename", "cell.py", "-"],
        input=code,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=20,
    )


def _require_ruff() -> None:
    if not _RUFF.exists():
        raise HTTPException(status_code=503, detail="ไม่พบ ruff ใน backend")


async def ruff_diagnostics(code: str, ignore: str = "") -> list[Diagnostic]:
    """Reusable: run `ruff check` and return diagnostics (also used by the
    kernel-aware notebook linter)."""
    if not _RUFF.exists():
        return []
    args = ["check", "--output-format", "json"]
    if ignore:
        args += ["--ignore", ignore]
    proc = await asyncio.to_thread(_ruff, args, code)
    try:
        items = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError:
        items = []
    diags: list[Diagnostic] = []
    for it in items:
        c = it.get("code") or "E999"
        loc = it.get("location") or {}
        end = it.get("end_location") or loc
        severity = "error" if (c in _ERROR_CODES or c.startswith("E9")) else "warning"
        diags.append(
            Diagnostic(
                line=loc.get("row", 1),
                column=loc.get("column", 1),
                end_line=end.get("row", loc.get("row", 1)),
                end_column=end.get("column", loc.get("column", 1)),
                code=c,
                message=it.get("message", ""),
                severity=severity,
            )
        )
    return diags


# Cell linting keeps F821 (undefined name) — the kernel-aware filter removes
# false positives for cross-cell names.
CELL_LINT_IGNORE = "F401,F811,F823"


@router.post("/lint", response_model=list[Diagnostic])
async def lint(body: CodeBody) -> list[Diagnostic]:
    _require_ruff()
    return await ruff_diagnostics(body.code, _CELL_IGNORE if body.cell else "")


@router.post("/complete", response_model=list[Completion])
async def complete(body: CompleteBody) -> list[Completion]:
    """Static code completion for files via Jedi (no AI)."""

    def _do() -> list[Completion]:
        try:
            import jedi
        except ImportError:
            return []
        try:
            script = jedi.Script(body.code)
            return [
                Completion(label=c.name, type=c.type)
                for c in script.complete(body.line, body.column)[:60]
            ]
        except Exception:  # noqa: BLE001
            return []

    return await asyncio.to_thread(_do)


@router.post("/format", response_model=FormatResult)
async def format_code(body: CodeBody) -> FormatResult:
    _require_ruff()
    proc = await asyncio.to_thread(_ruff, ["format"], body.code)
    if proc.returncode == 0:
        return FormatResult(code=proc.stdout, ok=True)
    return FormatResult(code=body.code, ok=False, error=proc.stderr.strip())


@router.post("/fix", response_model=FormatResult)
async def fix_code(body: CodeBody) -> FormatResult:
    _require_ruff()
    # Auto-fix (unused imports, import order, simple issues) then format.
    fixed = await asyncio.to_thread(_ruff, ["check", "--fix"], body.code)
    src = fixed.stdout if fixed.stdout else body.code
    formatted = await asyncio.to_thread(_ruff, ["format"], src)
    return FormatResult(code=formatted.stdout if formatted.returncode == 0 else src, ok=True)
