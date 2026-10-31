/**
 * Catalog MCP tools (U6): `catalog_lookup`, `lineage_of`, `impact_of`.
 *
 * Every tool wraps the catalog REST API through the internal Hono dispatch —
 * agents see exactly the data the SPA sees (contract-first: the same payloads
 * that openapi.yaml declares). Results come back as pretty-printed JSON text.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResponse {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export class UnknownToolError extends Error {
  constructor(name: string) {
    super(`unknown tool: ${name}`);
    this.name = "UnknownToolError";
  }
}

/** Internal dispatch — `path` is a full API path like `/api/tables/mail_activity`. */
export type ApiDispatch = (path: string) => Response | Promise<Response>;

export const CATALOG_TOOLS: ToolDefinition[] = [
  {
    name: "catalog_lookup",
    description:
      "Look up data products in the governed lakehouse catalog (gold layer). " +
      "Call this BEFORE choosing or recommending a data product: pass a free-text " +
      "query to find candidates, then pass product or table to get the detail " +
      "(purpose, limitations, trust score, certification, concepts). " +
      "Exactly one of query, product or table.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Free-text search across products, tables, columns and concepts.",
        },
        product: {
          type: "string",
          description: "Data product id (e.g. mail-activity) for its full summary.",
        },
        table: {
          type: "string",
          description: "Table id (e.g. lake_gold.mail_activity) for columns and trust.",
        },
      },
    },
  },
  {
    name: "lineage_of",
    description:
      "Lineage + relations neighborhood around a table (or one of its columns): " +
      "upstream sources and downstream consumers from the semantic/dbt graph, " +
      "plus the joined concept edges. Use before assuming where data comes from.",
    inputSchema: {
      type: "object",
      required: ["table"],
      properties: {
        table: {
          type: "string",
          description: "Table id (lake_gold.mail_activity or the bare name).",
        },
        column: {
          type: "string",
          description: "Optional column name for column-level lineage.",
        },
        depth: {
          type: "integer",
          description: "Neighborhood radius (default 2).",
        },
      },
    },
  },
  {
    name: "impact_of",
    description:
      "Blast radius of a change to a table or column: affected dbt models, " +
      "contracts, products and recently logged queries. Use before renaming, " +
      "dropping or re-typing anything.",
    inputSchema: {
      type: "object",
      required: ["table"],
      properties: {
        table: {
          type: "string",
          description: "Table id (lake_gold.mail_activity or the bare name).",
        },
        column: {
          type: "string",
          description: "Optional column name — narrows the blast radius.",
        },
      },
    },
  },
];

export async function callCatalogTool(
  dispatch: ApiDispatch,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  switch (name) {
    case "catalog_lookup":
      return catalogLookup(dispatch, args);
    case "lineage_of":
      return lineageOf(dispatch, args);
    case "impact_of":
      return impactOf(dispatch, args);
    default:
      throw new UnknownToolError(name);
  }
}

// ---------------------------------------------------------------------------

function text(payload: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function toolError(message: string): ToolResponse {
  return { content: [{ type: "text", text: message }], isError: true };
}

function argString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

async function fetchJson(dispatch: ApiDispatch, path: string): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const response = await dispatch(path);
  const body = (await response.json()) as Record<string, unknown>;
  return { ok: response.ok, body };
}

async function catalogLookup(dispatch: ApiDispatch, args: Record<string, unknown>): Promise<ToolResponse> {
  const query = argString(args, "query");
  const product = argString(args, "product");
  const table = argString(args, "table");
  const chosen = [query, product, table].filter((value) => value !== undefined);
  if (chosen.length !== 1) {
    return toolError("catalog_lookup needs exactly one of: query, product, table.");
  }

  if (query) {
    const { body } = await fetchJson(
      dispatch,
      `/api/search?q=${encodeURIComponent(query)}&limit=10`,
    );
    return text({ query, hits: body["hits"] ?? [] });
  }

  if (product) {
    const { ok, body } = await fetchJson(dispatch, `/api/products/${encodeURIComponent(product)}`);
    if (!ok) return toolError(`unknown product: ${product}`);
    // The raw ODCS contract is heavy — agents get its identity via the table view.
    const { contract: _contract, ...summary } = body;
    return text(summary);
  }

  const { ok, body } = await fetchJson(dispatch, `/api/tables/${encodeURIComponent(table as string)}`);
  if (!ok) return toolError(`unknown table: ${String(table)}`);
  const { contract: _contract, ...summary } = body;
  return text(summary);
}

async function lineageOf(dispatch: ApiDispatch, args: Record<string, unknown>): Promise<ToolResponse> {
  const table = argString(args, "table");
  if (!table) return toolError("lineage_of requires a table argument.");
  const column = argString(args, "column");
  const depth = typeof args["depth"] === "number" && args["depth"] > 0 ? Math.trunc(args["depth"]) : 2;

  const resolved = await fetchJson(dispatch, `/api/tables/${encodeURIComponent(table)}`);
  if (!resolved.ok) return toolError(`unknown table: ${table}`);
  const tableId = String(resolved.body["id"]);
  const asset = column ? `${tableId}.${column}` : tableId;

  const params = new URLSearchParams({ table: tableId, depth: String(depth) });
  if (column) params.set("column", column);
  const { ok, body } = await fetchJson(dispatch, `/api/lineage?${params.toString()}`);
  if (!ok) return toolError(`no lineage for ${asset}`);
  const edges = (body["edges"] ?? []) as { from: string; to: string; kind: string }[];

  return text({
    asset,
    depth,
    upstream: walk(edges, asset, "upstream"),
    downstream: walk(edges, asset, "downstream"),
    nodes: body["nodes"] ?? [],
    edges,
  });
}

async function impactOf(dispatch: ApiDispatch, args: Record<string, unknown>): Promise<ToolResponse> {
  const table = argString(args, "table");
  if (!table) return toolError("impact_of requires a table argument.");
  const column = argString(args, "column");

  const resolved = await fetchJson(dispatch, `/api/tables/${encodeURIComponent(table)}`);
  if (!resolved.ok) return toolError(`unknown table: ${table}`);
  const tableId = String(resolved.body["id"]);

  const params = new URLSearchParams({ table: tableId });
  if (column) params.set("column", column);
  const { ok, body } = await fetchJson(dispatch, `/api/impact?${params.toString()}`);
  if (!ok) return toolError(`no impact report for ${tableId}`);
  return text(body);
}

/**
 * Transitive closure over `derives_from` edges (from = derived, to = upstream —
 * ADR-005). `upstream` walks towards the sources, `downstream` towards the
 * consumers.
 */
function walk(
  edges: { from: string; to: string; kind: string }[],
  start: string,
  direction: "upstream" | "downstream",
): string[] {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "derives_from") continue;
    const [from, to] = direction === "upstream" ? [edge.from, edge.to] : [edge.to, edge.from];
    const list = next.get(from) ?? [];
    list.push(to);
    next.set(from, list);
  }
  const seen = new Set<string>([start]);
  const queue = [start];
  const ordered: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const id of next.get(current) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
      queue.push(id);
    }
  }
  return ordered;
}
