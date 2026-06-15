"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Check,
  Loader2,
  Cpu,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Trash2,
  Plus,
  Server,
  Cloud,
  X,
} from "lucide-react";
import {
  aiHardware,
  aiPull,
  aiSelectModel,
  aiDeleteModel,
  aiAddProvider,
  aiDeleteProvider,
  type AiStatus,
  type AiHardware,
} from "@/lib/api";
import { useDialogs } from "@/components/Dialogs";

// The three offered local editions — kept in sync with the backend MODEL_CATALOG.
const MODELS = [
  {
    id: "qwen2.5-coder:1.5b",
    name: "Qwen2.5-Coder 1.5B",
    size: "~1 GB",
    req: "เครื่องทั่วไป · ไม่มีการ์ดจอก็ได้ · RAM 8GB+",
  },
  {
    id: "qwen2.5-coder:3b",
    name: "Qwen2.5-Coder 3B",
    size: "~1.9 GB",
    req: "การ์ดจอ 4GB หรือ CPU แรง · RAM 16GB+",
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen2.5-Coder 7B",
    size: "~4.7 GB",
    req: "การ์ดจอ 6GB+ (เช่น RTX 3060) · คุณภาพดีสุด",
  },
];

const gb = (mb: number | null) =>
  mb ? `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB` : "—";

const kindLabel = (k: string) =>
  k === "anthropic" ? "Claude" : k === "gemini" ? "Gemini" : "OpenAI-compatible";

// Provider presets for the "เพิ่ม API" popup. `kind` is what the backend stores.
type PresetKey = "anthropic" | "gemini" | "openai" | "custom";
const PRESETS: Record<
  PresetKey,
  {
    kind: "anthropic" | "gemini" | "openai";
    name: string;
    model: string;
    base: string;
    hint: string;
    baseHint: string;
  }
> = {
  anthropic: {
    kind: "anthropic",
    name: "Claude (Anthropic)",
    model: "claude-opus-4-8",
    base: "",
    hint: "claude-opus-4-8 · claude-sonnet-4-6 · claude-haiku-4-5",
    baseHint: "Base URL (ไม่ใส่ = https://api.anthropic.com)",
  },
  gemini: {
    kind: "gemini",
    name: "Gemini (Google)",
    model: "gemini-2.5-flash",
    base: "",
    hint: "gemini-2.5-flash · gemini-3.5-flash · gemini-3.1-flash-lite",
    baseHint: "Base URL (ไม่ใส่ = generativelanguage.googleapis.com)",
  },
  openai: {
    kind: "openai",
    name: "OpenAI",
    model: "gpt-4o-mini",
    base: "https://api.openai.com/v1",
    hint: "gpt-4o-mini · gpt-4o · o4-mini",
    baseHint: "https://api.openai.com/v1",
  },
  custom: {
    kind: "openai",
    name: "อื่นๆ (OpenAI-compatible)",
    model: "",
    base: "",
    hint: "OpenRouter, Together, Groq, LM Studio ฯลฯ",
    baseHint: "เช่น https://openrouter.ai/api/v1",
  },
};

