import type { Catalog } from "../artifacts/types.js";
import type { MetaDb } from "../meta/db.js";
import { recordUsage } from "../meta/usage.js";
import { resolveTableRef, tableRefsIn } from "../util/sql.js";
import type { Clock } from "../util/time.js";
import { generateSql, type GoldenQuestion, type LlmConfig } from "./generate.js";
import type { McpClient } from "./mcp.js";
import { parseQueryProductOutput } from "./parse.js";

export interface QueryInput {
  prompt?: string | undefined;
  sql?: string | undefined;
  actor: string;
}

export interface QueryGrounding {
  concepts: string[];
  joins: string[];
  timezone: string;
}

export interface GenerationInfo {
  llmUsed: boolean;
  fallback: boolean;
  goldenMatch: string | null;
  goldenScore: number;
}

export interface QueryResponseBody {
  sql: string;
  columns: string[];
  rows: string[][];
  grounding: QueryGrounding;
  truncated: boolean;
  generation?: GenerationInfo;
}

export interface QueryServiceDeps {
  catalog: Catalog;
  meta: MetaDb;
  mcp: McpClient;
  clock: Clock;
  llm?: LlmConfig | null;
  golden?: GoldenQuestion[];
}

export class QueryRejected extends Error {}
export class QueryNotImplemented extends Error {}

/**
 * `POST /query` — SQL goes to the guarded lakehouse-mcp (gold-only, scan
 * caps), results come back with the grounding we know from the catalog, and
 * one usage event per touched table closes the loop the usage/impact views
 * read (docs/ARTIFACTS.md).
 */
export async function runQuery(deps: QueryServiceDeps, input: QueryInput): Promise<QueryResponseBody> {
  let sql = (input.sql ?? "").trim();
  let generation: GenerationInfo | undefined;
  if (sql === "") {
    const prompt = (input.prompt ?? "").trim();
    if (prompt === "") {
      throw new QueryNotImplemented("pass `sql` or a natural-language `prompt`");
    }
    const generated = await generateSql(deps.catalog, deps.golden ?? [], prompt, deps.llm ?? null);
    sql = generated.sql;
    generation = {
      llmUsed: generated.llmUsed,
      fallback: generated.fallback,
      goldenMatch: generated.plan.golden?.q ?? null,
      goldenScore: generated.plan.goldenScore,
    };
  }
  const raw = await deps.mcp.callTool("query_product", { sql });
  const parsed = parseQueryProductOutput(raw);
  if (parsed.kind === "rejected") {
    throw new QueryRejected(parsed.reason);
  }

  const tableIds = tableRefsIn(sql)
    .map((ref) => resolveTableRef(ref, deps.catalog.database, deps.catalog.tables))
    .filter((id): id is string => id !== null);

  const now = deps.clock();
  const queryId = parsed.queryId;
  const rowsReturned = parsed.kind === "result" ? parsed.rows.length : 0;
  for (const tableId of new Set(tableIds)) {
    recordUsage(deps.meta, {
      ts: now,
      tableId,
      actor: input.actor,
      queryId: queryId ?? undefined,
      rowsReturned,
      sql,
    });
  }

  return {
    sql,
    columns: parsed.kind === "result" ? parsed.columns : [],
    rows: parsed.kind === "result" ? parsed.rows : [],
    grounding: groundingFor(deps.catalog, tableIds),
    truncated: parsed.kind === "result" ? parsed.truncated : false,
    generation,
  };
}

function groundingFor(catalog: Catalog, tableIds: string[]): QueryGrounding {
  const concepts = new Set<string>();
  for (const tableId of tableIds) {
    const table = catalog.tables.get(tableId);
    for (const column of table?.columns ?? []) {
      if (column.concept) concepts.add(column.concept);
    }
  }
  let timezone = "UTC";
  for (const conceptId of concepts) {
    const concept = catalog.conceptsById.get(conceptId);
    if (concept?.timeSemantics?.timezone) timezone = concept.timeSemantics.timezone;
  }
  return {
    concepts: [...concepts].sort(),
    joins: [],
    timezone,
  };
}
