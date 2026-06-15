"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ListTree,
  Folder,
  FolderOpen,
  Braces,
  FileText,
  RefreshCw,
  Loader2,
  Upload,
  Eye,
  EyeOff,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  Trash2,
  Pencil,
  Copy,
  MoreVertical,
  Package,
  Play,
  Plus,
  Download,
  X,
  Loader2 as Spin,
} from "lucide-react";
import {
  listFiles,
  uploadFile,
  createEntry,
  deleteEntry,
  renameEntry,
  moveEntry,
  fileAbsPath,
  getVariables,
  listPackages,
  installPackage,
  uninstallPackage,
  type FileEntry,
  type Variable,
  type NotebookCell,
  type Package as Pkg,
} from "@/lib/api";
import { useDialogs } from "@/components/Dialogs";

type Panel = "toc" | "files" | "vars" | "packages" | null;

export function NotebookSidebar({
  slug,
  cells,
  notebookPath,
  onJump,
  onRunHeading,
  onAddHeading,
  onOpenFile,
  onFileDeleted,
  onFileRenamed,
  workspaceName,
  workspacePath,
}: {
  slug: string;
  cells?: NotebookCell[];
  notebookPath?: string;
  onJump?: (id: string) => void;
  onRunHeading?: (id: string, level: number) => void;
  onAddHeading?: () => void;
  onOpenFile: (path: string) => void;
  onFileDeleted: (path: string) => void;
  onFileRenamed: (oldPath: string, newPath: string) => void;
  workspaceName?: string;
  workspacePath?: string;
}) {
  const [panel, setPanel] = useState<Panel>("files");
  const hasNotebook = cells !== undefined;

  const Icon = ({ id, title, children }: { id: Panel; title: string; children: React.ReactNode }) => (
    <button
      onClick={() => setPanel((p) => (p === id ? null : id))}
      title={title}
      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors cursor-pointer ${
        panel === id
          ? "bg-zinc-800 text-teal-300"
          : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex h-full">
      <div className="flex flex-col items-center gap-1 py-3 px-1.5 border-r border-zinc-800 bg-zinc-950">
        <Icon id="toc" title="สารบัญ">
          <ListTree size={18} />
        </Icon>
        <Icon id="files" title="ไฟล์">
          <Folder size={18} />
        </Icon>
        <Icon id="packages" title="แพ็กเกจ">
          <Package size={18} />
        </Icon>
        {hasNotebook && (
          <Icon id="vars" title="ตัวแปร">
            <Braces size={18} />
          </Icon>
        )}
      </div>
      {panel && (
        <div className="w-64 border-r border-zinc-800 bg-zinc-950/60 overflow-auto">
          {panel === "files" && (
            <FilesPanel
              slug={slug}
              title={workspaceName}
              titleHint={workspacePath}
              onOpenFile={onOpenFile}
              onFileDeleted={onFileDeleted}
              onFileRenamed={onFileRenamed}
            />
          )}
          {panel === "packages" && <PackagesPanel slug={slug} />}
          {panel === "toc" && (
            <TocPanel
              cells={cells}
              onJump={onJump}
              onRunHeading={onRunHeading}
              onAddHeading={onAddHeading}
            />
          )}
          {panel === "vars" && hasNotebook && (
            <VarsPanel slug={slug} path={notebookPath} />
          )}
        </div>
      )}
    </div>
  );
}

function PanelHeader({
  title,
  hint,
  onRefresh,
  busy,
}: {
  title: string;
  hint?: string;
  onRefresh?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 sticky top-0 bg-zinc-950/90 backdrop-blur z-10">
      <span
        title={hint}
        className="text-xs font-semibold text-zinc-300 uppercase tracking-wide truncate"
      >
        {title}
      </span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="p-1 rounded text-zinc-500 hover:text-zinc-200 cursor-pointer"
          title="รีเฟรช"
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
        </button>
      )}
    </div>
  );
}

