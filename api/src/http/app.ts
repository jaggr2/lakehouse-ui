import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";

import { normalizeTableId } from "../artifacts/catalog.js";
import type { Catalog, TableEntry } from "../artifacts/types.js";
import { buildImpactReport } from "../impact/report.js";
import type { MetaDb } from "../meta/db.js";
import { buildQualityReport, tableTrustScore } from "../quality/report.js";
import { collectQuality, testSummary } from "../quality/rules.js";
import { freshnessFor } from "../quality/freshness.js";
import { QueryNotImplemented, QueryRejected, runQuery } from "../query/service.js";
import type { McpClient } from "../query/mcp.js";
import { searchCatalog } from "../search.js";
import { buildUsageReport, usageCountForTables } from "../usage/report.js";
import type { Clock } from "../util/time.js";

export interface AppDeps {
  catalog: Catalog;
  meta: MetaDb;
  mcp: McpClient;
  clock: Clock;
  usageWindowDays: number;
  queryLookbackDays: number;
  specPath?: string;
}

const SPEC_PATH = path.resolve(
  fileURLToPath(new URL("../../../openapi.yaml", import.meta.url)),
);

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const api = new Hono();

  api.get("/health", (c) => {
    const artifacts: Record<string, string> = { ...deps.catalog.health };
    try {
      deps.meta.db.prepare("SELECT 1 AS ok").get();
      artifacts["meta_db"] = `ok - ${deps.meta.path}`;
    } catch (error) {
      artifacts["meta_db"] = `degraded - ${String(error)}`;
    }
    const degraded = Object.values(artifacts).some((value) => value.startsWith("degraded"));
    return c.json({ status: degraded ? "degraded" : "ok", artifacts });
  });

  api.get("/openapi.yaml", (c) => {
    const file = deps.specPath ?? SPEC_PATH;
    return c.body(fs.readFileSync(file, "utf8"), 200, { "content-type": "application/yaml" });
  });

  api.get("/search", (c) => {
    const q = c.req.query("q") ?? "";
    const limit = parsePositiveInt(c.req.query("limit"), 20);
    return c.json({ hits: searchCatalog(deps.catalog, q, limit) });
  });

  api.get("/products", (c) => {
    return c.json({
      products: deps.catalog.products.map((product) => {
        const tables = tableEntriesOf(deps.catalog, product.id);
        return {
          id: product.id,
          name: product.name,
          purpose: product.description.purpose,
          status: product.status,
          tables: tables.map((table) => table.id),
          trustScore: averageTrust(deps, tables),
          usageCount: usageCountForTables(
            deps.meta,
            tables.map((table) => table.id),
            deps.clock,
            deps.usageWindowDays,
          ),
        };
      }),
    });
  });

  api.get("/products/:productId", (c) => {
    const product = deps.catalog.products.find((item) => item.id === c.req.param("productId"));
    if (!product) return c.json({ error: "unknown product" }, 404);
    const tables = tableEntriesOf(deps.catalog, product.id);
    const concepts = new Set<string>();
    for (const table of tables) {
      for (const column of table.columns) {
        if (column.concept) concepts.add(column.concept);
      }
    }
    const contract = tables.find((table) => table.contract)?.contract;
    return c.json({
      id: product.id,
      name: product.name,
      purpose: product.description.purpose,
      status: product.status,
      tables: tables.map((table) => table.id),
      trustScore: averageTrust(deps, tables),
      usageCount: usageCountForTables(
        deps.meta,
        tables.map((table) => table.id),
        deps.clock,
        deps.usageWindowDays,
      ),
      contract: contract?.raw,
      limitations: product.description.limitations ?? contract?.description.limitations,
      concepts: [...concepts].sort(),
    });
  });

  api.get("/tables/:tableId", (c) => {
    const table = resolveTable(deps, c.req.param("tableId"));
    if (!table) return c.json({ error: "unknown table" }, 404);
    const freshness = freshnessFor(deps.catalog, table, deps.clock);
    const freshnessStatus = freshness.status === "fresh" ? "pass" : freshness.status === "warn" ? "warn" : freshness.status === "stale" ? "fail" : "unknown";
    const { rules } = collectQuality({
      catalog: deps.catalog,
      table,
      freshnessStatus,
      freshnessDescription: freshness.note,
    });
    return c.json({
      id: table.id,
      database: table.database,
      columns: table.columns.map((column) => ({
        name: column.name,
        type: column.type,
        description: column.description,
        concept: column.concept ?? null,
        quality: rules.filter((rule) => rule.column === column.name).map((rule) => rule.name),
      })),
      contract: table.contract?.raw,
      trustScore: tableTrustScore(deps.catalog, deps.meta, table, deps.clock, {
        usageWindowDays: deps.usageWindowDays,
      }),
    });
  });

  api.get("/quality/:tableId", (c) => {
    const table = resolveTable(deps, c.req.param("tableId"));
    if (!table) return c.json({ error: "unknown table" }, 404);
    return c.json(
      buildQualityReport(deps.catalog, deps.meta, table, deps.clock, {
        usageWindowDays: deps.usageWindowDays,
      }),
    );
  });

  api.get("/usage/:tableId", (c) => {
    const table = resolveTable(deps, c.req.param("tableId"));
    if (!table) return c.json({ error: "unknown table" }, 404);
    const days = parsePositiveInt(c.req.query("days"), deps.usageWindowDays);
    return c.json(buildUsageReport(deps.meta, table, deps.clock, days));
  });

  api.get("/lineage", (c) => {
    const tableParam = c.req.query("table");
    if (!tableParam) return c.json({ error: "table query parameter is required" }, 400);
    const table = resolveTable(deps, tableParam);
    if (!table) return c.json({ error: "unknown table" }, 404);
    const column = c.req.query("column");
    const depth = parsePositiveInt(c.req.query("depth"), 2);
    return c.json(lineageGraph(deps, table, column, depth));
  });

  api.get("/impact", (c) => {
    const tableParam = c.req.query("table");
    if (!tableParam) return c.json({ error: "table query parameter is required" }, 400);
    const table = resolveTable(deps, tableParam);
    if (!table) return c.json({ error: "unknown table" }, 404);
    return c.json(
      buildImpactReport(deps.catalog, deps.meta, table, c.req.query("column"), deps.clock, deps.queryLookbackDays),
    );
  });

  api.get("/concepts", (c) => {
    return c.json({
      concepts: deps.catalog.concepts.map((concept) => {
        const columns: { table: string; column: string; role?: string }[] = [];
        for (const mapping of deps.catalog.mappings) {
          for (const [column, spec] of mapping.columns) {
            if (spec.concept === concept.id) {
              columns.push({ table: mapping.table, column, role: spec.role });
            }
          }
        }
        return {
          id: concept.id,
          label: concept.label,
          synonyms: concept.synonyms,
          unit: concept.unit,
          grain: concept.grain,
          columns,
        };
      }),
    });
  });

  api.post("/query", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { prompt?: unknown; sql?: unknown };
    const actor = c.req.header("x-actor") ?? "workbench";
    try {
      const result = await runQuery(
        {
          catalog: deps.catalog,
          meta: deps.meta,
          mcp: deps.mcp,
          clock: deps.clock,
        },
        {
          prompt: typeof body.prompt === "string" ? body.prompt : undefined,
          sql: typeof body.sql === "string" ? body.sql : undefined,
          actor,
        },
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof QueryNotImplemented) {
        return c.json({ error: error.message }, 501);
      }
      if (error instanceof QueryRejected) {
        return c.json({ error: `query rejected: ${error.message}` }, 400);
      }
      return c.json({ error: `query failed: ${String(error)}` }, 502);
    }
  });

  app.route("/api", api);
  return app;
}

