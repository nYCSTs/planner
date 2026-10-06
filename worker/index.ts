import { HttpError, json, preflight, readJson, str } from "./http";
import { normalizeCode, randomCode, randomId, randomToken, sha256 } from "./crypto";
import { authenticate, type Auth, type Env } from "./auth";
import { pushRoutes, runPushCron } from "./push";

const COLLECTIONS = new Set(["tasks", "occurrences", "entries", "tags", "projects", "settings"]);
const PAIRING_TTL_MS = 10 * 60_000;
const MAX_CHANGES = 500;
const PULL_LIMIT = 1000;

function formatRecovery(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

async function newDevice(env: Env, vaultId: string, name: string) {
  const token = randomToken();
  const deviceId = randomId();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO devices (id, vault_id, token_hash, name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(deviceId, vaultId, await sha256(token), name, now, now)
    .run();
  return { vaultId, deviceId, token };
}

async function createVault(req: Request, env: Env) {
  const body = await readJson<{ deviceName?: string }>(req);
  const name = str(body.deviceName ?? "Aparelho", "deviceName", 60);
  const max = Number(env.MAX_VAULTS ?? 0);
  if (max > 0) {
    const row = await env.DB.prepare("SELECT count(*) AS n FROM vaults").first<{ n: number }>();
    if ((row?.n ?? 0) >= max) {
      throw new HttpError(403, "Este servidor já tem um cofre. Use \"Conectar a um aparelho\" com o QR de um aparelho sincronizado.");
    }
  }

  const vaultId = randomId();
  const recovery = randomCode(16);
  await env.DB.prepare("INSERT INTO vaults (id, recovery_hash, seq, created_at) VALUES (?, ?, 0, ?)")
    .bind(vaultId, await sha256(recovery), Date.now())
    .run();
  const device = await newDevice(env, vaultId, name);
  return json({ ...device, recoveryCode: formatRecovery(recovery) }, 201);
}

async function startPairing(env: Env, auth: Auth) {
  const code = randomCode(8);
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM pairings WHERE expires_at < ?").bind(Date.now()),
    env.DB.prepare("INSERT INTO pairings (code_hash, vault_id, created_by, expires_at) VALUES (?, ?, ?, ?)").bind(
      await sha256(code),
      auth.vaultId,
      auth.deviceId,
      expiresAt,
    ),
  ]);
  return json({ code, expiresAt });
}

async function completePairing(req: Request, env: Env) {
  const body = await readJson<{ code?: string; deviceName?: string }>(req);
  const code = normalizeCode(str(body.code, "code", 32));
  const name = str(body.deviceName ?? "Aparelho", "deviceName", 60);
  const hash = await sha256(code);
  const row = await env.DB.prepare("DELETE FROM pairings WHERE code_hash = ? RETURNING vault_id, expires_at")
    .bind(hash)
    .first<{ vault_id: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) {
    throw new HttpError(404, "Código inválido ou expirado");
  }

  return json(await newDevice(env, row.vault_id, name), 201);
}

async function recover(req: Request, env: Env) {
  const body = await readJson<{ recoveryCode?: string; deviceName?: string }>(req);
  const code = normalizeCode(str(body.recoveryCode, "recoveryCode", 64));
  const name = str(body.deviceName ?? "Aparelho", "deviceName", 60);
  const vault = await env.DB.prepare("SELECT id FROM vaults WHERE recovery_hash = ?")
    .bind(await sha256(code))
    .first<{ id: string }>();
  if (!vault) {
    throw new HttpError(404, "Código de recuperação inválido");
  }

  return json(await newDevice(env, vault.id, name), 201);
}

async function rotateRecovery(env: Env, auth: Auth) {
  const recovery = randomCode(16);
  await env.DB.prepare("UPDATE vaults SET recovery_hash = ? WHERE id = ?").bind(await sha256(recovery), auth.vaultId).run();
  return json({ recoveryCode: formatRecovery(recovery) });
}

async function listDevices(env: Env, auth: Auth) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, created_at, last_seen_at FROM devices WHERE vault_id = ? ORDER BY created_at",
  )
    .bind(auth.vaultId)
    .all<{ id: string; name: string; created_at: number; last_seen_at: number }>();
  return json({
    devices: results.map((d) => ({
      id: d.id,
      name: d.name,
      createdAt: d.created_at,
      lastSeenAt: d.last_seen_at,
      current: d.id === auth.deviceId,
    })),
  });
}

async function renameDevice(req: Request, env: Env, auth: Auth) {
  const body = await readJson<{ name?: string }>(req);
  await env.DB.prepare("UPDATE devices SET name = ? WHERE id = ?").bind(str(body.name, "name", 60), auth.deviceId).run();
  return json({ ok: true });
}

