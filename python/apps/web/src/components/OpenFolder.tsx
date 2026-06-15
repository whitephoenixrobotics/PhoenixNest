"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  FolderInput,
  FolderPlus,
  Loader2,
  Trash2,
  ListX,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  listWorkspaces,
  pickFolder,
  openWorkspace,
  createWorkspace,
  closeWorkspace,
  deleteProjectFiles,
  type Workspace,
} from "@/lib/api";
import { useDialogs } from "@/components/Dialogs";

export function OpenFolder() {
  const router = useRouter();
  const dialogs = useDialogs();
  const [recents, setRecents] = useState<Workspace[] | null>(null);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Project pending deletion → drives the confirm modal (null = closed).
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(() => {
    listWorkspaces()
      .then(setRecents)
      .catch(() => setRecents([]));
  }, []);

  useEffect(refresh, [refresh]);

  const open = useCallback(
    async (p: string) => {
      if (!p.trim()) return;
      setBusy(true);
      setError(null);
      try {
        const ws = await openWorkspace(p.trim());
        router.push(`/workspace/${ws.id}`);
      } catch (e) {
        setError((e as Error).message || "เปิดโฟลเดอร์ไม่สำเร็จ");
        setBusy(false);
      }
    },
    [router],
  );

  const browse = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await pickFolder();
      if (picked) await open(picked);
      else setBusy(false);
    } catch {
      setError("เปิด dialog ไม่ได้ — กรอก path เองด้านล่าง");
      setBusy(false);
    }
  };

  // Create a new project in the default projects dir (data/projects/).
  const newFolder = async () => {
    const name = await dialogs.prompt({
      title: "ชื่อโปรเจค",
      placeholder: "my-project",
      confirmText: "สร้าง",
    });
    if (!name?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const ws = await createWorkspace("", name.trim());
      router.push(`/workspace/${ws.id}`);
    } catch (e) {
      setError((e as Error).message || "สร้างโปรเจคไม่สำเร็จ");
      setBusy(false);
    }
  };

  // Drop from the list only — files on disk are kept.
  const removeFromList = async (w: Workspace) => {
    setDeleting(true);
    try {
      await closeWorkspace(w.id);
      setDeleteTarget(null);
      refresh();
    } finally {
      setDeleting(false);
    }
  };

  // Permanently delete the folder + files from disk, then drop from the list.
  const deleteForever = async (w: Workspace) => {
    setDeleting(true);
    setError(null);
    try {
      await deleteProjectFiles(w.id);
      await closeWorkspace(w.id).catch(() => {}); // also forget the registry entry
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      setError((e as Error).message || "ลบไฟล์ไม่สำเร็จ");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-16 w-full">
      <div className="w-full max-w-xl">
        <div className="flex flex-col items-center text-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/15 ring-1 ring-teal-400/30 flex items-center justify-center text-3xl">
            🐍
          </div>
          <h1 className="text-2xl font-bold">เริ่มต้นโปรเจค</h1>
          <p className="text-sm text-zinc-500">
            สร้างโปรเจคใหม่ หรือนำเข้าโฟลเดอร์ที่มีอยู่ — รัน notebook, แก้ไฟล์,
            เปิดเทอร์มินัล (ใช้ venv ของโปรเจค)
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={newFolder}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <FolderPlus size={18} />
            )}
            สร้างโปรเจค
          </button>
          <button
            onClick={browse}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <FolderOpen size={18} />
            )}
            นำเข้าโปรเจค
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && open(path)}
            placeholder="หรือวาง path เช่น P:\work\myproj"
            disabled={busy}
            className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm font-mono outline-none focus:border-teal-500/60 disabled:opacity-50"
          />
          <button
            onClick={() => open(path)}
            disabled={busy || !path.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm cursor-pointer disabled:opacity-40"
          >
            <FolderInput size={15} /> เปิด
          </button>
        </div>

        {error && (
          <div className="mt-3 text-sm text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="mt-10">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-3">
            <FolderOpen size={13} /> โปรเจคของฉัน
          </div>
          {recents === null ? (
            <p className="text-sm text-zinc-600">กำลังโหลด…</p>
          ) : recents.length === 0 ? (
            <p className="text-sm text-zinc-600">
              ยังไม่มีโปรเจค — สร้างหรือนำเข้าโปรเจคแรกด้านบน
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recents.map((w) => (
                <div
                  key={w.id}
                  className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-900/40 border border-zinc-800 hover:border-teal-500/50 transition-colors"
                >
                  <button
                    onClick={() => open(w.path)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <FolderOpen size={16} className="text-amber-400/80 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-200 truncate">{w.name}</div>
                      <div className="text-[11px] text-zinc-600 font-mono truncate">
                        {w.path}
                      </div>
                    </div>
                    {w.has_venv ? (
                      <CheckCircle2 size={12} className="text-emerald-500/80 shrink-0" />
                    ) : (
                      <AlertTriangle size={12} className="text-amber-500/80 shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(w)}
                    title="ลบโปรเจค"
                    className="p-1 rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-600/15 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {deleteTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <div
              className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-white">
                ลบโปรเจค “{deleteTarget.name}”?
              </h3>
              <p className="mt-1 text-[11px] text-zinc-500 font-mono break-all">
                {deleteTarget.path}
              </p>
              <p className="mt-3 text-sm text-zinc-400">เลือกวิธีลบ:</p>

              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={() => removeFromList(deleteTarget)}
                  disabled={deleting}
                  className="flex items-start gap-2.5 text-left px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 cursor-pointer disabled:opacity-50"
                >
                  <ListX size={16} className="mt-0.5 shrink-0 text-zinc-300" />
                  <span>
                    <span className="block text-sm font-medium">เอาออกจากรายการ</span>
                    <span className="block text-[11px] text-zinc-400">
                      ไฟล์บนดิสก์ยังอยู่ครบ — แค่ซ่อนจากรายการนี้
                    </span>
                  </span>
                </button>

                <button
                  onClick={() => deleteForever(deleteTarget)}
                  disabled={deleting}
                  className="flex items-start gap-2.5 text-left px-3 py-2.5 rounded-lg bg-red-600/15 border border-red-500/30 hover:bg-red-600/25 text-red-200 cursor-pointer disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
                  ) : (
                    <Trash2 size={16} className="mt-0.5 shrink-0" />
                  )}
                  <span>
                    <span className="block text-sm font-medium">ลบไฟล์ถาวร</span>
                    <span className="block text-[11px] text-red-300/80">
                      ลบโฟลเดอร์ + ไฟล์ทั้งหมดออกจากดิสก์ — กู้คืนไม่ได้
                    </span>
                  </span>
                </button>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium cursor-pointer disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </main>
  );
}
