import { HttpError } from "./http";
import { sha256 } from "./crypto";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Private VAPID key as a JWK JSON string (wrangler secret). */
  VAPID_JWK?: string;
  /** "mailto:" or https URL identifying the sender to push services. */
  VAPID_SUBJECT?: string;
}

export interface Auth {
  vaultId: string;
  deviceId: string;
}

export async function authenticate(req: Request, env: Env): Promise<Auth> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    throw new HttpError(401, "Sem token");
  }

  const row = await env.DB.prepare("SELECT id, vault_id, last_seen_at FROM devices WHERE token_hash = ?")
    .bind(await sha256(token))
    .first<{ id: string; vault_id: string; last_seen_at: number }>();
  if (!row) {
    throw new HttpError(401, "Aparelho não autorizado");
  }

  if (Date.now() - row.last_seen_at > 5 * 60_000) {
    await env.DB.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  }

  return { vaultId: row.vault_id, deviceId: row.id };
}
