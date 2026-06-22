import type { Task, Settings, DayOverride } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

const KEYS = {
  tasks: "planner.tasks",
  settings: "planner.settings",
  completions: "planner.completions",
  overrides: "planner.overrides",
  subtaskDone: "planner.subtaskDone",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — ignore.
  }
}

export const storage = {
  loadTasks: (): Task[] => read<Task[]>(KEYS.tasks, []),
  saveTasks: (tasks: Task[]) => write(KEYS.tasks, tasks),

  loadSettings: (): Settings => ({
    ...DEFAULT_SETTINGS,
    ...read<Partial<Settings>>(KEYS.settings, {}),
  }),
  saveSettings: (settings: Settings) => write(KEYS.settings, settings),

  loadCompletions: (): Record<string, number> =>
    read<Record<string, number>>(KEYS.completions, {}),
  saveCompletions: (completions: Record<string, number>) =>
    write(KEYS.completions, completions),

  loadOverrides: (): Record<string, DayOverride> =>
    read<Record<string, DayOverride>>(KEYS.overrides, {}),
  saveOverrides: (overrides: Record<string, DayOverride>) =>
    write(KEYS.overrides, overrides),

  loadSubtaskDone: (): Record<string, boolean> =>
    read<Record<string, boolean>>(KEYS.subtaskDone, {}),
  saveSubtaskDone: (done: Record<string, boolean>) =>
    write(KEYS.subtaskDone, done),
};
