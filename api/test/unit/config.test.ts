import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("defaults usage retention to 3 years", () => {
    expect(loadConfig({}).usageRetentionDays).toBe(1095);
  });

  it("accepts a custom retention and the 0 opt-out", () => {
    expect(loadConfig({ LAKEHOUSE_USAGE_RETENTION_DAYS: "30" }).usageRetentionDays).toBe(30);
    expect(loadConfig({ LAKEHOUSE_USAGE_RETENTION_DAYS: "0" }).usageRetentionDays).toBe(0);
  });

  it("falls back to the default for junk values", () => {
    expect(loadConfig({ LAKEHOUSE_USAGE_RETENTION_DAYS: "soon" }).usageRetentionDays).toBe(1095);
    expect(loadConfig({ LAKEHOUSE_USAGE_RETENTION_DAYS: "-1" }).usageRetentionDays).toBe(1095);
  });
});
