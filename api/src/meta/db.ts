import { DatabaseSync } from "node:sqlite";

/**
 * meta.db — ours (see docs/ARTIFACTS.md): usage events, annotations and a
 * graph cache. Bootstrap is idempotent; migrations are additive only.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  table_id TEXT NOT NULL,
  actor TEXT,
  query_id TEXT,
  rows_returned INTEGER,
  sql TEXT
);
CREATE TABLE IF NOT EXISTS annotations (
  asset_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT,
  ts TEXT NOT NULL,
  PRIMARY KEY (asset_id, kind, ts)
);
CREATE TABLE IF NOT EXISTS graph_cache (
  id INTEGER PRIMARY KEY,
  built_ts TEXT NOT NULL,
  graph_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_table_ts ON usage_events (table_id, ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_query_id ON usage_events (query_id) WHERE query_id IS NOT NULL;
`;

export interface MetaDb {
  db: DatabaseSync;
  path: string;
  close(): void;
}

export function openMetaDb(path: string): MetaDb {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA_SQL);
  return {
    db,
    path,
    close: () => db.close(),
  };
}
