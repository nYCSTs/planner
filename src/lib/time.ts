import { format, parse } from "date-fns";
import type {
  DayOverride,
  Task,
  Recurrence,
  ResolvedOccurrence,
  Weekday,
} from "@/types";

export const MINUTES_IN_DAY = 24 * 60;

/** yyyy-MM-dd key for a Date. */
export function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateKey(key: string): Date {
  return parse(key, "yyyy-MM-dd", new Date());
}

/** "HH:mm" -> minutes from midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** minutes from midnight -> "HH:mm". */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_IN_DAY - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function nowMinutes(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Does this task repeat on an hourly cadence? */
export function isHourly(rec: Recurrence): boolean {
  return rec.everyHour === true;
}

/** Step in hours between hourly repeats (defaults to 1, always >= 1). */
export function hourlyInterval(rec: Recurrence): number {
  const n = rec.everyHourInterval ?? 1;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Whether a recurrence pattern is active on the given weekday. */
function recurrenceMatchesWeekday(rec: Recurrence, weekday: Weekday): boolean {
  switch (rec.kind) {
    case "everyday":
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekends":
      return weekday === 0 || weekday === 6;
    case "custom":
      return rec.weekdays?.includes(weekday) ?? false;
    case "once":
      return false; // handled separately by date
  }
}

/** Does this task have an occurrence on the given day? */
function taskOccursOn(task: Task, day: Date): boolean {
  const key = dateKey(day);
  if (task.recurrence.kind === "once") {
    return task.date === key;
  }
  return recurrenceMatchesWeekday(task.recurrence, day.getDay() as Weekday);
}

/**
 * Resolve every task into the concrete occurrences that fall on `day`.
 * Hourly tasks expand into one occurrence per hour. Open-ended tasks get an
 * effective end (manual completion minute, or end-of-day for layout).
 *
 * When `now` is passed and falls on `day`, tasks flagged `hideElapsed` drop
 * occurrences whose end has already passed (only applies to the current day).
 */
export function resolveOccurrences(
  tasks: Task[],
  day: Date,
  completions: Record<string, number>, // key `${taskId}:${dateKey}` -> completedAtMinute
  now?: Date,
  overrides: Record<string, DayOverride> = {}, // key `${taskId}:${dateKey}`
): ResolvedOccurrence[] {
  const key = dateKey(day);
  const isCurrentDay = now !== undefined && dateKey(now) === key;
  const currentMinute = isCurrentDay ? nowMinutes(now) : 0;
  const result: ResolvedOccurrence[] = [];

  for (const task of tasks) {
    if (!taskOccursOn(task, day)) continue;

    const override = overrides[`${task.id}:${key}`];
    const hasDescription = Boolean(
      task.description?.trim() || override?.description?.trim(),
    );
    const hasSubtasks = Boolean(
      (task.subtasks?.length ?? 0) > 0 || (override?.subtasks?.length ?? 0) > 0,
    );

    // Unscheduled task: no time, never on the timeline. Resolves once per day so
    // it can be listed and completed per day under "Sem horário".
    if (task.startMinute === null) {
      const completionKey = `${task.id}:${key}`;
      result.push({
        task,
        key: completionKey,
        date: key,
        startMinute: -1,
        endMinute: -1,
        openEnded: false,
        scheduled: false,
        completed: completions[completionKey] !== undefined,
        hasDescription,
        hasSubtasks,
      });
      continue;
    }

    if (isHourly(task.recurrence)) {
      // The task starts at startMinute and repeats every `interval` hours from
      // there until end of day, anchored at the start time. Both the hour and
      // minute of startMinute are honored. Each slot is completed independently,
      // keyed by the occurrence's own key.
      const offset = task.startMinute % 60;
      const firstHour = Math.floor(task.startMinute / 60);
      const interval = hourlyInterval(task.recurrence);
      const duration =
        task.endMinute !== null
          ? Math.max(1, task.endMinute - task.startMinute)
          : null;

      for (let hour = firstHour; hour < 24; hour += interval) {
        const start = hour * 60 + offset;
        if (start >= MINUTES_IN_DAY) break;
        const occKey = `${task.id}:${key}:${hour}`;
        const doneAt = completions[occKey];
        const done = doneAt !== undefined;
        const baseEnd =
          duration !== null
            ? Math.min(MINUTES_IN_DAY, start + duration)
            : Math.min(MINUTES_IN_DAY, (hour + interval) * 60 + offset);
        result.push({
          task,
          key: occKey,
          date: key,
          startMinute: start,
          endMinute: duration === null && done ? doneAt : baseEnd,
          openEnded: duration === null,
          scheduled: true,
          completed: done,
          hasDescription,
          hasSubtasks,
        });
      }
      continue;
    }

    const completionKey = `${task.id}:${key}`;
    const completedAt = completions[completionKey];
    const isCompleted = completedAt !== undefined;

    const openEnded = task.endMinute === null;
    let endMinute: number;
    if (openEnded) {
      endMinute = isCompleted ? completedAt : MINUTES_IN_DAY;
    } else {
      endMinute = task.endMinute as number;
    }

    result.push({
      task,
      key: `${task.id}:${key}`,
      date: key,
      startMinute: task.startMinute,
      endMinute,
      openEnded,
      scheduled: true,
      completed: isCompleted,
      hasDescription,
      hasSubtasks,
    });
  }

  // Hide occurrences whose end has already passed today (per-task opt-in).
  // Hourly tasks are never hidden this way — each slot is an independent
  // occurrence and elapsed slots should remain visible (pending or late).
  const visible = isCurrentDay
    ? result.filter(
        (o) =>
          !(
            o.scheduled &&
            o.task.hideElapsed &&
            !isHourly(o.task.recurrence) &&
            o.endMinute <= currentMinute
          ),
      )
    : result;

  return visible.sort((a, b) => a.startMinute - b.startMinute);
}

/** Do two [start, end) intervals overlap? */
export function intervalsOverlap(
  aStart: number,
  aEnd: number | null,
  bStart: number,
  bEnd: number | null,
): boolean {
  const ae = aEnd ?? MINUTES_IN_DAY;
  const be = bEnd ?? MINUTES_IN_DAY;
  return aStart < be && bStart < ae;
}

const RECURRENCE_DAYS: Record<string, Weekday[]> = {
  everyday: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
};

/** Weekdays a recurrence applies to (for conflict detection across patterns). */
export function recurrenceWeekdays(rec: Recurrence): Weekday[] {
  if (rec.kind === "custom") return rec.weekdays ?? [];
  if (rec.kind === "once") return [];
  return RECURRENCE_DAYS[rec.kind] ?? [];
}
