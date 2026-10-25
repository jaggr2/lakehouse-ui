import type { Catalog, DbtNode, DbtRunResult, TableEntry } from "../artifacts/types.js";

export type RuleStatus = "pass" | "fail" | "warn" | "unknown";

export interface RuleView {
  name: string;
  status: RuleStatus;
  source: "odcs" | "dbt" | "freshness";
  column: string | null;
  description: string;
  severity: string | null;
  dimension: string | null;
}

export interface TestView {
  name: string;
  status: RuleStatus;
  rawStatus: string;
  runAt: string | null;
  failures: number | null;
  message: string | null;
  column: string | null;
}

const STATUS_MAP: Record<string, RuleStatus> = {
  pass: "pass",
  success: "pass",
  warn: "warn",
  fail: "fail",
  failure: "fail",
  error: "fail",
  skipped: "unknown",
  unknown: "unknown",
};

export function mapStatus(raw: string): RuleStatus {
  return STATUS_MAP[raw.toLowerCase()] ?? "unknown";
}

/** The model (or source) node a table is materialized by. */
function modelOf(table: TableEntry): DbtNode | undefined {
  return table.model;
}

/**
 * A test result belongs to a table when the manifest says so
 * (`attached_node`, dbt ≥1.8), when the test depends on the table's model,
 * or — last resort — when the test name embeds the table name.
 */
function attachedTo(node: DbtNode, table: TableEntry, manifestNodes: Map<string, DbtNode>): boolean {
  const model = modelOf(table);
  if (node.attachedNode) {
    const target = manifestNodes.get(node.attachedNode);
    if (target && (target.alias ?? target.name) === table.name) return true;
    if (node.attachedNode.endsWith(`.${table.name}`)) return true;
    return false;
  }
  if (model && node.dependsOn.includes(model.uniqueId)) return true;
  if (node.dependsOn.some((id) => id.endsWith(`.${table.name}`))) return true;
  return node.name.includes(table.name);
}

export interface QualityInputs {
  catalog: Catalog;
  table: TableEntry;
  freshnessStatus: RuleStatus;
  freshnessDescription: string;
}

export interface QualityParts {
  rules: RuleView[];
  testHistory: TestView[];
}

/**
 * Merge the three rule sources for one table: ODCS quality rules from the
 * contract, dbt test results from run_results.json, and the freshness check.
 */
export function collectQuality({ catalog, table, freshnessStatus, freshnessDescription }: QualityInputs): QualityParts {
  const rules: RuleView[] = [];
  const testHistory: TestView[] = [];

  for (const spec of table.contractSchema?.quality ?? []) {
    const constraint = spec.constraint ? ` ${spec.constraint.op} ${String(spec.constraint.value)}` : "";
    rules.push({
      name: `${spec.metric}${constraint}`,
      // Contract-declared rule with no live evaluation attached to this
      // service — honest 'unknown' rather than a fake green.
      status: "unknown",
      source: "odcs",
      column: spec.column ?? null,
      description: spec.description ?? `ODCS quality rule: ${spec.metric}${constraint}`,
      severity: spec.severity ?? null,
      dimension: spec.dimension ?? null,
    });
  }

  for (const result of catalog.dbt.runResults) {
    const node = catalog.dbt.nodes.get(result.uniqueId);
    if (!node || node.resourceType !== "test") continue;
    if (!attachedTo(node, table, catalog.dbt.nodes)) continue;
    const status = mapStatus(result.status);
    testHistory.push({
      name: node.name,
      status,
      rawStatus: result.status,
      runAt: result.runAt ?? null,
      failures: result.failures ?? null,
      message: result.message ?? null,
      column: node.columnName ?? null,
    });
    rules.push({
      name: node.name,
      status,
      source: "dbt",
      column: node.columnName ?? null,
      description: node.description ?? `dbt test on ${table.id}${node.columnName ? `.${node.columnName}` : ""}`,
      severity: null,
      dimension: null,
    });
  }

  rules.push({
    name: "freshness",
    status: freshnessStatus,
    source: "freshness",
    column: null,
    description: freshnessDescription,
    severity: "error",
    dimension: "timeliness",
  });

  return { rules, testHistory };
}

/** Distinct test results count for the trust score (latest state per test). */
export function testSummary(testHistory: TestView[]): { total: number; pass: number; warn: number; fail: number } {
  const seen = new Map<string, TestView>();
  for (const test of testHistory) seen.set(test.name, test);
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const test of seen.values()) {
    if (test.status === "pass") pass += 1;
    else if (test.status === "warn") warn += 1;
    else if (test.status === "fail") fail += 1;
  }
  return { total: seen.size, pass, warn, fail };
}

export function runResultFor(catalog: Catalog, uniqueId: string): DbtRunResult | undefined {
  return catalog.dbt.runResults.find((result) => result.uniqueId === uniqueId);
}
