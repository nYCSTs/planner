// Domain model for the planner (schema v4).

/** Days of week, 0 = Sunday ... 6 = Saturday (matches JS Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RecurrenceKind =
  | "once" // a single dated occurrence (or a backlog item when unscheduled)
  | "everyday"
  | "weekdays" // Mon–Fri
  | "weekends" // Sat–Sun
  | "custom" // an explicit set of weekdays
  | "interval" // every N days / weeks
  | "monthly" // every N months, by day of month or nth weekday (anchored at startDate)
  | "yearly" // same day every year (anchored at startDate)
  | "afterDone"; // N days after the last completion

export interface Recurrence {
  kind: RecurrenceKind;
  weekdays?: Weekday[];
  /** yyyy-MM-dd the recurrence starts on (also the anchor for interval/monthly/yearly). */
  startDate?: string;
  /** yyyy-MM-dd the recurrence ends on (inclusive). */
  endDate?: string;
  interval?: number;
  unit?: "day" | "week";
  monthlyBy?: "day" | "weekday";
  everyHour?: boolean;
  everyHourInterval?: number;
  everyHourDuration?: number;
}

export interface Subtask {
  id: string;
  title: string;
}

export type Priority = "high" | "medium" | "low";

/** Fields every synced record carries. */
export interface SyncMeta {
  id: string;
  /** ms epoch of the last local change (last-writer-wins on sync). */
  updatedAt: number;
  /** ms epoch when soft-deleted; tombstones are kept so deletions sync. */
  deletedAt?: number | null;
}

export interface Tag extends SyncMeta {
  label: string;
  color: string;
}

export interface Project extends SyncMeta {
  name: string;
  color: string;
  archived?: boolean;
}

export interface Task extends SyncMeta {
  title: string;
  description?: string;
  subtasks?: Subtask[];
  color: string;
  priority?: Priority;
  tags?: string[];
  projectId?: string;
  link?: string;
  /** Minutes from midnight; null = no scheduled time ("Sem horário"). */
  startMinute: number | null;
  /** Minutes from midnight; null = open-ended (finished manually). */
  endMinute: number | null;
  recurrence: Recurrence;
  /** "once" tasks: the day it lives on. Unscheduled "once": optional due date. */
  date?: string;
  notifyBeforeStart?: number;
  notifyBeforeEnd?: number;
  soundEnabled?: boolean;
  /** Tasks split from the same series share it (keeps habit history continuous). */
  seriesId?: string;
  createdAt: string;
}

/**
 * State of one occurrence, keyed by occurrence key:
 * - `${taskId}` for backlog items (unscheduled "once")
 * - `${taskId}:${date}` for a day
 * - `${taskId}:${date}:${hour}` for an hourly slot (status only)
 */
export interface OccurrenceState extends SyncMeta {
  taskId: string;
  date?: string;
  slot?: number;
  status?: "done" | "skipped";
  /** ms epoch when marked done. */
  doneAt?: number;
  skipReason?: string;
  /** Occurrence removed only on this day (series continues). */
  removed?: boolean;
  /** "Só este dia" overrides. */
  title?: string;
  startMinute?: number;
  endMinute?: number | null;
  note?: string;
  subtasks?: Subtask[];
  subtaskDone?: string[];
}

export interface TimeEntry extends SyncMeta {
  title: string;
  taskId?: string;
  /** Occurrence the entry was tracked against (for planned vs real). */
  occurrenceKey?: string;
  projectId?: string;
  tags?: string[];
  color?: string;
  note?: string;
  /** ms epoch. */
  start: number;
  /** ms epoch; null while running. */
  end: number | null;
}

export interface SleepSchedule {
  enabled: boolean;
  bedtime: number;
  wakeTime: number;
  /** Per-weekday overrides: the bedtime that starts on that day. */
  perDay?: Partial<Record<Weekday, { bedtime: number; wakeTime: number }>>;
}

/** Settings shared across synced devices. */
export interface SyncedSettings {
  notifyBeforeStart: number;
  notifyBeforeEnd: number;
  pomodoroWork: number;
  pomodoroBreak: number;
  sleep: SleepSchedule;
  /** IANA time zone, used by the server to schedule push notifications. */
  timeZone?: string;
}

export interface SettingsRecord extends SyncMeta, SyncedSettings {}

/** Per-device preferences (kept in localStorage, never synced). */
export interface DevicePrefs {
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  /** Auto-stop the alarm after N seconds (0 = no limit). */
  alarmMaxSeconds: number;
  /** Auto-stop the alarm after N bursts (0 = no limit). */
  alarmMaxBeeps: number;
  /** Show the "Realizado" lane on the day timeline. */
  showTracked: boolean;
}

export type Settings = SyncedSettings & DevicePrefs;

export interface Collections {
  tasks: Task;
  occurrences: OccurrenceState;
  entries: TimeEntry;
  tags: Tag;
  projects: Project;
  settings: SettingsRecord;
}

export type CollectionName = keyof Collections;

export const COLLECTIONS: CollectionName[] = [
  "tasks",
  "occurrences",
  "entries",
  "tags",
  "projects",
  "settings",
];

/** A task resolved to a concrete occurrence on a specific day. */
export interface ResolvedOccurrence {
  task: Task;
  /** Occurrence key (status record id). */
  key: string;
  /** Key of the record that holds the day's note/subtasks (differs for hourly slots). */
  dayKey: string;
  date: string;
  title: string;
  /** Minutes from midnight; -1 when unscheduled. */
  startMinute: number;
  endMinute: number;
  openEnded: boolean;
  scheduled: boolean;
  completed: boolean;
  skipped: boolean;
  skipReason?: string;
  doneAt?: number;
  /** Time or title changed only on this day. */
  overridden: boolean;
  /** Pending and past its day (shown again on today). */
  overdue: boolean;
  hasDescription: boolean;
  hasSubtasks: boolean;
  /** Hour of the slot for hourly tasks. */
  slot?: number;
}

export const DEFAULT_SYNCED_SETTINGS: SyncedSettings = {
  notifyBeforeStart: 5,
  notifyBeforeEnd: 5,
  pomodoroWork: 25,
  pomodoroBreak: 5,
  sleep: {
    enabled: false,
    bedtime: 23 * 60,
    wakeTime: 7 * 60,
  },
};

export const DEFAULT_DEVICE_PREFS: DevicePrefs = {
  theme: "system",
  notificationsEnabled: true,
  soundEnabled: true,
  alarmMaxSeconds: 180,
  alarmMaxBeeps: 0,
  showTracked: true,
};

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_SYNCED_SETTINGS,
  ...DEFAULT_DEVICE_PREFS,
};
