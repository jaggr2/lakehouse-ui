import type { MetaDb } from "./db.js";
import { toIso, type Clock } from "../util/time.js";

/**
 * Certification flags on the `annotations` table (docs/ARTIFACTS.md): a
 * steward asserts that a product/table/column is fit for use — or revokes
 * that assertion. One row per event (kind `certified` | `decertified`), the
 * latest event wins. No approval workflow (AGENTS.md §5) — the flag records
 * who stands behind the asset.
 */
export interface CertificationEvent {
  certified: boolean;
  note: string | null;
  author: string | null;
  ts: string;
}

export interface Certification {
  assetId: string;
  certified: boolean;
  note: string | null;
  author: string | null;
  /** When the current state was set; null when the flag was never touched. */
  ts: string | null;
  history: CertificationEvent[];
}

export function certificationFor(meta: MetaDb, assetId: string): Certification {
  const rows = meta.db
    .prepare(
      `SELECT kind, body, author, ts FROM annotations
       WHERE asset_id = ? AND kind IN ('certified', 'decertified')
       ORDER BY ts ASC, rowid ASC`,
    )
    .all(assetId) as Record<string, unknown>[];
  const history = rows.map((row) => ({
    certified: String(row["kind"]) === "certified",
    note: row["body"] ? String(row["body"]) : null,
    author: row["author"] === null || row["author"] === undefined ? null : String(row["author"]),
    ts: String(row["ts"]),
  }));
  const current = history[history.length - 1];
  return {
    assetId,
    certified: current?.certified ?? false,
    note: current?.note ?? null,
    author: current?.author ?? null,
    ts: current?.ts ?? null,
    history,
  };
}

/** Batch variant for product/table rollups. */
export function certificationsFor(meta: MetaDb, assetIds: string[]): Map<string, Certification> {
  const out = new Map<string, Certification>();
  for (const assetId of assetIds) out.set(assetId, certificationFor(meta, assetId));
  return out;
}

export function setCertification(
  meta: MetaDb,
  clock: Clock,
  assetId: string,
  input: { certified: boolean; note?: string | undefined; author?: string | undefined },
): Certification {
  meta.db
    .prepare(`INSERT INTO annotations (asset_id, kind, body, author, ts) VALUES (?, ?, ?, ?, ?)`)
    .run(
      assetId,
      input.certified ? "certified" : "decertified",
      input.note ?? "",
      input.author ?? null,
      toIso(clock()),
    );
  return certificationFor(meta, assetId);
}
