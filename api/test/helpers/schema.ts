import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

/**
 * Contract-test helper: validates response payloads against the schemas in
 * openapi.yaml (the law). Covers the schema subset the spec actually uses:
 * $ref, allOf, type, enum, nullable, items, properties, additionalProperties.
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export interface Spec {
  paths: Record<string, Record<string, { operationId?: string }>>;
  schemas: Record<string, unknown>;
}

let cached: Spec | null = null;

export function loadSpec(): Spec {
  if (cached) return cached;
  const doc = parseYaml(fs.readFileSync(path.join(REPO_ROOT, "openapi.yaml"), "utf8")) as {
    paths?: Spec["paths"];
    components?: { schemas?: Record<string, unknown> };
  };
  cached = {
    paths: doc.paths ?? {},
    schemas: doc.components?.schemas ?? {},
  };
  return cached;
}

export function schemaNamed(name: string): unknown {
  const schema = loadSpec().schemas[name];
  if (!schema) throw new Error(`openapi.yaml has no schema ${name}`);
  return schema;
}

export function validateAgainst(name: string, value: unknown): string[] {
  return validateValue(schemaNamed(name), value, name, loadSpec().schemas);
}

function validateValue(
  schema: unknown,
  value: unknown,
  where: string,
  schemas: Record<string, unknown>,
): string[] {
  if (typeof schema !== "object" || schema === null) return [];
  const spec = schema as Record<string, unknown>;

  const ref = spec["$ref"];
  if (typeof ref === "string") {
    const target = schemas[ref.replace("#/components/schemas/", "")];
    if (!target) return [`${where}: unresolved $ref ${ref}`];
    return validateValue(target, value, where, schemas);
  }

  const errors: string[] = [];
  const allOf = spec["allOf"];
  if (Array.isArray(allOf)) {
    for (const sub of allOf) errors.push(...validateValue(sub, value, where, schemas));
  }

  const enumValues = spec["enum"];
  if (Array.isArray(enumValues) && value !== undefined && !enumValues.includes(value)) {
    errors.push(`${where}: ${JSON.stringify(value)} not in enum ${JSON.stringify(enumValues)}`);
  }

  const type = spec["type"];
  if (type === undefined) return errors;
  if (value === null) {
    if (spec["nullable"] === true) return errors;
    return [...errors, `${where}: expected ${String(type)}, got null`];
  }

  switch (type) {
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${where}: expected object, got ${Array.isArray(value) ? "array" : typeof value}`);
        return errors;
      }
      const record = value as Record<string, unknown>;
      const properties = (spec["properties"] ?? {}) as Record<string, unknown>;
      for (const [key, sub] of Object.entries(properties)) {
        if (record[key] === undefined) continue;
        errors.push(...validateValue(sub, record[key], `${where}.${key}`, schemas));
      }
      const additional = spec["additionalProperties"];
      if (additional === false) {
        for (const key of Object.keys(record)) {
          if (!(key in properties)) errors.push(`${where}.${key}: unexpected property`);
        }
      } else if (typeof additional === "object" && additional !== null) {
        for (const [key, item] of Object.entries(record)) {
          if (key in properties) continue;
          errors.push(...validateValue(additional, item, `${where}.${key}`, schemas));
        }
      }
      return errors;
    }
    case "array": {
      if (!Array.isArray(value)) {
        errors.push(`${where}: expected array, got ${typeof value}`);
        return errors;
      }
      const items = spec["items"];
      if (typeof items === "object" && items !== null) {
        value.forEach((item, index) => {
          errors.push(...validateValue(items, item, `${where}[${index}]`, schemas));
        });
      }
      return errors;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push(`${where}: expected integer, got ${JSON.stringify(value)}`);
      }
      return errors;
    }
    case "number": {
      if (typeof value !== "number") errors.push(`${where}: expected number, got ${JSON.stringify(value)}`);
      return errors;
    }
    case "string": {
      if (typeof value !== "string") errors.push(`${where}: expected string, got ${JSON.stringify(value)}`);
      return errors;
    }
    case "boolean": {
      if (typeof value !== "boolean") errors.push(`${where}: expected boolean, got ${JSON.stringify(value)}`);
      return errors;
    }
    default:
      return errors;
  }
}

/** Every operationId declared in the spec. */
export function specOperations(): string[] {
  const operations: string[] = [];
  for (const methods of Object.values(loadSpec().paths)) {
    for (const operation of Object.values(methods)) {
      if (operation.operationId) operations.push(operation.operationId);
    }
  }
  return operations;
}
