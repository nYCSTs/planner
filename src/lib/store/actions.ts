import {
  COLLECTIONS,
  DEFAULT_SYNCED_SETTINGS,
  type CollectionName,
  type OccurrenceState,
  type Project,
  type ResolvedOccurrence,
  type SettingsRecord,
  type Subtask,
  type SyncedSettings,
  type Tag,
  type Task,
  type TimeEntry,
} from "@/types";
import { uid } from "@/lib/id";
import { addDaysKey } from "@/lib/time";
import { backlogKey, dayOccKey, isBacklog } from "@/lib/occurrences";
import { recurrenceFloor } from "@/lib/recurrence";
import { runningEntry } from "@/lib/entries";
import { getState, put, remove, transact, update, type RecordRef } from "./store";
import { migrateLegacy, type LegacyData } from "./migrate";
import { getPrefs } from "./device";

export type TaskInput = Omit<Task, "id" | "createdAt" | "updatedAt" | "deletedAt">;

// --- Tasks -------------------------------------------------------------------

export function createTask(input: TaskInput): Task {
  return put("tasks", {
    ...input,
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: 0,
  });
}

export function updateTask(id: string, patch: Partial<Task>): Task | undefined {
  return update("tasks", id, patch);
}

export function deleteTask(id: string) {
  return transact(() => remove("tasks", id)).undo;
}

export function restoreTask(id: string) {
  const task = getState().tasks[id];
  if (task?.deletedAt) {
    put("tasks", { ...task, deletedAt: null });
  }
}

/** Stop a series after `lastDate` (inclusive) — keeps its history. */
export function endSeries(id: string, lastDate: string) {
  return transact(() => {
    const task = getState().tasks[id];
    if (!task) {
      return;
    }

    if (lastDate < recurrenceFloor(task)) {
      remove("tasks", id);
      return;
    }

    put("tasks", { ...task, recurrence: { ...task.recurrence, endDate: lastDate } });
  }).undo;
}

/**
 * "Este e os próximos": end the series the day before `fromDate` and start a
 * new one there with `patch` applied. Future per-day states move along.
 */
export function splitSeries(id: string, fromDate: string, patch: Partial<Task>): Task | undefined {
  const state = getState();
  const task = state.tasks[id];
  if (!task) {
    return undefined;
  }

  if (fromDate <= recurrenceFloor(task)) {
    return put("tasks", { ...task, ...patch });
  }

  const newId = uid();
  const recurrence = { ...task.recurrence, ...patch.recurrence, startDate: fromDate };
  const next: Task = {
    ...task,
    ...patch,
    id: newId,
    seriesId: task.seriesId ?? task.id,
    recurrence,
    createdAt: new Date().toISOString(),
    updatedAt: 0,
    deletedAt: null,
  };

  put("tasks", {
    ...task,
    recurrence: { ...task.recurrence, endDate: addDaysKey(fromDate, -1) },
  });
  put("tasks", next);

  for (const occ of Object.values(state.occurrences)) {
    if (occ.taskId !== id || occ.deletedAt || !occ.date || occ.date < fromDate) {
      continue;
    }

    const newKey = occ.id.replace(`${id}:`, `${newId}:`);
    put("occurrences", { ...occ, id: newKey, taskId: newId, updatedAt: 0 });
    remove("occurrences", occ.id);
  }

  return next;
}

/** Copy a task (and that day's subtasks/done state) into a new one-off task. */
export function duplicateTask(sourceId: string, fromDate: string, toDate: string): Task | undefined {
  const state = getState();
  const source = state.tasks[sourceId];
  if (!source) {
    return undefined;
  }

  const fromKey = isBacklog(source)
    ? backlogKey(source.id)
    : dayOccKey(source.id, source.recurrence.kind === "once" && source.date ? source.date : fromDate);
  const fromState = state.occurrences[fromKey];
  const done = new Set(fromState?.subtaskDone ?? []);
  const subs = [...(source.subtasks ?? []), ...(fromState?.subtasks ?? [])];
  const mapped = subs.map((s) => ({ sub: { id: uid(), title: s.title }, wasDone: done.has(s.id) }));

  const copy = createTask({
    ...stripMeta(source),
    subtasks: mapped.length ? mapped.map((m) => m.sub) : undefined,
    recurrence: { kind: "once" },
    date: toDate,
    seriesId: undefined,
  });

  const carried = mapped.filter((m) => m.wasDone).map((m) => m.sub.id);
  if (carried.length) {
    const key = copy.startMinute === null ? backlogKey(copy.id) : dayOccKey(copy.id, toDate);
    put("occurrences", { id: key, taskId: copy.id, date: copy.startMinute === null ? undefined : toDate, subtaskDone: carried, updatedAt: 0 });
  }

  return copy;
}

function stripMeta(task: Task): TaskInput {
  const rest: Partial<Task> = { ...task };
  delete rest.id;
  delete rest.createdAt;
  delete rest.updatedAt;
  delete rest.deletedAt;
  return rest as TaskInput;
}

