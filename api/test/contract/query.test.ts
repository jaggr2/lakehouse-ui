import { describe, expect, it } from "vitest";

import { usageStats } from "../../src/meta/usage.js";
import { fixedClock, json, makeApp } from "../helpers/fixtures.js";
import { validateAgainst } from "../helpers/schema.js";

const RESULT_TABLE = `message_id | subject
--- | ---
m-1 | Hello
m-2 | World

2 row(s) (truncated) · query_id=athena-q-1`;

describe("POST /api/query (postQuery)", () => {
  it("runs SQL through the guarded MCP, parses the result and logs usage", async () => {
    const { app, mcp, meta } = makeApp({ mcpResult: RESULT_TABLE });
    const response = await app.request("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "select message_id, subject from mail_activity" }),
    });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(validateAgainst("QueryResponse", body)).toEqual([]);
    expect(body["columns"]).toEqual(["message_id", "subject"]);
    expect(body["rows"]).toEqual([
      ["m-1", "Hello"],
      ["m-2", "World"],
    ]);
    expect(body["truncated"]).toBe(true);
    expect(mcp.calls).toEqual([
      { name: "query_product", args: { sql: "select message_id, subject from mail_activity" } },
    ]);

    const stats = usageStats(meta, "lake_gold.mail_activity", new Date(0));
    expect(stats.totalQueries).toBe(1);
    expect(stats.topConsumers[0]).toEqual({ actor: "workbench", queries: 1 });
  });

  it("fills grounding from the semantic layer", async () => {
    const { app } = makeApp({ mcpResult: "Query succeeded: no rows." });
    const body = await json(
      await app.request("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json", "x-actor": "ui" },
        body: JSON.stringify({ sql: "select value from home_environment" }),
      }),
    );
    const grounding = body["grounding"] as { concepts: string[]; joins: string[]; timezone: string };
    expect(grounding.concepts).toContain("home.temperature.celsius");
    expect(grounding.timezone).toBe("Europe/Zurich");
    expect(body["rows"]).toEqual([]);
  });

  it("rejects with 400 when the guard rejects the query", async () => {
    const { app } = makeApp({ mcpResult: "QUERY REJECTED: only SELECT / WITH statements are allowed" });
    const response = await app.request("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "drop table mail_activity" }),
    });
    expect(response.status).toBe(400);
    expect((await json(response))["error"]).toContain("only SELECT / WITH");
  });

  it("answers 501 for natural-language prompts (U5)", async () => {
    const { app } = makeApp();
    const response = await app.request("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "mails from dpd last week" }),
    });
    expect(response.status).toBe(501);
    expect((await json(response))["error"]).toContain("U5");
  });

  it("answers 502 when the MCP is unreachable", async () => {
    const { app, mcp } = makeApp();
    mcp.callTool = async () => {
      throw new Error("connection refused");
    };
    const response = await app.request("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "select 1 from mail_activity" }),
    });
    expect(response.status).toBe(502);
  });
});
