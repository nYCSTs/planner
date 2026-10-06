import type { Project, Task, TimeEntry } from "../types";
import { MINUTES_IN_DAY, dateKey, dayStartMs } from "./time";

export const NEUTRAL_COLOR = "#64748b";

export interface DayEntry {
  entry: TimeEntry;
  /** Clipped to the day, in minutes from midnight. */
  startMinute: number;
  endMinute: number;
  running: boolean;
  /** Entry started on a previous day / continues past midnight. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

export function entryEnd(entry: TimeEntry, now: number): number {
  return entry.end ?? Math.max(now, entry.start);
}

export function entryDuration(entry: TimeEntry, now: number): number {
  return Math.max(0, entryEnd(entry, now) - entry.start);
}

/** Entries overlapping `day`, clipped to its bounds. */
export function entriesForDay(entries: TimeEntry[], day: Date, now: number): DayEntry[] {
  const start = dayStartMs(dateKey(day));
  const end = start + MINUTES_IN_DAY * 60_000;
  const out: DayEntry[] = [];

  for (const entry of entries) {
    if (entry.deletedAt) {
      continue;
    }

    const eEnd = entryEnd(entry, now);
    if (entry.start >= end || eEnd <= start) {
      continue;
    }

    const s = Math.max(entry.start, start);
    const e = Math.min(eEnd, end);
    out.push({
      entry,
      startMinute: (s - start) / 60_000,
      endMinute: (e - start) / 60_000,
      running: entry.end === null,
      clippedStart: entry.start < start,
      clippedEnd: eEnd > end,
    });
  }

  return out.sort((a, b) => a.startMinute - b.startMinute);
}

/** ms of `entry` that fall inside [from, to). */
export function overlapMs(entry: TimeEntry, from: number, to: number, now: number): number {
  const s = Math.max(entry.start, from);
  const e = Math.min(entryEnd(entry, now), to);
  return Math.max(0, e - s);
}

export function entryColor(
  entry: Pick<TimeEntry, "color" | "taskId" | "projectId">,
  tasksById: Record<string, Task>,
  projectsById: Record<string, Project>,
): string {
  const task = entry.taskId ? tasksById[entry.taskId] : undefined;
  const project = entry.projectId ? projectsById[entry.projectId] : undefined;
  return entry.color ?? task?.color ?? project?.color ?? NEUTRAL_COLOR;
}

export function runningEntry(entries: Record<string, TimeEntry>): TimeEntry | undefined {
  let found: TimeEntry | undefined;
  for (const e of Object.values(entries)) {
    if (!e.deletedAt && e.end === null && (!found || e.start > found.start)) {
      found = e;
    }
  }

  return found;
}
