import { serve } from "@hono/node-server";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

// Serve the Angular SPA (web/dist) with an index.html fallback for client
// routes. /api/* is left to the router above (404 as JSON).
const webRoot = path.resolve(process.env["WEB_DIST_DIR"] ?? "web/dist/lakehouse-ui");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
app.get("*", async (c) => {
  const urlPath = decodeURIComponent(new URL(c.req.url).pathname);
  if (urlPath.startsWith("/api")) return c.json({ error: `not found: ${urlPath}` }, 404);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(webRoot, rel);
  if (!file.startsWith(webRoot)) return c.text("forbidden", 403);
  try {
    const body = await readFile(file);
    return c.body(body, 200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  } catch {
    return c.html(await readFile(path.join(webRoot, "index.html"), "utf8"));
  }
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
