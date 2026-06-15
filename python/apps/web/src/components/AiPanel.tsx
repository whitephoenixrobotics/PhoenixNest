"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, Square, Trash2, Copy, Check, CornerDownLeft, SlidersHorizontal } from "lucide-react";
import { aiStatus, aiChat, type AiMessage, type AiStatus } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import { AiSetup } from "@/components/AiSetup";

interface Msg extends AiMessage {
  streaming?: boolean;
}

// Split an assistant reply into prose + fenced code blocks so code can render
// with Copy / Insert actions.
function parseSegments(content: string) {
  const segs: ({ code: false; text: string } | { code: true; lang: string; src: string })[] =
    [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last)
      segs.push({ code: false, text: content.slice(last, m.index) });
    segs.push({ code: true, lang: m[1], src: m[2].replace(/\n$/, "") });
    last = re.lastIndex;
  }
  if (last < content.length) segs.push({ code: false, text: content.slice(last) });
  return segs;
}

function CodeBlock({
  src,
  lang,
  onInsert,
}: {
  src: string;
  lang: string;
  onInsert?: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(src);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden my-2">
      <div className="flex items-center justify-between px-2 py-1 bg-zinc-900 text-[10px] text-zinc-500">
        <span>{lang || "code"}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={copy}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
          {onInsert && (
            <button
              onClick={() => onInsert(src)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-teal-300 hover:bg-teal-600/20 cursor-pointer"
            >
              <CornerDownLeft size={11} /> แทรก
            </button>
          )}
        </div>
      </div>
      <pre className="px-3 py-2 overflow-auto text-xs font-mono text-zinc-100 m-0">
        <code>{src}</code>
      </pre>
    </div>
  );
}

export function AiPanel({
  seed,
  onClose,
  onInsert,
}: {
  // Bumping seed.nonce auto-sends seed.text (e.g. an "explain error" prompt).
  seed: { text: string; nonce: number } | null;
  onClose: () => void;
  onInsert?: (code: string) => void;
}) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeed = useRef(0);

  const refreshStatus = () =>
    aiStatus().then(setStatus).catch(() => setStatus(null));

  useEffect(() => {
    const ctrl = new AbortController();
    aiStatus(ctrl.signal).then(setStatus).catch(() => setStatus(null));
    return () => ctrl.abort();
  }, []);

  // Show the setup/chooser until an assistant is ready (or when the user opens
  // it via the gear to switch). Keyed off model_ready only — an active API
  // provider is ready even when local Ollama is down.
  const needsSetup = !status || !status.model_ready;
  const setupOpen = showSetup || needsSetup;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Abort any in-flight chat stream if the panel unmounts mid-response.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    const history: Msg[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "", streaming: true }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await aiChat(
        history.map((m) => ({ role: m.role, content: m.content })),
        (tok) =>
          setMessages((ms) => {
            const next = [...ms];
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: next[next.length - 1].content + tok,
            };
            return next;
          }),
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error)?.name !== "AbortError")
        setMessages((ms) => {
          const next = [...ms];
          next[next.length - 1] = {
            role: "assistant",
            content: `⚠️ ${(e as Error).message}`,
          };
          return next;
        });
    } finally {
      setMessages((ms) =>
        ms.map((m, i) =>
          i === ms.length - 1 ? { ...m, streaming: false } : m,
        ),
      );
      setBusy(false);
    }
  };

  // Auto-send a seeded prompt (from "explain error" buttons).
  useEffect(() => {
    if (seed && seed.nonce !== lastSeed.current) {
      lastSeed.current = seed.nonce;
      send(seed.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const stop = () => abortRef.current?.abort();

  return (
    <div className="w-[380px] shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-teal-300" />
          <span className="text-sm font-medium text-zinc-200">ผู้ช่วย</span>
          {status && (
            <span
              className={`text-[10px] flex items-center gap-1 max-w-[150px] truncate ${
                status.model_ready ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
              <span className="truncate">
                {status.model_ready
                  ? status.label || status.model
                  : "ยังไม่ได้ตั้งค่า"}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSetup((s) => !s)}
            title="เลือก/ติดตั้งโมเดล"
            className={`p-1 rounded hover:bg-zinc-800 cursor-pointer ${
              setupOpen ? "text-teal-300" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <SlidersHorizontal size={14} />
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              title="ล้างแชท"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {setupOpen ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <AiSetup
            status={status}
            onChanged={refreshStatus}
            onClose={() => setShowSetup(false)}
          />
        </div>
      ) : (
        <>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-3 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="text-center text-zinc-600 text-sm mt-8 px-4">
            ถามอะไรก็ได้เกี่ยวกับโค้ด หรือกดปุ่ม ✨ ที่ error เพื่อให้อธิบาย/แก้
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "self-end max-w-[90%] bg-teal-600/20 border border-teal-500/30 rounded-xl rounded-br-sm px-3 py-2 text-sm text-zinc-100 whitespace-pre-wrap"
                : "self-start max-w-full w-full text-sm"
            }
          >
            {m.role === "user" ? (
              m.content
            ) : (
              <div className="text-zinc-200">
                {parseSegments(m.content || (m.streaming ? "…" : "")).map((s, j) =>
                  s.code ? (
                    <CodeBlock key={j} src={s.src} lang={s.lang} onInsert={onInsert} />
                  ) : (
                    <div
                      key={j}
                      className="md"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(s.text) }}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800 p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={Math.min(Math.max(input.split("\n").length, 1), 5)}
            placeholder="ถามผู้ช่วย… (Enter ส่ง)"
            className="flex-1 resize-none rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm outline-none focus:border-teal-500/60"
          />
          {busy ? (
            <button
              onClick={stop}
              title="หยุด"
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="p-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white cursor-pointer disabled:opacity-40"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
