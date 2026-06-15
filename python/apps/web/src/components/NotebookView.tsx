"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import {
  Play,
  Loader2,
  Plus,
  Trash2,
  RotateCcw,
  PlaySquare,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Code2,
  Type,
  CircleDot,
  Sparkles,
  Wand2,
  Undo2,
  Redo2,
  Search,
  GripVertical,
  ChevronsDownUp,
  ChevronsUpDown,
  X,
} from "lucide-react";
import {
  getNotebook,
  saveNotebook,
  executeCell,
  restartKernel,
  lintCell,
  formatCode,
  completeCell,
  runCellInteractive,
  type InteractiveRun,
  type CellKind,
  type ExecResult,
  type CellOutput,
  type Diagnostic,
} from "@/lib/api";
import { CodeEditor } from "@/components/CodeEditor";
import { AiFixModal } from "@/components/AiFixModal";

// Live interactive run state (cells that call input()): the running transcript
// plus the current pending prompt (null = not waiting for input).
interface LiveState {
  transcript: string;
  awaiting: string | null;
  done: boolean;
}

interface CellState {
  id: string;
  source: string;
  kind: CellKind;
  count: number | null;
  running: boolean;
  output: ExecResult | null;
  editing: boolean;
  stdin: string; // pre-supplied input() text (runtime only, not persisted)
  live?: LiveState | null; // interactive session (runtime only)
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `cell-${Math.floor(performance.now())}-${Math.random().toString(36).slice(2)}`;

const fmtDur = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} วินาที` : `${ms} ms`;

// Per-file notebook (one .ipynb). Owns its own kernel (keyed by workspace+path
// on the backend), so each open notebook keeps independent state.
export const explainPrompt = (code: string, error: string) =>
  `อธิบาย error นี้และบอกวิธีแก้ (โค้ด Python):\n\n\`\`\`python\n${code}\n\`\`\`\n\nError:\n\`\`\`\n${error}\n\`\`\``;

