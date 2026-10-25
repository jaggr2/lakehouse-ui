import { describe, expect, it } from "vitest";

import { recordUsage } from "../../src/meta/usage.js";
import { fixedClock, json, makeApp } from "../helpers/fixtures.js";
import { validateAgainst } from "../helpers/schema.js";

describe("GET /api/products (listProducts)", () => {
  it("lists products with trust + usage rollups", async () => {
    const { app, meta } = makeApp();
    recordUsage(meta, {
      ts: fixedClock()(),
      tableId: "lake_gold.mail_activity",
      actor: "ui",
      sql: "select * from mail_activity",
    });

    const body = await json(await app.request("/api/products"));
    const products = body["products"] as Record<string, unknown>[];
    expect(products).toHaveLength(6);
    for (const product of products) {
      expect(validateAgainst("Product", product)).toEqual([]);
    }
    const mail = products.find((product) => product["id"] === "mail-activity");
    expect(mail?.["tables"]).toEqual(["lake_gold.mail_activity"]);
    expect(mail?.["usageCount"]).toBe(1);
    expect(typeof mail?.["trustScore"]).toBe("number");
  });
});

describe("GET /api/products/{productId} (getProduct)", () => {
  it("returns the product detail with contract and concepts", async () => {
    const { app } = makeApp();
    const response = await app.request("/api/products/mail-activity");
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(validateAgainst("ProductDetail", body)).toEqual([]);
    expect((body["contract"] as { id?: string })["id"]).toBe("mail-activity");
    expect(body["limitations"]).toContain("32 KB");
  });

  it("404s on unknown products", async () => {
    const { app } = makeApp();
    expect((await app.request("/api/products/nope")).status).toBe(404);
  });
});

describe("GET /api/tables/{tableId} (getTable)", () => {
  it("returns columns with concepts, quality rule names and a trust score", async () => {
    const { app } = makeApp();
    const response = await app.request("/api/tables/lake_gold.home_environment");
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(validateAgainst("TableDetail", body)).toEqual([]);
    const columns = body["columns"] as { name: string; concept: string | null; quality: string[] }[];
    const value = columns.find((column) => column.name === "value");
    expect(value?.concept).toBe("home.temperature.celsius");
    expect(value?.quality).toContain("not_null_home_environment_value");
  });

  it("accepts bare table names and 404s on unknown tables", async () => {
    const { app } = makeApp();
    expect((await app.request("/api/tables/mail_activity")).status).toBe(200);
    expect((await app.request("/api/tables/nope")).status).toBe(404);
  });
});

describe("GET /api/concepts (listConcepts)", () => {
  it("returns the concept registry with mapping coverage", async () => {
    const { app } = makeApp();
    const body = await json(await app.request("/api/concepts"));
    const concepts = body["concepts"] as Record<string, unknown>[];
    expect(concepts).toHaveLength(3);
    for (const concept of concepts) {
      expect(validateAgainst("Concept", concept)).toEqual([]);
    }
    const temperature = concepts.find((concept) => concept["id"] === "home.temperature.celsius");
    expect(temperature?.["unit"]).toMatchObject({ code: "CEL" });
    const columns = temperature?.["columns"] as { table: string; column: string }[];
    expect(columns).toContainEqual(
      expect.objectContaining({ table: "lake_gold.home_environment", column: "value" }),
    );
  });
});
