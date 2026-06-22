"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task, Settings, ResolvedOccurrence } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { storage } from "@/lib/storage";

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Central client-side store. Holds tasks, settings, and per-day completions,
 * persisting each to localStorage on change. Hydrates after mount to avoid
 * SSR/client mismatch.
 */
export function usePlanner() {
  const [hydrated, setHydrated] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<Settings>(storage.loadSettings());
  const [completions, setCompletions] = useState<Record<string, number>>({});

  // Hydrate once on mount from localStorage (external system).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTasks(storage.loadTasks());
    setSettings(storage.loadSettings());
    setCompletions(storage.loadCompletions());
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Persist on change (after hydration).
  useEffect(() => {
    if (hydrated) storage.saveTasks(tasks);
  }, [tasks, hydrated]);
  useEffect(() => {
    if (hydrated) storage.saveSettings(settings);
  }, [settings, hydrated]);
  useEffect(() => {
    if (hydrated) storage.saveCompletions(completions);
  }, [completions, hydrated]);

  const addTask = useCallback((task: Omit<Task, "id" | "createdAt">) => {
    const full: Task = { ...task, id: uid(), createdAt: new Date().toISOString() };
    setTasks((prev) => [...prev, full]);
    return full;
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  /**
   * Toggle an occurrence's "done" state with the right granularity:
   * - hourly tasks → just that one hour on that day (keyed by occurrence key).
   * - once / daily-recurring tasks → that day (per-day completion).
   * Completion is always per-day (or per-hour) — never archives the whole task,
   * so finishing one occurrence never removes the others.
   */
  const toggleDone = useCallback((occ: ResolvedOccurrence) => {
    const makeDone = !occ.completed;
    const key = occ.key; // `${taskId}:${date}` or `${taskId}:${date}:${hour}`
    setCompletions((prev) => {
      if (makeDone) return { ...prev, [key]: occ.startMinute };
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /** Serialize everything to a JSON backup string. */
  const exportData = useCallback((): string => {
    return JSON.stringify(
      { version: 1, tasks, settings, completions },
      null,
      2,
    );
  }, [tasks, settings, completions]);

  /**
   * Replace state from a backup JSON string. Validates the shape loosely and
   * throws on malformed input so the caller can surface an error. Merges
   * settings over defaults so missing fields stay valid.
   */
  const importData = useCallback((json: string) => {
    const parsed = JSON.parse(json) as {
      tasks?: unknown;
      settings?: unknown;
      completions?: unknown;
    };
    if (!Array.isArray(parsed.tasks)) {
      throw new Error("Backup inválido: 'tasks' ausente ou malformado.");
    }
    setTasks(parsed.tasks as Task[]);
    if (parsed.settings && typeof parsed.settings === "object") {
      setSettings({ ...DEFAULT_SETTINGS, ...(parsed.settings as Settings) });
    }
    if (parsed.completions && typeof parsed.completions === "object") {
      setCompletions(parsed.completions as Record<string, number>);
    }
  }, []);

  return {
    hydrated,
    tasks,
    settings,
    completions,
    addTask,
    updateTask,
    deleteTask,
    updateSettings,
    toggleDone,
    exportData,
    importData,
  };
}
