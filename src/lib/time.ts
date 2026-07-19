import { format, parse } from "date-fns";
import type {
  DayOverride,
  SleepSchedule,
  Task,
  Recurrence,
  ResolvedOccurrence,
  SkipRecord,
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

  // Unscheduled "once" tasks are a persistent backlog: they show on every day
  // until completed, regardless of when they were created.
  if (task.startMinute === null && task.recurrence.kind === "once") return true;

  if (task.recurrence.kind === "once") {
    return task.date === key;
  }
  // Recurring tasks (scheduled or not) follow their weekday pattern within the
  // recurrence window: explicit startDate when set, otherwise the creation day
  // (so a recurring task can be scheduled to *begin* on a future date).
  const floor = task.recurrence.startDate ?? dateKey(new Date(task.createdAt));
  if (key < floor) return false;
  // Optional inclusive end of the recurrence window.
  if (task.recurrence.endDate && key > task.recurrence.endDate) return false;
  return recurrenceMatchesWeekday(task.recurrence, day.getDay() as Weekday);
}

/**
 * Resolve every task into the concrete occurrences that fall on `day`.
 * Hourly tasks expand into one occurrence per hour. Open-ended tasks get an
 * effective end (manual completion minute, or end-of-day for layout).
 *
 * When `now` is passed and falls on `day`, occurrences whose end has already
 * passed are hidden (only applies to the current day; hourly tasks are exempt).
 */
export function resolveOccurrences(
  tasks: Task[],
  day: Date,
  completions: Record<string, number>, // key `${taskId}:${dateKey}` -> completedAtMinute
  now?: Date,
  overrides: Record<string, DayOverride> = {}, // key `${taskId}:${dateKey}`
  skips: Record<string, SkipRecord> = {}, // key = occurrence key
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

    // Unscheduled task. Two flavours:
    //  - "once" (backlog): a global completion key (no date) so marking it done
    //    on any day persists everywhere — it's a single thing to do someday.
    //  - recurring (a habit/chore with no time): a per-day key so each day is
    //    tracked independently (done today ≠ done tomorrow).
    if (task.startMinute === null) {
      const recurringUnscheduled = task.recurrence.kind !== "once";
      const completionKey = recurringUnscheduled ? `${task.id}:${key}` : task.id;
      const skipRec = skips[completionKey];
      result.push({
        task,
        key: completionKey,
        date: key,
        startMinute: -1,
        endMinute: -1,
        openEnded: false,
        scheduled: false,
        completed: completions[completionKey] !== undefined,
        skipped: skipRec !== undefined,
        skipReason: skipRec?.reason,
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
        const skipRec = skips[occKey];
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
          skipped: skipRec !== undefined,
          skipReason: skipRec?.reason,
          hasDescription,
          hasSubtasks,
        });
      }
      continue;
    }

    const completionKey = `${task.id}:${key}`;
    const completedAt = completions[completionKey];
    const isCompleted = completedAt !== undefined;
    const skipRec = skips[completionKey];

    const openEnded = task.endMinute === null;
    let endMinute: number;
    if (openEnded) {
      endMinute = isCompleted ? completedAt : MINUTES_IN_DAY;
    } else {
      endMinute = task.endMinute as number;
    }

    result.push({
      task,
      key: completionKey,
      date: key,
      startMinute: task.startMinute,
      endMinute,
      openEnded,
      scheduled: true,
      completed: isCompleted,
      skipped: skipRec !== undefined,
      skipReason: skipRec?.reason,
      hasDescription,
      hasSubtasks,
    });
  }

  // On the task's creation day, hide slots that had already ended when the
  // task was created (so you don't see "stale" past slots on first setup).
  // Hourly tasks are exempt. On all other days nothing is hidden.
  const visible = isCurrentDay
    ? result.filter((o) => {
        if (!o.scheduled || isHourly(o.task.recurrence)) return true;
        const createdDate = new Date(o.task.createdAt);
        if (dateKey(createdDate) !== key) return true; // not creation day → always show
        const creationCutoff = createdDate.getHours() * 60 + createdDate.getMinutes();
        return o.endMinute > creationCutoff;
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

/** The bedtime/wake pair that *starts* on the given weekday. */
export function sleepForWeekday(
  sleep: SleepSchedule,
  weekday: Weekday,
): { bedtime: number; wakeTime: number } {
  return (
    sleep.perDay?.[weekday] ?? { bedtime: sleep.bedtime, wakeTime: sleep.wakeTime }
  );
}

/** A sleep band segment to draw on the timeline for a given day (minutes). */
export interface SleepSegment {
  startMinute: number;
  endMinute: number;
  /** "evening" = tonight's sleep starting; "morning" = last night's tail. */
  part: "evening" | "morning";
}

/**
 * Compute the sleep band segment(s) visible on `day`. Sleep crosses midnight,
 * so a day shows the morning tail of the previous night's sleep (00:00 → wake)
 * and the start of tonight's sleep (bedtime → 24:00). When bedtime < wakeTime
 * (a daytime nap-style window that doesn't cross midnight) a single segment is
 * returned instead.
 */
export function sleepSegments(sleep: SleepSchedule, day: Date): SleepSegment[] {
  if (!sleep.enabled) return [];
  const weekday = day.getDay() as Weekday;
  const today = sleepForWeekday(sleep, weekday);
  const segments: SleepSegment[] = [];

  // Tonight's sleep starts at bedtime.
  if (today.bedtime < today.wakeTime) {
    // Window doesn't cross midnight — a single same-day band.
    segments.push({ startMinute: today.bedtime, endMinute: today.wakeTime, part: "evening" });
    return segments;
  }

  // Evening: bedtime → end of day.
  if (today.bedtime < MINUTES_IN_DAY) {
    segments.push({ startMinute: today.bedtime, endMinute: MINUTES_IN_DAY, part: "evening" });
  }

  // Morning: 00:00 → wake, using the *previous* day's window (that's the night
  // that is ending this morning).
  const prevWeekday = ((weekday + 6) % 7) as Weekday;
  const prev = sleepForWeekday(sleep, prevWeekday);
  if (prev.bedtime >= prev.wakeTime && prev.wakeTime > 0) {
    segments.push({ startMinute: 0, endMinute: prev.wakeTime, part: "morning" });
  }

  return segments;
}
