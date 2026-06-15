"use client";

import { useEffect, useRef, useState } from "react";
import { X, TerminalSquare, Eraser, Power } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { API_URL, killTerminal } from "@/lib/api";

// Live PTY terminal (PowerShell in the project dir, project venv on PATH),
// streamed over a WebSocket. The session persists across closes; xterm.js
// touches the DOM, so it's imported dynamically inside the effect (SSR-safe).
export function TerminalPanel({
  slug,
  onClose,
}: {
  slug: string;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const termRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  // True when the socket dropped unexpectedly (backend reload, network) rather
  // than via an intentional close/Kill — surfaces a reconnect button.
  const [lost, setLost] = useState(false);

  // Drag-resizable height (persisted). The handle sits on the panel's top edge.
  const [height, setHeight] = useState(() => {
    if (typeof window === "undefined") return 256;
    const v = Number(localStorage.getItem("pn-terminal-height"));
    return v >= 120 && v <= 800 ? v : 256;
  });
  const heightRef = useRef(height);
  heightRef.current = height;

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = heightRef.current;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    const onMove = (ev: MouseEvent) => {
      // panel is anchored at the bottom → dragging up grows it.
      const next = Math.min(Math.max(startH + (startY - ev.clientY), 120), 800);
      setHeight(next);
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try {
        localStorage.setItem("pn-terminal-height", String(heightRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setLost(false);

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !hostRef.current) return;

      const term = new Terminal({
        fontSize: 13,
        fontFamily: "var(--font-mono), monospace",
        cursorBlink: true,
        theme: {
          background: "#0a0a0b",
          foreground: "#e4e4e7",
          cursor: "#2dd4bf",
          selectionBackground: "#334155",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(hostRef.current);
      fit.fit();
      termRef.current = term;

      const wsUrl =
        API_URL.replace(/^http/, "ws") + `/api/projects/${slug}/terminal/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const sendResize = () => {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({ type: "resize", rows: term.rows, cols: term.cols }),
          );
      };

      ws.onopen = () => {
        sendResize();
        term.focus();
      };
      ws.onmessage = (e) => term.write(e.data as string);
      ws.onclose = () => {
        term.write("\r\n\x1b[90m[terminal ปิดแล้ว]\x1b[0m\r\n");
        if (!disposed) setLost(true); // unexpected drop → offer reconnect
      };

      term.onData((d: string) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "input", data: d }));
      });

      const ro = new ResizeObserver(() => sendResize());
      ro.observe(hostRef.current);

      cleanup = () => {
        ro.disconnect();
        ws.close();
        term.dispose();
        termRef.current = null;
        wsRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [slug, reconnectKey]);

  // Clear: wipe the visible buffer AND the server-side scrollback so a later
  // reattach doesn't replay the old output.
  const handleClear = () => {
    termRef.current?.clear();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "clear" }));
  };

  // Kill: force-terminate the shell, then reconnect for a fresh session.
  const handleKill = async () => {
    try {
      await killTerminal(slug);
    } catch {
      /* ignore */
    }
    setReconnectKey((k) => k + 1);
  };

  return (
    <div
      className="bg-[#0a0a0b] flex flex-col shrink-0"
      style={{ height }}
    >
      {/* drag handle */}
      <div
        onMouseDown={startDrag}
        title="ลากเพื่อปรับความสูง"
        className="h-1.5 shrink-0 cursor-row-resize bg-zinc-800 hover:bg-teal-500/60 transition-colors"
      />
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          <TerminalSquare size={13} /> เทอร์มินัล · {slug} (venv)
        </span>
        <div className="flex items-center gap-0.5">
          {lost && (
            <button
              onClick={() => setReconnectKey((k) => k + 1)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-teal-300 hover:bg-teal-600/20 cursor-pointer"
              title="เชื่อมต่อเทอร์มินัลใหม่"
            >
              <Power size={13} /> เชื่อมต่อใหม่
            </button>
          )}
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
            title="ล้างหน้าจอ"
          >
            <Eraser size={13} /> Clear
          </button>
          <button
            onClick={handleKill}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-400 hover:text-red-400 hover:bg-red-600/15 cursor-pointer"
            title="บังคับจบเซสชันแล้วเริ่มใหม่"
          >
            <Power size={13} /> Kill
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
            title="ปิด (เซสชันยังรันต่อ)"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div ref={hostRef} className="flex-1 min-h-0 px-2 py-1 overflow-hidden" />
    </div>
  );
}
