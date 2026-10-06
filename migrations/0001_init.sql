-- Sync vaults: one per set of paired devices (no user accounts).
CREATE TABLE vaults (
  id TEXT PRIMARY KEY,
  recovery_hash TEXT NOT NULL UNIQUE,
  seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX devices_vault ON devices (vault_id);

-- One-time pairing codes shown as QR (short-lived).
CREATE TABLE pairings (
  code_hash TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Every synced record, last-writer-wins by updated_at; seq orders pulls.
CREATE TABLE records (
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (vault_id, collection, id)
);

CREATE INDEX records_seq ON records (vault_id, seq);

CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE INDEX push_subscriptions_vault ON push_subscriptions (vault_id);

-- Notifications computed by the cron, fetched by the service worker.
CREATE TABLE push_outbox (
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (vault_id, tag)
);
