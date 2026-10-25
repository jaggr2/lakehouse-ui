import type { MetaDb } from "./db.js";
import { requireRecord, requireString } from "../util/validate.js";
import { daysAgo, toIso, utcDay, type Clock } from "../util/time.js";

/**
 * usage_events — the closed loop from docs/ARTIFACTS.md: `/query` writes one
 * row per touched table, the Athena history importer writes the rest, and the
 * usage + impact views read from it.
 */
export interface UsageEventInput {
  ts: Date;
  tableId: string;
  actor?: string | undefined;
  queryId?: string | undefined;
  rowsReturned?: number | undefined;
  sql?: string | undefined;
}

export interface UsageQueryRef {
  queryId: string | null;
  actor: string | null;
  ts: string;
  sql: string | null;
  tableId: string;
}

function row(value: unknown, context: string): Record<string, unknown> {
  return requireRecord(value, context);
}

/**
 * Insert one event. `query_id` is unique when present: re-ingesting Athena
 * history (or replaying a logged query) is a no-op, first write wins — which
 * keeps the richer actor from the `/query` loop over the generic importer.
 */
export function recordUsage(meta: MetaDb, event: UsageEventInput): void {
  meta.db
    .prepare(
      `INSERT OR IGNORE INTO usage_events (ts, table_id, actor, query_id, rows_returned, sql)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      toIso(event.ts),
      event.tableId,
      event.actor ?? null,
      event.queryId ?? null,
      event.rowsReturned ?? null,
      event.sql ?? null,
    );
}

export function usageCount(meta: MetaDb, tableId: string, since: Date): number {
  const record = row(
    meta.db
      .prepare(`SELECT count(*) AS n FROM usage_events WHERE table_id = ? AND ts >= ?`)
      .get(tableId, toIso(since)),
    "usage_count",
  );
  return Number(record["n"] ?? 0);
}

export interface UsageDaily {
  date: string;
  count: number;
}

export interface UsageConsumer {
  actor: string;
  queries: number;
}

export interface UsageStats {
  totalQueries: number;
  daily: UsageDaily[];
  topConsumers: UsageConsumer[];
}

export function usageStats(meta: MetaDb, tableId: string, since: Date): UsageStats {
  const dailyRows = meta.db
    .prepare(
      `SELECT substr(ts, 1, 10) AS day, count(*) AS n
         FROM usage_events WHERE table_id = ? AND ts >= ?
        GROUP BY day ORDER BY day`,
    )
    .all(tableId, toIso(since));
  const daily: UsageDaily[] = dailyRows.map((value, index) => {
    const record = row(value, `usage_daily[${index}]`);
    return {
      date: requireString(record["day"], `usage_daily[${index}].day`),
      count: Number(record["n"] ?? 0),
    };
  });

  const consumerRows = meta.db
    .prepare(
      `SELECT coalesce(actor, 'unknown') AS actor, count(*) AS n
         FROM usage_events WHERE table_id = ? AND ts >= ?
        GROUP BY actor ORDER BY n DESC, actor LIMIT 5`,
    )
    .all(tableId, toIso(since));
  const topConsumers: UsageConsumer[] = consumerRows.map((value, index) => {
    const record = row(value, `usage_consumers[${index}]`);
    return {
      actor: requireString(record["actor"], `usage_consumers[${index}].actor`),
      queries: Number(record["n"] ?? 0),
    };
  });

  return {
    totalQueries: daily.reduce((sum, day) => sum + day.count, 0),
    daily,
    topConsumers,
  };
}

/** Fill missing days so charts get a continuous series. */
export function fillDaily(stats: UsageStats, since: Date, now: Date): UsageDaily[] {
  const byDate = new Map(stats.daily.map((day) => [day.date, day.count]));
  const daily: UsageDaily[] = [];
  for (let time = since.getTime(); time <= now.getTime(); time += 86_400_000) {
    const date = utcDay(new Date(time));
    daily.push({ date, count: byDate.get(date) ?? 0 });
  }
  return daily;
}

/**
 * Query log refs for impact analysis: events whose SQL touches one of the
 * given tables/columns (text-level match — column lineage lands in U2).
 */
export function queriesTouching(
  meta: MetaDb,
  opts: { tables: string[]; columns: string[]; since: Date },
): UsageQueryRef[] {
  const rows = meta.db
    .prepare(
      `SELECT query_id, actor, ts, sql, table_id
         FROM usage_events WHERE ts >= ? AND sql IS NOT NULL`,
    )
    .all(toIso(opts.since));
  const tables = opts.tables.map((table) => table.toLowerCase());
  const columns = opts.columns.map((column) => column.toLowerCase());
  const refs: UsageQueryRef[] = [];
  rows.forEach((value, index) => {
    const record = row(value, `usage_refs[${index}]`);
    const sql = record["sql"];
    if (typeof sql !== "string") return;
    const lower = sql.toLowerCase();
    const tableHit = tables.some((table) => lower.includes(table) || lower.includes(table.split(".").pop() ?? table));
    const columnHit = columns.some((column) => new RegExp(`\\b${escapeRegExp(column)}\\b`, "i").test(sql));
    if (!tableHit) return;
    if (columns.length > 0 && !columnHit) return;
    refs.push({
      queryId: typeof record["query_id"] === "string" ? record["query_id"] : null,
      actor: typeof record["actor"] === "string" ? record["actor"] : null,
      ts: typeof record["ts"] === "string" ? record["ts"] : toIso(new Date(0)),
      sql,
      tableId: requireString(record["table_id"], `usage_refs[${index}].table_id`),
    });
  });
  return refs;
}

export function usageSinceDays(meta: MetaDb, clock: Clock, days: number): Date {
  return daysAgo(clock, days);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
