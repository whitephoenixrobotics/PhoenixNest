"use client";

import { useEffect, useState } from "react";
import { netStatus } from "@/lib/api";

// Tracks whether the machine can actually reach the internet — used to gate
// actions that need the network (model downloads, pip installs, external AI
// APIs) so the user isn't left guessing why something stalls.
//
// We deliberately do NOT trust navigator.onLine alone: it only reports whether
// a network interface is up, so a machine on Wi-Fi whose router has lost its
// WAN still reads "online". Instead we poll a server-side reachability probe
// (/api/net) — the backend runs on the same host that performs the downloads,
// so it's the authoritative signal. navigator's offline/online events and
// window focus just trigger an immediate re-check.
//
// The poll only runs while a component using this hook is mounted (the AI setup
// / packages panels), so there's no constant background pinging.
export function useOnline(pollMs = 5000): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let alive = true;
    let ctrl: AbortController | null = null;

    const check = () => {
      ctrl?.abort();
      ctrl = new AbortController();
      netStatus(ctrl.signal)
        .then((v) => {
          if (alive) setOnline(v);
        })
        .catch(() => {
          /* probe failed (e.g. backend busy) — leave the last known value */
        });
    };

    check();
    const id = setInterval(check, pollMs);
    // A hard interface-down is authoritative → offline immediately.
    const goOffline = () => alive && setOnline(false);
    // "online" event only means an interface came up — re-probe to confirm
    // real connectivity rather than trusting it.
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", check);
    window.addEventListener("focus", check);

    return () => {
      alive = false;
      ctrl?.abort();
      clearInterval(id);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
    };
  }, [pollMs]);

  return online;
}
