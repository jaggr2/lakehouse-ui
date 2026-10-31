import { describe, expect, it } from "vitest";

import { certificationFor, certificationsFor, setCertification } from "../../src/meta/annotations.js";
import { openMetaDb, type MetaDb } from "../../src/meta/db.js";
import type { Clock } from "../../src/util/time.js";

/** Ticks one second per call — the annotations PK includes the timestamp. */
function tickingClock(start = "2026-10-25T08:00:00.000Z"): Clock {
  let offset = 0;
  return () => {
    offset += 1000;
    return new Date(new Date(start).getTime() + offset);
  };
}

function setup(): { meta: MetaDb; clock: Clock } {
  return { meta: openMetaDb(":memory:"), clock: tickingClock() };
}

describe("certification store (meta.db annotations)", () => {
  it("defaults to uncertified with empty history", () => {
    const { meta } = setup();
    const state = certificationFor(meta, "mail-activity");
    expect(state).toEqual({
      assetId: "mail-activity",
      certified: false,
      note: null,
      author: null,
      ts: null,
      history: [],
    });
  });

  it("records who asserts the certification and why", () => {
    const { meta, clock } = setup();
    const state = setCertification(meta, clock, "mail-activity", {
      certified: true,
      note: "contract + tests green since v0.1",
      author: "roger",
    });
    expect(state.certified).toBe(true);
    expect(state.note).toBe("contract + tests green since v0.1");
    expect(state.author).toBe("roger");
    expect(state.ts).not.toBeNull();
    expect(state.history).toHaveLength(1);
  });

  it("keeps the event history; the latest event wins", () => {
    const { meta, clock } = setup();
    setCertification(meta, clock, "lake_gold.mail_activity", { certified: true, author: "roger" });
    const revoked = setCertification(meta, clock, "lake_gold.mail_activity", {
      certified: false,
      note: "stale dbt runs",
      author: "roger",
    });
    expect(revoked.certified).toBe(false);
    expect(revoked.note).toBe("stale dbt runs");
    expect(revoked.history.map((event) => event.certified)).toEqual([true, false]);
  });

  it("resolves certifications for many assets at once", () => {
    const { meta, clock } = setup();
    setCertification(meta, clock, "mail-activity", { certified: true, author: "roger" });
    const batch = certificationsFor(meta, ["mail-activity", "parcel-events"]);
    expect(batch.get("mail-activity")?.certified).toBe(true);
    expect(batch.get("parcel-events")?.certified).toBe(false);
  });
});
