import { AthenaClient } from "@aws-sdk/client-athena";

import { loadCatalog } from "../artifacts/catalog.js";
import { loadConfig } from "../config.js";
import { openMetaDb } from "../meta/db.js";
import { ingestAthenaHistory } from "../usage/athena-history.js";
import { createAthenaHistorySource } from "../usage/athena-source.js";
import { daysAgo, systemClock } from "../util/time.js";

/**
 * Import Athena query history into meta.db usage_events (U4).
 *
 *   npm run ingest:athena -- --days 30
 *
 * Idempotent per query_id — schedule it as often as you like. Needs the
 * least-privilege `lakehouse-read` identity (AWS_* env) and the
 * `lakehouse-read` workgroup.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const daysArg = argv.indexOf("--days");
  const days = daysArg >= 0 ? Number.parseInt(argv[daysArg + 1] ?? "30", 10) : 30;

  const config = loadConfig();
  const catalog = loadCatalog({
    artifactsDir: config.artifactsDir,
    dbtTargetDir: config.dbtTargetDir,
    database: config.database,
  });
  const meta = openMetaDb(config.metaDbPath);
  const workgroup = process.env["LAKEHOUSE_WORKGROUP"] ?? "lakehouse-read";
  const region = process.env["AWS_REGION"] ?? "eu-central-1";

  const source = createAthenaHistorySource({
    client: new AthenaClient({ region }),
    workgroup,
    database: config.database,
  });

  const result = await ingestAthenaHistory(meta, source, {
    since: daysAgo(systemClock, days),
    clock: systemClock,
    database: config.database,
    actor: `athena:${workgroup}`,
    knownTables: catalog.tables,
  });

  console.log(
    `ingested ${result.recorded} usage event(s) over ${result.tables.length} table(s) ` +
      `from ${result.scanned} Athena execution(s) since ${days} day(s) ago`,
  );
  for (const table of result.tables) console.log(`  ${table}`);
  meta.close();
}

main().catch((error: unknown) => {
  console.error(`ingest:athena failed: ${String(error)}`);
  process.exitCode = 1;
});
