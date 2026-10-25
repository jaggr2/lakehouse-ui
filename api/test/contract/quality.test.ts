import { describe, expect, it } from "vitest";

import { recordUsage } from "../../src/meta/usage.js";
import { fixedClock, json, makeApp } from "../helpers/fixtures.js";
import { validateAgainst } from "../helpers/schema.js";

describe("GET /api/quality/{tableId} (getQuality) — U3", () => {
  it("merges ODCS rules, dbt results and freshness into one report", async () => {
    const { app } = makeApp();
    const response = await app.request("/api/quality/lake_gold.mail_activity");
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(validateAgainst("QualityReport", body)).toEqual([]);

    const rules = body["rules"] as { name: string; status: string; source: string; column: string | null }[];
    const odcs = rules.find((rule) => rule.source === "odcs");
    expect(odcs?.name).toBe("rowCount mustBeGreaterThan 0");
    expect(odcs?.status).toBe("unknown"); // no live evaluation attached — never fake green

    const dbt = rules.filter((rule) => rule.source === "dbt");
    expect(dbt.map((rule) => rule.name)).toContain("not_null_mail_activity_message_id");
    expect(dbt.find((rule) => rule.name === "not_null_mail_activity_message_id")?.column).toBe("message_id");
    expect(dbt.every((rule) => rule.status === "pass")).toBe(true);

    const freshness = body["freshness"] as { status: string; ageHours: number; source: string };
    expect(freshness.status).toBe("fresh");
    expect(freshness.source).toBe("dbt-model-build");
    expect(freshness.ageHours).toBeCloseTo(5.7, 1);

    const testHistory = body["testHistory"] as unknown[];
    for (const test of testHistory) {
      expect(validateAgainst("TestResult", test)).toEqual([]);
    }
  });

  it("surfaces failing dbt tests and lets them sink the tests component", async () => {
    const { app } = makeApp();
    const body = await json(await app.request("/api/quality/lake_gold.parcel_events"));
    const rules = body["rules"] as { name: string; status: string }[];
    expect(rules.find((rule) => rule.name === "accepted_values_parcel_events__event_type")?.status).toBe("fail");
    const trust = body["trust"] as {
      status: string;
      score: number;
      components: { name: string; known: boolean; score: number; evidence: string }[];
    };
    expect(validateAgainst("TrustBreakdown", trust)).toEqual([]);
    const tests = trust.components.find((component) => component.name === "tests");
    expect(tests?.known).toBe(true);
    expect(tests?.score).toBeLessThan(100);
    expect(trust.score).toBe(body["trustScore"]);
  });

  it("computes the trust breakdown from contract ∧ tests ∧ fresh ∧ used", async () => {
    const { app, meta, deps } = makeApp();
    for (let index = 0; index < 25; index += 1) {
      recordUsage(meta, {
        ts: deps.clock(),
        tableId: "lake_gold.home_environment",
        actor: "workbench",
        queryId: `q-${index}`,
        sql: "select value from home_environment",
      });
    }
    const body = await json(await app.request("/api/quality/lake_gold.home_environment"));
    const trust = body["trust"] as { score: number; status: string; components: { name: string; score: number; weight: number }[] };
    const weights = trust.components.reduce((sum, component) => sum + component.weight, 0);
    expect(weights).toBeCloseTo(1, 5);
    expect(trust.status).toBe("trusted");
    expect(trust.score).toBeGreaterThanOrEqual(80);
    const usage = trust.components.find((component) => component.name === "usage");
    expect(usage?.score).toBe(100); // saturates at 20 queries / 30 days
  });

  it("404s on unknown tables", async () => {
    const { app } = makeApp();
    expect((await app.request("/api/quality/nope")).status).toBe(404);
  });
});
