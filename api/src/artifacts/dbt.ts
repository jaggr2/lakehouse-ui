import {
  isRecord,
  optionalNumber,
  optionalRecordArray,
  optionalString,
  optionalStringArray,
  requireRecord,
  requireString,
} from "../util/validate.js";
import type { DbtArtifacts, DbtNode, DbtResourceType, DbtRunResult } from "./types.js";

const KNOWN_RESOURCE_TYPES = new Set<DbtResourceType>([
  "model",
  "test",
  "source",
  "seed",
  "snapshot",
  "metric",
  "semantic_model",
  "unit_test",
  "exposure",
]);

function resourceTypeOf(record: Record<string, unknown>, context: string): DbtResourceType {
  const raw = optionalString(record["resource_type"], `${context}.resource_type`) ?? "model";
  return KNOWN_RESOURCE_TYPES.has(raw) ? raw : ("other" as DbtResourceType);
}

function stringList(value: unknown, context: string): string[] {
  return optionalStringArray(value, context) ?? [];
}

export function parseDbtNode(uniqueId: string, value: unknown, context: string): DbtNode {
  const record = requireRecord(value, context);
  const dependsOn = requireRecord(record["depends_on"] ?? {}, `${context}.depends_on`);
  const config = isRecord(record["config"]) ? record["config"] : undefined;
  const columnsRaw = record["columns"];
  const columns = isRecord(columnsRaw) ? Object.keys(columnsRaw) : [];
  return {
    uniqueId,
    resourceType: resourceTypeOf(record, context),
    name: requireString(record["name"] ?? uniqueId, `${context}.name`),
    alias: optionalString(record["alias"], `${context}.alias`),
    packageName: optionalString(record["package_name"], `${context}.package_name`),
    database: optionalString(record["database"], `${context}.database`),
    schema: optionalString(record["schema"], `${context}.schema`),
    relationName: optionalString(record["relation_name"], `${context}.relation_name`),
    description: optionalString(record["description"], `${context}.description`),
    dependsOn: stringList(dependsOn["nodes"], `${context}.depends_on.nodes`),
    attachedNode: optionalString(record["attached_node"], `${context}.attached_node`),
    columnName: optionalString(record["column_name"], `${context}.column_name`),
    rawCode: optionalString(record["raw_code"], `${context}.raw_code`),
    compiledSql: optionalString(record["compiled_sql"], `${context}.compiled_sql`),
    columns,
    loadedAtField:
      optionalString(record["loaded_at_field"], `${context}.loaded_at_field`) ??
      (config ? optionalString(config["loaded_at_field"], `${context}.config.loaded_at_field`) : undefined),
    freshness: isRecord(record["freshness"]) ? record["freshness"] : undefined,
  };
}

/** dbt `target/manifest.json` — only the fields lineage/quality/impact need. */
export function parseManifest(doc: unknown, source: string): Pick<DbtArtifacts, "projectName" | "manifestGeneratedAt" | "nodes"> {
  const record = requireRecord(doc, source);
  const metadata = requireRecord(record["metadata"] ?? {}, `${source}.metadata`);
  const nodes = new Map<string, DbtNode>();

  const collect = (section: unknown, context: string): void => {
    if (!isRecord(section)) return;
    for (const [uniqueId, value] of Object.entries(section)) {
      nodes.set(uniqueId, parseDbtNode(uniqueId, value, `${context}.${uniqueId}`));
    }
  };
  collect(record["nodes"], `${source}.nodes`);
  collect(record["sources"], `${source}.sources`);
  collect(record["metrics"], `${source}.metrics`);
  collect(record["snapshots"], `${source}.snapshots`);
  collect(record["seeds"], `${source}.seeds`);

  return {
    projectName: optionalString(metadata["project_name"], `${source}.metadata.project_name`),
    manifestGeneratedAt:
      optionalString(record["generated_at"], `${source}.generated_at`) ??
      optionalString(metadata["generated_at"], `${source}.metadata.generated_at`),
    nodes,
  };
}

/** dbt `target/run_results.json` (also carries source-freshness entries). */
export function parseRunResults(doc: unknown, source: string): DbtRunResult[] {
  const record = requireRecord(doc, source);
  const results = record["results"];
  if (!Array.isArray(results)) return [];
  return results.map((item, index) => {
    const where = `${source}.results[${index}]`;
    const entry = requireRecord(item, where);
    const timing = optionalRecordArray(entry["timing"], `${where}.timing`) ?? [];
    const completed = timing
      .map((step) => optionalString(step["completed_at"], `${where}.timing.completed_at`))
      .filter((value): value is string => value !== undefined)
      .pop();
    const age = optionalNumber(entry["age"], `${where}.age`);
    return {
      uniqueId: requireString(entry["unique_id"], `${where}.unique_id`),
      status: optionalString(entry["status"], `${where}.status`) ?? "unknown",
      failures: optionalNumber(entry["failures"], `${where}.failures`),
      message: optionalString(entry["message"], `${where}.message`),
      runAt: completed ?? optionalString(entry["generated_at"], `${where}.generated_at`),
      maxLoadedAt: optionalString(entry["max_loaded_at"], `${where}.max_loaded_at`),
      ageHours: age,
    };
  });
}

export function parseRunGeneratedAt(doc: unknown, source: string): string | undefined {
  const record = requireRecord(doc, source);
  return (
    optionalString(record["generated_at"], `${source}.generated_at`) ??
    optionalString(requireRecord(record["metadata"] ?? {}, `${source}.metadata`)["generated_at"], `${source}.metadata.generated_at`)
  );
}

export function emptyDbt(): DbtArtifacts {
  return { nodes: new Map(), runResults: [], missing: true };
}
