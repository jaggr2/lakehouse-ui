import type { MetaDb } from "../meta/db.js";
import { recordUsage } from "../meta/usage.js";
import { resolveTableRef, tableRefsIn } from "../util/sql.js";
import type { Clock } from "../util/time.js";

/**
 * U4 usage ingestion: Athena query history (`ListQueryExecutions`) is the
 * "everything else ran here" source; the `/query` loop writes the workbench's
 * own events. Both land in `usage_events` (docs/ARTIFACTS.md).
 */

export interface AthenaQueryExecution {
  queryId: string;
  sql: string;
  database: string | null;
  submittedAt: Date | null;
  workgroup: string | null;
  rowsReturned: number | null;
  succeeded: boolean;
}

export interface AthenaHistorySource {
  listExecutions(since: Date): Promise<AthenaQueryExecution[]>;
}

export interface IngestOptions {
  since: Date;
  clock: Clock;
  database: string;
  /** Actor label for imported events, e.g. `athena:lakehouse-read`. */
  actor: string;
  /** Known catalog table ids (`catalog.tables`), for reference resolution. */
  knownTables: Map<string, unknown>;
}

export interface IngestResult {
  scanned: number;
  recorded: number;
  tables: string[];
}

/**
 * Import Athena query history into `usage_events`. Re-running is a no-op per
 * query (`query_id` is unique), so the importer can be scheduled freely.
 */
export async function ingestAthenaHistory(
  meta: MetaDb,
  source: AthenaHistorySource,
  options: IngestOptions,
): Promise<IngestResult> {
  const executions = await source.listExecutions(options.since);
  let recorded = 0;
  const tables = new Set<string>();
  for (const execution of executions) {
    if (!execution.succeeded) continue;
    const refs = tableRefsIn(execution.sql)
      .map((ref) => resolveTableRef(ref, options.database, options.knownTables))
      .filter((id): id is string => id !== null);
    for (const tableId of new Set(refs)) {
      recordUsage(meta, {
        ts: execution.submittedAt ?? options.clock(),
        tableId,
        actor: options.actor,
        queryId: execution.queryId,
        rowsReturned: execution.rowsReturned ?? undefined,
        sql: execution.sql,
      });
      tables.add(tableId);
      recorded += 1;
    }
  }
  return { scanned: executions.length, recorded, tables: [...tables].sort() };
}
