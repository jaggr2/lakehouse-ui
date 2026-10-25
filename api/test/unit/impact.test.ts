import { describe, expect, it } from "vitest";

import { buildImpactReport } from "../../src/impact/report.js";
import { recordUsage } from "../../src/meta/usage.js";
import { fixedClock, fixtureCatalog, makeApp } from "../helpers/fixtures.js";
import { openMetaDb } from "../../src/meta/db.js";

const NOW = fixedClock()();

describe("buildImpactReport", () => {
  it("walks the derives_from closure and groups the blast radius", () => {
    const catalog = fixtureCatalog();
    catalog.graph.edges.push({
      from: "lake_gold.parcel_events",
      to: "lake_gold.mail_activity",
      kind: "derives_from",
    });
    const meta = openMetaDb(":memory:");
    const table = catalog.tables.get("lake_gold.mail_activity");
    if (!table) throw new Error("fixture table missing");

    const report = buildImpactReport(catalog, meta, table, undefined, fixedClock(), 90);
    expect(report.asset).toBe("lake_gold.mail_activity");
    expect(report.downstream.models).toEqual([
      "model.lakehouse.mail_activity",
      "model.lakehouse.parcel_events",
    ]);
    expect(report.downstream.contracts).toEqual(["mail-activity", "parcel-events"]);
    expect(report.downstream.queries).toEqual([]);
    expect(report.notes).toContainEqual(expect.stringContaining("no queries logged"));
    meta.close();
  });

  it("narrows to models and queries that mention the column", () => {
    const catalog = fixtureCatalog();
    const meta = openMetaDb(":memory:");
    const table = catalog.tables.get("lake_gold.mail_activity");
    if (!table) throw new Error("fixture table missing");
    recordUsage(meta, {
      ts: NOW,
      tableId: "lake_gold.mail_activity",
      actor: "workbench",
      queryId: "q-1",
      sql: "select message_id from mail_activity",
    });
    recordUsage(meta, {
      ts: NOW,
      tableId: "lake_gold.mail_activity",
      actor: "workbench",
      queryId: "q-2",
      sql: "select subject from mail_activity",
    });

    const report = buildImpactReport(catalog, meta, table, "message_id", fixedClock(), 90);
    expect(report.asset).toBe("lake_gold.mail_activity.message_id");
    expect(report.downstream.models).toEqual(["model.lakehouse.mail_activity"]);
    expect(report.downstream.queries).toHaveLength(1);
    expect(report.downstream.queries[0]).toContain("q-1");
    expect(report.notes).toContainEqual(expect.stringContaining("text-based"));
    meta.close();
  });

  it("keeps every downstream model when the column appears nowhere", () => {
    const catalog = fixtureCatalog();
    const meta = openMetaDb(":memory:");
    const table = catalog.tables.get("lake_gold.mail_activity");
    if (!table) throw new Error("fixture table missing");
    const report = buildImpactReport(catalog, meta, table, "never_mentioned", fixedClock(), 90);
    expect(report.downstream.models).toEqual(["model.lakehouse.mail_activity"]);
    expect(report.notes).toContainEqual(expect.stringContaining("reporting all downstream models"));
    meta.close();
  });

  it("includes the contract of the affected table", () => {
    const { catalog, meta } = makeApp();
    const table = catalog.tables.get("lake_gold.home_environment");
    if (!table) throw new Error("fixture table missing");
    const report = buildImpactReport(catalog, meta, table, undefined, fixedClock(), 90);
    expect(report.downstream.contracts).toEqual(["home-environment"]);
    meta.close();
  });
});
