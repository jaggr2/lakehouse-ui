import {
  optionalRecordArray,
  optionalString,
  optionalStringArray,
  requireRecord,
  requireString,
  isRecord,
} from "../util/validate.js";
import type { ColumnMapping, ConceptDoc, ConceptExample, MappingDoc } from "./types.js";

function parseExamples(value: unknown, context: string): ConceptExample[] {
  const entries = optionalRecordArray(value, context) ?? [];
  return entries.map((record, index) => ({
    q: requireString(record["q"], `${context}[${index}].q`),
    sql: optionalString(record["sql"], `${context}[${index}].sql`),
  }));
}

export function parseConcept(doc: unknown, source: string): ConceptDoc {
  const record = requireRecord(doc, source);
  const timeRaw = record["time_semantics"] ?? record["timeSemantics"];
  const time = isRecord(timeRaw) ? timeRaw : undefined;
  return {
    id: requireString(record["id"], `${source}.id`),
    label: requireString(record["label"], `${source}.label`),
    synonyms: optionalStringArray(record["synonyms"], `${source}.synonyms`) ?? [],
    unit: isRecord(record["unit"]) ? record["unit"] : undefined,
    grain: optionalString(record["grain"], `${source}.grain`),
    timeSemantics: time
      ? {
          timezone: optionalString(time["timezone"], `${source}.time_semantics.timezone`),
          eventColumn: optionalString(time["event_column"], `${source}.time_semantics.event_column`),
        }
      : undefined,
    entity: optionalString(record["entity"], `${source}.entity`),
    preferredTable: optionalString(record["preferred_table"], `${source}.preferred_table`),
    notes: optionalString(record["notes"], `${source}.notes`),
    examples: parseExamples(record["examples"], `${source}.examples`),
  };
}

function parseColumnMapping(value: unknown, context: string): ColumnMapping {
  if (typeof value === "string") return { concept: value };
  const record = requireRecord(value, context);
  const conditional = record["conditional_on"] ?? record["conditionalOn"];
  return {
    concept: requireString(record["concept"], `${context}.concept`),
    role: optionalString(record["role"], `${context}.role`),
    note: optionalString(record["note"], `${context}.note`),
    conditionalOn: isRecord(conditional) ? conditional : undefined,
  };
}

/** Parse a per-table column→concept mapping file. */
export function parseMapping(doc: unknown, source: string): MappingDoc {
  const record = requireRecord(doc, source);
  const table = requireString(record["table"], `${source}.table`);
  const columnsRaw = requireRecord(record["columns"] ?? {}, `${source}.columns`);
  const columns = new Map<string, ColumnMapping>();
  for (const [name, spec] of Object.entries(columnsRaw)) {
    columns.set(name, parseColumnMapping(spec, `${source}.columns.${name}`));
  }
  return { table, columns };
}
