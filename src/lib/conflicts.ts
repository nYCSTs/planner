import type { Task } from "@/types";
import { intervalsOverlap, recurrenceWeekdays } from "./time";

/**
 * Two tasks can share at least one active day if their recurrence patterns
 * intersect. "once" tasks compare by their explicit date.
 */
function sharesActiveDay(a: Task, b: Task): boolean {
  const aOnce = a.recurrence.kind === "once";
  const bOnce = b.recurrence.kind === "once";

  if (aOnce && bOnce) return a.date === b.date;
  if (aOnce !== bOnce) {
    // One dated, one recurring: check the dated task's weekday against pattern.
    const once = aOnce ? a : b;
    const recurring = aOnce ? b : a;
    if (!once.date) return false;
    const weekday = new Date(once.date + "T00:00:00").getDay();
    return recurrenceWeekdays(recurring.recurrence).includes(weekday as never);
  }

  // Both recurring: any weekday overlap.
  const aDays = recurrenceWeekdays(a.recurrence);
  const bDays = recurrenceWeekdays(b.recurrence);
  return aDays.some((d) => bDays.includes(d));
}

/**
 * Find tasks that conflict (overlapping time on a shared day) with a candidate.
 * Hourly tasks are intentionally ignored as conflict sources — they're the
 * "interrupting" kind meant to overlay other work (e.g. the hourly review).
 */
export function findConflicts(
  candidate: Pick<Task, "startMinute" | "endMinute" | "recurrence" | "date">,
  existing: Task[],
  ignoreId?: string,
): Task[] {
  return existing.filter((task) => {
    if (task.id === ignoreId) return false;
    if (task.recurrence.kind === "hourly") return false;
    if (candidate.recurrence.kind === "hourly") return false;
    if (!sharesActiveDay(task, candidate as Task)) return false;
    return intervalsOverlap(
      candidate.startMinute,
      candidate.endMinute,
      task.startMinute,
      task.endMinute,
    );
  });
}
