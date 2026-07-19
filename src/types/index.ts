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
   * ISO date (yyyy-MM-dd) the recurrence starts on. When set, occurrences
   * before this date are suppressed — this lets a recurring task begin on a
   * *future* day rather than always from its creation day. When omitted the
   * task falls back to starting on its creation day (legacy behaviour).
   */
  startDate?: string;
  /**
   * ISO date (yyyy-MM-dd) the recurrence ends on (inclusive). When set,
   * occurrences after this date are suppressed. When omitted the task repeats
   * indefinitely.
   */
  endDate?: string;
  /**
   * When true, the task repeats on an hourly cadence from its start time on
   * each day the `kind` is active (e.g. everyHour + everyday = on all days).
   * Not valid together with `kind: "once"`.
   */
  everyHour?: boolean;
  /**
   * Step in hours between repeats when `everyHour` is true (anchored at the
   * start time). Defaults to 1 when omitted — keeps older tasks (which only had
   * `everyHour: true`) repeating every hour as before.
   */
  everyHourInterval?: number;
  /**
   * Duration in minutes of each hourly slot. When omitted each slot fills the
   * gap until the next one starts (or the cutoff / end-of-day).
   */
  everyHourDuration?: number;
}

/** A checklist item under a task. */
export interface Subtask {
  id: string;
  title: string;
}

export type Priority = "high" | "medium" | "low";

/** A user-defined label used to categorize tasks (Todoist-style). */
export interface Tag {
  id: string;
  label: string;
  /** Accent color (hex) for the tag chip. */
  color: string;
}

export interface Task {
  id: string;
  title: string;
  /** Global description (markdown). Shown on every occurrence. */
  description?: string;
  /** Global subtasks. Present on every occurrence of the task. */
  subtasks?: Subtask[];
  /** Hex/tailwind-friendly accent color used on the timeline block. */
  color: string;

  /** Priority level. Applies to both scheduled and unscheduled tasks. */
  priority?: Priority;

  /** Ids of the tags assigned to this task (see `Tag`). */
  tags?: string[];

  /** A single related URL, openable in a new tab from the task's detail. */
  link?: string;

  /**
   * Minutes from midnight, 0–1439. When null the task has no scheduled time —
   * it never appears on the timeline and is listed under "Sem horário" instead.
   */
  startMinute: number | null;
  /**
   * Minutes from midnight for the end. When null the task is open-ended and
   * must be finished manually (see `completedAt`). Always null when the task
   * has no start time.
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
  /** Per-task sound override for notifications. Falls back to global when undefined. */
  soundEnabled?: boolean;
  /** True when created via the live tracker (Toggl-style). Hides the done toggle. */
  tracked?: boolean;

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

/**
 * Skip record for an occurrence the user marked as "não feita / pulada".
 * Keyed in the skips store by `${occurrenceKey}` (same granularity as
 * completions). `reason` is an optional free-text explanation.
 */
export interface SkipRecord {
  reason?: string;
}

/**
 * A per-day override for a single occurrence of a (usually recurring) task,
 * keyed by `${taskId}:${dateKey}` in the overrides store. Lets the user add a
 * note or subtasks that apply only to that day, without touching the global
 * task. All fields optional — an empty override is the same as none.
 */
export interface DayOverride {
  /** Markdown note shown only on that day. */
  description?: string;
  /** Subtasks that exist only on that day. */
  subtasks?: Subtask[];
}

/**
 * The daily sleep window. Unlike tasks, sleep is a recurring *ambient* period
 * rendered as a distinct band on the timeline (never completable/skippable). It
 * crosses midnight, so on any given day it shows as up to two segments: the
 * morning tail (00:00 → wake) and the evening start (bedtime → 24:00).
 */
export interface SleepSchedule {
  enabled: boolean;
  /** Default bedtime (minutes from midnight). */
  bedtime: number;
  /** Default wake time (minutes from midnight). */
  wakeTime: number;
  /**
   * Per-weekday overrides. A weekday's entry gives the bedtime that *starts*
   * on that day (the wake time then falls on the following morning).
   */
  perDay?: Partial<Record<Weekday, { bedtime: number; wakeTime: number }>>;
}

export interface Settings {
  theme: "light" | "dark" | "system";
  /** Default minutes-before-start notification lead time. */
  notifyBeforeStart: number;
  /** Default minutes-before-end notification lead time. */
  notifyBeforeEnd: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  /**
   * Auto-stop the ringing alarm after this many seconds. 0 means no time
   * limit (rings until manually dismissed or the beep-count limit is hit).
   */
  alarmMaxSeconds: number;
  /**
   * Auto-stop the ringing alarm after this many beep bursts. 0 means no count
   * limit. The alarm stops at whichever limit (time or count) is reached first.
   */
  alarmMaxBeeps: number;
  /** Pomodoro durations in minutes. */
  pomodoroWork: number;
  pomodoroBreak: number;
  /** Optional daily sleep window shown as a distinct band on the timeline. */
  sleep: SleepSchedule;
}

/** A task resolved to a concrete interval on a specific day. */
export interface ResolvedOccurrence {
  task: Task;
  /** Stable key for this occurrence on this day. */
  key: string;
  date: string; // yyyy-MM-dd
  /**
   * Minutes from midnight. For unscheduled ("Sem horário") tasks this is -1 and
   * `scheduled` is false — such occurrences are never placed on the timeline.
   */
  startMinute: number;
  /** Effective end for layout: real end, manual completion, or end-of-day. */
  endMinute: number;
  /** True when endMinute is implied (open-ended, not yet finished). */
  openEnded: boolean;
  /** False for tasks without a start time (listed under "Sem horário"). */
  scheduled: boolean;
  completed: boolean;
  /** True when the occurrence was marked as skipped/not-done by the user. */
  skipped: boolean;
  /** Skip reason text, when skipped. */
  skipReason?: string;
  /** True when there's any description (global or this day's override). */
  hasDescription: boolean;
  /** True when there's any subtask (global or this day's override). */
  hasSubtasks: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  notifyBeforeStart: 5,
  notifyBeforeEnd: 5,
  notificationsEnabled: true,
  soundEnabled: true,
  alarmMaxSeconds: 180, // 3 minutes, matching the previous hard-coded limit
  alarmMaxBeeps: 0, // no count limit by default
  pomodoroWork: 25,
  pomodoroBreak: 5,
  sleep: {
    enabled: false,
    bedtime: 23 * 60, // 23:00
    wakeTime: 7 * 60, // 07:00
  },
};
