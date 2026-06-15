"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  FolderInput,
  FolderPlus,
  Loader2,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  listWorkspaces,
  pickFolder,
  openWorkspace,
  createWorkspace,
  closeWorkspace,
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

  const remove = async (id: string) => {
    await closeWorkspace(id);
    refresh();
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
            <Clock size={13} /> เปิดล่าสุด
          </div>
          {recents === null ? (
            <p className="text-sm text-zinc-600">กำลังโหลด…</p>
          ) : recents.length === 0 ? (
            <p className="text-sm text-zinc-600">ยังไม่มี — เปิดโฟลเดอร์แรกด้านบน</p>
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
                    onClick={() => remove(w.id)}
                    title="เอาออกจากรายการ (ไม่ลบโฟลเดอร์)"
                    className="p-1 rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-600/15 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
