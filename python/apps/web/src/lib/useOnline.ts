"use client";

import { useSyncExternalStore } from "react";

// Tracks real internet connectivity (navigator.onLine), updating live on the
// browser's online/offline events. Used to warn before actions that need the
// network — model downloads, pip installs, external AI APIs — so the user
// isn't left guessing why something stalled.
//
// Note: this is the *internet* status, distinct from whether the local Ollama
// daemon is reachable (that's the AI-status `online` flag, a loopback check).

function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // SSR / first paint: assume online
  );
}
