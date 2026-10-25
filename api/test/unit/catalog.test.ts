import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadCatalog, normalizeTableId, tableIdOf } from "../../src/artifacts/catalog.js";
import { FIXTURE_ARTIFACTS, FIXTURE_DBT_TARGET } from "../helpers/fixtures.js";

function load(overrides: Partial<Parameters<typeof loadCatalog>[0]> = {}) {
  return loadCatalog({
    artifactsDir: FIXTURE_ARTIFACTS,
    dbtTargetDir: FIXTURE_DBT_TARGET,
    database: "lake_gold",
    ...overrides,
  });
}

describe("loadCatalog", () => {
  it("merges contracts, products, semantics and dbt into one table index", () => {
    const catalog = load();
    expect(catalog.tables.size).toBe(6);
    expect(catalog.health["contracts"]).toBe("ok - 6 contract(s)");

    const mail = catalog.tables.get("lake_gold.mail_activity");
    expect(mail?.contract?.id).toBe("mail-activity");
    expect(mail?.product?.id).toBe("mail-activity");
    expect(mail?.model?.uniqueId).toBe("model.lakehouse.mail_activity");
    expect(mail?.columns.map((column) => column.name)).toContain("message_id");
    expect(mail?.sla).toContainEqual(expect.objectContaining({ property: "frequency" }));

    const home = catalog.tables.get("lake_gold.home_environment");
    const value = home?.columns.find((column) => column.name === "value");
    expect(value).toMatchObject({ concept: "home.temperature.celsius", conceptRole: "observed_value" });
  });

  it("compiles the graph when semantics/graph.json is absent — and invents no joins", () => {
    const catalog = load();
    expect(catalog.graph.origin).toBe("compiled");
    expect(catalog.health["graph"]).toContain("compiled");
    expect(catalog.graph.edges.some((edge) => edge.kind === "joins_on")).toBe(false);

    const column = catalog.graph.nodes.find((node) => node.id === "lake_gold.home_environment.value");
    expect(column).toMatchObject({ kind: "column", label: "value" });
    expect(catalog.graph.edges).toContainEqual({
      from: "lake_gold.home_environment.value",
      to: "home.temperature.celsius",
      kind: "implements",
      role: "observed_value",
    });
    expect(catalog.graph.edges).toContainEqual({
      from: "lake_gold.mail_activity",
      to: "model.lakehouse.stg_gmail_messages",
      kind: "derives_from",
    });
    expect(catalog.graph.edges).toContainEqual({
      from: "product:mail-activity",
      to: "lake_gold.mail_activity",
      kind: "contains",
    });
  });

  it("prefers semantics/graph.json when the data repo provides one", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lakehouse-graph-"));
    fs.mkdirSync(path.join(dir, "semantics"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "semantics", "graph.json"),
      JSON.stringify({
        nodes: [
          { id: "lake_gold.mail_activity", kind: "table", label: "mail_activity" },
          { id: "lake_gold.parcel_events", kind: "table", label: "parcel_events" },
        ],
        edges: [
          {
            from: "lake_gold.mail_activity",
            to: "lake_gold.parcel_events",
            kind: "joins_on",
            on: ["mail_activity.message_id", "parcel_events.message_id"],
          },
        ],
      }),
    );
    const catalog = load({ artifactsDir: dir, dbtTargetDir: path.join(dir, "none") });
    expect(catalog.graph.origin).toBe("graph.json");
    expect(catalog.graph.edges[0]?.kind).toBe("joins_on");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("isolates malformed files into the health report", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lakehouse-broken-"));
    fs.mkdirSync(path.join(dir, "contracts"), { recursive: true });
    fs.writeFileSync(path.join(dir, "contracts", "broken.odcs.yaml"), "id: [not-a-contract\n");
    const catalog = load({ artifactsDir: dir, dbtTargetDir: path.join(dir, "none") });
    expect(catalog.health["contracts"]).toContain("degraded");
    expect(catalog.products).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("normalizes table ids", () => {
    const catalog = load();
    expect(tableIdOf("lake_gold", "mail_activity")).toBe("lake_gold.mail_activity");
    expect(tableIdOf("lake_gold", "`MAIL_ACTIVITY`")).toBe("lake_gold.mail_activity");
    expect(normalizeTableId("mail_activity", catalog)).toBe("lake_gold.mail_activity");
    expect(normalizeTableId("lake_gold.mail_activity", catalog)).toBe("lake_gold.mail_activity");
    expect(normalizeTableId("nope", catalog)).toBeNull();
  });

  it("degrades cleanly when the dbt target is missing", () => {
    const catalog = load({ dbtTargetDir: path.join(os.tmpdir(), "no-such-target") });
    expect(catalog.dbt.missing).toBe(true);
    expect(catalog.health["dbt"]).toContain("no dbt artifacts");
  });
});