/** Schedule a backlog item on a day/time (drag from the list to the timeline). */
export function scheduleBacklog(taskId: string, date: string, startMinute: number, endMinute: number) {
  const state = getState();
  const task = state.tasks[taskId];
  if (!task) {
    return;
  }

  transact(() => {
    put("tasks", { ...task, startMinute, endMinute, date });
    const old = state.occurrences[backlogKey(taskId)];
    if (old && !old.deletedAt) {
      put("occurrences", { ...old, id: dayOccKey(taskId, date), date, updatedAt: 0 });
      remove("occurrences", old.id);
    }
  });
}

// --- Occurrence state --------------------------------------------------------

function occBase(key: string, taskId: string, date?: string, slot?: number): OccurrenceState {
  const cur = getState().occurrences[key];
  if (cur && !cur.deletedAt) {
    return cur;
  }

  return { id: key, taskId, date, slot, updatedAt: 0 };
}

function stateFor(occ: ResolvedOccurrence): OccurrenceState {
  const date = occ.key === backlogKey(occ.task.id) ? undefined : occ.date;
  return occBase(occ.key, occ.task.id, date, occ.slot);
}

function dayStateFor(occ: ResolvedOccurrence): OccurrenceState {
  const date = occ.dayKey === backlogKey(occ.task.id) ? undefined : occ.date;
  return occBase(occ.dayKey, occ.task.id, date);
}

export function toggleDone(occ: ResolvedOccurrence) {
  const s = stateFor(occ);
  if (occ.completed) {
    put("occurrences", { ...s, status: undefined, doneAt: undefined });
    return;
  }

  put("occurrences", { ...s, status: "done", doneAt: Date.now(), skipReason: undefined });
}

export function setSkipped(occ: ResolvedOccurrence, skipped: boolean, reason?: string) {
  const s = stateFor(occ);
  if (!skipped) {
    put("occurrences", { ...s, status: undefined, skipReason: undefined });
    return;
  }

  put("occurrences", { ...s, status: "skipped", doneAt: undefined, skipReason: reason?.trim() || undefined });
}

/** Remove only this occurrence (the series continues). */
export function removeOccurrence(occ: ResolvedOccurrence) {
  return transact(() => {
    put("occurrences", { ...stateFor(occ), removed: true });
  }).undo;
}

export function setOccurrenceTime(occ: ResolvedOccurrence, startMinute: number, endMinute: number | null) {
  put("occurrences", { ...dayStateFor(occ), startMinute, endMinute });
}

/** Apply "só este dia" edits (title/time) to one occurrence. */
export function overrideOccurrence(
  occ: ResolvedOccurrence,
  patch: { title?: string; startMinute?: number; endMinute?: number | null },
) {
  const s = dayStateFor(occ);
  const next: OccurrenceState = { ...s };
  if (patch.title !== undefined) {
    next.title = patch.title === occ.task.title ? undefined : patch.title;
  }

  if (patch.startMinute !== undefined) {
    const same = patch.startMinute === occ.task.startMinute && patch.endMinute === occ.task.endMinute;
    next.startMinute = same ? undefined : patch.startMinute;
    next.endMinute = same ? undefined : patch.endMinute;
  }

  put("occurrences", next);
}

export function clearOccurrenceOverride(occ: ResolvedOccurrence) {
  put("occurrences", { ...dayStateFor(occ), title: undefined, startMinute: undefined, endMinute: undefined });
}

export function setDayNote(occ: ResolvedOccurrence, note: string) {
  put("occurrences", { ...dayStateFor(occ), note: note.trim() ? note : undefined });
}

// --- Subtasks ----------------------------------------------------------------

export type SubtaskScope = "global" | "day";

