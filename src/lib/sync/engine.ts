import { getMeta, setMeta } from "@/lib/store/db";
import {
  applyRemote,
  dirtyRecords,
  flush,
  initStore,
  markAllDirty,
  markClean,
  onLocalChange,
  resetLocal,
  type RecordRef,
} from "@/lib/store/store";
import { updateSyncedSettings } from "@/lib/store/actions";
import { getState } from "@/lib/store/store";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "";
const BATCH = 400;

export interface Session {
  vaultId: string;
  deviceId: string;
  token: string;
  deviceName: string;
  cursor: number;
  pairedAt: number;
}

export type SyncStatus = "off" | "idle" | "syncing" | "error" | "offline" | "revoked";

export interface SyncState {
  status: SyncStatus;
  session: Session | null;
  lastSync?: number;
  error?: string;
}

export interface Device {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const SERVER_STATE: SyncState = { status: "off", session: null };
let state: SyncState = SERVER_STATE;
const listeners = new Set<() => void>();

export const getSyncState = () => state;
export const getServerSyncState = () => SERVER_STATE;

export function subscribeSync(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const l of listeners) {
    l();
  }
}

async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor");
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Erro ${res.status}`);
  }

  return data as T;
}

async function saveSession(session: Session | null) {
  await setMeta("sync", session ?? undefined);
  setState({ session });
}

export function defaultDeviceName(): string {
  if (typeof navigator === "undefined") {
    return "Aparelho";
  }

  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Aparelho";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return browser ? `${browser} · ${os}` : os;
}

function ensureTimeZone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && getState().settings.settings?.timeZone !== tz) {
    updateSyncedSettings({ timeZone: tz });
  }
}

let running: Promise<void> | null = null;
let again = false;

/** Push local changes and pull remote ones until both sides are caught up. */
export function syncNow(): Promise<void> {
  if (!state.session) {
    return Promise.resolve();
  }

  if (running) {
    again = true;
    return running;
  }

  running = (async () => {
    try {
      setState({ status: "syncing" });
      do {
        again = false;
        await flush();
        let more = true;
        while (more) {
          const session = state.session;
          if (!session) {
            return;
          }

          const batch: RecordRef[] = dirtyRecords().slice(0, BATCH);
          const res = await api<{ cursor: number; more: boolean; changes: RecordRef[] }>("/api/sync", {
            method: "POST",
            token: session.token,
            body: {
              cursor: session.cursor,
              changes: batch.map(({ c, record }) => ({
                c,
                id: record.id,
                updatedAt: record.updatedAt,
                deleted: Boolean(record.deletedAt),
                data: record,
              })),
            },
          });
          markClean(batch);
          applyRemote(res.changes);
          await saveSession({ ...session, cursor: res.cursor });
          more = res.more || (batch.length === BATCH && dirtyRecords().length > 0);
        }
      } while (again);
      setState({ status: "idle", lastSync: Date.now(), error: undefined });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await saveSession(null);
        setState({ status: "revoked", error: "Este aparelho foi removido da sincronização." });
      } else if (err instanceof ApiError && err.status === 0) {
        setState({ status: "offline", error: err.message });
      } else {
        setState({ status: "error", error: err instanceof Error ? err.message : "Falha ao sincronizar" });
      }
    } finally {
      running = null;
    }
  })();

  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(delay: number) {
  if (!state.session) {
    return;
  }

  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delay);
}

let started = false;

export async function startEngine() {
  if (started) {
    return;
  }

  started = true;
  await initStore();
  const session = (await getMeta<Session>("sync").catch(() => undefined)) ?? null;
  setState({ session, status: session ? "idle" : "off" });

  onLocalChange(() => schedule(1500));
  window.addEventListener("focus", () => schedule(0));
  window.addEventListener("online", () => schedule(0));
  document.addEventListener("visibilitychange", () => schedule(document.visibilityState === "visible" ? 0 : 100));
  setInterval(() => {
    if (document.visibilityState === "visible") {
      schedule(0);
    }
  }, 30_000);

  if (session) {
    if ("recoveryCode" in session) {
      delete (session as Partial<Session> & { recoveryCode?: string }).recoveryCode;
      await saveSession(session);
    }

    void syncNow().then(ensureTimeZone);
  }
}

async function adopt(
  res: { vaultId: string; deviceId: string; token: string },
  deviceName: string,
  mode: "merge" | "replace" | "upload",
) {
  if (mode === "replace") {
    await resetLocal();
  } else {
    markAllDirty();
  }

  await saveSession({
    vaultId: res.vaultId,
    deviceId: res.deviceId,
    token: res.token,
    deviceName,
    cursor: 0,
    pairedAt: Date.now(),
  });
  // Pull the vault's settings first so only the time zone field changes.
  await syncNow();
  ensureTimeZone();
}

/** Turn this device into the first one of a new vault. */
export async function createVault(deviceName: string): Promise<string> {
  const res = await api<{ vaultId: string; deviceId: string; token: string; recoveryCode: string }>("/api/vault", {
    method: "POST",
    body: { deviceName },
  });
  await adopt(res, deviceName, "upload");
  return res.recoveryCode;
}

export async function joinWithCode(code: string, deviceName: string, mode: "merge" | "replace") {
  const res = await api<{ vaultId: string; deviceId: string; token: string }>("/api/pair/complete", {
    method: "POST",
    body: { code, deviceName },
  });
  await adopt(res, deviceName, mode);
}

export async function recoverVault(recoveryCode: string, deviceName: string, mode: "merge" | "replace") {
  const res = await api<{ vaultId: string; deviceId: string; token: string }>("/api/recover", {
    method: "POST",
    body: { recoveryCode, deviceName },
  });
  await adopt(res, deviceName, mode);
}

function token(): string {
  if (!state.session) {
    throw new ApiError(401, "Sincronização desativada");
  }

  return state.session.token;
}

export function startPairing() {
  return api<{ code: string; expiresAt: number }>("/api/pair/start", { method: "POST", token: token() });
}

export async function listDevices(): Promise<Device[]> {
  return (await api<{ devices: Device[] }>("/api/devices", { token: token() })).devices;
}

export async function renameDevice(name: string) {
  await api("/api/devices/me", { method: "PATCH", token: token(), body: { name } });
  if (state.session) {
    await saveSession({ ...state.session, deviceName: name });
  }
}

export async function removeDevice(id: string) {
  await api(`/api/devices/${encodeURIComponent(id)}`, { method: "DELETE", token: token() });
}

export async function rotateRecovery(): Promise<string> {
  return (await api<{ recoveryCode: string }>("/api/vault/recovery", { method: "POST", token: token() })).recoveryCode;
}

/** Stop syncing on this device (local data stays). */
export async function leave() {
  const session = state.session;
  if (session) {
    await api(`/api/devices/${encodeURIComponent(session.deviceId)}`, { method: "DELETE", token: session.token }).catch(
      () => undefined,
    );
  }

  await saveSession(null);
  setState({ status: "off", error: undefined });
}

/** Delete the vault and every device's access on the server. */
export async function deleteServerData() {
  await api("/api/vault", { method: "DELETE", token: token() });
  await saveSession(null);
  setState({ status: "off", error: undefined });
}

export function pendingChanges(): number {
  return dirtyRecords().length;
}

export async function pushPublicKey(): Promise<string> {
  return (await api<{ publicKey: string }>("/api/push/key")).publicKey;
}

export async function registerPush(endpoint: string) {
  await api("/api/push/subscribe", { method: "POST", token: token(), body: { endpoint } });
}

export async function unregisterPush(endpoint: string) {
  await api("/api/push/unsubscribe", { method: "POST", token: token(), body: { endpoint } }).catch(() => undefined);
}

export async function testPush(): Promise<number> {
  return (await api<{ sent: number }>("/api/push/test", { method: "POST", token: token() })).sent;
}
