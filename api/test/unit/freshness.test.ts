import { describe, expect, it } from "vitest";

import type { Catalog, DbtArtifacts, TableEntry } from "../../src/artifacts/types.js";
import { freshnessFor, thresholdsFor } from "../../src/quality/freshness.js";
import { fixedClock } from "../helpers/fixtures.js";

const NOW = fixedClock(); // 2026-10-25T08:00Z

function table(overrides: Partial<TableEntry> = {}): TableEntry {
  return { id: "lake_gold.example", database: "lake_gold", name: "example", columns: [], sla: [], ...overrides };
}

function catalogWith(dbt: Partial<DbtArtifacts>): Catalog {
  return {
    database: "lake_gold",
    health: {},
    contracts: [],
    products: [],
    concepts: [],
    mappings: [],
    graph: { nodes: [], edges: [], origin: "compiled" },
    dbt: { nodes: new Map(), runResults: [], missing: false, ...dbt },
    tables: new Map(),
    conceptsById: new Map(),
  };
}

describe("freshness thresholds", () => {
  it("prefers dbt source freshness, then the SLA cadence, then house defaults", () => {
    const fromDbt = thresholdsFor(
      table({
        model: {
          uniqueId: "model.lakehouse.example",
          resourceType: "model",
          name: "example",
          dependsOn: [],
          columns: [],
          freshness: { warn_after: { count: 2, period: "h" }, error_after: { count: 4, period: "h" } },
        },
      }),
    );
    expect(fromDbt).toMatchObject({ warn: 2, error: 4, basis: "dbt source freshness" });

    const fromSla = thresholdsFor(table({ sla: [{ property: "frequency", value: 1, unit: "d" }] }));
    expect(fromSla).toMatchObject({ warn: 48, error: 96, basis: "contract SLA frequency" });

    expect(thresholdsFor(table())).toMatchObject({ warn: 26, error: 48, basis: "house default" });
  });
});

describe("freshnessFor", () => {
  it("uses source freshness results when present", () => {
    const catalog = catalogWith({
      runResults: [
        {
          uniqueId: "source.lakehouse.bronze.example",
          status: "pass",
          maxLoadedAt: "2026-10-25T01:45:00.000Z",
          runAt: "2026-10-25T02:20:00.000Z",
        },
      ],
    });
    const view = freshnessFor(catalog, table(), NOW);
    expect(view.source).toBe("dbt-source-freshness");
    expect(view.status).toBe("fresh");
    expect(view.ageHours).toBeCloseTo(6.3, 1);
  });

  it("falls back to the last successful model build and marks stale data", () => {
    const catalog = catalogWith({
      runResults: [
        {
          uniqueId: "model.lakehouse.example",
          status: "success",
          runAt: "2026-10-20T02:15:00.000Z",
        },
      ],
    });
    const view = freshnessFor(catalog, table({ model: { uniqueId: "model.lakehouse.example", resourceType: "model", name: "example", dependsOn: [], columns: [] } }), NOW);
    expect(view.source).toBe("dbt-model-build");
    expect(view.status).toBe("stale");
    expect(view.ageHours).toBeGreaterThan(100);
  });

  it("is unknown without evidence", () => {
    const view = freshnessFor(catalogWith({ missing: true }), table(), NOW);
    expect(view.status).toBe("unknown");
    expect(view.note).toContain("run_results.json");
  });

  it("warns between warn and error thresholds", () => {
    const catalog = catalogWith({
      runResults: [
        { uniqueId: "model.lakehouse.example", status: "success", runAt: "2026-10-23T08:00:00.000Z" },
      ],
    });
    const view = freshnessFor(
      catalog,
      table({
        model: { uniqueId: "model.lakehouse.example", resourceType: "model", name: "example", dependsOn: [], columns: [] },
      }),
      NOW,
    );
    expect(view.status).toBe("warn"); // 48h old, house default warn 26h / error 48h
    expect(view.ageHours).toBe(48);
  });
});