// ---------------------------------------------------------------------------

function resolveTable(deps: AppDeps, raw: string): TableEntry | null {
  const id = normalizeTableId(raw, deps.catalog);
  return id ? (deps.catalog.tables.get(id) ?? null) : null;
}

function tableEntriesOf(catalog: Catalog, productId: string): TableEntry[] {
  return [...catalog.tables.values()].filter((table) => table.product?.id === productId);
}

function averageTrust(deps: AppDeps, tables: TableEntry[]): number {
  if (tables.length === 0) return 0;
  const scores = tables.map((table) =>
    tableTrustScore(deps.catalog, deps.meta, table, deps.clock, {
      usageWindowDays: deps.usageWindowDays,
    }),
  );
  return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1));
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Neighborhood of one asset in the lineage/relations graph. Walks every edge
 * kind in both directions up to `depth`.
 */
function lineageGraph(
  deps: AppDeps,
  table: TableEntry,
  column: string | undefined,
  depth: number,
): { nodes: unknown[]; edges: unknown[] } {
  const startId = column ? `${table.id}.${column}` : table.id;
  const { nodes, edges } = deps.catalog.graph;

  const visited = new Set<string>([startId]);
  let frontier = new Set<string>([startId]);
  const seenEdges = new Set<string>();
  const keptEdges: typeof edges = [];
  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const edge of edges) {
      if (!frontier.has(edge.from) && !frontier.has(edge.to)) continue;
      const key = `${edge.from}|${edge.kind}|${edge.to}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        keptEdges.push(edge);
      }
      for (const id of [edge.from, edge.to]) {
        if (visited.has(id)) continue;
        visited.add(id);
        next.add(id);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  return {
    nodes: nodes.filter((node) => visited.has(node.id)),
    edges: keptEdges,
  };
}
