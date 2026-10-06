import type { OccurrenceState, ResolvedOccurrence, Task } from "../types";
import { hourlyInterval, isHourly, patternMatches, recurrenceFloor } from "./recurrence";
import { MINUTES_IN_DAY, addDaysKey, dateKey, dayKeyOfMs, minuteOfDay } from "./time";

export function backlogKey(taskId: string): string {
  return taskId;
}

export function dayOccKey(taskId: string, date: string): string {
  return `${taskId}:${date}`;
}

export function slotOccKey(taskId: string, date: string, hour: number): string {
  return `${taskId}:${date}:${hour}`;
}

export function isBacklog(task: Pick<Task, "startMinute" | "recurrence">): boolean {
  return task.startMinute === null && task.recurrence.kind === "once";
}

export interface TaskHistory {
  doneDates: Set<string>;
  lastDone?: string;
}

export type HistoryIndex = Map<string, TaskHistory>;

const indexCache = new WeakMap<Record<string, OccurrenceState>, HistoryIndex>();

/** Per-task completion dates, used by "afterDone" recurrences and habit stats. */
export function historyIndex(occurrences: Record<string, OccurrenceState>): HistoryIndex {
  const cached = indexCache.get(occurrences);
  if (cached) {
    return cached;
  }

  const index: HistoryIndex = new Map();
  for (const occ of Object.values(occurrences)) {
    if (occ.deletedAt || occ.status !== "done" || !occ.date) {
      continue;
    }

    let h = index.get(occ.taskId);
    if (!h) {
      h = { doneDates: new Set() };
      index.set(occ.taskId, h);
    }

    h.doneDates.add(occ.date);
    if (!h.lastDone || occ.date > h.lastDone) {
      h.lastDone = occ.date;
    }
  }

  indexCache.set(occurrences, index);
  return index;
}

/** Next due day of an "afterDone" task (last completion + N, or its start). */
export function afterDoneDue(task: Task, index: HistoryIndex): string {
  const n = Math.max(1, Math.floor(task.recurrence.interval ?? 1));
  const last = index.get(task.id)?.lastDone;
  const floor = recurrenceFloor(task);
  if (!last) {
    return floor;
  }

  const next = addDaysKey(last, n);
  return next < floor ? floor : next;
}

/**
 * Does the task have an occurrence on `key`? For "afterDone" the pending
 * occurrence moves forward to today while overdue, and past completions stay.
 */
export function occursOn(
  task: Task,
  key: string,
  todayKey: string,
  index: HistoryIndex,
): { occurs: boolean; overdue: boolean } {
  if (task.recurrence.kind !== "afterDone") {
    return { occurs: patternMatches(task, key), overdue: false };
  }

  if (task.recurrence.endDate && key > task.recurrence.endDate) {
    return { occurs: false, overdue: false };
  }

  if (index.get(task.id)?.doneDates.has(key)) {
    return { occurs: true, overdue: false };
  }

  const due = afterDoneDue(task, index);
  if (key === due && due >= todayKey) {
    return { occurs: true, overdue: false };
  }

  if (key === todayKey && due < todayKey) {
    return { occurs: true, overdue: true };
  }

  return { occurs: false, overdue: false };
}

interface ResolveInput {
  tasks: Task[];
  occurrences: Record<string, OccurrenceState>;
  day: Date;
  now: Date;
}

function live(state: OccurrenceState | undefined): OccurrenceState | undefined {
  return state && !state.deletedAt ? state : undefined;
}

/** Build the occurrence of a backlog item (visibility rules live in resolveDay). */
export function backlogOccurrence(
  task: Task,
  state: OccurrenceState | undefined,
  date: string,
  overdue = false,
): ResolvedOccurrence {
  const st = live(state);
  return {
    task,
    key: backlogKey(task.id),
    dayKey: backlogKey(task.id),
    date,
    title: st?.title ?? task.title,
    startMinute: -1,
    endMinute: -1,
    openEnded: false,
    scheduled: false,
    completed: st?.status === "done",
    skipped: st?.status === "skipped",
    skipReason: st?.skipReason,
    doneAt: st?.doneAt,
    overridden: false,
    overdue,
    hasDescription: Boolean(task.description?.trim() || st?.note?.trim()),
    hasSubtasks: Boolean(task.subtasks?.length || st?.subtasks?.length),
  };
}

/**
 * Resolve every task into the concrete occurrences that fall on `day`.
 * Hourly tasks expand into one occurrence per slot.
 */
