import type { Catalog, SlaProperty, TableEntry } from "../artifacts/types.js";
import { hoursBetween, type Clock } from "../util/time.js";

export type FreshnessStatus = "fresh" | "warn" | "stale" | "unknown";

export interface FreshnessView {
  status: FreshnessStatus;
  source: "dbt-source-freshness" | "dbt-model-build" | "none";
  lastEventAt: string | null;
  ageHours: number | null;
  warnAfterHours: number | null;
  errorAfterHours: number | null;
  note: string;
}

const UNIT_HOURS: Record<string, number> = {
  s: 1 / 3600,
  min: 1 / 60,
  h: 1,
  d: 24,
  w: 168,
  mo: 720,
  y: 8760,
};

/** House default when neither dbt freshness nor an SLA says otherwise. */
const DEFAULT_WARN_HOURS = 26;
const DEFAULT_ERROR_HOURS = 48;

/**
 * Thresholds, in order of preference:
 * 1. dbt source freshness (`warn_after`/`error_after` on the manifest node)
 * 2. the contract SLA `frequency` (warn = 2× the cadence, error = 4×)
 * 3. the house defaults (26 h / 48 h)
 */
export function thresholdsFor(table: TableEntry): { warn: number; error: number; basis: string } {
  const freshness = table.model?.freshness;
  const warn = durationHours(freshness?.["warn_after"]);
  const error = durationHours(freshness?.["error_after"]);
  if (warn !== undefined || error !== undefined) {
    return {
      warn: warn ?? DEFAULT_WARN_HOURS,
      error: error ?? DEFAULT_ERROR_HOURS,
      basis: "dbt source freshness",
    };
  }
  const slaCadence = slaCadenceHours(table.sla);
  if (slaCadence !== undefined) {
    return {
      warn: slaCadence * 2,
      error: slaCadence * 4,
      basis: "contract SLA frequency",
    };
  }
  return { warn: DEFAULT_WARN_HOURS, error: DEFAULT_ERROR_HOURS, basis: "house default" };
}

function durationHours(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const count = record["count"];
  const period = record["period"];
  if (typeof count !== "number") return undefined;
  const factor = typeof period === "string" ? UNIT_HOURS[period] : undefined;
  return factor === undefined ? undefined : count * factor;
}

function slaCadenceHours(sla: SlaProperty[]): number | undefined {
  const frequency = sla.find((property) => property.property === "frequency");
  if (!frequency) return undefined;
  const factor = frequency.unit ? UNIT_HOURS[frequency.unit] : undefined;
  if (typeof frequency.value !== "number" || factor === undefined) return undefined;
  return frequency.value * factor;
}

/**
 * Freshness evidence for one table:
 * 1. dbt source-freshness results (entries carrying `max_loaded_at`)
 * 2. the last successful build of the table's dbt model
 * 3. nothing → `unknown`
 */
export function freshnessFor(catalog: Catalog, table: TableEntry, clock: Clock): FreshnessView {
  const { warn, error, basis } = thresholdsFor(table);

  const sourceResult = catalog.dbt.runResults.find(
    (result) => result.maxLoadedAt !== undefined && result.uniqueId.endsWith(`.${table.name}`),
  );
  const model = table.model;
  const modelResult = model
    ? catalog.dbt.runResults.find((result) => result.uniqueId === model.uniqueId && result.status === "success")
    : undefined;

  const evidence =
    sourceResult?.maxLoadedAt !== undefined
      ? {
          lastEventAt: sourceResult.maxLoadedAt,
          source: "dbt-source-freshness" as const,
          snapshottedAt: sourceResult.runAt,
        }
      : modelResult?.runAt !== undefined
        ? { lastEventAt: modelResult.runAt, source: "dbt-model-build" as const, snapshottedAt: modelResult.runAt }
        : null;

  if (!evidence) {
    return {
      status: "unknown",
      source: "none",
      lastEventAt: null,
      ageHours: null,
      warnAfterHours: warn,
      errorAfterHours: error,
      note:
        catalog.dbt.missing
          ? "no dbt run_results.json - freshness cannot be established"
          : "no freshness or model-build evidence for this table",
    };
  }

  const lastEvent = new Date(evidence.lastEventAt);
  const ageHours = Number(hoursBetween(lastEvent, clock()).toFixed(1));
  const status: FreshnessStatus = ageHours > error ? "stale" : ageHours > warn ? "warn" : "fresh";
  return {
    status,
    source: evidence.source,
    lastEventAt: evidence.lastEventAt,
    ageHours,
    warnAfterHours: warn,
    errorAfterHours: error,
    note: `${evidence.source} · thresholds from ${basis}`,
  };
}
