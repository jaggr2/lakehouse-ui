import { describe, expect, it } from "vitest";

import { json, makeApp } from "../helpers/fixtures.js";
import { validateAgainst } from "../helpers/schema.js";

/** The self-improvement loop: corrections become golden questions. */
describe("self-improvement loop", () => {
  it("captures a correction and promotes it to a golden question", async () => {
    const { app } = makeApp({ mcpResult: "Query succeeded: no rows." });
    const created = await json(
      await app.request("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "how many messages did I get this week",
          generatedSql: "select * from lake_gold.media_activity limit 50",
          correctedSql:
            "select count(*) as n from lake_gold.mail_activity where internal_date > current_timestamp - interval '7' day",
          notes: "messages means mail",
        }),
      }),
    );
    expect(validateAgainst("FeedbackRecord", created)).toEqual([]);
    expect(created["status"]).toBe("open");

    const promoted = await json(
      await app.request(`/api/feedback/${created["id"]}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const promotedFeedback = promoted["feedback"] as { status: string };
    expect(promotedFeedback.status).toBe("promoted");
    const golden = promoted["golden"] as { tables: string[]; must_use: string[] };
    expect(golden.tables).toContain("lake_gold.mail_activity");
    expect(golden.must_use.length).toBeGreaterThan(0);

    const queue = await json(await app.request("/api/feedback?status=promoted"));
    expect((queue["feedback"] as unknown[]).length).toBe(1);
  });

  it("includes promoted questions in the eval set and records history", async () => {
    const { app } = makeApp({ mcpResult: "Query succeeded: no rows." });
    const created = await json(
      await app.request("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "count the parcels delivered",
          generatedSql: "select 1",
          correctedSql: "select count(*) from lake_gold.parcel_events where event_type = 'delivered'",
        }),
      }),
    );
    await app.request(`/api/feedback/${created["id"]}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const report = await json(await app.request("/api/evals"));
    expect(report["total"]).toBe(1);
    const results = report["results"] as Record<string, unknown>[];
    expect(results[0]?.["q"]).toBe("count the parcels delivered");

    const history = await json(await app.request("/api/evals/history"));
    const runs = history["runs"] as Record<string, unknown>[];
    expect(runs.length).toBeGreaterThan(0);
    expect(validateAgainst("EvalRun", runs[0])).toEqual([]);
    expect(Number(runs[0]?.["total"])).toBe(1);
  });

  it("rejects feedback without prompt or sql", async () => {
    const { app } = makeApp({ mcpResult: "Query succeeded: no rows." });
    const response = await app.request("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    });
    expect(response.status).toBe(400);
  });
});
