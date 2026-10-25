import path from "node:path";

/**
 * Configuration comes from the environment only (no secrets in git).
 * See AGENTS.md §1 and docs/ARTIFACTS.md.
 */
export interface ApiConfig {
  /** Checkout of jaggr2/home-control-server-config/lakehouse. */
  artifactsDir: string;
  /** SQLite file for usage events, annotations and the graph cache (ours). */
  metaDbPath: string;
  /** Where dbt publishes manifest.json / run_results.json. */
  dbtTargetDir: string;
  /** Guarded lakehouse-mcp endpoint (gold-only SQL). */
  mcpEndpoint: string;
  mcpTimeoutMs: number;
  /** Gold database name — table ids are `<database>.<table>`. */
  database: string;
  host: string;
  port: number;
  /** Default window for usage reports (days). */
  usageWindowDays: number;
  /** How far back impact analysis looks for affected queries (days). */
  queryLookbackDays: number;
}

function intFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const artifactsDir = path.resolve(env["LAKEHOUSE_ARTIFACTS_DIR"] ?? "artifacts");
  const metaDbPath = path.resolve(env["LAKEHOUSE_META_DB"] ?? "meta.db");
  const dbtTargetDir = path.resolve(
    env["LAKEHOUSE_DBT_TARGET_DIR"] ?? path.join(artifactsDir, "dbt", "target"),
  );
  return {
    artifactsDir,
    metaDbPath,
    dbtTargetDir,
    mcpEndpoint: env["MCP_ENDPOINT"] ?? "http://10.30.0.1:8090/mcp",
    mcpTimeoutMs: intFromEnv(env, "MCP_TIMEOUT_MS", 120_000),
    database: env["LAKEHOUSE_DATABASE"] ?? "lake_gold",
    host: env["HOST"] ?? "127.0.0.1",
    port: intFromEnv(env, "PORT", 8787),
    usageWindowDays: intFromEnv(env, "LAKEHOUSE_USAGE_WINDOW_DAYS", 30),
    queryLookbackDays: intFromEnv(env, "LAKEHOUSE_QUERY_LOOKBACK_DAYS", 90),
  };
}
