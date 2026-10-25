import { describe, expect, it } from "vitest";

import { json, makeApp } from "../helpers/fixtures.js";
import { validateAgainst } from "../helpers/schema.js";

describe("GET /api/search (search)", () => {
  it("finds tables, columns and concepts and validates hits", async () => {
    const { app } = makeApp();
    const body = await json(await app.request("/api/search?q=mail"));
    expect(validateAgainst("SearchHit", (body["hits"] as unknown[])[0])).toEqual([]);
    const hits = body["hits"] as { kind: string; id: string }[];
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((hit) => hit.id)).toContain("lake_gold.mail_activity");
    expect(hits.every((hit) => ["product", "table", "column", "concept"].includes(hit.kind))).toBe(true);
  });

  it("matches concept synonyms", async () => {
    const { app } = makeApp();
    const body = await json(await app.request("/api/search?q=temperatur"));
    const hits = body["hits"] as { kind: string; id: string }[];
    expect(hits.map((hit) => hit.id)).toContain("home.temperature.celsius");
  });

  it("returns an empty list for nothing found", async () => {
    const { app } = makeApp();
    const body = await json(await app.request("/api/search?q=zzzznope"));
    expect(body["hits"]).toEqual([]);
  });
});
