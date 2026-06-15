"use client";

/* eslint-disable @next/next/no-img-element */
import { X, Image as ImageIcon } from "lucide-react";
import { fileRawUrl } from "@/lib/api";

export function ImageViewer({
  slug,
  path,
  onClose,
}: {
  slug: string;
  path: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <ImageIcon size={15} className="text-zinc-500 shrink-0" />
          <span className="text-sm text-zinc-200 truncate">{path}</span>
        </div>
        <button
          onClick={onClose}
          title="ปิด"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-[radial-gradient(circle,#1c1c1f_1px,transparent_1px)] [background-size:16px_16px]">
        <img
          src={fileRawUrl(slug, path)}
          alt={path}
          className="max-w-full max-h-full object-contain rounded"
        />
      </div>
    </div>
  );
}
