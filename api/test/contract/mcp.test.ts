import { describe, expect, it } from "vitest";

import { makeApp, json, type TestApp } from "../helpers/fixtures.js";
import { validateAgainst } from "../helpers/schema.js";

type App = TestApp["app"];

function call(app: App, body: Record<string, unknown>): Promise<Response> {
  return Promise.resolve(
    app.request("/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function rpc(method: string, params: Record<string, unknown> = {}, id: number | null = 1): Record<string, unknown> {
  return { jsonrpc: "2.0", id, method, params };
}

async function callTool(app: App, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body = await json(await call(app, rpc("tools/call", { name, arguments: args })));
  return body["result"] as Record<string, unknown>;
}

function toolText(result: Record<string, unknown>): Record<string, unknown> {
  const content = result["content"] as { type: string; text: string }[];
  return JSON.parse(content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("catalog MCP endpoint (/api/mcp)", () => {
  it("completes the initialize handshake and states its instructions", async () => {
    const { app } = makeApp();
    const body = await json(
      await call(app, rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "opencode", version: "1" } })),
    );
    expect(body["jsonrpc"]).toBe("2.0");
    expect(body["id"]).toBe(1);
    const result = body["result"] as Record<string, unknown>;
    expect(result["protocolVersion"]).toBe("2025-06-18");
    expect((result["serverInfo"] as Record<string, unknown>)["name"]).toBe("lakehouse-catalog");
    expect(result["capabilities"]).toHaveProperty("tools");
    expect(String(result["instructions"])).toContain("BEFORE choosing");
    expect(validateAgainst("McpResponse", body)).toEqual([]);
  });

  it("falls back to its newest protocol version for unknown ones", async () => {
    const { app } = makeApp();
    const body = await json(await call(app, rpc("initialize", { protocolVersion: "1999-01-01" })));
    const result = body["result"] as Record<string, unknown>;
    expect(result["protocolVersion"]).toBe("2025-06-18");
  });

  it("lists the three catalog tools with input schemas", async () => {
    const { app } = makeApp();
    const body = await json(await call(app, rpc("tools/list")));
    const tools = (body["result"] as Record<string, unknown>)["tools"] as Record<string, unknown>[];
    expect(tools.map((tool) => tool["name"])).toEqual(["catalog_lookup", "lineage_of", "impact_of"]);
    for (const tool of tools) {
      expect((tool["inputSchema"] as Record<string, unknown>)["type"]).toBe("object");
      expect(typeof tool["description"]).toBe("string");
    }
    expect(validateAgainst("McpResponse", body)).toEqual([]);
  });

  it("catalog_lookup searches, then resolves product and table detail", async () => {
    const { app } = makeApp();

    const search = toolText(await callTool(app, "catalog_lookup", { query: "mail" }));
    expect(Array.isArray(search["hits"])).toBe(true);

    const product = toolText(await callTool(app, "catalog_lookup", { product: "mail-activity" }));
    expect(product["id"]).toBe("mail-activity");
    expect(product["purpose"]).toBeTruthy();
    expect((product["certification"] as Record<string, unknown>)["certified"]).toBe(false);
    expect(product).not.toHaveProperty("contract");

    const table = toolText(await callTool(app, "catalog_lookup", { table: "mail_activity" }));
    expect(table["id"]).toBe("lake_gold.mail_activity");
    expect(Array.isArray(table["columns"])).toBe(true);
    expect(table).toHaveProperty("trustScore");
  });

  it("catalog_lookup rejects ambiguous or empty input and unknown assets", async () => {
    const { app } = makeApp();
    const empty = await callTool(app, "catalog_lookup", {});
    expect(empty["isError"]).toBe(true);

    const both = await callTool(app, "catalog_lookup", { query: "mail", product: "mail-activity" });
    expect(both["isError"]).toBe(true);

    const unknown = await callTool(app, "catalog_lookup", { product: "nope" });
    expect(unknown["isError"]).toBe(true);
  });

  it("lineage_of reports upstream and downstream world", async () => {
    const { app } = makeApp();
    const result = toolText(await callTool(app, "lineage_of", { table: "mail_activity", depth: 3 }));
    expect(result["asset"]).toBe("lake_gold.mail_activity");
    expect(Array.isArray(result["nodes"])).toBe(true);
    expect(Array.isArray(result["edges"])).toBe(true);
    expect(Array.isArray(result["upstream"])).toBe(true);
    expect(Array.isArray(result["downstream"])).toBe(true);
  });

  it("impact_of reports the blast radius for a column", async () => {
    const { app } = makeApp();
    const result = toolText(await callTool(app, "impact_of", { table: "mail_activity", column: "message_id" }));
    expect(result["asset"]).toBe("lake_gold.mail_activity.message_id");
    expect(result["downstream"]).toHaveProperty("models");
  });

  it("answers JSON-RPC errors for unknown tools and methods", async () => {
    const { app } = makeApp();
    const unknownTool = await json(await call(app, rpc("tools/call", { name: "drop_table", arguments: {} })));
    expect((unknownTool["error"] as Record<string, unknown>)["code"]).toBe(-32602);

    const unknownMethod = await json(await call(app, rpc("resources/list")));
    expect((unknownMethod["error"] as Record<string, unknown>)["code"]).toBe(-32601);
    expect(validateAgainst("McpResponse", unknownMethod)).toEqual([]);
  });

  it("accepts notifications with 202 and rejects broken envelopes with 400", async () => {
    const { app } = makeApp();
    const notification = await call(app, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(notification.status).toBe(202);

    const broken = await call(app, { sql: "select 1 from mail_activity" });
    expect(broken.status).toBe(400);
    const body = await json(broken);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe(-32600);
  });

  it("answers ping", async () => {
    const { app } = makeApp();
    const body = await json(await call(app, rpc("ping")));
    expect(body["result"]).toEqual({});
  });
});
