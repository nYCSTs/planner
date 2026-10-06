import {
  DEFAULT_SYNCED_SETTINGS,
  type OccurrenceState,
  type Recurrence,
  type Subtask,
  type SyncedSettings,
  type Tag,
  type Task,
  type TimeEntry,
} from "@/types";
import { MINUTES_IN_DAY, dateKey, msAt } from "@/lib/time";
import type { RecordRef } from "./store";

/** Shape of the pre-v4 data (localStorage keys / backup files version ≤ 3). */
export interface LegacyData {
  tasks: LegacyTask[];
  settings?: Partial<SyncedSettings> & Record<string, unknown>;
  completions?: Record<string, number>;
  overrides?: Record<string, { description?: string; subtasks?: Subtask[] }>;
  subtaskDone?: Record<string, boolean>;
  skips?: Record<string, { reason?: string }>;
  tags?: { id: string; label: string; color: string }[];
}

interface LegacyTask {
  id: string;
  title: string;
  description?: string;
  subtasks?: Subtask[];
  color: string;
  priority?: Task["priority"];
  tags?: string[];
  link?: string;
  startMinute: number | null;
  endMinute: number | null;
  recurrence: Recurrence;
  date?: string;
  notifyBeforeStart?: number;
  notifyBeforeEnd?: number;
  soundEnabled?: boolean;
  tracked?: boolean;
  createdAt: string;
}

const LEGACY_KEYS = {
  tasks: "planner.tasks",
  settings: "planner.settings",
  completions: "planner.completions",
  overrides: "planner.overrides",
  subtaskDone: "planner.subtaskDone",
  skips: "planner.skips",
  tags: "planner.tags",
} as const;

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function readLegacyStorage(): LegacyData | null {
  const tasks = readJson<LegacyTask[]>(LEGACY_KEYS.tasks);
  if (!Array.isArray(tasks)) {
    return null;
  }

  return {
    tasks,
    settings: readJson(LEGACY_KEYS.settings),
    completions: readJson(LEGACY_KEYS.completions),
    overrides: readJson(LEGACY_KEYS.overrides),
    subtaskDone: readJson(LEGACY_KEYS.subtaskDone),
    skips: readJson(LEGACY_KEYS.skips),
    tags: readJson(LEGACY_KEYS.tags),
  };
}

const SYNCED_KEYS: (keyof SyncedSettings)[] = [
  "notifyBeforeStart",
  "notifyBeforeEnd",
  "pomodoroWork",
  "pomodoroBreak",
  "sleep",
];

function checklist(subtasks: Subtask[] | undefined, done: (id: string) => boolean): string {
  return (subtasks ?? []).map((s) => `- [${done(s.id) ? "x" : " "}] ${s.title}`).join("\n");
}

