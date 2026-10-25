import { describe, expect, it } from "vitest";

import { makeApp } from "../helpers/fixtures.js";
import { specOperations } from "../helpers/schema.js";

/**
 * Coverage both ways: every operation declared in openapi.yaml (the law) has
 * a working route here, and every route here is declared there. A new
 * operation in the spec fails this test until api/ implements it.
 */
const ROUTES: Record<string, { method: "GET" | "POST"; path: string; expected: number }> = {
  getHealth: { method: "GET", path: "/api/health", expected: 200 },
  search: { method: "GET", path: "/api/search?q=mail", expected: 200 },
  listProducts: { method: "GET", path: "/api/products", expected: 200 },
  getProduct: { method: "GET", path: "/api/products/mail-activity", expected: 200 },
  getTable: { method: "GET", path: "/api/tables/mail_activity", expected: 200 },
  getLineage: { method: "GET", path: "/api/lineage?table=mail_activity", expected: 200 },
  getImpact: { method: "GET", path: "/api/impact?table=mail_activity", expected: 200 },
  getQuality: { method: "GET", path: "/api/quality/mail_activity", expected: 200 },
  getUsage: { method: "GET", path: "/api/usage/mail_activity", expected: 200 },
  listConcepts: { method: "GET", path: "/api/concepts", expected: 200 },
  postQuery: {
    method: "POST",
    path: "/api/query",
    expected: 200,
  },
};

describe("openapi.yaml ↔ routes", () => {
  it("implements every operation in the spec", async () => {
    const operations = specOperations();
    const missing = operations.filter((operation) => !(operation in ROUTES));
    expect(missing).toEqual([]);
  });

  it("serves every operation with the declared success status", async () => {
    const { app } = makeApp({ mcpResult: "Query succeeded: no rows." });
    for (const [operationId, route] of Object.entries(ROUTES)) {
      const response = await app.request(route.path, {
        method: route.method,
        headers: route.method === "POST" ? { "content-type": "application/json" } : undefined,
        body: route.method === "POST" ? JSON.stringify({ sql: "select 1 from mail_activity" }) : undefined,
      });
      expect(`${operationId}: ${response.status}`).toBe(`${operationId}: ${route.expected}`);
    }
  });

  it("serves the spec itself", async () => {
    const { app } = makeApp();
    const response = await app.request("/api/openapi.yaml");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("openapi: 3.1.0");
  });
});
