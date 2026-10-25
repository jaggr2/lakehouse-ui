import type { TableEntry } from "../artifacts/types.js";
import type { MetaDb } from "../meta/db.js";
import { fillDaily, usageStats, type UsageConsumer } from "../meta/usage.js";
import type { Clock } from "../util/time.js";

export interface UsageReportBody {
  tableId: string;
  windowDays: number;
  totalQueries: number;
  daily: { date: string; count: number }[];
  topConsumers: UsageConsumer[];
}

/** U4 usage view for one table: query counts over time + who runs them. */
export function buildUsageReport(
  meta: MetaDb,
  table: TableEntry,
  clock: Clock,
  windowDays: number,
): UsageReportBody {
  const now = clock();
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const stats = usageStats(meta, table.id, since);
  return {
    tableId: table.id,
    windowDays,
    totalQueries: stats.totalQueries,
    daily: fillDaily(stats, since, now),
    topConsumers: stats.topConsumers,
  };
}

/** Rollup for product lists — queries touching any of the product's tables. */
export function usageCountForTables(
  meta: MetaDb,
  tableIds: string[],
  clock: Clock,
  windowDays: number,
): number {
  const since = new Date(clock().getTime() - windowDays * 86_400_000);
  let total = 0;
  for (const tableId of tableIds) {
    total += usageStats(meta, tableId, since).totalQueries;
  }
  return total;
}
