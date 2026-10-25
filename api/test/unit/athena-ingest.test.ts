import { describe, expect, it } from "vitest";

import { openMetaDb } from "../../src/meta/db.js";
import { usageStats } from "../../src/meta/usage.js";
import {
  ingestAthenaHistory,
  type AthenaHistorySource,
  type AthenaQueryExecution,
} from "../../src/usage/athena-history.js";
import { fixedClock } from "../helpers/fixtures.js";

const NOW = fixedClock()();

function fakeSource(executions: AthenaQueryExecution[]): AthenaHistorySource {
  return { listExecutions: async () => executions };
}

const KNOWN = new Map<string, unknown>([
  ["lake_gold.mail_activity", true],
  ["lake_gold.parcel_events", true],
]);

describe("ingestAthenaHistory", () => {
  it("records one event per referenced table and skips failures", async () => {
    const meta = openMetaDb(":memory:");
    const result = await ingestAthenaHistory(
      meta,
      fakeSource([
        {
          queryId: "a-1",
          sql: "select message_id from mail_activity",
          database: "lake_gold",
          submittedAt: NOW,
          workgroup: "lakehouse-read",
          rowsReturned: null,
          succeeded: true,
        },
        {
          queryId: "a-2",
          sql: "select * from mail_activity join parcel_events on true",
          database: "lake_gold",
          submittedAt: NOW,
          workgroup: "lakehouse-read",
          rowsReturned: null,
          succeeded: true,
        },
        {
          queryId: "a-3",
          sql: "select 1 from mail_activity",
          database: "lake_gold",
          submittedAt: NOW,
          workgroup: "lakehouse-read",
          rowsReturned: null,
          succeeded: false,
        },
      ]),
      { since: new Date(0), clock: fixedClock(), database: "lake_gold", actor: "athena:lakehouse-read", knownTables: KNOWN },
    );

    expect(result.scanned).toBe(3);
    expect(result.tables).toEqual(["lake_gold.mail_activity", "lake_gold.parcel_events"]);
    const stats = usageStats(meta, "lake_gold.mail_activity", new Date(0));
    expect(stats.totalQueries).toBe(2);
    expect(stats.topConsumers).toEqual([{ actor: "athena:lakehouse-read", queries: 2 }]);
    meta.close();
  });

  it("is idempotent per query id", async () => {
    const meta = openMetaDb(":memory:");
    const source = fakeSource([
      {
        queryId: "a-1",
        sql: "select message_id from mail_activity",
        database: "lake_gold",
        submittedAt: NOW,
        workgroup: "lakehouse-read",
        rowsReturned: null,
        succeeded: true,
      },
    ]);
    const options = { since: new Date(0), clock: fixedClock(), database: "lake_gold", actor: "athena:lakehouse-read", knownTables: KNOWN };
    await ingestAthenaHistory(meta, source, options);
    await ingestAthenaHistory(meta, source, options);
    expect(usageStats(meta, "lake_gold.mail_activity", new Date(0)).totalQueries).toBe(1);
    meta.close();
  });

  it("ignores queries that touch no known table", async () => {
    const meta = openMetaDb(":memory:");
    const result = await ingestAthenaHistory(
      meta,
      fakeSource([
        {
          queryId: "a-9",
          sql: "select 1 from somewhere_else",
          database: "lake_gold",
          submittedAt: NOW,
          workgroup: "lakehouse-read",
          rowsReturned: null,
          succeeded: true,
        },
      ]),
      { since: new Date(0), clock: fixedClock(), database: "lake_gold", actor: "athena:lakehouse-read", knownTables: KNOWN },
    );
    expect(result.recorded).toBe(0);
    meta.close();
  });
});
