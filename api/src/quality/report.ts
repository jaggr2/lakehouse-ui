import type { Catalog, TableEntry } from "../artifacts/types.js";
import type { MetaDb } from "../meta/db.js";
import { usageCount } from "../meta/usage.js";
import { type Clock } from "../util/time.js";

import { collectQuality, testSummary, type RuleView, type TestView } from "./rules.js";
import { freshnessFor, type FreshnessView } from "./freshness.js";
import { trustScore, type TrustBreakdown } from "./trust.js";

export interface QualityReportBody {
  tableId: string;
  trustScore: number;
  trust: TrustBreakdown;
  freshness: FreshnessView;
  rules: RuleView[];
  testHistory: TestView[];
}

export interface QualityOptions {
  usageWindowDays: number;
}

/** The full U3 panel for one table: rules, tests, freshness, trust index. */
export function buildQualityReport(
  catalog: Catalog,
  meta: MetaDb,
  table: TableEntry,
  clock: Clock,
  options: QualityOptions,
): QualityReportBody {
  const freshness = freshnessFor(catalog, table, clock);
  const freshnessStatus =
    freshness.status === "fresh" ? "pass" : freshness.status === "warn" ? "warn" : freshness.status === "stale" ? "fail" : "unknown";
  const { rules, testHistory } = collectQuality({
    catalog,
    table,
    freshnessStatus,
    freshnessDescription: freshness.note,
  });

  const trust = trustScore({
    table,
    tests: testSummary(testHistory),
    freshness: { status: freshness.status, ageHours: freshness.ageHours },
    usageQueries: usageCount(meta, table.id, sinceDays(clock, options.usageWindowDays)),
    usageWindowDays: options.usageWindowDays,
  });

  return {
    tableId: table.id,
    trustScore: trust.score,
    trust,
    freshness,
    rules,
    testHistory,
  };
}

/** Trust index alone — used for the product/table rollups. */
export function tableTrustScore(
  catalog: Catalog,
  meta: MetaDb,
  table: TableEntry,
  clock: Clock,
  options: QualityOptions,
): number {
  return buildQualityReport(catalog, meta, table, clock, options).trustScore;
}

function sinceDays(clock: Clock, days: number): Date {
  return new Date(clock().getTime() - days * 86_400_000);
}
