"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_SYNCED_SETTINGS,
  type DevicePrefs,
  type Project,
  type Settings,
  type SettingsRecord,
  type SyncedSettings,
  type Tag,
  type Task,
  type TimeEntry,
} from "@/types";
import { runningEntry } from "@/lib/entries";
import { getPrefs, getServerPrefs, subscribePrefs } from "./device";
import { getServerState, getState, subscribe, type StoreState } from "./store";

export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(getServerState()),
  );
}

/** Memoize a derivation on the identity of its single (map) argument. */
function memoByRef<A extends object, R>(fn: (a: A) => R): (a: A) => R {
  const cache = new WeakMap<A, R>();
  return (a) => {
    if (cache.has(a)) {
      return cache.get(a) as R;
    }

    const r = fn(a);
    cache.set(a, r);
    return r;
  };
}

function alive<T extends { deletedAt?: number | null }>(map: Record<string, T>): T[] {
  return Object.values(map).filter((r) => !r.deletedAt);
}

export const selectTasks = memoByRef((m: Record<string, Task>) => alive(m));
export const selectEntries = memoByRef((m: Record<string, TimeEntry>) => alive(m));
export const selectTags = memoByRef((m: Record<string, Tag>) =>
  alive(m).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
);
export const selectProjects = memoByRef((m: Record<string, Project>) =>
  alive(m).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
);
export const selectRunning = memoByRef((m: Record<string, TimeEntry>) => runningEntry(m));
export const selectTagsById = memoByRef((m: Record<string, Tag>) =>
  Object.fromEntries(alive(m).map((t) => [t.id, t])) as Record<string, Tag>,
);
export const selectProjectsById = memoByRef((m: Record<string, Project>) => m);

const selectSynced = memoByRef((m: Record<string, SettingsRecord>): SyncedSettings => {
  const rec = m.settings;
  if (!rec) {
    return DEFAULT_SYNCED_SETTINGS;
  }

  return {
    notifyBeforeStart: rec.notifyBeforeStart ?? DEFAULT_SYNCED_SETTINGS.notifyBeforeStart,
    notifyBeforeEnd: rec.notifyBeforeEnd ?? DEFAULT_SYNCED_SETTINGS.notifyBeforeEnd,
    pomodoroWork: rec.pomodoroWork ?? DEFAULT_SYNCED_SETTINGS.pomodoroWork,
    pomodoroBreak: rec.pomodoroBreak ?? DEFAULT_SYNCED_SETTINGS.pomodoroBreak,
    sleep: rec.sleep ?? DEFAULT_SYNCED_SETTINGS.sleep,
    timeZone: rec.timeZone,
  };
});

export const useReady = () => useStore((s) => s.ready);
export const useTasks = () => useStore((s) => selectTasks(s.tasks));
export const useTasksById = () => useStore((s) => s.tasks);
export const useOccurrenceStates = () => useStore((s) => s.occurrences);
export const useEntries = () => useStore((s) => selectEntries(s.entries));
export const useTags = () => useStore((s) => selectTags(s.tags));
export const useTagsById = () => useStore((s) => selectTagsById(s.tags));
export const useProjects = () => useStore((s) => selectProjects(s.projects));
export const useProjectsById = () => useStore((s) => selectProjectsById(s.projects));
export const useRunningEntry = () => useStore((s) => selectRunning(s.entries));
export const useSyncedSettings = () => useStore((s) => selectSynced(s.settings));

export function usePrefs(): DevicePrefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
}

const mergeCache = new WeakMap<SyncedSettings, WeakMap<DevicePrefs, Settings>>();

export function useSettings(): Settings {
  const synced = useSyncedSettings();
  const prefs = usePrefs();
  let inner = mergeCache.get(synced);
  if (!inner) {
    inner = new WeakMap();
    mergeCache.set(synced, inner);
  }

  let merged = inner.get(prefs);
  if (!merged) {
    merged = { ...synced, ...prefs };
    inner.set(prefs, merged);
  }

  return merged;
}
