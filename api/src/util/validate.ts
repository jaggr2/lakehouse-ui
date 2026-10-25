/**
 * Small validation helpers for trust boundaries.
 *
 * Artifacts (YAML/JSON from the data repo, dbt, MCP) are parsed from
 * `unknown` — never `any` — and every field we rely on goes through one of
 * these. They throw `ArtifactError` with a path context so a malformed file
 * points at the exact field.
 */
export class ArtifactError extends Error {
  readonly context: string;

  constructor(context: string, message: string) {
    super(`${context}: ${message}`);
    this.name = "ArtifactError";
    this.context = context;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ArtifactError(context, "expected an object");
  return value;
}

export function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ArtifactError(context, "expected a non-empty string");
  }
  return value;
}

export function optionalString(value: unknown, context: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ArtifactError(context, "expected a string");
  return value;
}

export function optionalNumber(value: unknown, context: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ArtifactError(context, "expected a number");
  }
  return value;
}

export function optionalBoolean(value: unknown, context: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new ArtifactError(context, "expected a boolean");
  return value;
}

export function requireStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) throw new ArtifactError(context, "expected an array");
  return value.map((item, index) => requireString(item, `${context}[${index}]`));
}

export function optionalStringArray(value: unknown, context: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  return requireStringArray(value, context);
}

/** Pass-through for documents we keep verbatim (contract payloads, free-form objects). */
export function asRecordOrNull(value: unknown, context: string): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  return requireRecord(value, context);
}

export function optionalRecordArray(
  value: unknown,
  context: string,
): Record<string, unknown>[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new ArtifactError(context, "expected an array");
  return value.map((item, index) => requireRecord(item, `${context}[${index}]`));
}
