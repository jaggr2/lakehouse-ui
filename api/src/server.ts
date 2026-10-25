import { serve } from "@hono/node-server";

import { loadCatalog } from "./artifacts/catalog.js";
import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { openMetaDb } from "./meta/db.js";
import { purgeUsageBefore } from "./meta/usage.js";
import { createMcpClient } from "./query/mcp.js";
import { systemClock } from "./util/time.js";

const config = loadConfig();
const catalog = loadCatalog({
  artifactsDir: config.artifactsDir,
  dbtTargetDir: config.dbtTargetDir,
  database: config.database,
});
const meta = openMetaDb(config.metaDbPath);

// Retention (ADR-007): 3 years by default, 0 = keep forever.
const purge = (): void => {
  if (config.usageRetentionDays === 0) return;
  const cutoff = new Date(systemClock().getTime() - config.usageRetentionDays * 86_400_000);
  const deleted = purgeUsageBefore(meta, cutoff);
  if (deleted > 0) {
    console.log(`retention: purged ${deleted} usage event(s) older than ${cutoff.toISOString()}`);
  }
};
purge();
const purgeTimer = setInterval(purge, 86_400_000);
purgeTimer.unref();

const app = createApp({
  catalog,
  meta,
  mcp: createMcpClient({ endpoint: config.mcpEndpoint, timeoutMs: config.mcpTimeoutMs }),
  clock: systemClock,
  usageWindowDays: config.usageWindowDays,
  queryLookbackDays: config.queryLookbackDays,
});

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(
    `lakehouse-api listening on http://${info.address}:${info.port}` +
      ` · artifacts ${config.artifactsDir}` +
      ` · meta.db ${config.metaDbPath}` +
      ` · mcp ${config.mcpEndpoint}`,
  );
  if (config.usageRetentionDays === 0) {
    console.log("  retention: disabled (usage events are kept forever)");
  } else {
    console.log(`  retention: ${config.usageRetentionDays} day(s) on usage_events`);
  }
  for (const [artifact, status] of Object.entries(catalog.health)) {
    console.log(`  ${artifact}: ${status}`);
  }
});
