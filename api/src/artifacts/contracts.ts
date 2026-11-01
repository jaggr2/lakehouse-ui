import {
  optionalBoolean,
  optionalRecordArray,
  optionalString,
  optionalStringArray,
  requireRecord,
  requireString,
} from "../util/validate.js";
import type {
  ContractDescription,
  ContractDoc,
  ContractProperty,
  ContractSchema,
  QualityRuleSpec,
  SlaProperty,
} from "./types.js";

const CONSTRAINT_OPS = new Set([
  "mustBe",
  "mustNotBe",
  "mustBeGreaterThan",
  "mustBeGreaterThanOrEqual",
  "mustBeLessThan",
  "mustBeLessThanOrEqual",
  "mustBeBetween",
  "mustNotBeBetween",
  "mustContain",
  "mustNotContain",
  "mustMatch",
  "mustBeUnique",
]);

function parseDescription(value: unknown, context: string): ContractDescription {
  if (value === undefined || value === null) return {};
  if (typeof value === "string") return { purpose: value };
  const record = requireRecord(value, context);
  return {
    purpose: optionalString(record["purpose"], `${context}.purpose`),
    limitations: optionalString(record["limitations"], `${context}.limitations`),
    usage: optionalString(record["usage"], `${context}.usage`),
  };
}

function parseProperty(value: unknown, context: string): ContractProperty {
  const record = requireRecord(value, context);
  const semanticConcepts: string[] = [];
  for (const def of optionalRecordArray(record["authoritativeDefinitions"], `${context}.authoritativeDefinitions`) ?? []) {
    if (def["type"] !== "semanticDefinition") continue;
    const stem = String(def["url"] ?? "").split("/").pop() ?? "";
    const concept = stem.endsWith(".yaml") ? stem.slice(0, -5) : stem;
    if (concept) semanticConcepts.push(concept);
  }
  const conceptExtras: NonNullable<ContractProperty["conceptExtras"]> = {};
  for (const kv of optionalRecordArray(record["customProperties"], `${context}.customProperties`) ?? []) {
    const key = String(kv["property"] ?? "");
    const dot = key.lastIndexOf(".");
    if (dot <= 0) continue;
    const concept = key.slice(0, dot);
    const field = key.slice(dot + 1);
    const entry = (conceptExtras[concept] ??= {});
    const raw = String(kv["value"] ?? "");
    if (field === "role") entry.role = raw;
    else if (field === "note") entry.note = raw;
    else if (field === "conditional_on") {
      try {
        entry.conditionalOn = JSON.parse(raw);
      } catch {
        entry.conditionalOn = { raw };
      }
    }
  }
  return {
    name: requireString(record["name"], `${context}.name`),
    logicalType: optionalString(record["logicalType"], `${context}.logicalType`),
    description: optionalString(record["description"], `${context}.description`),
    required: optionalBoolean(record["required"], `${context}.required`),
    unique: optionalBoolean(record["unique"], `${context}.unique`),
    semanticConcepts,
    conceptExtras,
  };
}

/** ODCS quality rule: `metric` plus one or more `mustBe*` constraints. */
export function parseQualityRule(value: unknown, context: string): QualityRuleSpec {
  const record = requireRecord(value, context);
  const metric = requireString(record["metric"], `${context}.metric`);
  let constraint: QualityRuleSpec["constraint"];
  let description = optionalString(record["description"], `${context}.description`);
  for (const [key, raw] of Object.entries(record)) {
    if (!CONSTRAINT_OPS.has(key)) continue;
    const bound = numberOrString(raw);
    if (bound === undefined) continue;
    constraint = { op: key, value: bound };
    if (!description) description = `${metric} ${key} ${String(bound)}`;
    break;
  }
  return {
    metric,
    constraint,
    description,
    dimension: optionalString(record["dimension"], `${context}.dimension`),
    severity: optionalString(record["severity"], `${context}.severity`),
    column:
      optionalString(record["column"], `${context}.column`) ??
      optionalString(record["columnName"], `${context}.columnName`),
  };
}

function parseSchema(value: unknown, context: string): ContractSchema {
  const record = requireRecord(value, context);
  const properties = record["properties"];
  return {
    name: requireString(record["name"], `${context}.name`),
    physicalType: optionalString(record["physicalType"], `${context}.physicalType`),
    description: optionalString(record["description"], `${context}.description`),
    granularity:
      optionalString(record["dataGranularityDescription"], `${context}.dataGranularityDescription`) ??
      optionalString(record["granularity"], `${context}.granularity`),
    properties: (Array.isArray(properties) ? properties : []).map((item, index) =>
      parseProperty(item, `${context}.properties[${index}]`),
    ),
    quality: (optionalRecordArray(record["quality"], `${context}.quality`) ?? []).map(
      (item, index) => parseQualityRule(item, `${context}.quality[${index}]`),
    ),
  };
}

function parseSla(value: unknown, context: string): SlaProperty[] {
  const entries = optionalRecordArray(value, context) ?? [];
  return entries.map((record, index) => {
    const where = `${context}[${index}]`;
    const bound = numberOrString(record["value"]);
    if (bound === undefined) throw new Error(`${where}.value: expected a number or string`);
    return {
      property: requireString(record["property"], `${where}.property`),
      value: bound,
      unit: optionalString(record["unit"], `${where}.unit`),
      driver: optionalString(record["driver"], `${where}.driver`),
    };
  });
}

/** Tolerant number-or-string probe (ODCS constraint bounds, SLA values). */
function numberOrString(value: unknown): number | string | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  return undefined;
}

/**
 * Parse one ODCS 3.x data contract document (already YAML-parsed).
 * Keeps the verbatim document in `raw` — the UI renders the full contract.
 */
export function parseContract(doc: unknown, source: string): ContractDoc {
  const record = requireRecord(doc, source);
  const kind = optionalString(record["kind"], `${source}.kind`);
  if (kind !== undefined && kind !== "DataContract") {
    throw new Error(`${source}: kind is ${kind}, expected DataContract`);
  }
  const schemas = record["schema"];
  return {
    id: requireString(record["id"], `${source}.id`),
    name: requireString(record["name"], `${source}.name`),
    version: optionalString(record["version"], `${source}.version`),
    status: optionalString(record["status"], `${source}.status`),
    domain: optionalString(record["domain"], `${source}.domain`),
    dataProduct: optionalString(record["dataProduct"], `${source}.dataProduct`),
    tags: optionalStringArray(record["tags"], `${source}.tags`) ?? [],
    description: parseDescription(record["description"], `${source}.description`),
    schemas: (Array.isArray(schemas) ? schemas : []).map((item, index) =>
      parseSchema(item, `${source}.schema[${index}]`),
    ),
    sla: parseSla(record["slaProperties"], `${source}.slaProperties`),
    raw: record,
  };
}
