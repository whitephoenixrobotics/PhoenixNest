"use client";

import { useEffect, useState } from "react";
import { diffLines } from "diff";
import { Loader2, Check, X, Sparkles, AlertTriangle } from "lucide-react";
import { aiFix } from "@/lib/api";

export function AiFixModal({
  original,
  error,
  onApply,
  onClose,
}: {
  original: string;
  error: string;
  onApply: (code: string) => void;
  onClose: () => void;
}) {
  const [fixed, setFixed] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    aiFix(original, error)
      .then((code) => !ctrl.signal.aborted && setFixed(code))
      .catch((e) => !ctrl.signal.aborted && setFailed((e as Error).message));
    return () => ctrl.abort();
  }, [original, error]);

  const parts = fixed !== null ? diffLines(original, fixed) : [];
  const changed =
    fixed !== null && fixed.trim() !== original.trim();

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
          <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Sparkles size={15} className="text-teal-300" /> แก้โค้ดด้วย AI
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {failed ? (
            <div className="flex flex-col items-center gap-2 py-16 text-zinc-500">
              <AlertTriangle size={28} className="text-amber-500" />
              <p className="text-sm">{failed}</p>
            </div>
          ) : fixed === null ? (
            <p className="flex items-center gap-2 text-zinc-500 text-sm p-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> AI กำลังแก้โค้ด…
            </p>
          ) : !changed ? (
            <p className="text-sm text-zinc-400 p-8 text-center">
              AI ไม่พบสิ่งที่ต้องแก้ (โค้ดเหมือนเดิม)
            </p>
          ) : (
            <pre className="font-mono text-xs leading-relaxed m-0">
              {parts.map((part, i) =>
                part.value
                  .replace(/\n$/, "")
                  .split("\n")
                  .map((line, j) => (
                    <div
                      key={`${i}-${j}`}
                      className={
                        part.added
                          ? "bg-emerald-500/10 text-emerald-300 px-3"
                          : part.removed
                            ? "bg-red-500/10 text-red-300 px-3"
                            : "text-zinc-400 px-3"
                      }
                    >
                      <span className="select-none opacity-50 mr-2">
                        {part.added ? "+" : part.removed ? "−" : " "}
                      </span>
                      {line || " "}
                    </div>
                  )),
              )}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => fixed !== null && onApply(fixed)}
            disabled={fixed === null || !changed}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={15} /> ยอมรับ
          </button>
        </div>
      </div>
    </div>
  );
}
