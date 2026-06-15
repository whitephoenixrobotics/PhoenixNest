"use client";

import { X, Download, FileText } from "lucide-react";
import { fileRawUrl } from "@/lib/api";

const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";
const AUDIO = ["mp3", "wav", "ogg", "m4a", "flac", "aac"];
const VIDEO = ["mp4", "webm", "mov", "mkv", "m4v"];

export function MediaViewer({
  slug,
  path,
  onClose,
}: {
  slug: string;
  path: string;
  onClose: () => void;
}) {
  const url = fileRawUrl(slug, path);
  const e = ext(path);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={15} className="text-zinc-500 shrink-0" />
          <span className="text-sm text-zinc-200 truncate">{path}</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={url}
            download
            title="ดาวน์โหลด"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-teal-300 hover:bg-zinc-800 cursor-pointer"
          >
            <Download size={15} />
          </a>
          <button
            onClick={onClose}
            title="ปิด"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-zinc-950/50">
        {e === "pdf" ? (
          <iframe src={url} title={path} className="w-full h-full rounded border border-zinc-800" />
        ) : AUDIO.includes(e) ? (
          <audio src={url} controls className="w-full max-w-lg" />
        ) : VIDEO.includes(e) ? (
          <video src={url} controls className="max-w-full max-h-full rounded" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-zinc-500">
            <FileText size={36} />
            <p className="text-sm">เปิดดูในแอปนี้ไม่ได้</p>
            <a
              href={url}
              download
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm cursor-pointer"
            >
              <Download size={14} /> ดาวน์โหลด
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
