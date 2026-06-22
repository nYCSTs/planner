import type { ResolvedOccurrence } from "@/types";

export interface ActiveState {
  /** The task the user should be doing right now (overlay wins). */
  active: ResolvedOccurrence | null;
  /** A task running but currently paused by `active` overlapping it. */
  pausedBy: ResolvedOccurrence | null;
  paused: ResolvedOccurrence | null;
}

/**
 * Determine what's active at `minute`. Interrupting ("hourly", or any block
 * fully nested inside another) tasks take priority and visually pause the
 * longer task they sit on top of, modeling the "pause my project while I do
 * the review" flow.
 */
export function activeAt(
  occurrences: ResolvedOccurrence[],
  minute: number,
): ActiveState {
  const running = occurrences.filter(
    (o) => minute >= o.startMinute && minute < o.endMinute && !o.completed,
  );
  if (running.length === 0) return { active: null, pausedBy: null, paused: null };
  if (running.length === 1) {
    return { active: running[0], pausedBy: null, paused: null };
  }

  // Multiple running: the interrupting one (hourly first, else shortest) wins.
  const sorted = [...running].sort((a, b) => {
    const aInt = a.task.recurrence.kind === "hourly" ? 0 : 1;
    const bInt = b.task.recurrence.kind === "hourly" ? 0 : 1;
    if (aInt !== bInt) return aInt - bInt;
    return a.endMinute - a.startMinute - (b.endMinute - b.startMinute);
  });

  const active = sorted[0];
  // The paused task is the longest other running task (the background work).
  const paused = sorted
    .slice(1)
    .sort((a, b) => b.endMinute - b.startMinute - (a.endMinute - a.startMinute))[0];

  return { active, pausedBy: active, paused: paused ?? null };
}
