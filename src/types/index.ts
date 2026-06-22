// Domain model for the planner.

/** Days of week, 0 = Sunday ... 6 = Saturday (matches JS Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RecurrenceKind =
  | "once" // a single dated occurrence
  | "weekdays" // Mon–Fri
  | "weekends" // Sat–Sun
  | "everyday" // all 7 days
  | "custom"; // an explicit set of weekdays

export interface Recurrence {
  kind: RecurrenceKind;
  /** For "custom": the weekdays the task repeats on. */
  weekdays?: Weekday[];
  /**
   * When true, the task repeats every hour from its start time on each day the
   * `kind` is active (e.g. everyHour + everyday = hourly on all days). Not
   * valid together with `kind: "once"`.
   */
  everyHour?: boolean;
}

export interface Task {
  id: string;
  title: string;
  /** Optional longer note. */
  notes?: string;
  /** Hex/tailwind-friendly accent color used on the timeline block. */
  color: string;

  /** Minutes from midnight, 0–1439. */
  startMinute: number;
  /**
   * Minutes from midnight for the end. When null the task is open-ended and
   * must be finished manually (see `completedAt`).
   */
  endMinute: number | null;

  recurrence: Recurrence;

  /**
   * For "once" tasks: the ISO date (yyyy-MM-dd) the task lives on.
   * Recurring tasks ignore this and use `recurrence` instead.
   */
  date?: string;

  /** Lead time overrides (minutes). Falls back to global settings when undefined. */
  notifyBeforeStart?: number;
  notifyBeforeEnd?: number;

  /**
   * When true, occurrences whose end time has already elapsed are hidden — but
   * only on the current day. Past days still show every occurrence (history).
   */
  hideElapsed?: boolean;

  createdAt: string;
}

/**
 * Per-day, per-task completion record for open-ended tasks. Keyed by
 * `${taskId}:${dateKey}`. Stores when the user manually finished the task.
 */
export interface Completion {
  taskId: string;
  date: string; // yyyy-MM-dd
  completedAtMinute: number;
}

export interface Settings {
  theme: "light" | "dark" | "system";
  /** Default minutes-before-start notification lead time. */
  notifyBeforeStart: number;
  /** Default minutes-before-end notification lead time. */
  notifyBeforeEnd: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  /** Pomodoro durations in minutes. */
  pomodoroWork: number;
  pomodoroBreak: number;
}

/** A task resolved to a concrete interval on a specific day. */
export interface ResolvedOccurrence {
  task: Task;
  /** Stable key for this occurrence on this day. */
  key: string;
  date: string; // yyyy-MM-dd
  startMinute: number;
  /** Effective end for layout: real end, manual completion, or end-of-day. */
  endMinute: number;
  /** True when endMinute is implied (open-ended, not yet finished). */
  openEnded: boolean;
  completed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  notifyBeforeStart: 5,
  notifyBeforeEnd: 5,
  notificationsEnabled: true,
  soundEnabled: true,
  pomodoroWork: 25,
  pomodoroBreak: 5,
};
