"use client";

import { useMemo } from "react";
import type { ResolvedOccurrence } from "@/types";
import { backlogOccurrence, isBacklog, resolveDay } from "@/lib/occurrences";
import { dateKey, dayFromKey } from "@/lib/time";
import { useOccurrenceStates, useTasks } from "./hooks";

/** Occurrences of `day`, recomputed only when data or the calendar day changes. */
export function useDayOccurrences(day: Date, now: Date): ResolvedOccurrence[] {
  const tasks = useTasks();
  const occurrences = useOccurrenceStates();
  const dk = dateKey(day);
  const nowKey = dateKey(now);

  return useMemo(
    () => resolveDay({ tasks, occurrences, day: dayFromKey(dk), now: dayFromKey(nowKey) }),
    [tasks, occurrences, dk, nowKey],
  );
}

/** Resolve one occurrence by key on a given date (detail panel, scope edits). */
export function useOccurrence(sel: { key: string; date: string } | null, now: Date): ResolvedOccurrence | null {
  const tasks = useTasks();
  const occurrences = useOccurrenceStates();
  const nowKey = dateKey(now);

  return useMemo(() => {
    if (!sel) {
      return null;
    }

    const backlog = tasks.find((t) => t.id === sel.key && isBacklog(t));
    if (backlog) {
      return backlogOccurrence(backlog, occurrences[sel.key], sel.date);
    }

    const list = resolveDay({ tasks, occurrences, day: dayFromKey(sel.date), now: dayFromKey(nowKey) });
    return list.find((o) => o.key === sel.key) ?? null;
  }, [sel, tasks, occurrences, nowKey]);
}
