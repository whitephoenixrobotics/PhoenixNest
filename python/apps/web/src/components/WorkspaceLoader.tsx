"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Client-only (CodeMirror/xterm touch the DOM and are heavy) — keeps them out
// of the dev SSR worker and the SSR bundle.
const WorkspaceView = dynamic(
  () => import("@/components/WorkspaceView").then((m) => m.WorkspaceView),
  {
    ssr: false,
    loading: () => (
      <p className="flex flex-1 items-center justify-center gap-2 text-zinc-500 text-sm">
        <Loader2 size={16} className="animate-spin" /> กำลังโหลด…
      </p>
    ),
  },
);

export function WorkspaceLoader({ workspaceId }: { workspaceId: string }) {
  return <WorkspaceView workspaceId={workspaceId} />;
}