/** Convert pre-v4 data into v4 records. */
export function migrateLegacy(legacy: LegacyData): RecordRef[] {
  const now = Date.now();
  const todayKey = dateKey(new Date());
  const out: RecordRef[] = [];
  const occ = new Map<string, OccurrenceState>();
  const tasksById = new Map<string, LegacyTask>();
  const subtaskOwner = new Map<string, string>();

  for (const t of legacy.tasks) {
    tasksById.set(t.id, t);
    for (const s of t.subtasks ?? []) {
      subtaskOwner.set(s.id, t.id);
    }
  }

  for (const [key, ov] of Object.entries(legacy.overrides ?? {})) {
    const taskId = key.split(":")[0];
    for (const s of ov.subtasks ?? []) {
      subtaskOwner.set(s.id, taskId);
    }
  }

  const isBacklog = (t: LegacyTask) => t.startMinute === null && t.recurrence.kind === "once";

  const touch = (key: string, taskId: string, date?: string, slot?: number) => {
    let rec = occ.get(key);
    if (!rec) {
      rec = { id: key, taskId, date, slot, updatedAt: now };
      occ.set(key, rec);
    }

    return rec;
  };

  for (const t of legacy.tags ?? []) {
    out.push({ c: "tags", record: { ...t, updatedAt: now } as Tag });
  }

  const tracked = legacy.tasks.filter((t) => t.tracked && t.startMinute !== null && t.date);
  const latestOpen = tracked
    .filter((t) => t.endMinute === null && t.date === todayKey)
    .sort((a, b) => (b.startMinute ?? 0) - (a.startMinute ?? 0))[0];

  for (const t of legacy.tasks) {
    if (t.tracked) {
      if (t.startMinute === null || !t.date) {
        continue;
      }

      const start = msAt(t.date, t.startMinute);
      let end: number | null;
      if (t.endMinute !== null) {
        const endDay = t.endMinute < t.startMinute ? 1 : 0;
        end = msAt(t.date, t.endMinute + endDay * MINUTES_IN_DAY);
      } else {
        end = t === latestOpen ? null : start + 60_000;
      }

      const doneKeys = legacy.subtaskDone ?? {};
      const note = [
        t.endMinute === null && t !== latestOpen ? "Fim não registrado (cronômetro interrompido). Ajuste o término." : undefined,
        t.description?.trim(),
        checklist(t.subtasks, (id) => Boolean(doneKeys[`${id}:${t.date}`])),
      ]
        .filter(Boolean)
        .join("\n\n");

      const entry: TimeEntry = {
        id: t.id,
        title: t.title,
        color: t.color,
        tags: t.tags,
        note: note || undefined,
        start,
        end,
        updatedAt: now,
      };
      out.push({ c: "entries", record: entry });
      continue;
    }

    const task: Task = {
      id: t.id,
      title: t.title,
      description: t.description,
      subtasks: t.subtasks,
      color: t.color,
      priority: t.priority,
      tags: t.tags,
      link: t.link,
      startMinute: t.startMinute,
      endMinute: t.startMinute === null ? null : t.endMinute,
      recurrence: t.recurrence,
      date: t.recurrence.kind === "once" && t.startMinute !== null ? t.date : undefined,
      notifyBeforeStart: t.notifyBeforeStart,
      notifyBeforeEnd: t.notifyBeforeEnd,
      soundEnabled: t.soundEnabled ?? legacy.settings?.soundEnabled !== false,
      createdAt: t.createdAt,
      updatedAt: now,
    };
    out.push({ c: "tasks", record: task });
  }

  const parseKey = (key: string) => {
    const [taskId, date, hour] = key.split(":");
    return { taskId, date, slot: hour !== undefined ? Number(hour) : undefined };
  };

  for (const [key, value] of Object.entries(legacy.completions ?? {})) {
    const { taskId, date, slot } = parseKey(key);
    const task = tasksById.get(taskId);
    if (!task || task.tracked) {
      continue;
    }

    const rec = touch(key, taskId, date, slot);
    rec.status = "done";
    if (value > 100_000_000_000) {
      rec.doneAt = value;
    } else if (date) {
      rec.doneAt = msAt(date, value);
    }
  }

  for (const [key, skip] of Object.entries(legacy.skips ?? {})) {
    const { taskId, date, slot } = parseKey(key);
    const task = tasksById.get(taskId);
    if (!task || task.tracked) {
      continue;
    }

    const rec = touch(key, taskId, date, slot);
    if (rec.status !== "done") {
      rec.status = "skipped";
      rec.skipReason = skip.reason;
    }
  }

  for (const [key, ov] of Object.entries(legacy.overrides ?? {})) {
    const { taskId, date } = parseKey(key);
    const task = tasksById.get(taskId);
    if (!task || task.tracked) {
      continue;
    }

    const target = isBacklog(task) ? touch(taskId, taskId) : touch(key, taskId, date);
    if (ov.description?.trim()) {
      target.note = ov.description;
    }

    if (ov.subtasks?.length) {
      target.subtasks = [...(target.subtasks ?? []), ...ov.subtasks];
    }
  }

  for (const [key, isDone] of Object.entries(legacy.subtaskDone ?? {})) {
    if (!isDone) {
      continue;
    }

    const [subId, date] = key.split(":");
    const taskId = subtaskOwner.get(subId);
    const task = taskId ? tasksById.get(taskId) : undefined;
    if (!task || !taskId || task.tracked) {
      continue;
    }

    const target = isBacklog(task) ? touch(taskId, taskId) : touch(`${taskId}:${date}`, taskId, date);
    const list = new Set(target.subtaskDone ?? []);
    list.add(subId);
    target.subtaskDone = [...list];
  }

  for (const rec of occ.values()) {
    out.push({ c: "occurrences", record: rec });
  }

  if (legacy.settings) {
    const synced = { ...DEFAULT_SYNCED_SETTINGS } as SyncedSettings;
    for (const k of SYNCED_KEYS) {
      if (legacy.settings[k] !== undefined) {
        (synced as unknown as Record<string, unknown>)[k] = legacy.settings[k];
      }
    }

    out.push({ c: "settings", record: { id: "settings", ...synced, updatedAt: now } });
  }

  return out;
}
