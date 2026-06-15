"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  FileText,
  NotebookPen,
  Image as ImageIcon,
  FileType,
  Table2,
  X,
  TerminalSquare,
  Sparkles,
} from "lucide-react";
import { getWorkspace, type Workspace, type NotebookCell } from "@/lib/api";
import { NotebookSidebar } from "@/components/NotebookSidebar";
import { TerminalPanel } from "@/components/TerminalPanel";
import { AiPanel } from "@/components/AiPanel";
import {
  FileTab,
  IMAGE_RE,
  MEDIA_RE,
  CSV_RE,
  isNotebook,
} from "@/components/FileTab";

function tabIcon(p: string) {
  if (isNotebook(p)) return <NotebookPen size={11} />;
  if (IMAGE_RE.test(p)) return <ImageIcon size={11} />;
  if (MEDIA_RE.test(p)) return <FileType size={11} />;
  if (CSV_RE.test(p)) return <Table2 size={11} />;
  return <FileText size={11} />;
}

export function WorkspaceView({ workspaceId }: { workspaceId: string }) {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiSeed, setAiSeed] = useState<{ text: string; nonce: number } | null>(null);
  // The active editor (notebook/file) registers its "insert code" fn here so
  // the AI panel's Insert button targets whatever tab is in front.
  const insertRef = useRef<((code: string) => void) | null>(null);
  // The active notebook drives the sidebar table-of-contents: it pushes its
  // cells (for headings) and registers jump / run-section actions here.
  const [tocCells, setTocCells] = useState<NotebookCell[] | undefined>(undefined);
  const tocActionsRef = useRef<{
    jumpTo: (id: string) => void;
    runHeading: (id: string, level: number) => void;
    addHeading: () => void;
  } | null>(null);

  // Open the AI panel and (optionally) auto-send a prompt — used by the
  // "✨ อธิบาย/แก้ error" buttons on cell/file errors.
  const askAI = useCallback((text?: string) => {
    if (text) setAiSeed({ text, nonce: Date.now() + Math.random() });
    setShowAi(true);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    getWorkspace(workspaceId, ctrl.signal)
      .then(setWs)
      .catch((e) => {
        if (e?.name !== "AbortError") setErr("ไม่พบ workspace นี้");
      });
    return () => ctrl.abort();
  }, [workspaceId]);

  const openFile = useCallback((p: string) => {
    setTabs((t) => (t.includes(p) ? t : [...t, p]));
    setActive(p);
  }, []);
  const closeTab = useCallback((p: string) => {
    setTabs((t) => {
      const next = t.filter((x) => x !== p);
      setActive((a) => (a === p ? next[next.length - 1] ?? null : a));
      return next;
    });
  }, []);
  const onFileDeleted = useCallback(
    (p: string) => {
      setTabs((t) => t.filter((x) => x !== p && !x.startsWith(p + "/")));
      setActive((a) => (a === p || a?.startsWith(p + "/") ? null : a));
    },
    [],
  );
  const onFileRenamed = useCallback((oldP: string, newP: string) => {
    setTabs((t) => t.map((x) => (x === oldP ? newP : x)));
    setActive((a) => (a === oldP ? newP : a));
  }, []);

  // When the front tab isn't a notebook, the TOC has nothing to show.
  useEffect(() => {
    if (!active || !isNotebook(active)) {
      setTocCells(undefined);
      tocActionsRef.current = null;
    }
  }, [active]);

  if (err)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-500">
        <AlertTriangle size={32} className="text-amber-500" />
        <p>{err}</p>
      </div>
    );

  if (!ws)
    return (
      <p className="flex flex-1 items-center justify-center gap-2 text-zinc-500 text-sm">
        <Loader2 size={16} className="animate-spin" /> กำลังเปิด workspace…
      </p>
    );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 min-h-0">
        <NotebookSidebar
          slug={workspaceId}
          workspaceName={ws.name}
          workspacePath={ws.path}
          cells={tocCells}
          notebookPath={active && isNotebook(active) ? active : undefined}
          onJump={(id) => tocActionsRef.current?.jumpTo(id)}
          onRunHeading={(id, level) =>
            tocActionsRef.current?.runHeading(id, level)
          }
          onAddHeading={() => tocActionsRef.current?.addHeading()}
          onOpenFile={openFile}
          onFileDeleted={onFileDeleted}
          onFileRenamed={onFileRenamed}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          {/* tabs */}
          {tabs.length > 0 && (
            <div className="flex items-stretch border-b border-zinc-800 bg-zinc-950/60 overflow-x-auto">
              {tabs.map((p) => (
                <div
                  key={p}
                  onClick={() => setActive(p)}
                  className={`group/tab flex items-center gap-1 pl-2 pr-1 py-1 text-xs border-r border-zinc-800 cursor-pointer whitespace-nowrap ${
                    active === p
                      ? "bg-zinc-900 text-teal-200"
                      : "text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
                  }`}
                >
                  {tabIcon(p)}
                  {p.split("/").pop()}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(p);
                    }}
                    className="p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-700 opacity-60 group-hover/tab:opacity-100 cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* content (all tabs mounted; hidden unless active → preserves state) */}
          <div className="flex-1 min-h-0 relative">
            {tabs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-600">
                <FileText size={32} />
                <p className="text-sm">เปิดไฟล์จาก explorer ด้านซ้าย</p>
                <p className="text-xs">.ipynb เปิดเป็น notebook · ไฟล์อื่นเปิดในเอดิเตอร์</p>
              </div>
            )}
            {tabs.map((p) => (
              <div key={p} className={active === p ? "h-full" : "hidden"}>
                <FileTab
                  workspaceId={workspaceId}
                  path={p}
                  active={active === p}
                  onClose={() => closeTab(p)}
                  onAskAI={askAI}
                  insertRef={insertRef}
                  onToc={setTocCells}
                  tocActionsRef={tocActionsRef}
                />
              </div>
            ))}
          </div>
        </div>

        {showAi && (
          <AiPanel
            seed={aiSeed}
            onClose={() => setShowAi(false)}
            onInsert={(code) => insertRef.current?.(code)}
          />
        )}
      </div>

      {showTerminal && (
        <TerminalPanel slug={workspaceId} onClose={() => setShowTerminal(false)} />
      )}

      {/* status bar */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowTerminal((s) => !s)}
            className={`flex items-center gap-1.5 cursor-pointer transition-colors ${
              showTerminal ? "text-teal-300" : "hover:text-zinc-200"
            }`}
          >
            <TerminalSquare size={13} /> เทอร์มินัล
          </button>
          <button
            onClick={() => askAI()}
            className={`flex items-center gap-1.5 cursor-pointer transition-colors ${
              showAi ? "text-teal-300" : "hover:text-zinc-200"
            }`}
          >
            <Sparkles size={13} /> ผู้ช่วย AI
          </button>
        </div>
        <span className="flex items-center gap-1.5">
          🐍 Python {ws.python_version}
          {ws.has_venv ? " · venv ✓" : " · ไม่มี venv"}
        </span>
      </div>
    </div>
  );
}
