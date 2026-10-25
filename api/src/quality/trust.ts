import type { FreshnessStatus } from "./freshness.js";
import type { TableEntry } from "../artifacts/types.js";

/**
 * Data Trust Index (U3) — the composite the plan calls "contract ∧ tests ∧
 * fresh ∧ used". Formula is documented in docs/DECISIONS.md (ADR-002); keep
 * this file and that ADR in sync.
 */

export type TrustComponentName = "contract" | "tests" | "freshness" | "usage";

export interface TrustComponent {
  name: TrustComponentName;
  score: number;
  weight: number;
  known: boolean;
  evidence: string;
}

export interface TrustBreakdown {
  score: number;
  status: "trusted" | "mixed" | "weak" | "unknown";
  components: TrustComponent[];
}

export const TRUST_WEIGHTS: Record<TrustComponentName, number> = {
  contract: 0.25,
  tests: 0.35,
  freshness: 0.25,
  usage: 0.15,
};

/** Queries per 30 days that count as "well used" (usage component saturates). */
const USAGE_SATURATION = 20;

export interface TrustInputs {
  table: TableEntry;
  tests: { total: number; pass: number; warn: number; fail: number };
  freshness: { status: FreshnessStatus; ageHours: number | null };
  usageQueries: number;
  usageWindowDays: number;
}

export function trustScore(input: TrustInputs): TrustBreakdown {
  const components: TrustComponent[] = [
    contractComponent(input.table),
    testsComponent(input.tests),
    freshnessComponent(input.freshness),
    usageComponent(input.usageQueries, input.usageWindowDays),
  ];

  const known = components.filter((component) => component.known);
  const weightSum = known.reduce((sum, component) => sum + component.weight, 0);
  const score =
    weightSum === 0
      ? 0
      : Number(
          (known.reduce((sum, component) => sum + component.score * component.weight, 0) / weightSum).toFixed(1),
        );

  const status: TrustBreakdown["status"] =
    weightSum === 0 ? "unknown" : score >= 80 ? "trusted" : score >= 50 ? "mixed" : "weak";

  return { score, status, components };
}

function contractComponent(table: TableEntry): TrustComponent {
  const weight = TRUST_WEIGHTS.contract;
  if (!table.contract || !table.contractSchema) {
    return {
      name: "contract",
      score: 0,
      weight,
      known: false,
      evidence: "no ODCS contract covers this table",
    };
  }
  const described = table.columns.filter((column) => column.description !== undefined).length;
  const coverage = table.columns.length === 0 ? 0 : described / table.columns.length;
  const hasRules = table.contractSchema.quality.length > 0;
  const hasSla = table.sla.length > 0;
  const score = Math.round(50 + 25 * coverage + (hasRules ? 15 : 0) + (hasSla ? 10 : 0));
  return {
    name: "contract",
    score,
    weight,
    known: true,
    evidence:
      `contract ${table.contract.id} (${table.contract.status ?? "status unknown"}); ` +
      `${described}/${table.columns.length} columns documented` +
      `${hasRules ? "; quality rules declared" : ""}${hasSla ? "; SLA declared" : ""}`,
  };
}

function testsComponent(tests: TrustInputs["tests"]): TrustComponent {
  const weight = TRUST_WEIGHTS.tests;
  if (tests.total === 0) {
    return {
      name: "tests",
      score: 0,
      weight,
      known: false,
      evidence: "no dbt test results for this table",
    };
  }
  const score = Math.round(((tests.pass + 0.5 * tests.warn) / tests.total) * 100);
  return {
    name: "tests",
    score,
    weight,
    known: true,
    evidence: `${tests.pass}/${tests.total} dbt tests passing${tests.warn ? `, ${tests.warn} warn` : ""}${tests.fail ? `, ${tests.fail} failing` : ""}`,
  };
}

function freshnessComponent(freshness: TrustInputs["freshness"]): TrustComponent {
  const weight = TRUST_WEIGHTS.freshness;
  if (freshness.status === "unknown") {
    return {
      name: "freshness",
      score: 0,
      weight,
      known: false,
      evidence: "no freshness evidence",
    };
  }
  const score = freshness.status === "fresh" ? 100 : freshness.status === "warn" ? 50 : 0;
  return {
    name: "freshness",
    score,
    weight,
    known: true,
    evidence:
      freshness.ageHours === null
        ? `freshness ${freshness.status}`
        : `freshness ${freshness.status}, last data ${freshness.ageHours}h ago`,
  };
}

function usageComponent(queries: number, windowDays: number): TrustComponent {
  const weight = TRUST_WEIGHTS.usage;
  const scaled = Math.round(Math.min(1, queries / USAGE_SATURATION) * 100);
  return {
    name: "usage",
    score: scaled,
    weight,
    // Field evidence exists only when something actually queried the table.
    known: queries > 0,
    evidence:
      queries > 0
        ? `${queries} quer${queries === 1 ? "y" : "ies"} in the last ${windowDays} days (field evidence)`
        : `no queries in the last ${windowDays} days - no field evidence yet`,
  };
}
