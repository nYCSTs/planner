"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Task,
  Settings,
  ResolvedOccurrence,
  DayOverride,
  Subtask,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { storage } from "@/lib/storage";
import { dateKey } from "@/lib/time";

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
  const [overrides, setOverrides] = useState<Record<string, DayOverride>>({});
  const [subtaskDone, setSubtaskDone] = useState<Record<string, boolean>>({});

  // Hydrate once on mount from localStorage (external system).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTasks(storage.loadTasks());
    setSettings(storage.loadSettings());
    setCompletions(storage.loadCompletions());
    setOverrides(storage.loadOverrides());
    setSubtaskDone(storage.loadSubtaskDone());
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
  useEffect(() => {
    if (hydrated) storage.saveOverrides(overrides);
  }, [overrides, hydrated]);
  useEffect(() => {
    if (hydrated) storage.saveSubtaskDone(subtaskDone);
  }, [subtaskDone, hydrated]);

  const addTask = useCallback((task: Omit<Task, "id" | "createdAt">) => {
    const full: Task = { ...task, id: uid(), createdAt: new Date().toISOString() };
    setTasks((prev) => [...prev, full]);
    return full;
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  /**
   * Fork an existing task into a new one: an exact copy (title, description,
   * color, recurrence, notify/sound) plus all its subtasks — global and the
   * source day's pontual ones merged into the new task's global subtasks, each
   * with a fresh id. Subtasks that were done on `fromDay` are carried over as
   * done on `forDay`. The new task starts as a single-day ("once") task with no
   * time set, so the caller can open it for the user to pick the new time.
   * Returns the created task.
   */
  const forkTask = useCallback(
    (sourceId: string, fromDay: Date, forDay: Date): Task | null => {
      const source = tasks.find((t) => t.id === sourceId);
      if (!source) return null;

      // For "once" tasks use their own date; for recurring tasks use fromDay.
      const effectiveFromKey =
        source.recurrence.kind === "once" && source.date
          ? source.date
          : dateKey(fromDay);

      const forKey = dateKey(forDay);
      const sourceOverride = overrides[`${sourceId}:${effectiveFromKey}`];

      // Merge global + that day's pontual subtasks, remapping to fresh ids and
      // remembering which were done so we can mark the copies done.
      const sourceSubs = [
        ...(source.subtasks ?? []),
        ...(sourceOverride?.subtasks ?? []),
      ];
      const newSubs = sourceSubs.map((s) => ({
        sub: { id: uid(), title: s.title },
        wasDone: Boolean(subtaskDone[`${s.id}:${effectiveFromKey}`]),
      }));

      const newId = uid();
      const forked: Task = {
        ...source,
        id: newId,
        subtasks: newSubs.map((n) => n.sub),
        startMinute: null,
        endMinute: null,
        recurrence: { kind: "once" },
        date: forKey,
        createdAt: new Date().toISOString(),
      };

      setTasks((prev) => [...prev, forked]);

      const doneToCarry = newSubs.filter((n) => n.wasDone);
      if (doneToCarry.length > 0) {
        setSubtaskDone((prev) => {
          const next = { ...prev };
          for (const n of doneToCarry) next[`${n.sub.id}:${forKey}`] = true;
          return next;
        });
      }

      return forked;
    },
    [tasks, overrides, subtaskDone],
  );

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * Create a live-tracking task starting right now (open-ended, "once", today).
   * Returns the created task so the caller can hold its id to stop it later.
   */
  const startTracking = useCallback(
    (
      title: string,
      color: string,
      subtasks?: Task["subtasks"],
    ): Task => {
      const now = new Date();
      const start = now.getHours() * 60 + now.getMinutes();
      const task: Task = {
        id: uid(),
        title,
        color,
        subtasks,
        startMinute: start,
        endMinute: null,
        recurrence: { kind: "once" },
        date: dateKey(now),
        soundEnabled: undefined,
        hideElapsed: false,
        createdAt: now.toISOString(),
      };
      setTasks((prev) => [...prev, task]);
      return task;
    },
    [],
  );

  /**
   * Stop a live-tracking task by setting its endMinute to the current minute.
   */
  const stopTracking = useCallback((taskId: string) => {
    const now = new Date();
    const end = now.getHours() * 60 + now.getMinutes();
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, endMinute: end } : t)),
    );
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

  // --- Per-day overrides (description / subtasks that apply to one day) -----

  /** Patch a single day's override for a task, pruning it when it goes empty. */
  const patchOverride = useCallback(
    (taskId: string, day: Date, patch: Partial<DayOverride>) => {
      const key = `${taskId}:${dateKey(day)}`;
      setOverrides((prev) => {
        const merged: DayOverride = { ...prev[key], ...patch };
        const empty =
          !merged.description?.trim() && (merged.subtasks?.length ?? 0) === 0;
        const next = { ...prev };
        if (empty) delete next[key];
        else next[key] = merged;
        return next;
      });
    },
    [],
  );

  /** Set the day-specific (pontual) description. */
  const setDayDescription = useCallback(
    (taskId: string, day: Date, description: string) => {
      patchOverride(taskId, day, { description });
    },
    [patchOverride],
  );

  /** Add a subtask either globally (task) or just for `day` (override). */
  const addSubtask = useCallback(
    (taskId: string, day: Date, title: string, scope: "global" | "day") => {
      const sub: Subtask = { id: uid(), title };
      if (scope === "global") {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: [...(t.subtasks ?? []), sub] }
              : t,
          ),
        );
      } else {
        const key = `${taskId}:${dateKey(day)}`;
        setOverrides((prev) => {
          const cur = prev[key] ?? {};
          return {
            ...prev,
            [key]: { ...cur, subtasks: [...(cur.subtasks ?? []), sub] },
          };
        });
      }
    },
    [],
  );

  /** Remove a subtask from the global task or a day override. */
  const removeSubtask = useCallback(
    (taskId: string, day: Date, subtaskId: string, scope: "global" | "day") => {
      if (scope === "global") {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: (t.subtasks ?? []).filter((s) => s.id !== subtaskId) }
              : t,
          ),
        );
      } else {
        const key = `${taskId}:${dateKey(day)}`;
        setOverrides((prev) => {
          const cur = prev[key];
          if (!cur) return prev;
          const subtasks = (cur.subtasks ?? []).filter((s) => s.id !== subtaskId);
          const merged: DayOverride = { ...cur, subtasks };
          const empty =
            !merged.description?.trim() && subtasks.length === 0;
          const next = { ...prev };
          if (empty) delete next[key];
          else next[key] = merged;
          return next;
        });
      }
    },
    [],
  );

  /** Rename a subtask in the global task or a day override. */
  const renameSubtask = useCallback(
    (
      taskId: string,
      day: Date,
      subtaskId: string,
      title: string,
      scope: "global" | "day",
    ) => {
      if (scope === "global") {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: (t.subtasks ?? []).map((s) =>
                    s.id === subtaskId ? { ...s, title } : s,
                  ),
                }
              : t,
          ),
        );
      } else {
        const key = `${taskId}:${dateKey(day)}`;
        setOverrides((prev) => {
          const cur = prev[key];
          if (!cur) return prev;
          return {
            ...prev,
            [key]: {
              ...cur,
              subtasks: (cur.subtasks ?? []).map((s) =>
                s.id === subtaskId ? { ...s, title } : s,
              ),
            },
          };
        });
      }
    },
    [],
  );

  /** Toggle a subtask's done state for a specific day (always per-day). */
  const toggleSubtaskDone = useCallback((subtaskId: string, day: Date) => {
    const key = `${subtaskId}:${dateKey(day)}`;
    setSubtaskDone((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }, []);

  /** Serialize everything to a JSON backup string. */
  const exportData = useCallback((): string => {
    return JSON.stringify(
      { version: 2, tasks, settings, completions, overrides, subtaskDone },
      null,
      2,
    );
  }, [tasks, settings, completions, overrides, subtaskDone]);

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
      overrides?: unknown;
      subtaskDone?: unknown;
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
    // overrides/subtaskDone are optional (older backups won't have them).
    setOverrides(
      parsed.overrides && typeof parsed.overrides === "object"
        ? (parsed.overrides as Record<string, DayOverride>)
        : {},
    );
    setSubtaskDone(
      parsed.subtaskDone && typeof parsed.subtaskDone === "object"
        ? (parsed.subtaskDone as Record<string, boolean>)
        : {},
    );
  }, []);

  return {
    hydrated,
    tasks,
    settings,
    completions,
    overrides,
    subtaskDone,
    addTask,
    updateTask,
    deleteTask,
    forkTask,
    startTracking,
    stopTracking,
    updateSettings,
    toggleDone,
    setDayDescription,
    addSubtask,
    removeSubtask,
    renameSubtask,
    toggleSubtaskDone,
    exportData,
    importData,
  };
}
