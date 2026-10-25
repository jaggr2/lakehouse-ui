import type { Catalog, TableEntry } from "../artifacts/types.js";
import { normalizeTableId } from "../artifacts/catalog.js";
import type { MetaDb } from "../meta/db.js";
import { queriesTouching } from "../meta/usage.js";
import type { Clock } from "../util/time.js";

export interface ImpactReportBody {
  asset: string;
  downstream: {
    models: string[];
    contracts: string[];
    products: string[];
    queries: string[];
  };
  notes: string[];
}

/**
 * U4 impact analysis — "if I change X, what breaks".
 *
 * Downstream models come from the lineage graph (`derives_from` edges, from =
 * derived, to = source) so a rename of `mail_activity.message_id` reports the
 * models, contracts, products and logged queries that reference it.
 */
export function buildImpactReport(
  catalog: Catalog,
  meta: MetaDb,
  table: TableEntry,
  column: string | undefined,
  clock: Clock,
  lookbackDays: number,
): ImpactReportBody {
  const notes: string[] = [];
  const asset = column ? `${table.id}.${column}` : table.id;

  // 1. Downstream closure over the lineage graph.
  const downstreamIds = downstreamClosure(catalog, table.id);
  const affectedTables = new Set<string>([table.id]);
  for (const id of downstreamIds) {
    const asTable = normalizeTableId(id, catalog);
    if (asTable) affectedTables.add(asTable);
  }

  // 2. Models: the defining model plus everything derived from the table.
  const models = new Set<string>();
  const definingModel = table.model?.uniqueId;
  if (definingModel) models.add(definingModel);
  const modelNodes = new Set<string>();
  for (const id of downstreamIds) {
    const entry = catalog.tables.get(id);
    if (entry?.model) {
      models.add(entry.model.uniqueId);
      modelNodes.add(entry.model.uniqueId);
    } else if (id.startsWith("model.") || id.startsWith("source.")) {
      models.add(id);
      modelNodes.add(id);
    }
  }

  if (column) {
    const candidates = [...models];
    const mentioning = candidates.filter((uniqueId) => {
      const node = catalog.dbt.nodes.get(uniqueId);
      if (!node) return false;
      const sql = `${node.rawCode ?? ""}\n${node.compiledSql ?? ""}`;
      return new RegExp(`\\b${column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sql);
    });
    if (mentioning.length > 0) {
      models.clear();
      for (const uniqueId of mentioning) models.add(uniqueId);
    } else if (candidates.length > 0) {
      notes.push(
        `no model SQL mentions column '${column}' (dbt manifest may be stale) - ` +
          `reporting all downstream models instead`,
      );
    } else {
      notes.push(
        `no models known for this asset - column '${column}' cannot be resolved to model SQL`,
      );
    }
    notes.push("column-level matching is text-based; precise column lineage lands with U2 (sqlglot)");
  }

  // 3. Contracts + products over every affected table.
  const contracts = new Set<string>();
  const products = new Set<string>();
  for (const tableId of affectedTables) {
    const entry = catalog.tables.get(tableId);
    if (!entry) continue;
    if (entry.contract) contracts.add(entry.contract.id);
    if (entry.product) products.add(entry.product.id);
  }
  if (contracts.size === 0) {
    notes.push("no ODCS contract declares the affected tables - contract impact cannot be asserted");
  }

  // 4. Logged queries that touch the asset (Athena history + /query loop).
  const since = new Date(clock().getTime() - lookbackDays * 86_400_000);
  const refs = queriesTouching(meta, {
    tables: [...affectedTables],
    columns: column ? [column] : [],
    since,
  });
  const queries = [...new Set(refs.map(formatQueryRef))];
  if (queries.length === 0) {
    notes.push(`no queries logged against this asset in the last ${lookbackDays} days`);
  }
  if (catalog.dbt.missing) {
    notes.push("dbt manifest missing - downstream closure limited to the compiled graph");
  }

  return {
    asset,
    downstream: {
      models: [...models].sort(),
      contracts: [...contracts].sort(),
      products: [...products].sort(),
      queries: queries.slice(0, 50),
    },
    notes,
  };
}

/** BFS over `derives_from` edges (from = derived, to = upstream). */
function downstreamClosure(catalog: Catalog, start: string): string[] {
  const children = new Map<string, string[]>();
  for (const edge of catalog.graph.edges) {
    if (edge.kind !== "derives_from") continue;
    const list = children.get(edge.to) ?? [];
    list.push(edge.from);
    children.set(edge.to, list);
  }
  const seen = new Set<string>([start]);
  const queue = [start];
  const ordered: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of children.get(current) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      ordered.push(child);
      queue.push(child);
    }
  }
  return ordered;
}

function formatQueryRef(ref: { queryId: string | null; actor: string | null; ts: string; sql: string | null }): string {
  const id = ref.queryId ?? "(unlogged)";
  const actor = ref.actor ?? "unknown";
  const snippet = (ref.sql ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${id} · ${actor} · ${ref.ts}${snippet ? ` · ${snippet}` : ""}`;
}
