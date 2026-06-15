"use client";

import { NotebookView } from "@/components/NotebookView";
import { ImageViewer } from "@/components/ImageViewer";
import { MediaViewer } from "@/components/MediaViewer";
import { CsvViewer } from "@/components/CsvViewer";
import { FileEditor } from "@/components/FileEditor";

export const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;
export const MEDIA_RE = /\.(pdf|mp3|wav|ogg|m4a|flac|aac|mp4|webm|mov|mkv|m4v)$/i;
export const CSV_RE = /\.(csv|tsv)$/i;
export const isNotebook = (p: string) => p.toLowerCase().endsWith(".ipynb");

// Picks the viewer for a file by extension. Everything text-based (code, md,
// json, txt, …) falls through to the editor.
export function FileTab({
  workspaceId,
  path,
  active,
  onClose,
  onAskAI,
  insertRef,
  onToc,
  tocActionsRef,
}: {
  workspaceId: string;
  path: string;
  active: boolean;
  onClose: () => void;
  onAskAI: (prompt: string) => void;
  insertRef: React.MutableRefObject<((code: string) => void) | null>;
  onToc?: (cells: { id: string; source: string; kind: "code" | "markdown" }[]) => void;
  tocActionsRef?: React.MutableRefObject<{
    jumpTo: (id: string) => void;
    runHeading: (id: string, level: number) => void;
    addHeading: () => void;
  } | null>;
}) {
  if (isNotebook(path))
    return (
      <NotebookView
        workspaceId={workspaceId}
        path={path}
        active={active}
        onAskAI={onAskAI}
        insertRef={insertRef}
        onToc={onToc}
        tocActionsRef={tocActionsRef}
      />
    );
  if (IMAGE_RE.test(path))
    return <ImageViewer slug={workspaceId} path={path} onClose={onClose} />;
  if (MEDIA_RE.test(path))
    return <MediaViewer slug={workspaceId} path={path} onClose={onClose} />;
  if (CSV_RE.test(path))
    return <CsvViewer slug={workspaceId} path={path} onClose={onClose} />;
  return (
    <FileEditor
      slug={workspaceId}
      path={path}
      active={active}
      onClose={onClose}
      onAskAI={onAskAI}
      insertRef={insertRef}
    />
  );
}
