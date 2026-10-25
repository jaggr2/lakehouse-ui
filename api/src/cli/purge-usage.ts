import { loadConfig } from "../config.js";
import { openMetaDb } from "../meta/db.js";
import { purgeUsageBefore } from "../meta/usage.js";
import { systemClock } from "../util/time.js";

/**
 * Manual retention run (the server also purges at startup and daily):
 *
 *   npm run purge:usage
 *
 * Honours LAKEHOUSE_USAGE_RETENTION_DAYS (default 3 years; 0 = never purge).
 */
function main(): void {
  const config = loadConfig();
  if (config.usageRetentionDays === 0) {
    console.log("retention disabled (LAKEHOUSE_USAGE_RETENTION_DAYS=0) - nothing purged");
    return;
  }
  const meta = openMetaDb(config.metaDbPath);
  const cutoff = new Date(systemClock().getTime() - config.usageRetentionDays * 86_400_000);
  const deleted = purgeUsageBefore(meta, cutoff);
  console.log(
    `purged ${deleted} usage event(s) older than ${cutoff.toISOString()} ` +
      `(retention ${config.usageRetentionDays} day(s))`,
  );
  meta.close();
}

main();
