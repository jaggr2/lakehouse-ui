import { describe, expect, it } from "vitest";

import { makeApp, json, type TestApp } from "../helpers/fixtures.js";
import { validateAgainst } from "../helpers/schema.js";
import type { Clock } from "../../src/util/time.js";

/** Ticks one second per call — the annotations PK includes the timestamp. */
function tickingClock(start = "2026-10-25T08:00:00.000Z"): Clock {
  let offset = 0;
  return () => {
    offset += 1000;
    return new Date(new Date(start).getTime() + offset);
  };
}

function app(): TestApp {
  return makeApp({ clock: tickingClock() });
}

describe("certification flags", () => {
  it("starts uncertified and rejects unknown assets", async () => {
    const { app: testApp } = app();
    const state = await json(await testApp.request("/api/certification/mail-activity"));
    expect(state["certified"]).toBe(false);
    expect(state["ts"]).toBeNull();
    expect(validateAgainst("Certification", state)).toEqual([]);

    const missing = await testApp.request("/api/certification/nope");
    expect(missing.status).toBe(404);
  });

  it("certifies, revokes and keeps the history", async () => {
    const { app: testApp } = app();
    const certified = await json(
      await testApp.request("/api/certification/mail-activity", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-actor": "roger" },
        body: JSON.stringify({ certified: true, note: "stewarded end to end" }),
      }),
    );
    expect(certified["certified"]).toBe(true);
    expect(certified["author"]).toBe("roger");
    expect(validateAgainst("Certification", certified)).toEqual([]);

    const revoked = await json(
      await testApp.request("/api/certification/mail-activity", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ certified: false, note: "renamed downstream models" }),
      }),
    );
    expect(revoked["certified"]).toBe(false);
    expect((revoked["history"] as unknown[]).length).toBe(2);

    const state = await json(await testApp.request("/api/certification/mail-activity"));
    expect(state["certified"]).toBe(false);
    expect(state["note"]).toBe("renamed downstream models");
  });

  it("validates the input and the asset", async () => {
    const { app: testApp } = app();
    const badBody = await testApp.request("/api/certification/mail-activity", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "no flag" }),
    });
    expect(badBody.status).toBe(400);

    const unknown = await testApp.request("/api/certification/does.not.exist", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certified: true }),
    });
    expect(unknown.status).toBe(404);
  });

  it("certifies tables and columns too", async () => {
    const { app: testApp } = app();
    const column = await json(
      await testApp.request("/api/certification/mail_activity.message_id", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ certified: true }),
      }),
    );
    expect(column["assetId"]).toBe("mail_activity.message_id");
    expect(column["certified"]).toBe(true);
  });

  it("embeds the flag in product and table payloads", async () => {
    const { app: testApp } = app();
    await testApp.request("/api/certification/mail-activity", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certified: true, note: "ready for consumers" }),
    });

    const products = await json(await testApp.request("/api/products"));
    const product = (products["products"] as Record<string, unknown>[]).find(
      (item) => item["id"] === "mail-activity",
    );
    expect((product?.["certification"] as Record<string, unknown>)["certified"]).toBe(true);
    expect(validateAgainst("Product", product)).toEqual([]);

    const table = await json(await testApp.request("/api/tables/mail_activity"));
    expect((table["certification"] as Record<string, unknown>)["certified"]).toBe(false);
    expect(validateAgainst("TableDetail", table)).toEqual([]);
  });
});
