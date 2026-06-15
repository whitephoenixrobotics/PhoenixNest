// Module-level install store for the AI model pull.
//
// A model download takes minutes. If the pull lived inside the AiSetup
// component, closing the panel or switching views would unmount it and either
// lose the progress or abort the download. So the pull lives here, at module
// scope: it keeps running and keeps reporting progress regardless of which
// component is mounted. A freshly-mounted panel reads the current state and
// re-renders the progress bar; only an explicit cancelInstall() stops it.

import { aiPull, aiSelectModel } from "@/lib/api";

export interface InstallState {
  name: string | null; // model currently installing (null = idle)
  pct: number | null;
  status: string;
  error: string | null;
}

let state: InstallState = { name: null, pct: null, status: "", error: null };
let ctrl: AbortController | null = null;
const listeners = new Set<() => void>();

function set(next: InstallState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

export function getInstallState(): InstallState {
  return state;
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Start pulling a model. Resolves true on success. One install at a time.
export async function startInstall(name: string): Promise<boolean> {
  if (state.name) return false;
  ctrl = new AbortController();
  set({ name, pct: null, status: "กำลังเริ่ม…", error: null });
  try {
    await aiPull(name, (s, pct) => set({ name, pct, status: s, error: null }), ctrl.signal);
    await aiSelectModel(`ollama:${name}`);
    set({ name: null, pct: null, status: "", error: null });
    return true;
  } catch (e) {
    const err = e as Error;
    set({
      name: null,
      pct: null,
      status: "",
      // an explicit cancel isn't an error worth surfacing
      error: err?.name === "AbortError" ? null : err.message || "ติดตั้งไม่สำเร็จ",
    });
    return false;
  } finally {
    ctrl = null;
  }
}

export function cancelInstall(): void {
  ctrl?.abort();
}

export function clearInstallError(): void {
  if (state.error) set({ ...state, error: null });
}
