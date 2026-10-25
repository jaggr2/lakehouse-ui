import { describe, expect, it } from "vitest";

import type { TableEntry } from "../../src/artifacts/types.js";
import { trustScore } from "../../src/quality/trust.js";

function table(overrides: Partial<TableEntry> = {}): TableEntry {
  return {
    id: "lake_gold.example",
    database: "lake_gold",
    name: "example",
    columns: [
      { name: "id", description: "identifier" },
      { name: "value" },
    ],
    sla: [],
    ...overrides,
  };
}

const healthy = {
  tests: { total: 4, pass: 4, warn: 0, fail: 0 },
  freshness: { status: "fresh" as const, ageHours: 2 },
  usageQueries: 25,
  usageWindowDays: 30,
};

describe("trustScore (Data Trust Index)", () => {
  it("weights contract ∧ tests ∧ fresh ∧ used", () => {
    const breakdown = trustScore({
      table: table({
        contract: { id: "example", name: "Example", tags: [], description: {}, schemas: [], sla: [], raw: {} },
        contractSchema: { name: "example", properties: [], quality: [{ metric: "rowCount" }] },
        sla: [{ property: "frequency", value: 1, unit: "d" }],
      }),
      ...healthy,
    });
    expect(breakdown.status).toBe("trusted");
    expect(breakdown.score).toBeGreaterThanOrEqual(80);
    const names = breakdown.components.map((component) => component.name);
    expect(names).toEqual(["contract", "tests", "freshness", "usage"]);
    expect(breakdown.components.every((component) => component.known)).toBe(true);
  });

  it("renormalizes weights over the known components", () => {
    const withTests = trustScore({ table: table(), ...healthy, freshness: { status: "unknown", ageHours: null } });
    const freshness = withTests.components.find((component) => component.name === "freshness");
    expect(freshness?.known).toBe(false);
    const knownWeight = withTests.components
      .filter((component) => component.known)
      .reduce((sum, component) => sum + component.weight, 0);
    expect(knownWeight).toBeCloseTo(0.5, 5);
    expect(withTests.score).toBeGreaterThan(0);
  });

  it("reports unknown when nothing is known", () => {
    const breakdown = trustScore({
      table: table(),
      tests: { total: 0, pass: 0, warn: 0, fail: 0 },
      freshness: { status: "unknown", ageHours: null },
      usageQueries: 0,
      usageWindowDays: 30,
    });
    expect(breakdown.status).toBe("unknown");
    expect(breakdown.score).toBe(0);
  });

  it("lets failing tests and stale data sink the score", () => {
    const breakdown = trustScore({
      table: table(),
      tests: { total: 4, pass: 1, warn: 0, fail: 3 },
      freshness: { status: "stale", ageHours: 200 },
      usageQueries: 0,
      usageWindowDays: 30,
    });
    expect(breakdown.status).toBe("weak");
    expect(breakdown.score).toBeLessThan(50);
  });

  it("counts warns as half a pass and saturates usage at 20 queries", () => {
    const breakdown = trustScore({
      table: table(),
      tests: { total: 2, pass: 1, warn: 1, fail: 0 },
      freshness: { status: "fresh", ageHours: 1 },
      usageQueries: 200,
      usageWindowDays: 30,
    });
    const tests = breakdown.components.find((component) => component.name === "tests");
    expect(tests?.score).toBe(75);
    const usage = breakdown.components.find((component) => component.name === "usage");
    expect(usage?.score).toBe(100);
  });
});
