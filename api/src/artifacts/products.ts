import {
  optionalRecordArray,
  optionalString,
  optionalStringArray,
  requireRecord,
  requireString,
} from "../util/validate.js";
import type { ContractDescription, ProductDoc, ProductPort } from "./types.js";

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

function parsePort(value: unknown, context: string): ProductPort {
  const record = requireRecord(value, context);
  return {
    name: requireString(record["name"], `${context}.name`),
    description: optionalString(record["description"], `${context}.description`),
    type: optionalString(record["type"], `${context}.type`),
    version: optionalString(record["version"], `${context}.version`),
    contractId: optionalString(record["contractId"], `${context}.contractId`),
  };
}

/** Parse one ODPS v1 data product document (already YAML-parsed). */
export function parseProduct(doc: unknown, source: string): ProductDoc {
  const record = requireRecord(doc, source);
  const kind = optionalString(record["kind"], `${source}.kind`);
  if (kind !== undefined && kind !== "DataProduct") {
    throw new Error(`${source}: kind is ${kind}, expected DataProduct`);
  }
  return {
    id: requireString(record["id"], `${source}.id`),
    name: requireString(record["name"], `${source}.name`),
    domain: optionalString(record["domain"], `${source}.domain`),
    status: optionalString(record["status"], `${source}.status`),
    version: optionalString(record["version"], `${source}.version`),
    tags: optionalStringArray(record["tags"], `${source}.tags`) ?? [],
    description: parseDescription(record["description"], `${source}.description`),
    outputPorts: (optionalRecordArray(record["outputPorts"], `${source}.outputPorts`) ?? []).map(
      (item, index) => parsePort(item, `${source}.outputPorts[${index}]`),
    ),
    raw: record,
  };
}
