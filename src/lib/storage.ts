import type { Task, Settings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

const KEYS = {
  tasks: "planner.tasks",
  settings: "planner.settings",
  completions: "planner.completions",
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
};