export function NotebookView({
  workspaceId,
  path,
  active,
  onAskAI,
  insertRef,
  onToc,
  tocActionsRef,
}: {
  workspaceId: string;
  path: string;
  active: boolean;
  onAskAI: (prompt: string) => void;
  insertRef: React.MutableRefObject<((code: string) => void) | null>;
  onToc?: (cells: { id: string; source: string; kind: CellKind }[]) => void;
  tocActionsRef?: React.MutableRefObject<{
    jumpTo: (id: string) => void;
    runHeading: (id: string, level: number) => void;
    addHeading: () => void;
  } | null>;
}) {
  const [cells, setCells] = useState<CellState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [fixTarget, setFixTarget] = useState<{
    id: string;
    code: string;
    error: string;
  } | null>(null);
  // Notebook-level undo/redo for *structural* ops (add/delete/move/reorder/kind).
  // Intra-cell text undo stays with CodeMirror.
  const [past, setPast] = useState<CellState[][]>([]);
  const [future, setFuture] = useState<CellState[][]>([]);
  // Modal editing (Jupyter-style): a selected cell, in "command" or "edit" mode.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"command" | "edit">("command");
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findCase, setFindCase] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKey = useRef<{ key: string; t: number }>({ key: "", t: 0 });
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const interactiveRef = useRef<Map<string, InteractiveRun>>(new Map());

  useEffect(() => {
    const ctrl = new AbortController();
    getNotebook(workspaceId, path, ctrl.signal)
      .then((nbCells) => {
        const seed = nbCells.length
          ? nbCells
          : [{ id: uid(), source: "", kind: "code" as CellKind }];
        const seeded = seed.map((c) => ({
          id: c.id,
          source: c.source,
          kind: c.kind,
          count: null,
          running: false,
          output: null,
          editing: c.kind === "markdown" ? !c.source.trim() : false,
          stdin: "",
        }));
        setCells(seeded);
        setSelectedId(seeded[0]?.id ?? null);
        setPast([]);
        setFuture([]);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => ctrl.abort();
  }, [workspaceId, path]);

  const persist = useCallback(
    (next: CellState[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveNotebook(
          workspaceId,
          next.map((c) => ({ id: c.id, source: c.source, kind: c.kind })),
          path,
        ).catch(() => {});
      }, 600);
    },
    [workspaceId, path],
  );

  const update = useCallback(
    (next: CellState[]) => {
      setCells(next);
      persist(next);
    },
    [persist],
  );

  // Structural change: snapshot the current cells for undo, then apply.
  const commit = useCallback(
    (next: CellState[]) => {
      setPast((p) => [...p.slice(-49), cells]);
      setFuture([]);
      update(next);
    },
    [cells, update],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [...f, cells]);
      update(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, [cells, update]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, cells]);
      update(f[f.length - 1]);
      return f.slice(0, -1);
    });
  }, [cells, update]);

  const setSource = (id: string, source: string) =>
    update(cells.map((c) => (c.id === id ? { ...c, source } : c)));

  // AI panel "Insert" → append the code as a new cell at the end of this
  // notebook (registered while this tab is active).
  const insertCode = useCallback(
    (code: string) => {
      setCells((cs) => {
        const next: CellState[] = [
          ...cs,
          {
            id: uid(),
            source: code,
            kind: "code",
            count: null,
            running: false,
            output: null,
            editing: false,
            stdin: "",
          },
        ];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  useEffect(() => {
    if (!active) return;
    insertRef.current = insertCode;
    return () => {
      if (insertRef.current === insertCode) insertRef.current = null;
    };
  }, [active, insertCode, insertRef]);

  const newCell = (kind: CellKind): CellState => ({
    id: uid(),
    source: "",
    kind,
    count: null,
    running: false,
    output: null,
    editing: kind === "markdown",
    stdin: "",
  });

  const addCell = (kind: CellKind, afterId?: string, above = false) => {
    const cell = newCell(kind);
    setSelectedId(cell.id);
    setMode(kind === "markdown" ? "edit" : "command");
    if (!afterId) return commit([...cells, cell]);
    const i = cells.findIndex((c) => c.id === afterId);
    const at = above ? i : i + 1;
    commit([...cells.slice(0, at), cell, ...cells.slice(at)]);
  };

  const removeCell = (id: string) => {
    const i = cells.findIndex((c) => c.id === id);
    const next = cells.filter((c) => c.id !== id);
    const safe = next.length ? next : [newCell("code")];
    // keep selection on a neighbouring cell
    setSelectedId(safe[Math.min(i, safe.length - 1)]?.id ?? null);
    setMode("command");
    commit(safe);
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = cells.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= cells.length) return;
    const next = [...cells];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  // Drag-reorder: move `fromId` to just before/after `toId`.
  const reorder = (fromId: string, toId: string, after: boolean) => {
    if (fromId === toId) return;
    const from = cells.findIndex((c) => c.id === fromId);
    const without = cells.filter((c) => c.id !== fromId);
    let to = without.findIndex((c) => c.id === toId);
    if (to < 0) return;
    if (after) to += 1;
    if (without[after ? to - 1 : to]?.id === fromId) return;
    const next = [...without.slice(0, to), cells[from], ...without.slice(to)];
    commit(next);
  };

  const changeKind = (id: string, kind: CellKind) =>
    commit(
      cells.map((c) =>
        c.id === id
          ? { ...c, kind, editing: kind === "markdown", output: null, count: null }
          : c,
      ),
    );

  const setEditing = (id: string, editing: boolean) =>
    setCells((cs) => cs.map((c) => (c.id === id ? { ...c, editing } : c)));

  // ── interactive run (cells that call input()) ──────────────────────
  const updateLive = (id: string, fn: (l: LiveState) => LiveState) =>
    setCells((cs) =>
      cs.map((c) => (c.id === id && c.live ? { ...c, live: fn(c.live) } : c)),
    );

  const runInteractive = (id: string, source: string): Promise<boolean> =>
    new Promise((resolve) => {
      setCells((cs) =>
        cs.map((c) =>
          c.id === id
            ? {
                ...c,
                running: true,
                output: null,
                live: { transcript: "", awaiting: null, done: false },
              }
            : c,
        ),
      );
      const ctrl = runCellInteractive(workspaceId, path, source, {
        onStdout: (s) => updateLive(id, (l) => ({ ...l, transcript: l.transcript + s })),
        onInput: (prompt) => updateLive(id, (l) => ({ ...l, awaiting: prompt })),
        onResult: (res) => {
          setCells((cs) =>
            cs.map((c) =>
              c.id === id
                ? {
                    ...c,
                    running: false,
                    count: res.count,
                    output: res,
                    live: {
                      transcript: (c.live?.transcript ?? "") + (res.stdout || ""),
                      awaiting: null,
                      done: true,
                    },
                  }
                : c,
            ),
          );
          interactiveRef.current.delete(id);
          resolve(res.ok && !res.timed_out);
        },
        onError: (msg) => {
          updateLive(id, (l) => ({
            ...l,
            transcript: l.transcript + `\n⚠ ${msg}`,
            awaiting: null,
            done: true,
          }));
          setCells((cs) =>
            cs.map((c) => (c.id === id ? { ...c, running: false } : c)),
          );
          interactiveRef.current.delete(id);
          resolve(false);
        },
      });
      interactiveRef.current.set(id, ctrl);
    });

  const submitInput = (id: string, value: string) => {
    const ctrl = interactiveRef.current.get(id);
    if (!ctrl) return;
    setCells((cs) =>
      cs.map((c) =>
        c.id === id && c.live
          ? {
              ...c,
              live: {
                ...c.live,
                transcript: c.live.transcript + (c.live.awaiting ?? "") + value + "\n",
                awaiting: null,
              },
            }
          : c,
      ),
    );
    ctrl.sendInput(value);
  };

  // Format a single code cell (safe — reformat only, never removes imports).
  const formatCell = async (id: string) => {
    const cell = cells.find((c) => c.id === id);
    if (!cell || cell.kind !== "code" || !cell.source.trim()) return;
    try {
      const next = await formatCode(cell.source);
      if (next !== cell.source) setSource(id, next);
    } catch {
      /* ignore */
    }
  };

  const runCell = useCallback(
    async (id: string): Promise<boolean> => {
      const cell = cells.find((c) => c.id === id);
      if (!cell) return false;
      if (cell.kind === "markdown") {
        setEditing(id, false);
        return true;
      }
      // Cells that read input() run interactively (live prompt + box).
      if (/\binput\s*\(/.test(cell.source)) {
        return runInteractive(id, cell.source);
      }
      setCells((cs) => cs.map((c) => (c.id === id ? { ...c, running: true } : c)));
      try {
        const res = await executeCell(workspaceId, cell.source, path);
        setCells((cs) =>
          cs.map((c) =>
            c.id === id ? { ...c, running: false, output: res, count: res.count } : c,
          ),
        );
        return res.ok && !res.timed_out;
      } catch {
        setCells((cs) =>
          cs.map((c) =>
            c.id === id
              ? {
                  ...c,
                  running: false,
                  output: {
                    stdout: "",
                    stderr: "เรียก backend ไม่สำเร็จ",
                    result: null,
                    outputs: [],
                    ok: false,
                    count: c.count ?? 0,
                    timed_out: false,
                    duration_ms: 0,
                  },
                }
              : c,
          ),
        );
        return false;
      }
    },
    [cells, workspaceId, path],
  );

  const runAll = useCallback(async () => {
    setRunningAll(true);
    for (const c of cells) {
      const ok = await runCell(c.id);
      if (!ok && c.kind === "code") break;
    }
    setRunningAll(false);
  }, [cells, runCell]);

  const restart = useCallback(async () => {
    await restartKernel(workspaceId, path).catch(() => {});
    setCells((cs) =>
      cs.map((c) => ({ ...c, count: null, output: null, running: false })),
    );
  }, [workspaceId, path]);

  // ── table of contents (Colab-style) ────────────────────────────────
  // Push the current cells up to the sidebar TOC whenever this notebook is
  // the active tab.
  useEffect(() => {
    if (!active) return;
    onToc?.(cells.map((c) => ({ id: c.id, source: c.source, kind: c.kind })));
  }, [active, cells, onToc]);

  const jumpTo = (id: string) => {
    setSelectedId(id);
    setMode("command");
    cellRefs.current
      .get(id)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // Run a heading's section: the heading cell + everything under it, stopping
  // at the next heading of the same or higher level (like Colab "Run section").
  const headingMinLevel = (src: string): number | null => {
    let min: number | null = null;
    for (const l of src.split("\n")) {
      const m = l.match(/^(#{1,6})\s/);
      if (m && (min === null || m[1].length < min)) min = m[1].length;
    }
    return min;
  };

  const runHeading = useCallback(
    async (id: string, level: number) => {
      const start = cells.findIndex((c) => c.id === id);
      if (start < 0) return;
      let end = cells.length;
      for (let i = start + 1; i < cells.length; i++) {
        if (cells[i].kind === "markdown") {
          const lvl = headingMinLevel(cells[i].source);
          if (lvl !== null && lvl <= level) {
            end = i;
            break;
          }
        }
      }
      setRunningAll(true);
      for (let i = start; i < end; i++) {
        const ok = await runCell(cells[i].id);
        if (!ok && cells[i].kind === "code") break;
      }
      setRunningAll(false);
    },
    [cells, runCell],
  );

  // Add a new "หัวข้อที่ N" markdown heading at the end (N = next in sequence).
  const addHeading = () => {
    let max = 0;
    for (const c of cells) {
      if (c.kind !== "markdown") continue;
      for (const m of c.source.matchAll(/หัวข้อที่\s*(\d+)/g)) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    const cell: CellState = {
      id: uid(),
      source: `# หัวข้อที่ ${max + 1}`,
      kind: "markdown",
      count: null,
      running: false,
      output: null,
      editing: false,
      stdin: "",
    };
    setSelectedId(cell.id);
    setMode("command");
    commit([...cells, cell]);
    cellRefs.current
      .get(cell.id)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // Register jump/run-section/add-heading for the sidebar while this tab is
  // active. A ref holds the freshest impls so the stable wrapper never goes
  // stale.
  const tocImpl = useRef({ jumpTo, runHeading, addHeading });
  tocImpl.current = { jumpTo, runHeading, addHeading };
  useEffect(() => {
    if (!active || !tocActionsRef) return;
    tocActionsRef.current = {
      jumpTo: (id) => tocImpl.current.jumpTo(id),
      runHeading: (id, lvl) => tocImpl.current.runHeading(id, lvl),
      addHeading: () => tocImpl.current.addHeading(),
    };
  }, [active, tocActionsRef]);

  // ── selection / modal editing ──────────────────────────────────────
  const focusCell = (id: string) =>
    requestAnimationFrame(() => cellRefs.current.get(id)?.focus());

  const selectAt = (i: number) => {
    if (i < 0 || i >= cells.length) return;
    const id = cells[i].id;
    setSelectedId(id);
    setMode("command");
    cellRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
    focusCell(id);
  };

  const enterEdit = (id: string) => {
    const cell = cells.find((c) => c.id === id);
    if (!cell) return;
    setSelectedId(id);
    setMode("edit");
    if (cell.kind === "markdown") {
      setEditing(id, true); // textarea autofocuses
      return;
    }
    requestAnimationFrame(() =>
      (
        cellRefs.current.get(id)?.querySelector(".cm-content") as HTMLElement | null
      )?.focus(),
    );
  };

  // ── find / replace ─────────────────────────────────────────────────
  const matches = useMemo(() => {
    if (!findText) return [] as { cellId: string; pos: number }[];
    const needle = findCase ? findText : findText.toLowerCase();
    const res: { cellId: string; pos: number }[] = [];
    for (const c of cells) {
      const hay = findCase ? c.source : c.source.toLowerCase();
      let from = 0;
      let idx = hay.indexOf(needle, from);
      while (idx !== -1) {
        res.push({ cellId: c.id, pos: idx });
        from = idx + needle.length;
        idx = hay.indexOf(needle, from);
      }
    }
    return res;
  }, [cells, findText, findCase]);

  useEffect(() => {
    setMatchIdx(0);
  }, [findText, findCase]);

  const gotoMatch = (dir: 1 | -1) => {
    if (!matches.length) return;
    const n = (matchIdx + dir + matches.length) % matches.length;
    setMatchIdx(n);
    const m = matches[n];
    setSelectedId(m.cellId);
    setMode("command");
    cellRefs.current.get(m.cellId)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  };

  const replaceCurrent = () => {
    const m = matches[matchIdx];
    if (!m || !findText) return;
    commit(
      cells.map((c) =>
        c.id === m.cellId
          ? {
              ...c,
              source:
                c.source.slice(0, m.pos) +
                replaceText +
                c.source.slice(m.pos + findText.length),
            }
          : c,
      ),
    );
  };

  const replaceAll = () => {
    if (!findText) return;
    const needle = findCase ? findText : findText.toLowerCase();
    let touched = false;
    const next = cells.map((c) => {
      if (!c.source) return c;
      const hay = findCase ? c.source : c.source.toLowerCase();
      let out = "";
      let from = 0;
      let idx = hay.indexOf(needle, from);
      if (idx === -1) return c;
      while (idx !== -1) {
        out += c.source.slice(from, idx) + replaceText;
        from = idx + needle.length;
        idx = hay.indexOf(needle, from);
      }
      out += c.source.slice(from);
      touched = true;
      return { ...c, source: out };
    });
    if (touched) commit(next);
  };

  // ── command-mode keyboard (Jupyter-like) ───────────────────────────
  // A ref holds the freshest handler so the window listener (attached once
  // per active-state change) always sees current cells/selection/mode.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target as HTMLElement | null;
    const inField =
      !!target?.closest("input, textarea, .cm-editor, [contenteditable=true]");

    if (mod && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setShowFind(true);
      return;
    }
    if (e.key === "Escape") {
      if (mode === "edit") {
        target?.blur();
        setMode("command");
        if (selectedId) focusCell(selectedId);
      } else if (showFind) {
        setShowFind(false);
      }
      return;
    }
    // command-mode shortcuts only — never while typing in a field/editor
    if (mode !== "command" || !selectedId || inField || mod || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const idx = cells.findIndex((c) => c.id === selectedId);
    if (k === "arrowdown" || k === "j") {
      e.preventDefault();
      selectAt(idx + 1);
    } else if (k === "arrowup" || k === "k") {
      e.preventDefault();
      selectAt(idx - 1);
    } else if (k === "Enter") {
      e.preventDefault();
      enterEdit(selectedId);
    } else if (k === "a") {
      e.preventDefault();
      addCell("code", selectedId, true);
    } else if (k === "b") {
      e.preventDefault();
      addCell("code", selectedId);
    } else if (k === "m") {
      e.preventDefault();
      changeKind(selectedId, "markdown");
    } else if (k === "y") {
      e.preventDefault();
      changeKind(selectedId, "code");
    } else if (k === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (k === "d") {
      e.preventDefault();
      const now = Date.now();
      if (lastKey.current.key === "d" && now - lastKey.current.t < 500) {
        removeCell(selectedId);
        lastKey.current = { key: "", t: 0 };
      } else {
        lastKey.current = { key: "d", t: now };
      }
    }
  };

  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active]);

  if (!loaded)
    return (
      <p className="flex items-center gap-2 text-zinc-500 text-sm py-20 justify-center">
        <Loader2 size={16} className="animate-spin" /> กำลังโหลดโน้ตบุ๊ก…
      </p>
    );

  const busy = runningAll || cells.some((c) => c.running);

  return (
    <div className="flex flex-col h-full outline-none">
      <div className="flex items-center gap-1 px-2 py-0.5 border-b border-zinc-800 bg-zinc-950/40">
        <TBtn onClick={() => addCell("code")} icon={<Code2 size={12} />}>
          โค้ด
        </TBtn>
        <TBtn onClick={() => addCell("markdown")} icon={<Type size={12} />}>
          ข้อความ
        </TBtn>
        <div className="w-px h-4 bg-zinc-800 mx-0.5" />
        <TBtn
          onClick={runAll}
          disabled={busy}
          icon={runningAll ? <Loader2 size={12} className="animate-spin" /> : <PlaySquare size={12} />}
        >
          Run all
        </TBtn>
        <TBtn onClick={restart} disabled={busy} icon={<RotateCcw size={12} />}>
          Restart
        </TBtn>
        <div className="w-px h-4 bg-zinc-800 mx-0.5" />
        <TBtn onClick={undo} disabled={!past.length} icon={<Undo2 size={12} />}>
          ย้อนกลับ
        </TBtn>
        <TBtn onClick={redo} disabled={!future.length} icon={<Redo2 size={12} />}>
          ทำซ้ำ
        </TBtn>
        <TBtn
          onClick={() => setShowFind((s) => !s)}
          icon={<Search size={12} />}
        >
          ค้นหา
        </TBtn>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500">
          <CircleDot size={10} className={busy ? "text-amber-400" : "text-emerald-400"} />
          {busy ? "busy" : "idle"}
        </span>
      </div>

      {showFind && (
        <FindBar
          findText={findText}
          replaceText={replaceText}
          findCase={findCase}
          count={matches.length}
          current={matches.length ? matchIdx + 1 : 0}
          onFind={setFindText}
          onReplace={setReplaceText}
          onToggleCase={() => setFindCase((c) => !c)}
          onPrev={() => gotoMatch(-1)}
          onNext={() => gotoMatch(1)}
          onReplaceOne={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={() => setShowFind(false)}
        />
      )}

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          {cells.map((cell, idx) => (
            <CellView
              key={cell.id}
              cell={cell}
              first={idx === 0}
              last={idx === cells.length - 1}
              disabled={busy && !cell.running}
              selected={selectedId === cell.id}
              mode={mode}
              registerRef={(el) => {
                if (el) cellRefs.current.set(cell.id, el);
                else cellRefs.current.delete(cell.id);
              }}
              onSelect={() => {
                setSelectedId(cell.id);
                setMode("command");
              }}
              onEditFocus={() => {
                setSelectedId(cell.id);
                setMode("edit");
              }}
              onEditBlur={() => setMode("command")}
              onChange={(src) => setSource(cell.id, src)}
              onRun={() => runCell(cell.id)}
              onRunAdvance={async () => {
                const ok = await runCell(cell.id);
                if (ok && idx === cells.length - 1) addCell(cell.kind, cell.id);
                else if (ok) selectAt(idx + 1);
              }}
              onDelete={() => removeCell(cell.id)}
              onAddBelow={() => addCell(cell.kind, cell.id)}
              onMoveUp={() => move(cell.id, -1)}
              onMoveDown={() => move(cell.id, 1)}
              onEdit={() => setEditing(cell.id, true)}
              onFormat={() => formatCell(cell.id)}
              onReorder={reorder}
              completionSource={(c, ln, col) =>
                completeCell(workspaceId, path, c, ln, col)
              }
              lintSource={(c) => lintCell(workspaceId, path, c)}
              live={cell.live}
              onSubmitInput={(v) => submitInput(cell.id, v)}
              onAskAI={onAskAI}
              onFix={(code, error) =>
                setFixTarget({ id: cell.id, code, error })
              }
            />
          ))}
        </div>
      </div>

      {fixTarget && (
        <AiFixModal
          original={fixTarget.code}
          error={fixTarget.error}
          onApply={(code) => {
            setSource(fixTarget.id, code);
            setFixTarget(null);
          }}
          onClose={() => setFixTarget(null)}
        />
      )}
    </div>
  );
}

function FindBar({
  findText,
  replaceText,
  findCase,
  count,
  current,
  onFind,
  onReplace,
  onToggleCase,
  onPrev,
  onNext,
  onReplaceOne,
  onReplaceAll,
  onClose,
}: {
  findText: string;
  replaceText: string;
  findCase: boolean;
  count: number;
  current: number;
  onFind: (v: string) => void;
  onReplace: (v: string) => void;
  onToggleCase: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReplaceOne: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 border-b border-zinc-800 bg-zinc-950/70">
      <div className="flex items-center gap-1.5">
        <Search size={13} className="text-zinc-500 shrink-0" />
        <input
          autoFocus
          value={findText}
          onChange={(e) => onFind(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) onPrev();
              else onNext();
            }
          }}
          placeholder="ค้นหา…"
          className="flex-1 min-w-0 rounded-md bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs outline-none focus:border-teal-500/60"
        />
        <span className="text-[11px] text-zinc-500 tabular-nums w-14 text-center shrink-0">
          {findText ? `${current}/${count}` : "0/0"}
        </span>
        <button
          onClick={onToggleCase}
          title="ตรงตามตัวพิมพ์ใหญ่-เล็ก"
          className={`shrink-0 px-1.5 py-1 rounded-md text-[11px] font-mono cursor-pointer ${
            findCase
              ? "bg-teal-600/30 text-teal-200 border border-teal-500/40"
              : "text-zinc-400 hover:bg-zinc-800 border border-transparent"
          }`}
        >
          Aa
        </button>
        <button
          onClick={onPrev}
          disabled={!count}
          title="ก่อนหน้า (Shift+Enter)"
          className="shrink-0 p-1 rounded-md text-zinc-400 hover:bg-zinc-800 cursor-pointer disabled:opacity-30"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={onNext}
          disabled={!count}
          title="ถัดไป (Enter)"
          className="shrink-0 p-1 rounded-md text-zinc-400 hover:bg-zinc-800 cursor-pointer disabled:opacity-30"
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={onClose}
          title="ปิด (Esc)"
          className="shrink-0 p-1 rounded-md text-zinc-400 hover:bg-zinc-800 cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-[13px] shrink-0" />
        <input
          value={replaceText}
          onChange={(e) => onReplace(e.target.value)}
          placeholder="แทนที่ด้วย…"
          className="flex-1 min-w-0 rounded-md bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs outline-none focus:border-teal-500/60"
        />
        <button
          onClick={onReplaceOne}
          disabled={!count}
          className="shrink-0 px-2 py-1 rounded-md text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 cursor-pointer disabled:opacity-30"
        >
          แทนที่
        </button>
        <button
          onClick={onReplaceAll}
          disabled={!count}
          className="shrink-0 px-2 py-1 rounded-md text-[11px] bg-teal-600/80 text-white hover:bg-teal-500 cursor-pointer disabled:opacity-30"
        >
          ทั้งหมด
        </button>
      </div>
    </div>
  );
}

function TBtn({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {icon}
      {children}
    </button>
  );
}

function CellView({
  cell,
  first,
  last,
  disabled,
  selected,
  mode,
  registerRef,
  onSelect,
  onEditFocus,
  onEditBlur,
  onChange,
  onRun,
  onRunAdvance,
  onDelete,
  onAddBelow,
  onMoveUp,
  onMoveDown,
  onEdit,
  onFormat,
  onReorder,
  completionSource,
  lintSource,
  live,
  onSubmitInput,
  onAskAI,
  onFix,
}: {
  cell: CellState;
  first: boolean;
  last: boolean;
  disabled: boolean;
  selected: boolean;
  mode: "command" | "edit";
  registerRef: (el: HTMLDivElement | null) => void;
  onSelect: () => void;
  onEditFocus: () => void;
  onEditBlur: () => void;
  onChange: (src: string) => void;
  onRun: () => void;
  onRunAdvance: () => void;
  onDelete: () => void;
  onAddBelow: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onFormat: () => void;
  onReorder: (fromId: string, toId: string, after: boolean) => void;
  onAskAI: (prompt: string) => void;
  onFix: (code: string, error: string) => void;
  completionSource: (
    code: string,
    line: number,
    column: number,
  ) => Promise<{ label: string; type: string }[]>;
  lintSource: (code: string) => Promise<Diagnostic[]>;
  live?: LiveState | null;
  onSubmitInput: (value: string) => void;
}) {
  const out = cell.output;
  const hasOut =
    out &&
    (out.stdout ||
      out.stderr ||
      out.result ||
      out.outputs?.length ||
      out.timed_out);
  const label = cell.running ? "*" : cell.count ?? " ";
  const isMd = cell.kind === "markdown";
  const [collapsed, setCollapsed] = useState(false);
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState<"top" | "bottom" | null>(null);
  const editing = selected && mode === "edit";
  const previewLine =
    cell.source.split("\n").find((l) => l.trim()) || "(ว่าง)";

  // selected + command = blue rail; selected + edit = green rail (Jupyter cue)
  const ring = editing
    ? "border-emerald-500/60 ring-1 ring-emerald-500/30"
    : selected
      ? "border-sky-500/60 ring-1 ring-sky-500/30"
      : "border-zinc-800 hover:border-zinc-700";

  return (
    <div
      ref={registerRef}
      tabIndex={-1}
      onMouseDown={onSelect}
      onFocusCapture={(e) => {
        // focus entering the editor → edit mode
        if ((e.target as HTMLElement).closest(".cm-content, textarea"))
          onEditFocus();
      }}
      onBlurCapture={(e) => {
        if (
          editing &&
          !e.currentTarget.contains(e.relatedTarget as Node)
        )
          onEditBlur();
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-cell")) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setDragOver(e.clientY < r.top + r.height / 2 ? "top" : "bottom");
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => {
        const fromId = e.dataTransfer.getData("application/x-cell");
        const where = dragOver;
        setDragOver(null);
        if (fromId && where) onReorder(fromId, cell.id, where === "bottom");
      }}
      className={`group relative rounded-xl border bg-zinc-900/40 transition-colors outline-none ${ring}`}
    >
      {dragOver && (
        <div
          className={`absolute left-2 right-2 h-0.5 bg-teal-400 rounded-full z-20 ${
            dragOver === "top" ? "-top-1" : "-bottom-1"
          }`}
        />
      )}
      <div className="absolute -top-3 right-3 z-10 hidden group-hover:flex items-center gap-0.5 rounded-lg bg-zinc-800 border border-zinc-700 px-1 py-0.5 shadow-lg">
        <span
          title="ลากเพื่อย้าย"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/x-cell", cell.id);
          }}
          className="flex items-center justify-center p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </span>
        <IconBtn title="ขึ้น" onClick={onMoveUp} disabled={first}>
          <ChevronUp size={14} />
        </IconBtn>
        <IconBtn title="ลง" onClick={onMoveDown} disabled={last}>
          <ChevronDown size={14} />
        </IconBtn>
        {!isMd && (
          <IconBtn title="จัดรูปแบบ (Format)" onClick={onFormat}>
            <Sparkles size={14} />
          </IconBtn>
        )}
        <IconBtn
          title={inputCollapsed ? "แสดงเซลล์" : "ซ่อนเซลล์"}
          onClick={() => setInputCollapsed((v) => !v)}
        >
          {inputCollapsed ? (
            <ChevronsUpDown size={14} />
          ) : (
            <ChevronsDownUp size={14} />
          )}
        </IconBtn>
        <IconBtn title="เพิ่มด้านล่าง" onClick={onAddBelow}>
          <Plus size={14} />
        </IconBtn>
        <IconBtn title="ลบ" onClick={onDelete} danger>
          <Trash2 size={14} />
        </IconBtn>
      </div>

      <div className="flex">
        <div className="shrink-0 w-12 flex flex-col items-center pt-2 select-none">
          <button
            onClick={onRun}
            disabled={cell.running || disabled}
            title={isMd ? "แสดงผล" : "รัน (Ctrl+Enter)"}
            className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-teal-300 hover:bg-zinc-800 cursor-pointer disabled:opacity-40"
          >
            {cell.running ? (
              <Loader2 size={15} className="animate-spin" />
            ) : isMd ? (
              <Type size={15} />
            ) : (
              <Play size={15} />
            )}
          </button>
          {!isMd && (
            <span className="mt-1 font-mono text-[10px] text-zinc-600">[{label}]</span>
          )}
          {!isMd && out && !cell.running && (
            <span className="mt-0.5 text-[9px] text-zinc-600 text-center leading-tight">
              {fmtDur(out.duration_ms)}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 py-1.5 pr-2">
          {inputCollapsed ? (
            <button
              onClick={() => setInputCollapsed(false)}
              title="แสดงเซลล์"
              className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 cursor-pointer"
            >
              <ChevronRight size={13} className="shrink-0" />
              <span className="font-mono text-xs truncate">{previewLine}</span>
              <span className="text-[10px] text-zinc-600 shrink-0">⋯</span>
            </button>
          ) : isMd && !cell.editing ? (
            <div
              onDoubleClick={onEdit}
              className="md px-2 py-1 cursor-text min-h-[2rem]"
              dangerouslySetInnerHTML={{
                __html: marked.parse(cell.source || "*(ดับเบิลคลิกเพื่อแก้ไข)*") as string,
              }}
            />
          ) : isMd ? (
            <textarea
              autoFocus
              value={cell.source}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onRun}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                  e.preventDefault();
                  onRun();
                }
              }}
              rows={Math.min(Math.max(cell.source.split("\n").length, 2), 20)}
              placeholder="# เขียน Markdown…"
              className="w-full resize-none bg-transparent px-2 py-1 font-mono text-sm text-zinc-100 outline-none"
            />
          ) : (
            <CodeEditor
              value={cell.source}
              onChange={onChange}
              onRun={onRun}
              onRunAdvance={onRunAdvance}
              lintSource={lintSource}
              completionSource={completionSource}
            />
          )}

          {/* interactive run — live transcript + inline input box (input()) */}
          {!isMd && live && (
            <div className="mt-1 border-t border-zinc-800/60 px-2 pt-1 pb-1.5 text-sm">
              {live.transcript && (
                <pre className="font-mono whitespace-pre-wrap text-zinc-100 m-0">
                  {live.transcript}
                </pre>
              )}
              {live.awaiting !== null && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const inp = (e.currentTarget.elements.namedItem(
                      "v",
                    ) as HTMLInputElement);
                    onSubmitInput(inp.value);
                    inp.value = "";
                  }}
                  className="flex items-center gap-1 font-mono text-sm"
                >
                  <span className="whitespace-pre-wrap text-zinc-100">
                    {live.awaiting}
                  </span>
                  <input
                    name="v"
                    autoFocus
                    autoComplete="off"
                    className="flex-1 min-w-0 bg-zinc-900 border border-teal-500/50 rounded px-1.5 py-0.5 text-zinc-100 outline-none focus:border-teal-400"
                  />
                </form>
              )}
              {live.done && out && (
                <>
                  {out.outputs?.map((o, i) => (
                    <CellRichOutput key={i} out={o} />
                  ))}
                  {out.result && (
                    <pre className="font-mono whitespace-pre-wrap text-teal-300 m-0">
                      {out.result}
                    </pre>
                  )}
                  {out.stderr && (
                    <>
                      <pre className="font-mono whitespace-pre-wrap text-red-400 m-0">
                        {out.stderr}
                      </pre>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          onClick={() => onAskAI(explainPrompt(cell.source, out!.stderr))}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                        >
                          <Sparkles size={12} /> อธิบาย
                        </button>
                        <button
                          onClick={() => onFix(cell.source, out!.stderr)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-teal-600/20 border border-teal-500/30 text-teal-200 hover:bg-teal-600/30 cursor-pointer"
                        >
                          <Wand2 size={12} /> แก้ให้เลย
                        </button>
                      </div>
                    </>
                  )}
                  {out.timed_out && (
                    <span className="text-amber-400">⏱ หยุดเพราะเกิน timeout</span>
                  )}
                </>
              )}
            </div>
          )}

          {!isMd && !live && hasOut && (
            <div className="mt-1 border-t border-zinc-800/60">
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                {collapsed ? (
                  <ChevronRight size={11} />
                ) : (
                  <ChevronDown size={11} />
                )}
                {collapsed ? "แสดงผลลัพธ์" : "ซ่อนผลลัพธ์"}
              </button>
              {!collapsed && (
              <div className="px-2 pb-1.5 text-sm">
              {out!.stdout && (
                <pre className="font-mono whitespace-pre-wrap text-zinc-100 m-0">
                  {out!.stdout}
                </pre>
              )}
              {out!.outputs?.map((o, i) => (
                <CellRichOutput key={i} out={o} />
              ))}
              {out!.result && (
                <pre className="font-mono whitespace-pre-wrap text-teal-300 m-0">
                  {out!.result}
                </pre>
              )}
              {out!.stderr && (
                <>
                  <pre className="font-mono whitespace-pre-wrap text-red-400 m-0">
                    {out!.stderr}
                  </pre>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      onClick={() => onAskAI(explainPrompt(cell.source, out!.stderr))}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                    >
                      <Sparkles size={12} /> อธิบาย
                    </button>
                    <button
                      onClick={() => onFix(cell.source, out!.stderr)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-teal-600/20 border border-teal-500/30 text-teal-200 hover:bg-teal-600/30 cursor-pointer"
                    >
                      <Wand2 size={12} /> แก้ให้เลย
                    </button>
                  </div>
                </>
              )}
              {out!.timed_out && (
                <span className="text-amber-400">⏱ หยุดเพราะเกิน timeout</span>
              )}
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @next/next/no-img-element
function CellRichOutput({ out }: { out: CellOutput }) {
  if (out.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`data:${out.mime || "image/png"};base64,${out.data}`}
        alt="output"
        className="max-w-full my-1 rounded bg-white"
      />
    );
  }
  if (out.kind === "html" || out.kind === "svg") {
    // Local single-user kernel output → rendering its HTML/SVG is acceptable.
    return (
      <div
        className="cell-html overflow-auto my-1"
        dangerouslySetInnerHTML={{ __html: out.data }}
      />
    );
  }
  return (
    <pre className="font-mono whitespace-pre-wrap text-zinc-100 m-0">
      {out.data}
    </pre>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
        danger
          ? "text-zinc-400 hover:text-red-400 hover:bg-red-600/15"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}
