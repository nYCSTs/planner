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
  // Unscheduled tasks appear on every day regardless of their creation date.
  if (task.startMinute === null) return true;
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

    // Unscheduled task: appears on every day with a global completion key
    // (no date suffix) so marking done on any day persists everywhere.
    if (task.startMinute === null) {
      const completionKey = task.id;
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
      // endMinute on hourly tasks is an inclusive cutoff — the last slot may
      // START exactly at cutoff; no slot may start AFTER it.
      // When absent the task repeats until end of day.
      const offset = task.startMinute % 60;
      const firstHour = Math.floor(task.startMinute / 60);
      const interval = hourlyInterval(task.recurrence);
      const cutoff = task.endMinute ?? MINUTES_IN_DAY - 1;
      // Per-slot duration in minutes (optional). When absent each slot fills
      // the gap to the next slot start (capped at cutoff / end of day).
      const slotDuration = task.recurrence.everyHourDuration ?? null;

      for (let hour = firstHour; hour < 24; hour += interval) {
        const start = hour * 60 + offset;
        if (start >= MINUTES_IN_DAY) break;
        if (start > cutoff) break; // strictly after cutoff — stop
        const occKey = `${task.id}:${key}:${hour}`;
        const doneAt = completions[occKey];
        const done = doneAt !== undefined;
        const slotEnd = slotDuration !== null
          ? Math.min(start + slotDuration, MINUTES_IN_DAY)
          : Math.min((hour + interval) * 60 + offset, MINUTES_IN_DAY);
        result.push({
          task,
          key: occKey,
          date: key,
          startMinute: start,
          endMinute: done ? doneAt : slotEnd,
          openEnded: false,
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

  // Hide occurrences that ended before the relevant cutoff minute (opt-in).
  // Hourly tasks are exempt — each slot is independent and should stay visible.
  // Cutoff logic:
  //   - On the task's creation day: use the task's creation minute, so slots
  //     that had already ended when the task was created don't appear.
  //   - On any other current day: use the current minute (hide elapsed slots).
  const visible = isCurrentDay
    ? result.filter((o) => {
        if (!o.scheduled || !o.task.hideElapsed || isHourly(o.task.recurrence))
          return true;
        const createdDate = new Date(o.task.createdAt);
        const isCreationDay = dateKey(createdDate) === key;
        const cutoff = isCreationDay
          ? createdDate.getHours() * 60 + createdDate.getMinutes()
          : currentMinute;
        return o.endMinute > cutoff;
      })
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
