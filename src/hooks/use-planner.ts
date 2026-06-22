"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task, Settings } from "@/types";
import { storage } from "@/lib/storage";
import { dateKey, nowMinutes } from "@/lib/time";

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

  /** Mark an open-ended task finished now (or at a given minute) on a day. */
  const completeTask = useCallback(
    (taskId: string, day: Date, atMinute?: number) => {
      const key = `${taskId}:${dateKey(day)}`;
      setCompletions((prev) => ({
        ...prev,
        [key]: atMinute ?? nowMinutes(),
      }));
    },
    [],
  );

  const uncompleteTask = useCallback((taskId: string, day: Date) => {
    const key = `${taskId}:${dateKey(day)}`;
    setCompletions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /**
   * Toggle a task's "done" state with the right semantics:
   * - once tasks → per-day completion (done just for that day).
   * - recurring tasks → archived (done "for good", stops recurring).
   * `done` forces a direction; omit to flip the current state.
   */
  const toggleDone = useCallback(
    (task: Task, day: Date, currentlyDone: boolean) => {
      const recurring = task.recurrence.kind !== "once";
      const makeDone = !currentlyDone;

      if (recurring) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, archived: makeDone } : t)),
        );
        return;
      }

      const key = `${task.id}:${dateKey(day)}`;
      setCompletions((prev) => {
        if (makeDone) return { ...prev, [key]: nowMinutes() };
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  return {
    hydrated,
    tasks,
    settings,
    completions,
    addTask,
    updateTask,
    deleteTask,
    updateSettings,
    completeTask,
    uncompleteTask,
    toggleDone,
  };
}
