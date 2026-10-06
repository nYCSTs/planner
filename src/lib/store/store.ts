import { COLLECTIONS, type CollectionName, type Collections } from "@/types";
import {
  clearCollections,
  getMeta,
  loadAll,
  setMeta,
  writeRecords,
  type Maps,
  type PendingWrite,
} from "./db";
import { migrateLegacy, readLegacyStorage } from "./migrate";

export interface StoreState extends Maps {
  ready: boolean;
}

export interface RecordRef<C extends CollectionName = CollectionName> {
  c: C;
  record: Collections[C];
}

function emptyMaps(): Maps {
  return { tasks: {}, occurrences: {}, entries: {}, tags: {}, projects: {}, settings: {} };
}

const SERVER_STATE: StoreState = { ready: false, ...emptyMaps() };
const MIGRATED_FLAG = "planner.migratedV4";

let state: StoreState = SERVER_STATE;
const listeners = new Set<() => void>();
const changeListeners = new Set<() => void>();
let emitScheduled = false;

let dirty = new Set<string>();
let pending = new Map<string, PendingWrite>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let journal: Map<string, { c: CollectionName; id: string; prev: unknown }> | null = null;
let channel: BroadcastChannel | null = null;

export const getState = () => state;
export const getServerState = () => SERVER_STATE;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fires after every local (non-remote) change — used to schedule syncs. */
export function onLocalChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function scheduleEmit() {
  if (emitScheduled) {
    return;
  }

  emitScheduled = true;
  queueMicrotask(() => {
    emitScheduled = false;
    for (const l of listeners) {
      l();
    }
  });
}

const refKey = (c: CollectionName, id: string) => `${c}/${id}`;

function queuePersist(c: CollectionName, record: { id: string }) {
  pending.set(refKey(c, record.id), { c, record });
  if (!flushTimer) {
    flushTimer = setTimeout(() => void flush(), 50);
  }
}

export async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const writes = [...pending.values()];
  pending = new Map();
  if (writes.length === 0) {
    return;
  }

  try {
    await writeRecords(writes);
    await setMeta("dirty", [...dirty]);
  } catch (err) {
    console.error("planner: falha ao salvar no IndexedDB", err);
  }
}

function setRecord(c: CollectionName, record: { id: string }) {
  state = { ...state, [c]: { ...state[c], [record.id]: record } };
}

/** Insert or replace a record locally (bumps updatedAt, marks it for sync). */
export function put<C extends CollectionName>(c: C, record: Collections[C]): Collections[C] {
  const prev = state[c][record.id] as Collections[C] | undefined;
  const updatedAt = Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);
  const next = { ...record, updatedAt } as Collections[C];

  const key = refKey(c, record.id);
  if (journal && !journal.has(key)) {
    journal.set(key, { c, id: record.id, prev });
  }

  setRecord(c, next);
  dirty.add(key);
  queuePersist(c, next);
  channel?.postMessage({ type: "records", records: [{ c, record: next }] });
  scheduleEmit();
  for (const l of changeListeners) {
    l();
  }

  return next;
}

export function update<C extends CollectionName>(
  c: C,
  id: string,
  patch: Partial<Collections[C]>,
): Collections[C] | undefined {
  const prev = state[c][id] as Collections[C] | undefined;
  if (!prev) {
    return undefined;
  }

  return put(c, { ...prev, ...patch });
}

/** Soft-delete (tombstone) so the deletion syncs and can be undone. */
export function remove(c: CollectionName, id: string) {
  const prev = state[c][id];
  if (!prev || prev.deletedAt) {
    return;
  }

  put(c, { ...prev, deletedAt: Date.now() } as never);
}

/**
 * Run `fn`, capturing every record it writes; returns an undo that restores
 * the previous versions (or tombstones records it created).
 */