export function AiSetup({
  status,
  onChanged,
  onClose,
}: {
  status: AiStatus | null;
  onChanged: () => void;
  onClose?: () => void;
}) {
  const [hw, setHw] = useState<AiHardware | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ pct: number | null; status: string }>(
    { pct: null, status: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null); // switching ("ใช้")
  const [deleting, setDeleting] = useState<string | null>(null); // uninstalling
  const [custom, setCustom] = useState("");
  const [addApi, setAddApi] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const dialogs = useDialogs();

  useEffect(() => {
    const ctrl = new AbortController();
    aiHardware(ctrl.signal).then(setHw).catch(() => setHw(null));
    return () => ctrl.abort();
  }, []);

  const online = status?.online;
  const installed = status?.installed ?? [];
  const installedModels = status?.installed_models ?? [];
  const active = status?.active;
  const providers = status?.providers ?? [];
  const recommended = hw?.recommended;

  // installed Ollama tags that aren't one of the catalog editions
  const customInstalled = installedModels.filter(
    (n) => !MODELS.some((m) => n === m.id || n === `${m.id}:latest`),
  );

  // active points at a local model that isn't installed and isn't a catalog
  // edition (e.g. removed outside the app, or hand-edited config) → no card
  // would otherwise represent it, so warn explicitly.
  const activeTag =
    active && active.startsWith("ollama:") ? active.slice("ollama:".length) : null;
  const activeMissing =
    !!activeTag &&
    !installedModels.includes(activeTag) &&
    !installedModels.includes(`${activeTag}:latest`) &&
    !MODELS.some((m) => m.id === activeTag);

  const install = async (name: string) => {
    setError(null);
    setInstalling(name);
    setProgress({ pct: null, status: "กำลังเริ่ม…" });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await aiPull(name, (s, pct) => setProgress({ pct, status: s }), ctrl.signal);
      await aiSelectModel(`ollama:${name}`);
      onChanged();
      onClose?.();
    } catch (e) {
      if ((e as Error)?.name !== "AbortError")
        setError((e as Error).message || "ติดตั้งไม่สำเร็จ");
    } finally {
      setInstalling(null);
    }
  };

  const use = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await aiSelectModel(id);
      onChanged();
      onClose?.();
    } catch (e) {
      setError((e as Error).message || "สลับไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const removeModel = async (name: string) => {
    const ok = await dialogs.confirm({
      title: "ถอนการติดตั้ง?",
      message: `ลบโมเดล "${name}" ออกจากเครื่อง? ถ้าจะใช้อีกต้องโหลดใหม่`,
      confirmText: "ถอนการติดตั้ง",
      danger: true,
    });
    if (!ok) return;
    setDeleting(`ollama:${name}`);
    setError(null);
    try {
      await aiDeleteModel(name);
      onChanged();
    } catch (e) {
      setError((e as Error).message || "ถอนการติดตั้งไม่สำเร็จ");
    } finally {
      setDeleting(null);
    }
  };

  const removeProvider = async (id: string) => {
    const ok = await dialogs.confirm({
      title: "ลบผู้ช่วย?",
      message: "ลบการเชื่อมต่อ API นี้ออก?",
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    setDeleting(id);
    setError(null);
    try {
      await aiDeleteProvider(id);
      onChanged();
    } catch (e) {
      setError((e as Error).message || "ลบไม่สำเร็จ");
    } finally {
      setDeleting(null);
    }
  };

  const installCustom = () => {
    const n = custom.trim();
    if (n) install(n);
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center gap-2 text-zinc-200">
        <Sparkles size={16} className="text-teal-300" />
        <span className="font-medium">ตั้งค่าผู้ช่วย AI</span>
      </div>

      {/* hardware summary */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
        <div className="flex items-center gap-1.5 mb-1 text-zinc-300">
          <Cpu size={13} /> เครื่องของคุณ
        </div>
        {hw ? (
          <ul className="space-y-0.5">
            <li>การ์ดจอ: {hw.gpu ?? "ไม่พบการ์ดจอ NVIDIA (จะใช้ CPU)"}</li>
            {hw.vram_mb ? <li>VRAM: {gb(hw.vram_mb)}</li> : null}
            <li>RAM: {gb(hw.ram_mb)}</li>
          </ul>
        ) : (
          <span>กำลังตรวจสอบ…</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* ── local models ── */}
      <div className="flex items-center gap-1.5 text-zinc-300 text-xs font-medium pt-1">
        <Server size={13} /> โมเดลในเครื่อง (Ollama)
      </div>

      {!online && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ยังเปิด <b>Ollama</b> ไม่ได้ — ติดตั้ง/เปิดโปรแกรมก่อนถึงจะโหลดโมเดลในเครื่องได้
          <div className="mt-1.5 flex items-center gap-2">
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
            >
              <ExternalLink size={12} /> ดาวน์โหลด Ollama
            </a>
            <button
              onClick={onChanged}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-zinc-300 hover:bg-zinc-800 cursor-pointer"
            >
              <RefreshCw size={12} /> ตรวจสอบใหม่
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {MODELS.map((m) => {
          const id = `ollama:${m.id}`;
          const isInstalled = installed.includes(m.id);
          // only "in use" if it is ACTUALLY installed — a stale active config
          // pointing at a removed model must not claim "กำลังใช้งาน"
          const isActive = active === id && isInstalled;
          const isRec = recommended === m.id;
          const busy = installing === m.id;
          const isDeleting = deleting === id;
          return (
            <div
              key={m.id}
              className={`rounded-lg border px-3 py-2.5 ${
                isRec ? "border-teal-500/50 bg-teal-500/5" : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-100">{m.name}</span>
                <span className="text-[10px] text-zinc-500 shrink-0">{m.size}</span>
              </div>
              {isRec && (
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-teal-600/30 text-teal-200">
                  ★ แนะนำสำหรับเครื่องนี้
                </span>
              )}
              <p className="mt-1 text-[11px] text-zinc-500">{m.req}</p>

              {busy ? (
                <ProgressBar progress={progress} />
              ) : isDeleting ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                  <Loader2 size={13} className="animate-spin" /> กำลังถอนการติดตั้ง…
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <Check size={13} /> กำลังใช้งาน
                    </span>
                  ) : isInstalled ? (
                    <>
                      <span className="text-xs text-zinc-400">พร้อมใช้งาน</span>
                      <UseBtn busy={busyId === id} onClick={() => use(id)} />
                    </>
                  ) : (
                    <InstallBtn
                      disabled={!online || !!installing}
                      title={
                        !online
                          ? "เปิด Ollama ก่อน"
                          : installing
                            ? "กำลังติดตั้งโมเดลอื่นอยู่ — รอสักครู่"
                            : undefined
                      }
                      onClick={() => install(m.id)}
                    />
                  )}
                  {isInstalled && <DelBtn onClick={() => removeModel(m.id)} />}
                </div>
              )}
            </div>
          );
        })}

        {/* custom / other installed Ollama models */}
        {customInstalled.map((name) => {
          const id = `ollama:${name}`;
          const isDeleting = deleting === id;
          return (
            <div
              key={name}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 flex items-center justify-between gap-2"
            >
              <span className="font-mono text-xs text-zinc-200 truncate">{name}</span>
              <div className="flex items-center gap-2 shrink-0">
                {isDeleting ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                    <Loader2 size={13} className="animate-spin" /> กำลังถอน…
                  </span>
                ) : active === id ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <Check size={13} /> กำลังใช้งาน
                    </span>
                    <DelBtn onClick={() => removeModel(name)} />
                  </>
                ) : (
                  <>
                    <span className="text-xs text-zinc-400">พร้อมใช้งาน</span>
                    <UseBtn busy={busyId === id} onClick={() => use(id)} />
                    <DelBtn onClick={() => removeModel(name)} />
                  </>
                )}
              </div>
            </div>
          );
        })}

        {activeMissing && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            โมเดลที่ตั้งไว้ (<span className="font-mono">{activeTag}</span>)
            ไม่พบในเครื่อง — ติดตั้งใหม่ด้านล่าง หรือเลือกผู้ช่วยอื่น
          </div>
        )}

        {/* custom pull */}
        {online && !installing && (
          <div className="flex gap-1.5">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && installCustom()}
              placeholder="ติดตั้งเอง เช่น llama3.2, deepseek-coder:6.7b"
              className="flex-1 min-w-0 rounded-md bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs outline-none focus:border-teal-500/60"
            />
            <button
              onClick={installCustom}
              disabled={!custom.trim()}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700 cursor-pointer disabled:opacity-40"
            >
              <Download size={12} /> ติดตั้ง
            </button>
          </div>
        )}
        {installing && !MODELS.some((m) => m.id === installing) && (
          <ProgressBar progress={progress} />
        )}
      </div>

      {/* ── external APIs ── */}
      <div className="flex items-center gap-1.5 text-zinc-300 text-xs font-medium pt-2">
        <Cloud size={13} /> API ภายนอก (Claude / OpenAI ฯลฯ)
      </div>

      <div className="flex flex-col gap-2">
        {providers.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-zinc-100 truncate">{p.label}</div>
              <div className="text-[10px] text-zinc-500 truncate">
                {kindLabel(p.kind)} · {p.model}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {deleting === p.id ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                  <Loader2 size={13} className="animate-spin" /> กำลังลบ…
                </span>
              ) : active === p.id ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <Check size={13} /> กำลังใช้งาน
                  </span>
                  <DelBtn onClick={() => removeProvider(p.id)} />
                </>
              ) : (
                <>
                  <span className="text-xs text-zinc-400">พร้อมใช้งาน</span>
                  <UseBtn busy={busyId === p.id} onClick={() => use(p.id)} />
                  <DelBtn onClick={() => removeProvider(p.id)} />
                </>
              )}
            </div>
          </div>
        ))}

        <button
          onClick={() => setAddApi(true)}
          className="self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700 cursor-pointer"
        >
          <Plus size={12} /> เพิ่ม API
        </button>
      </div>

      {addApi && (
        <AddApiModal
          onClose={() => setAddApi(false)}
          onAdded={() => {
            setAddApi(false);
            onChanged();
          }}
        />
      )}

      {status?.model_ready && onClose && (
        <button
          onClick={onClose}
          className="self-start text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer pt-1"
        >
          ← กลับไปแชท
        </button>
      )}
    </div>
  );
}

function ProgressBar({
  progress,
}: {
  progress: { pct: number | null; status: string };
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
        <span className="truncate">{progress.status || "กำลังดาวน์โหลด…"}</span>
        <span className="shrink-0 tabular-nums">
          {progress.pct != null ? `${progress.pct}%` : ""}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-teal-500 transition-all"
          style={{ width: `${progress.pct ?? 8}%` }}
        />
      </div>
    </div>
  );
}

function UseBtn({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-teal-600 text-white hover:bg-teal-500 cursor-pointer disabled:opacity-40"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      ใช้
    </button>
  );
}

function InstallBtn({
  disabled,
  title,
  onClick,
}: {
  disabled: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-teal-600 text-white hover:bg-teal-500 cursor-pointer disabled:opacity-40"
    >
      <Download size={12} /> ติดตั้ง
    </button>
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="ถอนการติดตั้ง"
      className="shrink-0 p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-600/15 cursor-pointer"
    >
      <Trash2 size={13} />
    </button>
  );
}

function AddApiModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [choice, setChoice] = useState<PresetKey | null>(null);
  const [label, setLabel] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = (k: PresetKey) => {
    const p = PRESETS[k];
    setChoice(k);
    setModel(p.model);
    setBaseUrl(p.base);
    setLabel("");
    setApiKey(""); // never carry one provider's key over to another
    setErr(null);
  };

  const submit = async () => {
    if (!choice) return;
    if (!model.trim() || !apiKey.trim()) {
      setErr("ต้องใส่ชื่อโมเดลและ API key");
      return;
    }
    if (PRESETS[choice].kind === "openai" && !baseUrl.trim()) {
      setErr("ต้องใส่ Base URL สำหรับ OpenAI-compatible");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await aiAddProvider({
        kind: PRESETS[choice].kind,
        label: label.trim(),
        model: model.trim(),
        api_key: apiKey.trim(),
        base_url: baseUrl.trim(),
      });
      onAdded();
    } catch (e) {
      setErr((e as Error).message || "เพิ่มไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-md bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-teal-500/60";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl p-4 text-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-zinc-100">เพิ่ม API ผู้ช่วย</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {!choice ? (
          <>
            <p className="text-xs text-zinc-500 mb-2">เลือกผู้ให้บริการ</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => pick(k)}
                  className="flex flex-col items-start gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-teal-500/50 hover:bg-teal-500/5 px-3 py-2.5 text-left cursor-pointer"
                >
                  <span className="text-zinc-100 text-xs font-medium">
                    {PRESETS[k].name}
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">
                    {PRESETS[k].hint}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setChoice(null)}
              className="self-start text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              ← เลือกผู้ให้บริการอื่น
            </button>
            <div className="text-xs text-teal-300">{PRESETS[choice].name}</div>
            {err && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
                {err}
              </div>
            )}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ชื่อเรียก (ไม่ใส่ก็ได้)"
              className={inputCls}
            />
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="โมเดล"
              className={inputCls}
            />
            <p className="text-[10px] text-zinc-600 -mt-1">{PRESETS[choice].hint}</p>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              placeholder="API key"
              className={inputCls}
            />
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={PRESETS[choice].baseHint}
              className={inputCls}
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={submit}
                disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs bg-teal-600 text-white hover:bg-teal-500 cursor-pointer disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={12} />
                )}
                เพิ่ม
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:bg-zinc-800 cursor-pointer"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
