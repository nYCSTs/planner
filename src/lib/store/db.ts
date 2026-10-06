import { COLLECTIONS, type CollectionName, type Collections } from "@/types";

const DB_NAME = "planner";
const DB_VERSION = 1;
const META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const c of COLLECTIONS) {
        if (!db.objectStoreNames.contains(c)) {
          db.createObjectStore(c, { keyPath: "id" });
        }
      }

      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export type Maps = { [C in CollectionName]: Record<string, Collections[C]> };

export async function loadAll(): Promise<Maps> {
  const db = await openDb();
  const tx = db.transaction(COLLECTIONS, "readonly");
  const out = {} as Maps;
  await Promise.all(
    COLLECTIONS.map(
      (c) =>
        new Promise<void>((resolve, reject) => {
          const req = tx.objectStore(c).getAll();
          req.onsuccess = () => {
            const map: Record<string, unknown> = {};
            for (const r of req.result as { id: string }[]) {
              map[r.id] = r;
            }

            (out as Record<string, unknown>)[c] = map;
            resolve();
          };
          req.onerror = () => reject(req.error);
        }),
    ),
  );
  return out;
}

export interface PendingWrite {
  c: CollectionName;
  record: { id: string };
}

export async function writeRecords(writes: PendingWrite[]): Promise<void> {
  if (writes.length === 0) {
    return;
  }

  const db = await openDb();
  const stores = [...new Set(writes.map((w) => w.c))];
  const tx = db.transaction(stores, "readwrite");
  for (const w of writes) {
    tx.objectStore(w.c).put(w.record);
  }

  await done(tx);
}

export async function clearCollections(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(COLLECTIONS, "readwrite");
  for (const c of COLLECTIONS) {
    tx.objectStore(c).clear();
  }

  await done(tx);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(META, "readonly");
  const req = tx.objectStore(META).get(key);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(META, "readwrite");
  if (value === undefined) {
    tx.objectStore(META).delete(key);
  } else {
    tx.objectStore(META).put(value, key);
  }

  await done(tx);
}
