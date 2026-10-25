import { describe, expect, it } from "vitest";

import { json, makeApp } from "../helpers/fixtures.js";
import { validateAgainst } from "../helpers/schema.js";

describe("GET /api/health (getHealth)", () => {
  it("reports artifact status and validates against the spec", async () => {
    const { app } = makeApp();
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(validateAgainst("Health", body)).toEqual([]);
    expect(body["status"]).toBe("ok");
    const artifacts = body["artifacts"] as Record<string, string>;
    expect(artifacts["contracts"]).toContain("6 contract(s)");
    expect(artifacts["products"]).toContain("6 product(s)");
    expect(artifacts["concepts"]).toContain("3 concept(s)");
    expect(artifacts["dbt_manifest"]).toContain("ok");
    expect(artifacts["meta_db"]).toContain("ok");
  });

  it("degrades when dbt artifacts are missing", async () => {
    const { app, catalog } = makeApp();
    catalog.health["dbt_run_results"] = "degraded — no target/run_results.json";
    const body = await json(await app.request("/api/health"));
    expect(body["status"]).toBe("degraded");
  });
});
