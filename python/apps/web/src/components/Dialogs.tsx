"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface PromptOpts {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
}
interface ConfirmOpts {
  title?: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}
interface AlertOpts {
  title?: string;
  message: string;
}

type Dialog =
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "alert"; opts: AlertOpts; resolve: () => void };

interface DialogApi {
  prompt: (o: PromptOpts) => Promise<string | null>;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  alert: (o: AlertOpts) => Promise<void>;
}

const Ctx = createContext<DialogApi | null>(null);

// In-app modal dialogs that replace window.prompt/confirm/alert (those are
// unsupported / discouraged in Electron). Promise-based so call sites read the
// same: `const name = await dialogs.prompt({ title: "ชื่อโปรเจค" })`.
export function useDialogs(): DialogApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("DialogProvider missing");
  return c;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? "");
        setDialog({ kind: "prompt", opts, resolve });
      }),
    [],
  );
  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) =>
        setDialog({ kind: "confirm", opts, resolve }),
      ),
    [],
  );
  const alert = useCallback(
    (opts: AlertOpts) =>
      new Promise<void>((resolve) => setDialog({ kind: "alert", opts, resolve })),
    [],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const api = useRef<DialogApi>({ prompt, confirm, alert }).current;

  const done = (result: string | null | boolean | void) => {
    if (!dialog) return;
    (dialog.resolve as (v: unknown) => void)(result);
    setDialog(null);
  };

  useEffect(() => {
    if (dialog?.kind === "prompt") inputRef.current?.focus();
  }, [dialog]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      done(dialog?.kind === "confirm" ? false : dialog?.kind === "prompt" ? null : undefined);
    } else if (e.key === "Enter" && dialog?.kind === "prompt") {
      e.preventDefault();
      done(value);
    }
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() =>
            done(
              dialog.kind === "confirm" ? false : dialog.kind === "prompt" ? null : undefined,
            )
          }
          onKeyDown={onKeyDown}
        >
          <div
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {(dialog.opts as { title?: string }).title && (
              <h3 className="text-base font-semibold text-white mb-1">
                {(dialog.opts as { title?: string }).title}
              </h3>
            )}

            {dialog.kind === "prompt" && (
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={dialog.opts.placeholder}
                className="mt-2 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm outline-none focus:border-teal-500/60"
              />
            )}
            {(dialog.kind === "confirm" || dialog.kind === "alert") && (
              <p className="mt-1 text-sm text-zinc-400 whitespace-pre-wrap">
                {dialog.opts.message}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              {dialog.kind !== "alert" && (
                <button
                  onClick={() => done(dialog.kind === "confirm" ? false : null)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
              )}
              <button
                autoFocus={dialog.kind !== "prompt"}
                onClick={() =>
                  done(
                    dialog.kind === "prompt"
                      ? value
                      : dialog.kind === "confirm"
                        ? true
                        : undefined,
                  )
                }
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer transition-colors ${
                  dialog.kind === "confirm" && dialog.opts.danger
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-teal-600 hover:bg-teal-500"
                }`}
              >
                {dialog.kind === "prompt"
                  ? (dialog.opts.confirmText ?? "ตกลง")
                  : dialog.kind === "confirm"
                    ? (dialog.opts.confirmText ?? "ตกลง")
                    : "ตกลง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
