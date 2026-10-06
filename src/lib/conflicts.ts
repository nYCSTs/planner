import type { Task } from "@/types";
import { addDaysKey, dateKey, intervalsOverlap } from "./time";
import { isHourly, patternMatches } from "./recurrence";

const HORIZON_DAYS = 56;

type Candidate = Pick<Task, "startMinute" | "endMinute" | "recurrence" | "date" | "createdAt">;

function upcomingDays(task: Candidate, from: string): Set<string> {
  const days = new Set<string>();
  if (task.recurrence.kind === "once") {
    if (task.date && task.date >= from) {
      days.add(task.date);
    }

    return days;
  }

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const key = addDaysKey(from, i);
    if (patternMatches(task, key)) {
      days.add(key);
    }
  }

  return days;
}

/**
 * Tasks whose time overlaps the candidate on a shared day within the next
 * weeks. Hourly tasks are ignored — they're meant to overlay other work.
 */
export function findConflicts(candidate: Candidate, existing: Task[], ignoreId?: string): Task[] {
  const candidateStart = candidate.startMinute;
  if (candidateStart === null || isHourly(candidate.recurrence) || candidate.recurrence.kind === "afterDone") {
    return [];
  }

  const today = dateKey(new Date());
  const mine = upcomingDays(candidate, today);
  if (mine.size === 0) {
    return [];
  }

  return existing.filter((task) => {
    if (task.id === ignoreId || task.deletedAt || task.startMinute === null) {
      return false;
    }

    if (isHourly(task.recurrence) || task.recurrence.kind === "afterDone") {
      return false;
    }

    if (!intervalsOverlap(candidateStart, candidate.endMinute, task.startMinute, task.endMinute)) {
      return false;
    }

    for (const d of upcomingDays(task, today)) {
      if (mine.has(d)) {
        return true;
      }
    }

    return false;
  });
}
