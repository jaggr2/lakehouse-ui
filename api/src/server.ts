import { serve } from "@hono/node-server";

import { loadCatalog } from "./artifacts/catalog.js";
import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { openMetaDb } from "./meta/db.js";
import { createMcpClient } from "./query/mcp.js";
import { systemClock } from "./util/time.js";

const config = loadConfig();
const catalog = loadCatalog({
  artifactsDir: config.artifactsDir,
  dbtTargetDir: config.dbtTargetDir,
  database: config.database,
});
const meta = openMetaDb(config.metaDbPath);
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
  for (const [artifact, status] of Object.entries(catalog.health)) {
    console.log(`  ${artifact}: ${status}`);
  }
});