export function transact<T>(fn: () => T): { result: T; undo: () => void } {
  const outer = journal;
  journal = new Map();
  let captured: NonNullable<typeof journal>;
  let result: T;
  try {
    result = fn();
  } finally {
    captured = journal;
    journal = outer;
    if (outer) {
      for (const [k, v] of captured) {
        if (!outer.has(k)) {
          outer.set(k, v);
        }
      }
    }
  }

  const undo = () => {
    for (const { c, id, prev } of captured.values()) {
      if (prev) {
        put(c, prev as never);
        continue;
      }

      const cur = state[c][id];
      if (cur && !cur.deletedAt) {
        put(c, { ...cur, deletedAt: Date.now() } as never);
      }
    }
  };

  return { result, undo };
}

/** Records changed locally and not yet acknowledged by the server. */
export function dirtyRecords(): RecordRef[] {
  const out: RecordRef[] = [];
  for (const key of dirty) {
    const [c, ...rest] = key.split("/");
    const id = rest.join("/");
    const record = state[c as CollectionName]?.[id];
    if (record) {
      out.push({ c: c as CollectionName, record });
    }
  }

  return out;
}

export function markClean(sent: RecordRef[]) {
  for (const { c, record } of sent) {
    const cur = state[c][record.id];
    if (cur && cur.updatedAt === record.updatedAt) {
      dirty.delete(refKey(c, record.id));
    }
  }

  void setMeta("dirty", [...dirty]).catch(() => undefined);
}

export function markAllDirty() {
  for (const c of COLLECTIONS) {
    for (const id of Object.keys(state[c])) {
      dirty.add(refKey(c, id));
    }
  }

  void setMeta("dirty", [...dirty]).catch(() => undefined);
}

/** Merge records from the server / another tab (last-writer-wins). */
export function applyRemote(records: RecordRef[], opts: { persist?: boolean; markDirty?: boolean } = {}) {
  const persist = opts.persist ?? true;
  let changed = false;
  for (const { c, record } of records) {
    if (!COLLECTIONS.includes(c)) {
      continue;
    }

    const cur = state[c][record.id];
    if (cur && cur.updatedAt >= record.updatedAt) {
      continue;
    }

    setRecord(c, record);
    if (persist) {
      queuePersist(c, record);
    }

    if (opts.markDirty) {
      dirty.add(refKey(c, record.id));
    } else if (persist) {
      dirty.delete(refKey(c, record.id));
    }

    changed = true;
  }

  if (changed) {
    scheduleEmit();
    if (persist) {
      channel?.postMessage({ type: "records", records, remote: true });
    }
  }
}

/** Drop all local data (used when a device joins a vault and discards its own). */
export async function resetLocal() {
  pending = new Map();
  dirty = new Set();
  state = { ready: true, ...emptyMaps() };
  await clearCollections();
  await setMeta("dirty", []);
  channel?.postMessage({ type: "reset" });
  scheduleEmit();
}

export function hasLocalData(): boolean {
  return (
    Object.values(state.tasks).some((t) => !t.deletedAt) ||
    Object.values(state.entries).some((e) => !e.deletedAt)
  );
}

let initPromise: Promise<void> | null = null;

export function initStore(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    let maps = emptyMaps();
    try {
      maps = await loadAll();
      dirty = new Set((await getMeta<string[]>("dirty")) ?? []);
    } catch (err) {
      console.error("planner: IndexedDB indisponível, usando memória", err);
    }

    state = { ready: true, ...maps };

    const empty = COLLECTIONS.every((c) => Object.keys(maps[c]).length === 0);
    if (empty && !localStorage.getItem(MIGRATED_FLAG)) {
      const legacy = readLegacyStorage();
      if (legacy) {
        for (const ref of migrateLegacy(legacy)) {
          put(ref.c, ref.record);
        }

        await flush();
      }

      localStorage.setItem(MIGRATED_FLAG, "1");
    }

    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("planner-store");
      channel.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { type: string; records?: RecordRef[]; remote?: boolean };
        if (msg.type === "records" && msg.records) {
          applyRemote(msg.records, { persist: false, markDirty: !msg.remote });
        } else if (msg.type === "reset") {
          location.reload();
        }
      };
    }

    window.addEventListener("pagehide", () => void flush());
    scheduleEmit();
  })();

  return initPromise;
}
