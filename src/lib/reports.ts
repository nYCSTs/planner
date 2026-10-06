import type { OccurrenceState, Project, Tag, Task, TimeEntry } from "../types";
import { overlapMs } from "./entries";
import { resolveDay } from "./occurrences";
import { addDaysKey, dateKey, dayFromKey, dayStartMs, diffDaysKey } from "./time";

export const NO_GROUP = "__none__";
const NONE_COLOR = "#94a3b8";

export type GroupBy = "project" | "tag" | "task";

export interface Group {
  key: string;
  label: string;
  color: string;
  ms: number;
  /** Titles inside the group with their time. */
  items: { label: string; ms: number }[];
}

export interface DayBucket {
  date: string;
  totalMs: number;
  plannedMin: number;
  /** ms per group key, in group order. */
  byGroup: Map<string, number>;
}

export interface TaskComparison {
  task: Task;
  plannedMin: number;
  trackedMs: number;
}

export interface Report {
  days: DayBucket[];
  groups: Group[];
  totalMs: number;
  plannedMin: number;
  done: number;
  actionable: number;
  comparisons: TaskComparison[];
  entries: TimeEntry[];
}

interface Input {
  from: string;
  to: string;
  groupBy: GroupBy;
  now: number;
  tasks: Task[];
  tasksById: Record<string, Task>;
  occurrences: Record<string, OccurrenceState>;
  entries: TimeEntry[];
  projectsById: Record<string, Project>;
  tagsById: Record<string, Tag>;
}

function groupKeys(e: TimeEntry, groupBy: GroupBy, tasksById: Record<string, Task>): string[] {
  const task = e.taskId ? tasksById[e.taskId] : undefined;
  if (groupBy === "project") {
    return [e.projectId ?? task?.projectId ?? NO_GROUP];
  }

  if (groupBy === "tag") {
    const tags = e.tags?.length ? e.tags : task?.tags ?? [];
    return tags.length ? tags : [NO_GROUP];
  }

  return [`${e.taskId ?? ""}|${(e.title || "Sem descrição").trim()}`];
}