function moveItem<T extends { id: string }>(arr: T[], id: string, to: number): T[] {
  const from = arr.findIndex((s) => s.id === id);
  if (from === -1) {
    return arr;
  }

  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

function editSubtasks(occ: ResolvedOccurrence, scope: SubtaskScope, fn: (subs: Subtask[]) => Subtask[]) {
  if (scope === "global") {
    const task = getState().tasks[occ.task.id];
    if (task) {
      const subs = fn(task.subtasks ?? []);
      put("tasks", { ...task, subtasks: subs.length ? subs : undefined });
    }

    return;
  }

  const s = dayStateFor(occ);
  const subs = fn(s.subtasks ?? []);
  put("occurrences", { ...s, subtasks: subs.length ? subs : undefined });
}

export function addSubtask(occ: ResolvedOccurrence, title: string, scope: SubtaskScope) {
  editSubtasks(occ, scope, (subs) => [...subs, { id: uid(), title }]);
}

export function removeSubtask(occ: ResolvedOccurrence, subtaskId: string, scope: SubtaskScope) {
  editSubtasks(occ, scope, (subs) => subs.filter((s) => s.id !== subtaskId));
}

export function renameSubtask(occ: ResolvedOccurrence, subtaskId: string, title: string, scope: SubtaskScope) {
  editSubtasks(occ, scope, (subs) => subs.map((s) => (s.id === subtaskId ? { ...s, title } : s)));
}

export function reorderSubtask(occ: ResolvedOccurrence, subtaskId: string, index: number, scope: SubtaskScope) {
  editSubtasks(occ, scope, (subs) => moveItem(subs, subtaskId, index));
}

export function toggleSubtaskDone(occ: ResolvedOccurrence, subtaskId: string) {
  const s = dayStateFor(occ);
  const set = new Set(s.subtaskDone ?? []);
  if (set.has(subtaskId)) {
    set.delete(subtaskId);
  } else {
    set.add(subtaskId);
  }

  put("occurrences", { ...s, subtaskDone: set.size ? [...set] : undefined });
}

// --- Time entries ------------------------------------------------------------

export type EntryInput = Pick<TimeEntry, "title"> &
  Partial<Pick<TimeEntry, "taskId" | "occurrenceKey" | "projectId" | "tags" | "color" | "note">>;

export function startTimer(input: EntryInput): TimeEntry {
  return transact(() => {
    stopTimer();
    return put("entries", { ...input, id: uid(), start: Date.now(), end: null, updatedAt: 0 });
  }).result;
}

export function stopTimer(): TimeEntry | undefined {
  const running = runningEntry(getState().entries);
  if (!running) {
    return undefined;
  }

  return put("entries", { ...running, end: Math.max(Date.now(), running.start + 1000) });
}

export function continueEntry(entry: TimeEntry): TimeEntry {
  return startTimer({
    title: entry.title,
    taskId: entry.taskId,
    projectId: entry.projectId,
    tags: entry.tags,
    color: entry.color,
  });
}

export function addEntry(input: EntryInput & Pick<TimeEntry, "start" | "end">): TimeEntry {
  return put("entries", { ...input, id: uid(), updatedAt: 0 });
}

export function updateEntry(id: string, patch: Partial<TimeEntry>) {
  return update("entries", id, patch);
}

export function deleteEntry(id: string) {
  return transact(() => remove("entries", id)).undo;
}

// --- Tags & projects ---------------------------------------------------------

export function addTag(label: string, color: string): Tag {
  return put("tags", { id: uid(), label: label.trim(), color, updatedAt: 0 });
}

export function updateTag(id: string, patch: Partial<Omit<Tag, "id">>) {
  update("tags", id, patch);
}

export function deleteTag(id: string) {
  return transact(() => remove("tags", id)).undo;
}

export function addProject(name: string, color: string): Project {
  return put("projects", { id: uid(), name: name.trim(), color, updatedAt: 0 });
}

export function updateProject(id: string, patch: Partial<Omit<Project, "id">>) {
  update("projects", id, patch);
}

export function deleteProject(id: string) {
  return transact(() => remove("projects", id)).undo;
}

// --- Settings ----------------------------------------------------------------

export function updateSyncedSettings(patch: Partial<SyncedSettings>) {
  const cur = getState().settings.settings;
  const base: SettingsRecord = cur ?? { id: "settings", ...DEFAULT_SYNCED_SETTINGS, updatedAt: 0 };
  put("settings", { ...base, ...patch });
}

// --- Backup ------------------------------------------------------------------

export function exportData(): string {
  const state = getState();
  const data: Record<string, unknown[]> = {};
  for (const c of COLLECTIONS) {
    data[c] = Object.values(state[c]).filter((r) => !r.deletedAt);
  }

  return JSON.stringify(
    { format: "planner", version: 4, exportedAt: new Date().toISOString(), data, prefs: getPrefs() },
    null,
    2,
  );
}

/** Replace everything with a backup (v4 or legacy). Returns an undo. */
export function importData(json: string): () => void {
  const parsed = JSON.parse(json) as { version?: number; data?: Record<string, unknown[]>; tasks?: unknown };
  let refs: RecordRef[];

  if (parsed.version === 4 && parsed.data) {
    refs = [];
    for (const c of COLLECTIONS) {
      const list = parsed.data[c];
      if (!Array.isArray(list)) {
        continue;
      }

      for (const r of list) {
        if (r && typeof r === "object" && "id" in r) {
          refs.push({ c, record: r as never });
        }
      }
    }
  } else if (Array.isArray(parsed.tasks)) {
    refs = migrateLegacy(parsed as unknown as LegacyData);
  } else {
    throw new Error("Backup inválido: formato não reconhecido.");
  }

  return transact(() => {
    const state = getState();
    for (const c of COLLECTIONS) {
      for (const r of Object.values(state[c] as Record<string, { id: string; deletedAt?: number | null }>)) {
        if (!r.deletedAt) {
          remove(c as CollectionName, r.id);
        }
      }
    }

    for (const ref of refs) {
      put(ref.c, { ...ref.record, deletedAt: null } as never);
    }
  }).undo;
}
