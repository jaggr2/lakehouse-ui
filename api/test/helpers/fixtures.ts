import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCatalog } from "../../src/artifacts/catalog.js";
import type { Catalog } from "../../src/artifacts/types.js";
import { createApp, type AppDeps } from "../../src/http/app.js";
import { openMetaDb, type MetaDb } from "../../src/meta/db.js";
import type { McpClient } from "../../src/query/mcp.js";
import type { Clock } from "../../src/util/time.js";

export const FIXTURES_DIR = path.resolve(fileURLToPath(new URL("../fixtures", import.meta.url)));
export const FIXTURE_ARTIFACTS = path.join(FIXTURES_DIR, "artifacts");
export const FIXTURE_DBT_TARGET = path.join(FIXTURE_ARTIFACTS, "dbt", "target");

/** Fixed "now" for deterministic freshness/usage math: 2026-10-25T08:00Z. */
export const FIXED_NOW = new Date("2026-10-25T08:00:00.000Z");

export function fixedClock(now: Date = FIXED_NOW): Clock {
  return () => new Date(now.getTime());
}

export function fixtureCatalog(): Catalog {
  return loadCatalog({
    artifactsDir: FIXTURE_ARTIFACTS,
    dbtTargetDir: FIXTURE_DBT_TARGET,
    database: "lake_gold",
  });
}

export interface FakeMcp extends McpClient {
  calls: { name: string; args: Record<string, unknown> }[];
}

export function fakeMcp(result: string): FakeMcp {
  const calls: FakeMcp["calls"] = [];
  return {
    calls,
    async callTool(name, args) {
      calls.push({ name, args });
      return result;
    },
  };
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  catalog: Catalog;
  meta: MetaDb;
  mcp: FakeMcp;
  deps: AppDeps;
}

export function makeApp(options: { mcpResult?: string; clock?: Clock } = {}): TestApp {
  const catalog = fixtureCatalog();
  const meta = openMetaDb(":memory:");
  const mcp = fakeMcp(options.mcpResult ?? "Query succeeded: no rows.");
  const deps: AppDeps = {
    catalog,
    meta,
    mcp,
    clock: options.clock ?? fixedClock(),
    usageWindowDays: 30,
    queryLookbackDays: 90,
  };
  return { app: createApp(deps), catalog, meta, mcp, deps };
}

/** JSON response helper: parse the body of an app.request() response. */
export async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}
