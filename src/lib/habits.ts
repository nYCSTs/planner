import type { OccurrenceState, Task } from "../types";
import { resolveDay } from "./occurrences";
import { addDaysKey, dayFromKey } from "./time";

export type DayStatus = "done" | "partial" | "skipped" | "missed" | "pending" | "future" | "none";

export interface HistoryCell {
  date: string;
  status: DayStatus;
  /** Fraction of slots done (hourly tasks). */
  ratio: number;
}

export interface HabitStats {
  cells: HistoryCell[];
  streak: number;
  best: number;
  /** Done / (done + missed) over the last 30 days, 0–1, or null without data. */
  rate30: number | null;
  done: number;
  missed: number;
}

/** All tasks of the same series (split edits keep the history together). */
export function seriesOf(task: Task, all: Task[]): Task[] {
  const root = task.seriesId ?? task.id;
  return all.filter((t) => t.id === root || t.seriesId === root);
}

function statusOn(series: Task[], occurrences: Record<string, OccurrenceState>, date: string, todayKey: string): HistoryCell {
  const occs = resolveDay({ tasks: series, occurrences, day: dayFromKey(date), now: dayFromKey(todayKey) });
  if (occs.length === 0) {
    return { date, status: "none", ratio: 0 };
  }

  const counted = occs.filter((o) => !o.skipped);
  if (counted.length === 0) {
    return { date, status: "skipped", ratio: 0 };
  }

  const ratio = counted.filter((o) => o.completed).length / counted.length;
  if (ratio === 1) {
    return { date, status: "done", ratio };
  }

  if (date > todayKey) {
    return { date, status: "future", ratio };
  }

  if (date === todayKey) {
    return { date, status: ratio > 0 ? "partial" : "pending", ratio };
  }

  return { date, status: ratio >= 0.5 ? "partial" : "missed", ratio };
}

/** Day-by-day history of a recurring task (and its series) up to today. */
export function habitStats(
  task: Task,
  all: Task[],
  occurrences: Record<string, OccurrenceState>,
  todayKey: string,
  days = 84,
): HabitStats {
  const series = seriesOf(task, all).map((t) => ({ ...t, deletedAt: null }));
  const lookback = Math.max(days, 365);
  const cells: HistoryCell[] = [];
  for (let i = lookback - 1; i >= 0; i--) {
    cells.push(statusOn(series, occurrences, addDaysKey(todayKey, -i), todayKey));
  }

  const counts = (s: DayStatus) => s === "done" || s === "partial";
  let streak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (c.status === "none" || c.status === "skipped" || c.status === "pending" || c.status === "future") {
      continue;
    }

    if (!counts(c.status)) {
      break;
    }

    streak++;
  }

  let best = 0;
  let run = 0;
  for (const c of cells) {
    if (counts(c.status)) {
      run++;
      best = Math.max(best, run);
    } else if (c.status === "missed") {
      run = 0;
    }
  }

  const last30 = cells.slice(-30);
  const done = last30.filter((c) => counts(c.status)).length;
  const missed = last30.filter((c) => c.status === "missed").length;

  return {
    cells: cells.slice(-days),
    streak,
    best,
    rate30: done + missed > 0 ? done / (done + missed) : null,
    done,
    missed,
  };
}
