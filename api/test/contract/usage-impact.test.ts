import { describe, expect, it } from "vitest";

import { recordUsage } from "../../src/meta/usage.js";
import { fixedClock, json, makeApp } from "../helpers/fixtures.js";
import { validateAgainst } from "../helpers/schema.js";

const NOW = fixedClock()();

describe("GET /api/usage/{tableId} (getUsage) — U4", () => {
  it("returns query counts over time plus top consumers", async () => {
    const { app, meta } = makeApp();
    recordUsage(meta, { ts: NOW, tableId: "lake_gold.mail_activity", actor: "workbench", queryId: "q1", sql: "select 1 from mail_activity" });
    recordUsage(meta, { ts: NOW, tableId: "lake_gold.mail_activity", actor: "workbench", queryId: "q2", sql: "select 2 from mail_activity" });
    recordUsage(meta, { ts: NOW, tableId: "lake_gold.mail_activity", actor: "mcp", queryId: "q3", sql: "select 3 from mail_activity" });

    const response = await app.request("/api/usage/lake_gold.mail_activity?days=30");
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(validateAgainst("UsageReport", body)).toEqual([]);
    expect(body["totalQueries"]).toBe(3);
    expect(body["tableId"]).toBe("lake_gold.mail_activity");
    const daily = body["daily"] as { date: string; count: number }[];
    expect(daily).toHaveLength(31); // continuous series, one entry per day
    expect(daily.at(-1)).toEqual({ date: "2026-10-25", count: 3 });
    const top = body["topConsumers"] as { actor: string; queries: number }[];
    expect(top[0]).toEqual({ actor: "workbench", queries: 2 });
  });

  it("ignores re-ingested events with the same query id", async () => {
    const { app, meta } = makeApp();
    for (const actor of ["athena:lakehouse-read", "workbench"]) {
      recordUsage(meta, { ts: NOW, tableId: "lake_gold.mail_activity", actor, queryId: "same", sql: "select 1 from mail_activity" });
    }
    const body = await json(await app.request("/api/usage/lake_gold.mail_activity"));
    expect(body["totalQueries"]).toBe(1);
    expect((body["topConsumers"] as { actor: string }[])[0]?.actor).toBe("athena:lakehouse-read");
  });

  it("404s on unknown tables", async () => {
    const { app } = makeApp();
    expect((await app.request("/api/usage/nope")).status).toBe(404);
  });
});

describe("GET /api/impact (getImpact) — U4", () => {
  it("reports models, contracts, products and queries touching the asset", async () => {
    const { app, meta, catalog } = makeApp();
    // parcel_events is derived from mail data in the real world; the compiled
    // fallback graph only knows dbt refs, so add the relation explicitly.
    catalog.graph.edges.push({
      from: "lake_gold.parcel_events",
      to: "lake_gold.mail_activity",
      kind: "derives_from",
    });
    recordUsage(meta, {
      ts: NOW,
      tableId: "lake_gold.mail_activity",
      actor: "workbench",
      queryId: "q-17",
      sql: "select message_id, subject from mail_activity where from_addr ilike '%dpd%'",
    });

    const response = await app.request("/api/impact?table=mail_activity&column=message_id");
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(validateAgainst("ImpactReport", body)).toEqual([]);
    expect(body["asset"]).toBe("lake_gold.mail_activity.message_id");
    const downstream = body["downstream"] as { models: string[]; contracts: string[]; products: string[]; queries: string[] };
    expect(downstream.models).toContain("model.lakehouse.mail_activity");
    expect(downstream.models).toContain("model.lakehouse.parcel_events");
    expect(downstream.contracts).toEqual(expect.arrayContaining(["mail-activity", "parcel-events"]));
    expect(downstream.products).toEqual(expect.arrayContaining(["mail-activity", "parcel-events"]));
    expect(downstream.queries[0]).toContain("q-17");
    expect(downstream.queries[0]).toContain("message_id");
    expect(body["notes"] as string[]).toContainEqual(expect.stringContaining("text-based"));
  });

  it("reports the table-level blast radius without a column", async () => {
    const { app } = makeApp();
    const body = await json(await app.request("/api/impact?table=lake_gold.home_environment"));
    const downstream = body["downstream"] as { models: string[] };
    expect(downstream.models).toContain("model.lakehouse.home_environment");
  });

  it("400s without a table and 404s on unknown tables", async () => {
    const { app } = makeApp();
    expect((await app.request("/api/impact")).status).toBe(400);
    expect((await app.request("/api/impact?table=nope")).status).toBe(404);
  });
});

describe("GET /api/lineage (getLineage)", () => {
  it("returns the neighborhood graph around a table", async () => {
    const { app } = makeApp();
    const response = await app.request("/api/lineage?table=mail_activity&depth=2");
    expect(response.status).toBe(200);
    const body = await json(response);
    const nodes = body["nodes"] as { id: string; kind: string }[];
    const edges = body["edges"] as { from: string; to: string; kind: string }[];
    for (const node of nodes) expect(validateAgainst("Graph", { nodes: [node], edges: [] })).toEqual([]);
    for (const edge of edges) expect(validateAgainst("Graph", { nodes: [], edges: [edge] })).toEqual([]);
    const ids = nodes.map((node) => node.id);
    expect(ids).toContain("lake_gold.mail_activity");
    expect(ids).toContain("lake_gold.mail_activity.message_id");
    expect(ids).toContain("model.lakehouse.stg_gmail_messages");
    expect(edges.some((edge) => edge.kind === "derives_from")).toBe(true);
    expect(edges.some((edge) => edge.kind === "contains")).toBe(true);
  });

  it("scopes to one column when asked", async () => {
    const { app } = makeApp();
    const body = await json(await app.request("/api/lineage?table=lake_gold.home_environment&column=value&depth=1"));
    const nodes = body["nodes"] as { id: string }[];
    const ids = nodes.map((node) => node.id);
    expect(ids).toContain("lake_gold.home_environment.value");
    expect(ids).toContain("home.temperature.celsius");
    expect(ids).not.toContain("lake_gold.home_environment.read_at");
  });
});