export function resolveDay({ tasks, occurrences, day, now }: ResolveInput): ResolvedOccurrence[] {
  const key = dateKey(day);
  const todayKey = dateKey(now);
  const index = historyIndex(occurrences);
  const result: ResolvedOccurrence[] = [];

  for (const task of tasks) {
    if (task.deletedAt) {
      continue;
    }

    if (isBacklog(task)) {
      const state = live(occurrences[backlogKey(task.id)]);
      const createdKey = dateKey(new Date(task.createdAt));
      let show = false;
      let overdue = false;

      if (state?.status === "done") {
        show = dayKeyOfMs(state.doneAt ?? state.updatedAt) === key;
      } else if (state?.status === "skipped") {
        show = dayKeyOfMs(state.updatedAt) === key;
      } else if (task.date) {
        show = key === task.date;
        if (!show && key === todayKey && task.date < todayKey) {
          show = true;
          overdue = true;
        }
      } else {
        show = key >= todayKey && key >= createdKey;
      }

      if (!show) {
        continue;
      }

      result.push(backlogOccurrence(task, state, key, overdue));
      continue;
    }

    const { occurs, overdue } = occursOn(task, key, todayKey, index);
    if (!occurs) {
      continue;
    }

    const dayKey = dayOccKey(task.id, key);
    const dayState = live(occurrences[dayKey]);
    if (dayState?.removed) {
      continue;
    }

    const hasDescription = Boolean(task.description?.trim() || dayState?.note?.trim());
    const hasSubtasks = Boolean(task.subtasks?.length || dayState?.subtasks?.length);
    const title = dayState?.title ?? task.title;
    const startOverride = dayState?.startMinute;
    const start = startOverride ?? task.startMinute;

    const base = {
      task,
      dayKey,
      date: key,
      title,
      overdue,
      hasDescription,
      hasSubtasks,
    };

    if (start === null) {
      result.push({
        ...base,
        key: dayKey,
        startMinute: -1,
        endMinute: -1,
        openEnded: false,
        scheduled: false,
        completed: dayState?.status === "done",
        skipped: dayState?.status === "skipped",
        skipReason: dayState?.skipReason,
        doneAt: dayState?.doneAt,
        overridden: Boolean(dayState?.title),
      });
      continue;
    }

    if (isHourly(task.recurrence) && startOverride === undefined) {
      const offset = start % 60;
      const firstHour = Math.floor(start / 60);
      const interval = hourlyInterval(task.recurrence);
      const cutoff = task.endMinute ?? MINUTES_IN_DAY - 1;
      const slotDuration = task.recurrence.everyHourDuration ?? null;

      for (let hour = firstHour; hour < 24; hour += interval) {
        const slotStart = hour * 60 + offset;
        if (slotStart >= MINUTES_IN_DAY || slotStart > cutoff) {
          break;
        }

        const slotKey = slotOccKey(task.id, key, hour);
        const slotState = live(occurrences[slotKey]);
        if (slotState?.removed) {
          continue;
        }

        const slotEnd =
          slotDuration !== null
            ? Math.min(slotStart + slotDuration, MINUTES_IN_DAY)
            : Math.min((hour + interval) * 60 + offset, MINUTES_IN_DAY);

        result.push({
          ...base,
          key: slotKey,
          slot: hour,
          startMinute: slotStart,
          endMinute: slotEnd,
          openEnded: false,
          scheduled: true,
          completed: slotState?.status === "done",
          skipped: slotState?.status === "skipped",
          skipReason: slotState?.skipReason,
          doneAt: slotState?.doneAt,
          overridden: Boolean(dayState?.title),
        });
      }
      continue;
    }

    const end = dayState && dayState.endMinute !== undefined ? dayState.endMinute : task.endMinute;
    const completed = dayState?.status === "done";
    const openEnded = end === null;
    let endMinute: number;

    if (end !== null) {
      endMinute = Math.max(end, start + 1);
    } else if (completed && dayState?.doneAt && dayKeyOfMs(dayState.doneAt) === key) {
      endMinute = Math.max(minuteOfDay(dayState.doneAt), start + 1);
    } else {
      endMinute = MINUTES_IN_DAY;
    }

    result.push({
      ...base,
      key: dayKey,
      startMinute: start,
      endMinute,
      openEnded,
      scheduled: true,
      completed,
      skipped: dayState?.status === "skipped",
      skipReason: dayState?.skipReason,
      doneAt: dayState?.doneAt,
      overridden: startOverride !== undefined || dayState?.endMinute !== undefined || Boolean(dayState?.title),
    });
  }

  // On the task's creation day, hide slots that had already ended when it was created.
  const visible = key === todayKey
    ? result.filter((o) => {
        if (!o.scheduled || isHourly(o.task.recurrence)) {
          return true;
        }

        const created = new Date(o.task.createdAt);
        if (dateKey(created) !== key) {
          return true;
        }

        return o.endMinute > created.getHours() * 60 + created.getMinutes();
      })
    : result;

  return visible.sort((a, b) => a.startMinute - b.startMinute);
}

/** Scheduled "once" tasks from past days that were neither done nor skipped. */
export function overdueScheduled(
  tasks: Task[],
  occurrences: Record<string, OccurrenceState>,
  now: Date,
): Task[] {
  const todayKey = dateKey(now);
  return tasks.filter((t) => {
    if (t.deletedAt || t.startMinute === null || t.recurrence.kind !== "once") {
      return false;
    }

    if (!t.date || t.date >= todayKey) {
      return false;
    }

    const state = live(occurrences[dayOccKey(t.id, t.date)]);
    return !state?.status && !state?.removed;
  });
}

/** Backlog items whose due date already passed. */
export function overdueBacklog(
  tasks: Task[],
  occurrences: Record<string, OccurrenceState>,
  now: Date,
): Task[] {
  const todayKey = dateKey(now);
  return tasks.filter((t) => {
    if (t.deletedAt || !isBacklog(t) || !t.date || t.date >= todayKey) {
      return false;
    }

    return !live(occurrences[backlogKey(t.id)])?.status;
  });
}

/** Nearest day (today or later, else the last one) the task occurs on. */
export function nextOccurrenceDate(task: Task, todayKey: string, occurrences: Record<string, OccurrenceState>): string {
  if (isBacklog(task)) {
    return todayKey;
  }

  if (task.recurrence.kind === "once") {
    return task.date ?? todayKey;
  }

  if (task.recurrence.kind === "afterDone") {
    const due = afterDoneDue(task, historyIndex(occurrences));
    return due < todayKey ? todayKey : due;
  }

  for (let i = 0; i < 400; i++) {
    const key = addDaysKey(todayKey, i);
    if (patternMatches(task, key)) {
      return key;
    }
  }

  return task.recurrence.endDate ?? todayKey;
}
