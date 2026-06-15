"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Download, AlertTriangle } from "lucide-react";
import { getFileContent, fileRawUrl } from "@/lib/api";

// Minimal RFC-4180-ish parser: handles quoted fields, "" escapes, and
// commas/newlines inside quotes.
function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function CsvViewer({
  slug,
  path,
  onClose,
}: {
  slug: string;
  path: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getFileContent(slug, path, ctrl.signal)
      .then((r) => {
        if (!r.editable) {
          setErr(r.reason === "large" ? "ไฟล์ใหญ่เกินไป" : "เปิดไฟล์นี้ไม่ได้");
          return;
        }
        setRows(parseCsv(r.content, path.toLowerCase().endsWith(".tsv") ? "\t" : ","));
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setErr("เปิดไฟล์ไม่สำเร็จ");
      });
    return () => ctrl.abort();
  }, [slug, path]);

  const header = rows?.[0] ?? [];
  const body = rows?.slice(1) ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-zinc-200 truncate">{path}</span>
          {rows && (
            <span className="text-xs text-zinc-600">
              {body.length} แถว · {header.length} คอลัมน์
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={fileRawUrl(slug, path)}
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

      <div className="flex-1 overflow-auto">
        {err ? (
          <div className="flex flex-col items-center gap-2 py-20 text-zinc-500">
            <AlertTriangle size={28} className="text-amber-500" />
            <p>{err}</p>
          </div>
        ) : !rows ? (
          <p className="flex items-center gap-2 text-zinc-500 text-sm p-6">
            <Loader2 size={15} className="animate-spin" /> กำลังเปิด…
          </p>
        ) : (
          <table className="text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="bg-zinc-900 border border-zinc-800 px-2 py-1 text-zinc-600 text-xs font-normal w-10 text-right">
                  #
                </th>
                {header.map((h, i) => (
                  <th
                    key={i}
                    className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-left font-semibold text-zinc-200 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="even:bg-zinc-900/30">
                  <td className="border border-zinc-800/70 px-2 py-1 text-zinc-600 text-xs text-right select-none">
                    {ri + 1}
                  </td>
                  {header.map((_, ci) => (
                    <td
                      key={ci}
                      className="border border-zinc-800/70 px-3 py-1 text-zinc-300 whitespace-nowrap"
                    >
                      {r[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
