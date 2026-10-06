import { DEFAULT_DEVICE_PREFS, type DevicePrefs } from "@/types";

// Same key the pre-v4 app used, so the pre-paint theme script keeps working.
const KEY = "planner.settings";

let prefs: DevicePrefs = DEFAULT_DEVICE_PREFS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") {
    return;
  }

  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<DevicePrefs>) : {};
    prefs = { ...DEFAULT_DEVICE_PREFS };
    for (const k of Object.keys(DEFAULT_DEVICE_PREFS) as (keyof DevicePrefs)[]) {
      if (parsed[k] !== undefined) {
        (prefs as unknown as Record<string, unknown>)[k] = parsed[k];
      }
    }
  } catch {
    prefs = DEFAULT_DEVICE_PREFS;
  }
}

export function getPrefs(): DevicePrefs {
  load();
  return prefs;
}

export function getServerPrefs(): DevicePrefs {
  return DEFAULT_DEVICE_PREFS;
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPrefs(patch: Partial<DevicePrefs>) {
  load();
  prefs = { ...prefs, ...patch };
  try {
    const raw = localStorage.getItem(KEY);
    const existing = raw ? JSON.parse(raw) : {};
    localStorage.setItem(KEY, JSON.stringify({ ...existing, ...prefs }));
  } catch {
    // storage unavailable — keep in memory only.
  }

  for (const l of listeners) {
    l();
  }
}
