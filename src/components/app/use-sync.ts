"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getServerSyncState, getSyncState, startEngine, subscribeSync, type SyncState } from "@/lib/sync/engine";
import { useUI } from "./ui-context";

let pairCode: string | null = null;
const pairListeners = new Set<() => void>();

export function usePendingPairCode(): [string | null, (c: string | null) => void] {
  const code = useSyncExternalStore(
    (l) => {
      pairListeners.add(l);
      return () => pairListeners.delete(l);
    },
    () => pairCode,
    () => null,
  );
  const set = (c: string | null) => {
    pairCode = c;
    for (const l of pairListeners) {
      l();
    }
  };
  return [code, set];
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, getServerSyncState);
}

/** Boots the sync engine and picks up `#pair=CODE` links opened from a QR. */
export function useSyncEngine() {
  const ui = useUI();
  const [, setPairCode] = usePendingPairCode();

  useEffect(() => {
    void startEngine();

    const readHash = () => {
      const m = /[#&]pair=([A-Za-z0-9-]+)/.exec(location.hash);
      if (m) {
        setPairCode(m[1]);
        ui.setSyncOpen(true);
        history.replaceState(null, "", location.pathname + location.search);
      }
    };

    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
