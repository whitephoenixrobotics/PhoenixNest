"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Route-level error boundary — catches render/runtime throws so a single
// component error doesn't white-screen the whole app.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-zinc-300">
      <AlertTriangle size={36} className="text-amber-500" />
      <h2 className="text-lg font-medium text-zinc-100">เกิดข้อผิดพลาด</h2>
      <p className="max-w-md break-words text-center text-sm text-zinc-500">
        {error?.message || "มีบางอย่างผิดพลาดในหน้านี้"}
      </p>
      <button
        onClick={reset}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-500 cursor-pointer"
      >
        <RefreshCw size={14} /> ลองใหม่
      </button>
    </div>
  );
}