// ── Files (controlled tree: caches children per dir so create/delete/rename
//    can refresh just the affected folder while preserving expansion) ──
function FilesPanel({
  slug,
  title,
  titleHint,
  onOpenFile,
  onFileDeleted,
  onFileRenamed,
}: {
  slug: string;
  title?: string;
  titleHint?: string;
  onOpenFile: (path: string) => void;
  onFileDeleted: (path: string) => void;
  onFileRenamed: (oldPath: string, newPath: string) => void;
}) {
  const [byDir, setByDir] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedDir, setSelectedDir] = useState(""); // create target
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragPath, setDragPath] = useState<string | null>(null); // drag-to-move
  const [rootOver, setRootOver] = useState(false);
  const dialogs = useDialogs();

  const loadDir = useCallback(
    async (dir: string) => {
      const entries = await listFiles(slug, dir, showHidden).catch(() => []);
      setByDir((prev) => ({ ...prev, [dir]: entries }));
    },
    [slug, showHidden],
  );

  useEffect(() => {
    setByDir({});
    setExpanded(new Set());
    setSelectedDir("");
    setBusy(true);
    loadDir("").finally(() => setBusy(false));
  }, [loadDir]);

  const refresh = () => {
    setBusy(true);
    // reload every dir we've already opened so the view stays in sync
    Promise.all(Object.keys({ "": 1, ...byDir }).map(loadDir)).finally(() =>
      setBusy(false),
    );
  };

  const toggleDir = (entry: FileEntry) => {
    setSelectedDir(entry.path);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else {
        next.add(entry.path);
        if (!byDir[entry.path]) loadDir(entry.path);
      }
      return next;
    });
  };

  const parentDir = (p: string) => {
    const i = p.lastIndexOf("/");
    return i < 0 ? "" : p.slice(0, i);
  };

  const create = async (isDir: boolean) => {
    const name = await dialogs.prompt({
      title: isDir ? "ชื่อโฟลเดอร์ใหม่" : "ชื่อไฟล์ใหม่",
      placeholder: selectedDir ? `ใน ${selectedDir}/` : undefined,
      confirmText: "สร้าง",
    });
    if (!name?.trim()) return;
    const path = selectedDir ? `${selectedDir}/${name.trim()}` : name.trim();
    try {
      await createEntry(slug, path, isDir);
      if (selectedDir) setExpanded((p) => new Set(p).add(selectedDir));
      await loadDir(selectedDir);
    } catch (e) {
      await dialogs.alert({ message: (e as Error).message || "สร้างไม่สำเร็จ" });
    }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) await uploadFile(slug, f, selectedDir);
    } catch {
      /* ignore */
    }
    if (selectedDir) setExpanded((p) => new Set(p).add(selectedDir));
    await loadDir(selectedDir);
    setBusy(false);
  };

  const remove = async (entry: FileEntry) => {
    const ok = await dialogs.confirm({
      title: "ลบ?",
      message: `ลบ "${entry.name}"?`,
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteEntry(slug, entry.path);
      onFileDeleted(entry.path);
      await loadDir(parentDir(entry.path));
    } catch {
      await dialogs.alert({ message: "ลบไม่สำเร็จ" });
    }
  };

  const rename = async (entry: FileEntry) => {
    const name = await dialogs.prompt({
      title: "ชื่อใหม่",
      defaultValue: entry.name,
      confirmText: "เปลี่ยนชื่อ",
    });
    if (!name?.trim() || name.trim() === entry.name) return;
    try {
      const updated = await renameEntry(slug, entry.path, name.trim());
      onFileRenamed(entry.path, updated.path);
      await loadDir(parentDir(entry.path));
    } catch (e) {
      await dialogs.alert({
        message: (e as Error).message || "เปลี่ยนชื่อไม่สำเร็จ",
      });
    }
  };

  const copyPath = async (entry: FileEntry) => {
    let text = entry.path;
    try {
      text = await fileAbsPath(slug, entry.path);
    } catch {
      /* fall back to the relative path */
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      await dialogs.alert({ title: "เส้นทาง", message: text });
    }
  };

  // Drag-and-drop move: drop a file/folder onto a folder (or the root area).
  const doMove = async (srcPath: string, destDir: string) => {
    if (destDir === parentDir(srcPath)) return; // already there
    try {
      const updated = await moveEntry(slug, srcPath, destDir);
      onFileRenamed(srcPath, updated.path);
      if (destDir) setExpanded((p) => new Set(p).add(destDir));
      await Promise.all([loadDir(parentDir(srcPath)), loadDir(destDir)]);
    } catch (e) {
      await dialogs.alert({ message: (e as Error).message || "ย้ายไม่สำเร็จ" });
    }
  };

  const TBtn = ({
    onClick,
    title,
    active,
    children,
  }: {
    onClick: () => void;
    title: string;
    active?: boolean;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md cursor-pointer transition-colors ${
        active ? "text-teal-300 bg-zinc-800" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );

  const renderDir = (dir: string, depth: number): React.ReactNode =>
    (byDir[dir] ?? []).map((entry) => (
      <div key={entry.path}>
        <Row
          entry={entry}
          depth={depth}
          open={expanded.has(entry.path)}
          selected={entry.is_dir && selectedDir === entry.path}
          onClick={() =>
            entry.is_dir ? toggleDir(entry) : onOpenFile(entry.path)
          }
          onCopyPath={() => copyPath(entry)}
          onRename={() => rename(entry)}
          onDelete={() => remove(entry)}
          dragPath={dragPath}
          onDragStartItem={() => setDragPath(entry.path)}
          onDragEndItem={() => setDragPath(null)}
          onDropToDir={(dest) => doMove(dragPath!, dest)}
        />
        {entry.is_dir &&
          expanded.has(entry.path) &&
          (byDir[entry.path] === undefined ? (
            <p
              className="text-xs text-zinc-600 py-1"
              style={{ paddingLeft: 8 + (depth + 1) * 14 }}
            >
              …
            </p>
          ) : byDir[entry.path].length === 0 ? (
            <p
              className="text-xs text-zinc-600 py-1"
              style={{ paddingLeft: 8 + (depth + 1) * 14 }}
            >
              ว่าง
            </p>
          ) : (
            renderDir(entry.path, depth + 1)
          ))}
      </div>
    ));

  let pickRef: HTMLInputElement | null = null;

  return (
    <div>
      <PanelHeader title={title || "ไฟล์"} hint={titleHint} />
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800/60">
        <input
          ref={(r) => {
            pickRef = r;
          }}
          type="file"
          multiple
          hidden
          onChange={onPick}
        />
        <TBtn onClick={() => create(false)} title="ไฟล์ใหม่">
          <FilePlus2 size={15} />
        </TBtn>
        <TBtn onClick={() => create(true)} title="โฟลเดอร์ใหม่">
          <FolderPlus size={15} />
        </TBtn>
        <TBtn onClick={() => pickRef?.click()} title="อัปโหลด">
          <Upload size={15} />
        </TBtn>
        <TBtn onClick={refresh} title="รีเฟรช">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </TBtn>
        <TBtn
          onClick={() => setShowHidden((h) => !h)}
          title={showHidden ? "ซ่อนไฟล์ระบบ" : "แสดงไฟล์ระบบ"}
          active={showHidden}
        >
          {showHidden ? <Eye size={15} /> : <EyeOff size={15} />}
        </TBtn>
      </div>

      {/* create-target hint */}
      <button
        onClick={() => setSelectedDir("")}
        className={`w-full text-left px-3 py-1 text-[11px] truncate cursor-pointer ${
          selectedDir ? "text-zinc-500 hover:text-zinc-300" : "text-teal-400"
        }`}
        title="สร้างไฟล์/โฟลเดอร์ใหม่ที่นี่"
      >
        สร้างใน: /{selectedDir}
      </button>

      <div
        className={`py-1 min-h-24 ${rootOver ? "bg-teal-500/10 ring-1 ring-inset ring-teal-500/40" : ""}`}
        onDragOver={(e) => {
          if (dragPath && parentDir(dragPath) !== "") {
            e.preventDefault();
            setRootOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setRootOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setRootOver(false);
          if (dragPath && parentDir(dragPath) !== "") doMove(dragPath, "");
        }}
      >
        {byDir[""]?.length === 0 && (
          <p className="px-3 py-2 text-xs text-zinc-600">
            ว่าง — ลากไฟล์มาที่นี่เพื่อย้ายออกมาราก
          </p>
        )}
        {renderDir("", 0)}
      </div>
    </div>
  );
}

function Row({
  entry,
  depth,
  open,
  selected,
  onClick,
  onCopyPath,
  onRename,
  onDelete,
  dragPath,
  onDragStartItem,
  onDragEndItem,
  onDropToDir,
}: {
  entry: FileEntry;
  depth: number;
  open: boolean;
  selected: boolean;
  onClick: () => void;
  onCopyPath: () => void;
  onRename: () => void;
  onDelete: () => void;
  dragPath: string | null;
  onDragStartItem: () => void;
  onDragEndItem: () => void;
  onDropToDir: (destDir: string) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dropOver, setDropOver] = useState(false);

  // A folder can receive a drop unless it's the dragged item itself, its
  // current parent, or one of its own descendants.
  const canDrop =
    entry.is_dir &&
    !!dragPath &&
    dragPath !== entry.path &&
    !entry.path.startsWith(dragPath + "/");

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.right, y: r.bottom });
  };

  const MenuItem = ({
    icon,
    label,
    onSelect,
    danger,
  }: {
    icon: React.ReactNode;
    label: string;
    onSelect: () => void;
    danger?: boolean;
  }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setMenu(null);
        onSelect();
      }}
      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer ${
        danger
          ? "text-red-400 hover:bg-red-600/15"
          : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", entry.path);
        onDragStartItem();
      }}
      onDragEnd={() => {
        setDropOver(false);
        onDragEndItem();
      }}
      onDragOver={(e) => {
        if (canDrop) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          setDropOver(true);
        }
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        e.stopPropagation();
        setDropOver(false);
        onDropToDir(entry.path);
      }}
      className={`group/row flex items-center gap-1 w-full py-1 pr-1 text-sm cursor-pointer ${
        dropOver
          ? "bg-teal-500/15 ring-1 ring-inset ring-teal-500/50 text-teal-100"
          : selected
            ? "bg-zinc-800/70 text-teal-200"
            : "text-zinc-300 hover:bg-zinc-900/60"
      }`}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      {entry.is_dir ? (
        <ChevronRight
          size={13}
          className={`shrink-0 text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`}
        />
      ) : (
        <span className="w-[13px] shrink-0" />
      )}
      {entry.is_dir ? (
        open ? (
          <FolderOpen size={14} className="shrink-0 text-amber-400/80" />
        ) : (
          <Folder size={14} className="shrink-0 text-amber-400/80" />
        )
      ) : (
        <FileText size={14} className="shrink-0 text-zinc-500" />
      )}
      <span className="truncate flex-1">{entry.name}</span>
      <button
        onClick={openMenu}
        title="เพิ่มเติม"
        className={`shrink-0 p-0.5 rounded text-zinc-600 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer ${
          menu ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
        }`}
      >
        <MoreVertical size={13} />
      </button>
      {menu &&
        createPortal(
          <div
            style={{ position: "fixed", top: menu.y + 4, left: menu.x - 176 }}
            className="z-50 w-44 py-1 rounded-md border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40"
          >
            <MenuItem
              icon={<Copy size={13} />}
              label="คัดลอกเส้นทาง"
              onSelect={onCopyPath}
            />
            <MenuItem
              icon={<Pencil size={13} />}
              label="เปลี่ยนชื่อ"
              onSelect={onRename}
            />
            <div className="my-1 h-px bg-zinc-800" />
            <MenuItem
              icon={<Trash2 size={13} />}
              label="ลบ"
              onSelect={onDelete}
              danger
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function TocPanel({
  cells,
  onJump,
  onRunHeading,
  onAddHeading,
}: {
  cells?: NotebookCell[];
  onJump?: (id: string) => void;
  onRunHeading?: (id: string, level: number) => void;
  onAddHeading?: () => void;
}) {
  // Only the first heading of a markdown cell defines a section we can run
  // (matches the cell-level "run section" boundary).
  const headings = (cells ?? []).flatMap((c) => {
    if (c.kind !== "markdown") return [];
    const lines = c.source.split("\n").filter((l) => /^#{1,6}\s/.test(l));
    return lines.map((l, idx) => ({
      id: c.id,
      level: l.match(/^#+/)![0].length,
      text: l.replace(/^#+\s/, ""),
      runnable: idx === 0, // first heading in the cell owns the section
    }));
  });
  return (
    <div>
      <PanelHeader title="สารบัญ" />
      {cells !== undefined && onAddHeading && (
        <div className="px-2 py-1.5 border-b border-zinc-800/60">
          <button
            onClick={onAddHeading}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-300 hover:bg-zinc-800 cursor-pointer w-full"
          >
            <Plus size={13} /> เพิ่มหัวข้อ
          </button>
        </div>
      )}
      {cells === undefined ? (
        <p className="px-3 py-2 text-xs text-zinc-600">
          เปิดไฟล์ notebook (.ipynb) เพื่อดูสารบัญ
        </p>
      ) : headings.length === 0 ? (
        <p className="px-3 py-2 text-xs text-zinc-600">
          ยังไม่มีหัวข้อ — เพิ่มเซลล์ข้อความที่ขึ้นต้นด้วย #
        </p>
      ) : (
        <ul className="py-1">
          {headings.map((h, i) => (
            <li
              key={i}
              className="group flex items-center pr-1 hover:bg-zinc-900/60"
            >
              <button
                onClick={() => onJump?.(h.id)}
                className="flex-1 min-w-0 text-left px-3 py-1 text-sm text-zinc-400 group-hover:text-teal-300 truncate cursor-pointer"
                style={{ paddingLeft: 12 + (h.level - 1) * 12 }}
                title={h.text}
              >
                {h.text}
              </button>
              {h.runnable && onRunHeading && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRunHeading(h.id, h.level);
                  }}
                  title="รันเฉพาะหัวข้อนี้ (และหัวข้อย่อย)"
                  className="shrink-0 p-1 rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-teal-300 hover:bg-zinc-800 cursor-pointer"
                >
                  <Play size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VarsPanel({
  slug,
  path,
}: {
  slug: string;
  path?: string;
}) {
  const [vars, setVars] = useState<Variable[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    setBusy(true);
    getVariables(slug, path ?? "")
      .then(setVars)
      .catch(() => setVars([]))
      .finally(() => setBusy(false));
  };
  useEffect(load, [slug, path]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <PanelHeader title="ตัวแปร" onRefresh={load} busy={busy} />
      {vars && vars.length === 0 ? (
        <p className="px-3 py-2 text-xs text-zinc-600">
          ยังไม่มีตัวแปร — รันเซลล์ที่กำหนดค่า
        </p>
      ) : (
        <ul className="py-1">
          {vars?.map((v) => (
            <li key={v.name} className="px-3 py-1.5 border-b border-zinc-900/60">
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-teal-300 font-mono">{v.name}</span>
                <span className="text-[10px] text-zinc-600">{v.type}</span>
              </div>
              <div className="text-xs text-zinc-500 font-mono truncate">
                {v.preview}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PackagesPanel({ slug }: { slug: string }) {
  const dialogs = useDialogs();
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [installing, setInstalling] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [topOnly, setTopOnly] = useState(true); // only what you installed

  const load = () => {
    setBusy(true);
    listPackages(slug, topOnly)
      .then(setPkgs)
      .catch(() => setPkgs([]))
      .finally(() => setBusy(false));
  };
  useEffect(load, [slug, topOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const install = async () => {
    const n = name.trim();
    if (!n || installing) return;
    setInstalling(true);
    setLog([`$ pip install ${n}`]);
    try {
      const code = await installPackage(slug, n, (line) =>
        setLog((l) => [...l, line]),
      );
      setLog((l) => [...l, code === 0 ? "✓ สำเร็จ" : `✗ ล้มเหลว (exit ${code})`]);
      if (code === 0) {
        setName("");
        load();
        // ติดตั้งสำเร็จ → ซ่อน log อัตโนมัติหลังให้เห็น ✓ สักครู่
        setTimeout(() => setLog([]), 2000);
      }
    } catch {
      setLog((l) => [...l, "✗ เรียก backend ไม่สำเร็จ"]);
    } finally {
      setInstalling(false);
    }
  };

  const remove = async (n: string) => {
    const ok = await dialogs.confirm({
      title: "ถอนการติดตั้ง?",
      message: `pip uninstall ${n}`,
      confirmText: "ถอน",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await uninstallPackage(slug, n);
    } catch {
      /* ignore */
    }
    load();
  };

  const shown = (pkgs ?? []).filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <PanelHeader title="แพ็กเกจ (venv)" onRefresh={load} busy={busy} />
      {/* install */}
      <div className="p-2 border-b border-zinc-800/60 flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && install()}
            placeholder="ติดตั้ง เช่น requests"
            disabled={installing}
            className="flex-1 min-w-0 rounded-md bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs outline-none focus:border-teal-500/60"
          />
          <button
            onClick={install}
            disabled={installing || !name.trim()}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white cursor-pointer disabled:opacity-40"
          >
            {installing ? (
              <Spin size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
            ติดตั้ง
          </button>
        </div>
        {log.length > 0 && (
          <div className="rounded bg-zinc-950 border border-zinc-800/60 overflow-hidden">
            <div className="flex items-center justify-between px-2 py-0.5 border-b border-zinc-800/60">
              <span className="text-[10px] text-zinc-600">pip log</span>
              <button
                onClick={() => setLog([])}
                title="ซ่อน"
                className="p-0.5 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
            <pre className="max-h-32 overflow-auto p-2 text-[10px] font-mono text-zinc-400 whitespace-pre-wrap m-0">
              {log.join("\n")}
            </pre>
          </div>
        )}
      </div>
      {/* filter + scope toggle */}
      <div className="px-2 pt-2 flex flex-col gap-1.5">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="ค้นหา…"
          className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs outline-none focus:border-teal-500/60"
        />
        <div className="flex rounded-md bg-zinc-900 border border-zinc-800 p-0.5 text-[11px]">
          <button
            onClick={() => setTopOnly(true)}
            className={`flex-1 py-0.5 rounded cursor-pointer ${
              topOnly ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            ที่ติดตั้งเอง
          </button>
          <button
            onClick={() => setTopOnly(false)}
            className={`flex-1 py-0.5 rounded cursor-pointer ${
              !topOnly ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            ทั้งหมด
          </button>
        </div>
      </div>
      {pkgs === null ? (
        <p className="flex items-center gap-2 text-zinc-500 text-xs p-3">
          <Spin size={13} className="animate-spin" /> กำลังโหลด…
        </p>
      ) : (
        <>
          <ul className="py-1">
            {shown.map((p) => (
              <li
                key={p.name}
                className="group flex items-center justify-between gap-2 px-3 py-1 hover:bg-zinc-900/60"
              >
                <span className="text-sm text-zinc-300 truncate">
                  {p.name}{" "}
                  <span className="text-[10px] text-zinc-600">{p.version}</span>
                </span>
                <button
                  onClick={() => remove(p.name)}
                  title="ถอนการติดตั้ง"
                  className="shrink-0 p-0.5 rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-600/15 cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
          <p className="px-3 py-2 text-[11px] text-zinc-600">
            {shown.length} แพ็กเกจ
          </p>
        </>
      )}
    </div>
  );
}
