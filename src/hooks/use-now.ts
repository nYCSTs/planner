"use client";

import { useEffect, useState } from "react";

/** Returns the current Date, re-rendering every `intervalMs` (default 30s).
 *  State is set only inside useEffect so the initial value is always the local
 *  wall-clock time on the client, never the server's UTC clock. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    // Immediately correct the initial value (it may have been set in SSR UTC).
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