async function removeDevice(env: Env, auth: Auth, id: string) {
  await env.DB.prepare("DELETE FROM devices WHERE id = ? AND vault_id = ?").bind(id, auth.vaultId).run();
  return json({ ok: true });
}

async function deleteVault(env: Env, auth: Auth) {
  const v = auth.vaultId;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM records WHERE vault_id = ?").bind(v),
    env.DB.prepare("DELETE FROM push_outbox WHERE vault_id = ?").bind(v),
    env.DB.prepare("DELETE FROM push_plans WHERE vault_id = ?").bind(v),
    env.DB.prepare("DELETE FROM push_subscriptions WHERE vault_id = ?").bind(v),
    env.DB.prepare("DELETE FROM pairings WHERE vault_id = ?").bind(v),
    env.DB.prepare("DELETE FROM devices WHERE vault_id = ?").bind(v),
    env.DB.prepare("DELETE FROM vaults WHERE id = ?").bind(v),
  ]);
  return json({ ok: true });
}

interface Change {
  c: string;
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: unknown;
}

async function sync(req: Request, env: Env, auth: Auth) {
  const body = await readJson<{ cursor?: number; changes?: Change[] }>(req, 8_000_000);
  const cursor = Number.isFinite(body.cursor) ? Math.max(0, Number(body.cursor)) : 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length > MAX_CHANGES) {
    throw new HttpError(413, `No máximo ${MAX_CHANGES} alterações por vez`);
  }

  const valid = changes.filter(
    (ch) =>
      ch &&
      COLLECTIONS.has(ch.c) &&
      typeof ch.id === "string" &&
      ch.id.length > 0 &&
      ch.id.length <= 200 &&
      Number.isFinite(ch.updatedAt) &&
      ch.data &&
      typeof ch.data === "object",
  );

  if (valid.length) {
    // One transaction: seq numbers are assigned and committed together, so a
    // concurrent pull never skips a gap that is filled later.
    const stmts = valid.map((ch, i) =>
      env.DB.prepare(
        `INSERT INTO records (vault_id, collection, id, data, updated_at, deleted, seq)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT seq FROM vaults WHERE id = ?) + ?)
         ON CONFLICT (vault_id, collection, id) DO UPDATE SET
           data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = excluded.seq
         WHERE excluded.updated_at > records.updated_at`,
      ).bind(auth.vaultId, ch.c, ch.id, JSON.stringify(ch.data), ch.updatedAt, ch.deleted ? 1 : 0, auth.vaultId, i + 1),
    );
    stmts.push(env.DB.prepare("UPDATE vaults SET seq = seq + ? WHERE id = ?").bind(valid.length, auth.vaultId));
    await env.DB.batch(stmts);
  }

  const { results } = await env.DB.prepare(
    "SELECT collection, data, seq FROM records WHERE vault_id = ? AND seq > ? ORDER BY seq LIMIT ?",
  )
    .bind(auth.vaultId, cursor, PULL_LIMIT)
    .all<{ collection: string; data: string; seq: number }>();

  return json({
    cursor: results.length ? results[results.length - 1].seq : cursor,
    more: results.length === PULL_LIMIT,
    changes: results.map((r) => ({ c: r.collection, record: JSON.parse(r.data) })),
  });
}

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "");
  const m = req.method;

  if (m === "POST" && path === "/api/vault") {
    return createVault(req, env);
  }

  if (m === "POST" && path === "/api/pair/complete") {
    return completePairing(req, env);
  }

  if (m === "POST" && path === "/api/recover") {
    return recover(req, env);
  }

  const push = await pushRoutes(req, env, path);
  if (push) {
    return push;
  }

  const auth = await authenticate(req, env);

  if (m === "POST" && path === "/api/sync") {
    return sync(req, env, auth);
  }

  if (m === "POST" && path === "/api/pair/start") {
    return startPairing(env, auth);
  }

  if (m === "GET" && path === "/api/devices") {
    return listDevices(env, auth);
  }

  if (m === "PATCH" && path === "/api/devices/me") {
    return renameDevice(req, env, auth);
  }

  if (m === "DELETE" && path.startsWith("/api/devices/")) {
    return removeDevice(env, auth, decodeURIComponent(path.slice("/api/devices/".length)));
  }

  if (m === "POST" && path === "/api/vault/recovery") {
    return rotateRecovery(env, auth);
  }

  if (m === "DELETE" && path === "/api/vault") {
    return deleteVault(env, auth);
  }

  throw new HttpError(404, "Rota não encontrada");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(req);
    }

    if (req.method === "OPTIONS") {
      return preflight();
    }

    try {
      return await route(req, env, url);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, err.status);
      }

      console.error(err);
      return json({ error: "Erro interno" }, 500);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runPushCron(env));
  },
} satisfies ExportedHandler<Env>;
