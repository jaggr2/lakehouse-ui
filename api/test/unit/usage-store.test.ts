import { describe, expect, it } from "vitest";

import { openMetaDb } from "../../src/meta/db.js";
import {
  fillDaily,
  purgeUsageBefore,
  queriesTouching,
  recordUsage,
  usageCount,
  usageStats,
} from "../../src/meta/usage.js";
import { fixedClock } from "../helpers/fixtures.js";

const NOW = fixedClock()(); // 2026-10-25T08:00Z
const DAY = 86_400_000;

describe("usage_events store", () => {
  it("bootstraps the documented schema", () => {
    const meta = openMetaDb(":memory:");
    const tables = meta.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(["annotations", "graph_cache", "usage_events"]);
    meta.close();
  });

  it("counts and groups by day and actor", () => {
    const meta = openMetaDb(":memory:");
    recordUsage(meta, { ts: NOW, tableId: "lake_gold.a", actor: "ui", queryId: "q1", sql: "select 1 from a" });
    recordUsage(meta, { ts: new Date(NOW.getTime() - DAY), tableId: "lake_gold.a", actor: "ui", queryId: "q2", sql: "select 2 from a" });
    recordUsage(meta, { ts: new Date(NOW.getTime() - 2 * DAY), tableId: "lake_gold.a", actor: "mcp", queryId: "q3", sql: "select 3 from a" });

    expect(usageCount(meta, "lake_gold.a", new Date(0))).toBe(3);
    const stats = usageStats(meta, "lake_gold.a", new Date(NOW.getTime() - 30 * DAY));
    expect(stats.totalQueries).toBe(3);
    expect(stats.daily).toEqual([
      { date: "2026-10-23", count: 1 },
      { date: "2026-10-24", count: 1 },
      { date: "2026-10-25", count: 1 },
    ]);
    expect(stats.topConsumers).toEqual([
      { actor: "ui", queries: 2 },
      { actor: "mcp", queries: 1 },
    ]);
    meta.close();
  });

  it("fills missing days for charting", () => {
    const meta = openMetaDb(":memory:");
    recordUsage(meta, { ts: NOW, tableId: "lake_gold.a", actor: "ui", queryId: "q1", sql: "select 1 from a" });
    const stats = usageStats(meta, "lake_gold.a", new Date(NOW.getTime() - 3 * DAY));
    const daily = fillDaily(stats, new Date(NOW.getTime() - 3 * DAY), NOW);
    expect(daily).toEqual([
      { date: "2026-10-22", count: 0 },
      { date: "2026-10-23", count: 0 },
      { date: "2026-10-24", count: 0 },
      { date: "2026-10-25", count: 1 },
    ]);
    meta.close();
  });

  it("finds logged queries touching a table or column", () => {
    const meta = openMetaDb(":memory:");
    recordUsage(meta, {
      ts: NOW,
      tableId: "lake_gold.a",
      actor: "ui",
      queryId: "q1",
      sql: "select message_id from mail_activity",
    });
    recordUsage(meta, {
      ts: NOW,
      tableId: "lake_gold.a",
      actor: "ui",
      queryId: "q2",
      sql: "select subject from mail_activity",
    });
    const refs = queriesTouching(meta, {
      tables: ["lake_gold.mail_activity"],
      columns: ["message_id"],
      since: new Date(NOW.getTime() - DAY),
    });
    expect(refs.map((ref) => ref.queryId)).toEqual(["q1"]);
    meta.close();
  });

  it("purges usage events older than the retention cutoff", () => {
    const meta = openMetaDb(":memory:");
    const yearsAgo = (years: number) => new Date(NOW.getTime() - years * 365 * DAY);
    recordUsage(meta, { ts: yearsAgo(4), tableId: "lake_gold.a", actor: "ui", queryId: "old-1", sql: "select 1 from a" });
    recordUsage(meta, { ts: yearsAgo(2), tableId: "lake_gold.a", actor: "ui", queryId: "mid-1", sql: "select 2 from a" });
    recordUsage(meta, { ts: NOW, tableId: "lake_gold.a", actor: "ui", queryId: "new-1", sql: "select 3 from a" });

    // default retention: 3 years
    const deleted = purgeUsageBefore(meta, yearsAgo(3));
    expect(deleted).toBe(1);
    const remaining = meta.db
      .prepare(`SELECT query_id FROM usage_events ORDER BY ts`)
      .all()
      .map((row) => (row as { query_id: string }).query_id);
    expect(remaining).toEqual(["mid-1", "new-1"]);

    // idempotent: nothing else falls out
    expect(purgeUsageBefore(meta, yearsAgo(3))).toBe(0);
    meta.close();
  });
});