export function buildReport(input: Input): Report {
  const { from, to, groupBy, now, tasksById, projectsById, tagsById } = input;
  const nDays = diffDaysKey(from, to) + 1;
  const rangeStart = dayStartMs(from);
  const rangeEnd = dayStartMs(addDaysKey(to, 1));
  const days: DayBucket[] = [];
  const groupMs = new Map<string, number>();
  const groupItems = new Map<string, Map<string, number>>();
  const trackedByTask = new Map<string, number>();
  let totalMs = 0;

  const entries = input.entries
    .filter((e) => !e.deletedAt && overlapMs(e, rangeStart, rangeEnd, now) > 0)
    .sort((a, b) => b.start - a.start);

  for (let i = 0; i < nDays; i++) {
    const date = addDaysKey(from, i);
    const start = dayStartMs(date);
    const end = dayStartMs(addDaysKey(date, 1));
    const bucket: DayBucket = { date, totalMs: 0, plannedMin: 0, byGroup: new Map() };

    for (const e of entries) {
      const ms = overlapMs(e, start, end, now);
      if (ms <= 0) {
        continue;
      }

      bucket.totalMs += ms;
      if (e.taskId) {
        trackedByTask.set(e.taskId, (trackedByTask.get(e.taskId) ?? 0) + ms);
      }

      for (const key of groupKeys(e, groupBy, tasksById)) {
        bucket.byGroup.set(key, (bucket.byGroup.get(key) ?? 0) + ms);
        groupMs.set(key, (groupMs.get(key) ?? 0) + ms);
        const items = groupItems.get(key) ?? new Map<string, number>();
        const title = (e.title || "Sem descrição").trim();
        items.set(title, (items.get(title) ?? 0) + ms);
        groupItems.set(key, items);
      }
    }

    totalMs += bucket.totalMs;
    days.push(bucket);
  }

  // Planned time and completion from the agenda itself.
  const plannedByTask = new Map<string, number>();
  let done = 0;
  let actionable = 0;
  const todayKey = dateKey(new Date(now));
  for (const bucket of days) {
    const occs = resolveDay({ tasks: input.tasks, occurrences: input.occurrences, day: dayFromKey(bucket.date), now: dayFromKey(todayKey) });
    for (const o of occs) {
      if (o.skipped) {
        continue;
      }

      if (bucket.date <= todayKey && !(o.key === o.task.id && !o.completed)) {
        actionable++;
        if (o.completed) {
          done++;
        }
      }

      if (o.scheduled && !o.openEnded) {
        const min = o.endMinute - o.startMinute;
        bucket.plannedMin += min;
        plannedByTask.set(o.task.id, (plannedByTask.get(o.task.id) ?? 0) + min);
      }
    }
  }

  const groups: Group[] = [...groupMs.entries()]
    .map(([key, ms]) => {
      let label = "Sem projeto";
      let color = NONE_COLOR;
      if (groupBy === "project" && key !== NO_GROUP) {
        const p = projectsById[key];
        label = p?.name ?? "Projeto removido";
        color = p?.color ?? NONE_COLOR;
      } else if (groupBy === "tag") {
        const t = key === NO_GROUP ? undefined : tagsById[key];
        label = key === NO_GROUP ? "Sem etiqueta" : t?.label ?? "Etiqueta removida";
        color = t?.color ?? NONE_COLOR;
      } else if (groupBy === "task") {
        const [taskId, title] = key.split("|");
        const task = taskId ? tasksById[taskId] : undefined;
        label = title;
        color = task?.color ?? entries.find((e) => (e.title || "Sem descrição").trim() === title)?.color ?? NONE_COLOR;
      }

      const items = [...(groupItems.get(key) ?? new Map()).entries()]
        .map(([l, m]) => ({ label: l, ms: m }))
        .sort((a, b) => b.ms - a.ms);
      return { key, label, color, ms, items };
    })
    .sort((a, b) => (a.key === NO_GROUP ? 1 : b.key === NO_GROUP ? -1 : b.ms - a.ms));

  const comparisonIds = new Set([...plannedByTask.keys(), ...trackedByTask.keys()]);
  const comparisons: TaskComparison[] = [...comparisonIds]
    .map((id) => tasksById[id])
    .filter((t): t is Task => Boolean(t))
    .map((task) => ({ task, plannedMin: plannedByTask.get(task.id) ?? 0, trackedMs: trackedByTask.get(task.id) ?? 0 }))
    .sort((a, b) => b.trackedMs + b.plannedMin * 60_000 - (a.trackedMs + a.plannedMin * 60_000));

  return {
    days,
    groups,
    totalMs,
    plannedMin: days.reduce((s, d) => s + d.plannedMin, 0),
    done,
    actionable,
    comparisons,
    entries,
  };
}

function csvCell(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV (semicolon-separated, UTF-8 BOM) that opens cleanly in Excel pt-BR. */
export function entriesCsv(
  entries: TimeEntry[],
  now: number,
  tasksById: Record<string, Task>,
  projectsById: Record<string, Project>,
  tagsById: Record<string, Tag>,
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = (ms: number) => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const header = ["Data", "Início", "Fim", "Duração (min)", "Descrição", "Projeto", "Etiquetas", "Tarefa", "Nota"];
  const rows = [...entries]
    .sort((a, b) => a.start - b.start)
    .map((e) => {
      const end = e.end ?? now;
      const task = e.taskId ? tasksById[e.taskId] : undefined;
      const projectId = e.projectId ?? task?.projectId;
      const tags = (e.tags ?? task?.tags ?? []).map((id) => tagsById[id]?.label).filter(Boolean).join(", ");
      return [
        dateKey(new Date(e.start)),
        time(e.start),
        e.end ? time(end) : "",
        String(Math.round((end - e.start) / 60_000)),
        e.title,
        projectId ? projectsById[projectId]?.name ?? "" : "",
        tags,
        task?.title ?? "",
        e.note ?? "",
      ]
        .map(csvCell)
        .join(";");
    });
  return "﻿" + [header.join(";"), ...rows].join("\r\n");
}
