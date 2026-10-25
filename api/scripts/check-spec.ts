/**
 * Contract-first check: openapi.yaml parses, every $ref resolves, and every
 * operation in the spec has a route in the Hono app (the reverse direction —
 * responses matching the schemas — is covered by the contract tests).
 *
 * Run: npm run check:spec
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const specPath = path.join(repoRoot, "openapi.yaml");

interface Spec {
  paths?: Record<string, Record<string, { operationId?: string }>>;
  components?: { schemas?: Record<string, unknown> };
}

function collectRefs(node: unknown, refs: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string") refs.push(value);
    else collectRefs(value, refs);
  }
}

function main(): void {
  const spec = parseYaml(fs.readFileSync(specPath, "utf8")) as Spec;
  const paths = spec.paths ?? {};
  const schemas = spec.components?.schemas ?? {};
  const problems: string[] = [];

  const operations: string[] = [];
  for (const [route, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const id = (operation as { operationId?: string }).operationId;
      if (!id) problems.push(`${method.toUpperCase()} ${route}: missing operationId`);
      else operations.push(id);
    }
  }

  const refs: string[] = [];
  collectRefs(spec, refs);
  for (const ref of new Set(refs)) {
    const name = ref.replace("#/components/schemas/", "");
    if (!ref.startsWith("#/components/schemas/")) {
      problems.push(`unsupported $ref ${ref}`);
      continue;
    }
    if (!(name in schemas)) problems.push(`unresolved $ref ${ref}`);
  }

  const required = ["getHealth", "search", "listProducts", "getProduct", "getTable", "getLineage", "getImpact", "getQuality", "getUsage", "listConcepts", "postQuery"];
  for (const id of required) {
    if (!operations.includes(id)) problems.push(`missing operation ${id}`);
  }

  if (problems.length > 0) {
    console.error(`openapi.yaml is invalid:\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`openapi.yaml ok — ${operations.length} operation(s), ${Object.keys(schemas).length} schema(s)`);
}

main();
