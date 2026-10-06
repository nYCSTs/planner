import { authenticate, type Env } from "./auth";
import { HttpError, json, readJson, str } from "./http";
import { base64url, fromBase64url } from "./crypto";
import { resolveDay } from "../src/lib/occurrences";
import type { OccurrenceState, SettingsRecord, Task } from "../src/types";

const OUTBOX_TTL_MS = 2 * 24 * 60 * 60_000;
// Bump when the plan logic changes so cached plans get rebuilt.
const PLAN_VERSION = 2;

interface VapidJwk extends JsonWebKey {
  x: string;
  y: string;
  d: string;
}

function vapidJwk(env: Env): VapidJwk | null {
  if (!env.VAPID_JWK) {
    return null;
  }

  try {
    return JSON.parse(env.VAPID_JWK) as VapidJwk;
  } catch {
    return null;
  }
}

function publicKey(jwk: VapidJwk): string {
  const x = fromBase64url(jwk.x);
  const y = fromBase64url(jwk.y);
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(x, 1);
  raw.set(y, 33);
  return base64url(raw);
}

async function vapidHeader(env: Env, jwk: VapidJwk, endpoint: string): Promise<string> {
  const enc = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  const header = enc({ typ: "JWT", alg: "ES256" });
  const claims = enc({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT ?? "mailto:planner@example.com",
  });
  const key = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["sign"], ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${base64url(new Uint8Array(sig))}, k=${publicKey(jwk)}`;
}

/** Payload-less push: the service worker fetches /api/push/pending itself. */
async function sendPush(env: Env, jwk: VapidJwk, endpoint: string): Promise<boolean> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: await vapidHeader(env, jwk, endpoint), TTL: "600", Urgency: "high", "Content-Length": "0" },
  });
  if (res.status === 404 || res.status === 410) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
    return false;
  }

  return res.ok;
}

async function pushVault(env: Env, jwk: VapidJwk, vaultId: string, deviceId?: string) {
  const query = deviceId
    ? env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE vault_id = ? AND device_id = ?").bind(vaultId, deviceId)
    : env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE vault_id = ?").bind(vaultId);
  const { results } = await query.all<{ endpoint: string }>();
  await Promise.all(results.map((r) => sendPush(env, jwk, r.endpoint).catch(() => false)));
  return results.length;
}

export async function pushRoutes(req: Request, env: Env, path: string): Promise<Response | null> {
  if (!path.startsWith("/api/push/")) {
    return null;
  }

  const jwk = vapidJwk(env);
  if (req.method === "GET" && path === "/api/push/key") {
    if (!jwk) {
      throw new HttpError(503, "Notificações push não configuradas no servidor");
    }

    return json({ publicKey: publicKey(jwk) });
  }

  const auth = await authenticate(req, env);

  if (req.method === "POST" && path === "/api/push/subscribe") {
    const body = await readJson<{ endpoint?: string }>(req);
    const endpoint = str(body.endpoint, "endpoint", 2000);
    if (!endpoint.startsWith("https://")) {
      throw new HttpError(400, "Endpoint inválido");
    }

    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, vault_id, device_id, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET vault_id = excluded.vault_id, device_id = excluded.device_id`,
    )
      .bind(endpoint, auth.vaultId, auth.deviceId, Date.now())
      .run();
    return json({ ok: true });
  }

  if (req.method === "POST" && path === "/api/push/unsubscribe") {
    const body = await readJson<{ endpoint?: string }>(req);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND vault_id = ?")
      .bind(str(body.endpoint, "endpoint", 2000), auth.vaultId)
      .run();
    return json({ ok: true });
  }

  if (req.method === "GET" && path === "/api/push/pending") {
    const since = Number(new URL(req.url).searchParams.get("since")) || Date.now() - 15 * 60_000;
    const { results } = await env.DB.prepare(
      "SELECT tag, title, body FROM push_outbox WHERE vault_id = ? AND created_at >= ? ORDER BY created_at",
    )
      .bind(auth.vaultId, since)
      .all<{ tag: string; title: string; body: string }>();
    return json({ notifications: results });
  }

  if (req.method === "POST" && path === "/api/push/test") {
    if (!jwk) {
      throw new HttpError(503, "Notificações push não configuradas no servidor");
    }

    await env.DB.prepare(
      "INSERT OR REPLACE INTO push_outbox (vault_id, tag, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(auth.vaultId, `test:${Date.now()}`, "Planner", "Notificações funcionando neste aparelho.", Date.now())
      .run();
    const sent = await pushVault(env, jwk, auth.vaultId, auth.deviceId);
    return json({ sent });
  }

  throw new HttpError(404, "Rota não encontrada");
}

