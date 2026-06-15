"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Save,
  X,
  FileText,
  AlertTriangle,
  Check,
  Eye,
  Code2,
  Play,
  Clock,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  getFileContent,
  saveFileContent,
  runFile,
  runFileInteractive,
  lintCode,
  formatCode,
  fixCode,
  completeCode,
  type RunResult,
  type InteractiveRun,
} from "@/lib/api";
import { CodeEditor } from "@/components/CodeEditor";
import { explainPrompt } from "@/components/NotebookView";
import { AiFixModal } from "@/components/AiFixModal";
import { langForFilename } from "@/lib/lang";
import { renderMarkdown } from "@/lib/markdown";

const MD = /\.(md|markdown)$/i;
const PY = /\.(py|pyw)$/i;

export function FileEditor({
  slug,
  path,
  active,
  onClose,
  onAskAI,
  insertRef,
}: {
  slug: string;
  path: string;
  active: boolean;
  onClose: () => void;
  onAskAI: (prompt: string) => void;
  insertRef: React.MutableRefObject<((code: string) => void) | null>;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [editable, setEditable] = useState(true);
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isMd = MD.test(path);
  const isPy = PY.test(path);
  const [preview, setPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<RunResult | null>(null);
  const [live, setLive] = useState<{
    transcript: string;
    awaiting: string | null;
    done: boolean;
  } | null>(null);
  const ctrlRef = useRef<InteractiveRun | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // close the interactive run WebSocket + clear timers on unmount
  useEffect(
    () => () => {
      ctrlRef.current?.close();
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );
  const [fixOpen, setFixOpen] = useState(false);
  // Scripts that read input() run interactively (live prompt + inline box).
  const needsInput = isPy && /\binput\s*\(/.test(content ?? "");

  // Drag-resizable output panel (persisted).
  const [outHeight, setOutHeight] = useState(() => {
    if (typeof window === "undefined") return 200;
    const v = Number(localStorage.getItem("pn-output-height"));
    return v >= 100 && v <= 800 ? v : 200;
  });
  const outHeightRef = useRef(outHeight);
  outHeightRef.current = outHeight;

  const startDragOut = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = outHeightRef.current;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    const onMove = (ev: MouseEvent) =>
      setOutHeight(Math.min(Math.max(startH + (startY - ev.clientY), 100), 800));
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try {
        localStorage.setItem("pn-output-height", String(outHeightRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    setContent(null);
    setDirty(false);
    const ctrl = new AbortController();
    getFileContent(slug, path, ctrl.signal)
      .then((r) => {
        setEditable(r.editable);
        setReason(r.reason);
        setContent(r.content);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setErr("เปิดไฟล์ไม่สำเร็จ");
      });
    return () => ctrl.abort();
  }, [slug, path]);

  const save = async () => {
    if (content === null || !editable || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await saveFileContent(slug, path, content);
      setDirty(false);
      setSavedAt(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedAt(false), 1500);
    } catch {
      setErr("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // AI panel "Insert" → append the code to this file (while active).
  useEffect(() => {
    if (!active) return;
    const fn = (code: string) => {
      setContent((c) => {
        const base = c ?? "";
        return base + (base && !base.endsWith("\n") ? "\n" : "") + code + "\n";
      });
      setDirty(true);
    };
    insertRef.current = fn;
    return () => {
      if (insertRef.current === fn) insertRef.current = null;
    };
  }, [active, insertRef]);

  // Format / auto-fix the current content with Ruff (no AI).
  const transform = async (fn: (c: string) => Promise<string>) => {
    if (content === null) return;
    try {
      const next = await fn(content);
      if (next !== content) {
        setContent(next);
        setDirty(true);
      }
    } catch {
      setErr("จัดรูปแบบไม่สำเร็จ");
    }
  };

  const runInteractive = () =>
    new Promise<void>((resolve) => {
      setOutput(null);
      setLive({ transcript: "", awaiting: null, done: false });
      const ctrl = runFileInteractive(slug, path, {
        onStdout: (s) =>
          setLive((l) => (l ? { ...l, transcript: l.transcript + s } : l)),
        onInput: (p) => setLive((l) => (l ? { ...l, awaiting: p } : l)),
        onResult: (res) => {
          setLive((l) => ({
            transcript: (l?.transcript ?? "") + (res.stdout || ""),
            awaiting: null,
            done: true,
          }));
          setOutput(res);
          ctrlRef.current = null;
          resolve();
        },
        onError: (msg) => {
          setLive((l) => ({
            transcript: (l?.transcript ?? "") + `\n⚠ ${msg}`,
            awaiting: null,
            done: true,
          }));
          ctrlRef.current = null;
          resolve();
        },
      });
      ctrlRef.current = ctrl;
    });

  const submitInput = (value: string) => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    setLive((l) =>
      l
        ? {
            ...l,
            transcript: l.transcript + (l.awaiting ?? "") + value + "\n",
            awaiting: null,
          }
        : l,
    );
    ctrl.sendInput(value);
  };

  // Run the .py file (save first). Scripts with input() run interactively.
  const run = async () => {
    if (content === null || running) return;
    setRunning(true);
    setErr(null);
    try {
      await saveFileContent(slug, path, content);
      setDirty(false);
      if (needsInput) {
        await runInteractive();
      } else {
        setLive(null);
        setOutput(await runFile(slug, path));
      }
    } catch {
      setErr("รันไม่สำเร็จ");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={15} className="text-zinc-500 shrink-0" />
          <span className="text-sm text-zinc-200 truncate">{path}</span>
          {dirty && <span className="text-amber-400 text-xs">●</span>}
        </div>
        <div className="flex items-center gap-2">
          {editable && isMd && (
            <button
              onClick={() => setPreview((p) => !p)}
              title={preview ? "แก้ไข" : "พรีวิว"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
            >
              {preview ? <Code2 size={14} /> : <Eye size={14} />}
              {preview ? "แก้ไข" : "พรีวิว"}
            </button>
          )}
          {editable && isPy && !preview && (
            <>
              <button
                onClick={() => transform(fixCode)}
                title="แก้อัตโนมัติ (ลบ import ที่ไม่ใช้ + เรียง + format)"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
              >
                <Wand2 size={14} /> Fix
              </button>
              <button
                onClick={() => transform(formatCode)}
                title="จัดรูปแบบ (Ruff format)"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
              >
                <Sparkles size={14} /> Format
              </button>
              <button
                onClick={run}
                disabled={running}
                title="รันไฟล์ (Ctrl+Enter)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {running ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                รัน
              </button>
            </>
          )}
          {editable && !preview && (
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : savedAt ? (
                <Check size={14} />
              ) : (
                <Save size={14} />
              )}
              {savedAt ? "บันทึกแล้ว" : "บันทึก"}
            </button>
          )}
          <button
            onClick={onClose}
            title="ปิด (กลับ Notebook)"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-auto">
          {err && (
            <div className="m-4 text-sm text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
          {content === null && !err ? (
            <p className="flex items-center gap-2 text-zinc-500 text-sm p-6">
              <Loader2 size={15} className="animate-spin" /> กำลังเปิด…
            </p>
          ) : !editable ? (
            <div className="flex flex-col items-center text-center gap-2 py-20 text-zinc-500">
              <AlertTriangle size={30} className="text-amber-500" />
              <p>
                {reason === "large"
                  ? "ไฟล์ใหญ่เกินไปสำหรับแก้ไข"
                  : "ไฟล์ไบนารี เปิดแก้ไม่ได้"}
              </p>
            </div>
          ) : isMd && preview ? (
            <div
              className="md px-6 py-4 max-w-3xl"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content ?? "") }}
            />
          ) : (
            content !== null && (
              <CodeEditor
                value={content}
                language={langForFilename(path)}
                onChange={(v) => {
                  setContent(v);
                  setDirty(true);
                }}
                onSave={save}
                onRun={isPy ? run : undefined}
                lintSource={isPy ? (c) => lintCode(c) : undefined}
                completionSource={
                  isPy
                    ? (c, line, col) => completeCode(c, line, col)
                    : undefined
                }
              />
            )
          )}
        </div>

        {/* run output (.py) */}
        {isPy && (running || output || live) && (
          <div
            className="shrink-0 border-t border-zinc-800 bg-zinc-950 flex flex-col"
            style={{ height: outHeight }}
          >
            <div
              onMouseDown={startDragOut}
              title="ลากเพื่อปรับความสูง"
              className="h-1.5 shrink-0 cursor-row-resize bg-zinc-800 hover:bg-teal-500/60 transition-colors"
            />
            <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-800/60 text-xs">
              <span className="text-zinc-400">Output</span>
              <div className="flex items-center gap-2">
                {output && (
                  <span
                    className={`flex items-center gap-1 ${
                      output.exit_code === 0 && !output.timed_out
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    <Clock size={11} />
                    {output.duration_ms}ms · exit {output.exit_code ?? "—"}
                  </span>
                )}
                <button
                  onClick={() => {
                    setOutput(null);
                    setLive(null);
                  }}
                  className="p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-sm whitespace-pre-wrap">
              {live ? (
                <>
                  {live.transcript && (
                    <span className="text-zinc-100">{live.transcript}</span>
                  )}
                  {live.awaiting !== null && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const inp = e.currentTarget.elements.namedItem(
                          "v",
                        ) as HTMLInputElement;
                        submitInput(inp.value);
                        inp.value = "";
                      }}
                      className="flex items-center gap-1"
                    >
                      <span className="text-zinc-100 whitespace-pre-wrap">
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
                  {!live.done && live.awaiting === null && (
                    <span className="flex items-center gap-2 text-zinc-500">
                      <Loader2 size={14} className="animate-spin" /> กำลังรัน…
                    </span>
                  )}
                  {live.done && output?.stderr && (
                    <>
                      <span className="text-red-400">{output.stderr}</span>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            onAskAI(explainPrompt(content ?? "", output.stderr))
                          }
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 cursor-pointer w-fit"
                        >
                          <Sparkles size={12} /> อธิบาย
                        </button>
                        <button
                          onClick={() => setFixOpen(true)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-teal-600/20 border border-teal-500/30 text-teal-200 hover:bg-teal-600/30 cursor-pointer w-fit"
                        >
                          <Wand2 size={12} /> แก้ให้เลย
                        </button>
                      </div>
                    </>
                  )}
                  {live.done && output?.timed_out && (
                    <span className="text-amber-400">⏱ หยุดเพราะเกิน timeout</span>
                  )}
                </>
              ) : running ? (
                <span className="flex items-center gap-2 text-zinc-500">
                  <Loader2 size={14} className="animate-spin" /> กำลังรัน…
                </span>
              ) : output ? (
                <>
                  {output.stdout && <span className="text-zinc-100">{output.stdout}</span>}
                  {output.stderr && (
                    <>
                      <span className="text-red-400">{output.stderr}</span>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            onAskAI(explainPrompt(content ?? "", output.stderr))
                          }
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 cursor-pointer w-fit"
                        >
                          <Sparkles size={12} /> อธิบาย
                        </button>
                        <button
                          onClick={() => setFixOpen(true)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-teal-600/20 border border-teal-500/30 text-teal-200 hover:bg-teal-600/30 cursor-pointer w-fit"
                        >
                          <Wand2 size={12} /> แก้ให้เลย
                        </button>
                      </div>
                    </>
                  )}
                  {output.timed_out && (
                    <span className="text-amber-400">⏱ หยุดเพราะเกิน timeout</span>
                  )}
                  {!output.stdout && !output.stderr && !output.timed_out && (
                    <span className="text-zinc-600">(ไม่มี output)</span>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {fixOpen && output?.stderr && (
        <AiFixModal
          original={content ?? ""}
          error={output.stderr}
          onApply={(code) => {
            setContent(code);
            setDirty(true);
            setFixOpen(false);
          }}
          onClose={() => setFixOpen(false)}
        />
      )}
    </div>
  );
}