/** `date` as wall-clock time in `timeZone`, in a Date whose UTC-runtime fields match it. */
function wallClock(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

interface PlanItem {
  tag: string;
  kind: "start" | "end";
  /** Minute of the event and the minute the alert window opens. */
  at: number;
  from: number;
  body: string;
}

function dayKeyOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** All of today's alert windows for a vault (read once per data change). */
async function buildPlan(env: Env, vaultId: string, now: Date, timeZone: string, settings: Partial<SettingsRecord>): Promise<PlanItem[]> {
  const todayKey = dayKeyOf(now);
  const taskRows = await env.DB.prepare("SELECT data FROM records WHERE vault_id = ? AND deleted = 0 AND collection = 'tasks'")
    .bind(vaultId)
    .all<{ data: string }>();
  // Shared resolve code reads createdAt with the runtime clock (UTC here), so shift it to the user's wall time.
  const tasks = taskRows.results
    .map((r) => JSON.parse(r.data) as Task)
    .filter((t) => t.startMinute !== null)
    .map((t) => ({ ...t, createdAt: wallClock(new Date(t.createdAt), timeZone).toISOString() }));

  const occurrences: Record<string, OccurrenceState> = {};
  const addRows = (rows: { data: string }[]) => {
    for (const r of rows) {
      const o = JSON.parse(r.data) as OccurrenceState;
      occurrences[o.id] = o;
    }
  };

  const today = await env.DB.prepare(
    "SELECT data FROM records WHERE vault_id = ? AND deleted = 0 AND collection = 'occurrences' AND id LIKE ?",
  )
    .bind(vaultId, `%:${todayKey}%`)
    .all<{ data: string }>();
  addRows(today.results);

  // "N dias após concluir" needs the completion history of those tasks.
  for (const t of tasks.filter((x) => x.recurrence.kind === "afterDone")) {
    const hist = await env.DB.prepare(
      "SELECT data FROM records WHERE vault_id = ? AND deleted = 0 AND collection = 'occurrences' AND id LIKE ?",
    )
      .bind(vaultId, `${t.id}:%`)
      .all<{ data: string }>();
    addRows(hist.results);
  }

  const plan: PlanItem[] = [];
  for (const occ of resolveDay({ tasks, occurrences, day: now, now })) {
    if (!occ.scheduled || occ.completed || occ.skipped) {
      continue;
    }

    const leadStart = occ.task.notifyBeforeStart ?? settings.notifyBeforeStart ?? 5;
    const leadEnd = occ.task.notifyBeforeEnd ?? settings.notifyBeforeEnd ?? 5;
    plan.push({ tag: `start:${occ.key}`, kind: "start", at: occ.startMinute, from: occ.startMinute - leadStart, body: occ.title });
    if (!occ.openEnded) {
      plan.push({ tag: `end:${occ.key}`, kind: "end", at: occ.endMinute, from: occ.endMinute - leadEnd, body: occ.title });
    }
  }

  return plan;
}

async function dueFor(env: Env, vaultId: string): Promise<{ tag: string; title: string; body: string }[]> {
  const row = await env.DB.prepare(
    `SELECT v.seq AS seq, p.day AS day, p.seq AS plan_seq, p.plan AS plan,
       (SELECT data FROM records WHERE vault_id = v.id AND collection = 'settings' AND deleted = 0 LIMIT 1) AS settings
     FROM vaults v LEFT JOIN push_plans p ON p.vault_id = v.id WHERE v.id = ?`,
  )
    .bind(vaultId)
    .first<{ seq: number; day: string | null; plan_seq: number | null; plan: string | null; settings: string | null }>();
  if (!row) {
    return [];
  }

  const settings = row.settings ? (JSON.parse(row.settings) as Partial<SettingsRecord>) : {};
  let timeZone = settings.timeZone ?? "America/Sao_Paulo";
  let now: Date;
  try {
    now = wallClock(new Date(), timeZone);
  } catch {
    timeZone = "UTC";
    now = wallClock(new Date(), timeZone);
  }

  const planDay = `${dayKeyOf(now)}#${PLAN_VERSION}`;
  let plan: PlanItem[];
  if (row.plan && row.day === planDay && row.plan_seq === row.seq) {
    plan = JSON.parse(row.plan) as PlanItem[];
  } else {
    plan = await buildPlan(env, vaultId, now, timeZone, settings);
    await env.DB.prepare(
      `INSERT INTO push_plans (vault_id, day, seq, plan) VALUES (?, ?, ?, ?)
       ON CONFLICT (vault_id) DO UPDATE SET day = excluded.day, seq = excluded.seq, plan = excluded.plan`,
    )
      .bind(vaultId, planDay, row.seq, JSON.stringify(plan))
      .run();
  }

  const minute = now.getHours() * 60 + now.getMinutes();
  return plan
    .filter((p) => minute >= p.from && minute <= p.at)
    .map((p) => {
      const left = p.at - minute;
      const title =
        p.kind === "start"
          ? left <= 0 ? "Começando agora" : `Começa em ${left} min`
          : left <= 0 ? "Terminando agora" : `Termina em ${left} min`;
      return { tag: p.tag, title, body: p.body };
    });
}

export async function runPushCron(env: Env): Promise<void> {
  const jwk = vapidJwk(env);
  if (!jwk) {
    return;
  }

  await env.DB.prepare("DELETE FROM push_outbox WHERE created_at < ?").bind(Date.now() - OUTBOX_TTL_MS).run();
  const { results } = await env.DB.prepare("SELECT DISTINCT vault_id FROM push_subscriptions").all<{ vault_id: string }>();

  for (const { vault_id: vaultId } of results) {
    try {
      const due = await dueFor(env, vaultId);
      if (due.length === 0) {
        continue;
      }

      const inserted = await env.DB.batch(
        due.map((n) =>
          env.DB.prepare(
            "INSERT OR IGNORE INTO push_outbox (vault_id, tag, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
          ).bind(vaultId, n.tag, n.title, n.body, Date.now()),
        ),
      );
      if (inserted.some((r) => (r.meta.changes ?? 0) > 0)) {
        await pushVault(env, jwk, vaultId);
      }
    } catch (err) {
      console.error("push cron", vaultId, err);
    }
  }
}
