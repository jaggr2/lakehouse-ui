/**
 * feedback / golden_questions / eval_runs — the self-improvement loop's
 * memory (docs/SELF_IMPROVEMENT.md). Corrections are data: they influence
 * the golden eval set and the generation few-shot pool, never code.
 */
import type { GoldenQuestion } from "../query/generate.js";
import type { MetaDb } from "./db.js";
import { toIso, type Clock } from "../util/time.js";

export type FeedbackStatus = "open" | "promoted" | "rejected";

export interface FeedbackInput {
  prompt: string;
  generatedSql: string;
  correctedSql?: string | undefined;
  notes?: string | undefined;
  actor?: string | undefined;
}

export interface FeedbackRecord extends FeedbackInput {
  id: number;
  ts: string;
  status: FeedbackStatus;
  goldenQ: string | null;
  promotedTs: string | null;
}

export interface EvalRun {
  id: number;
  ts: string;
  total: number;
  passed: number;
  score: number;
  llmAvailable: boolean;
}

function toRecord(row: Record<string, unknown>): FeedbackRecord {
  return {
    id: Number(row["id"]),
    ts: String(row["ts"]),
    prompt: String(row["prompt"]),
    generatedSql: String(row["generated_sql"]),
    correctedSql: (row["corrected_sql"] as string | null) ?? undefined,
    notes: (row["notes"] as string | null) ?? undefined,
    actor: (row["actor"] as string | null) ?? undefined,
    status: String(row["status"]) as FeedbackStatus,
    goldenQ: (row["golden_q"] as string | null) ?? null,
    promotedTs: (row["promoted_ts"] as string | null) ?? null,
  };
}

export function insertFeedback(meta: MetaDb, clock: Clock, input: FeedbackInput): FeedbackRecord {
  const ts = toIso(clock());
  const result = meta.db
    .prepare(
      `INSERT INTO feedback (ts, prompt, generated_sql, corrected_sql, notes, actor)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(ts, input.prompt, input.generatedSql, input.correctedSql ?? null, input.notes ?? null, input.actor ?? null);
  return toRecord(result as Record<string, unknown>);
}

export function listFeedback(meta: MetaDb, status?: FeedbackStatus): FeedbackRecord[] {
  const rows = (
    status
      ? meta.db.prepare("SELECT * FROM feedback WHERE status = ? ORDER BY id DESC").all(status)
      : meta.db.prepare("SELECT * FROM feedback ORDER BY id DESC").all()
  ) as Record<string, unknown>[];
  return rows.map(toRecord);
}

export function getFeedback(meta: MetaDb, id: number): FeedbackRecord | null {
  const row = meta.db.prepare("SELECT * FROM feedback WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? toRecord(row) : null;
}

/**
 * Promote a correction to a golden question. `must_use` can be supplied
 * explicitly; otherwise equality atoms and target-table column mentions in
 * the corrected SQL are inferred (see app.ts for the column-aware wrapper).
 */
export function promoteFeedback(
  meta: MetaDb,
  clock: Clock,
  id: number,
  golden: Omit<GoldenQuestion, "q"> & { q?: string },
): { feedback: FeedbackRecord; golden: GoldenQuestion } {
  const row = meta.db.prepare("SELECT * FROM feedback WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error(`unknown feedback id: ${id}`);
  const record = toRecord(row);
  const question: GoldenQuestion = {
    q: golden.q ?? record.prompt,
    tables: golden.tables,
    concepts: golden.concepts,
    must_use: golden.must_use,
    timezone_note: golden.timezone_note,
  };
  const ts = toIso(clock());
  meta.db
    .prepare(
      `INSERT INTO golden_questions (q, tables, concepts, must_use, origin, created_ts)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(q) DO UPDATE SET tables = excluded.tables, concepts = excluded.concepts,
         must_use = excluded.must_use`,
    )
    .get(
      question.q,
      JSON.stringify(question.tables),
      JSON.stringify(question.concepts),
      JSON.stringify(question.must_use),
      `feedback-${id}`,
      ts,
    );
  meta.db
    .prepare("UPDATE feedback SET status = 'promoted', golden_q = ?, promoted_ts = ? WHERE id = ?")
    .run(question.q, ts, id);
  return {
    feedback: { ...record, status: "promoted", goldenQ: question.q, promotedTs: ts },
    golden: question,
  };
}

/** Golden questions promoted via feedback (merged into the eval set). */
export function goldenAdditions(meta: MetaDb): GoldenQuestion[] {
  const rows = meta.db
    .prepare("SELECT * FROM golden_questions ORDER BY id")
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({
    q: String(row["q"]),
    tables: JSON.parse(String(row["tables"])) as string[],
    concepts: JSON.parse(String(row["concepts"])) as string[],
    must_use: JSON.parse(String(row["must_use"])) as string[],
  }));
}

export function insertEvalRun(
  meta: MetaDb,
  clock: Clock,
  run: { total: number; passed: number; score: number; llmAvailable: boolean },
): EvalRun {
  const ts = toIso(clock());
  const row = meta.db
    .prepare(
      `INSERT INTO eval_runs (ts, total, passed, score, llm_available)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(ts, run.total, run.passed, run.score, run.llmAvailable ? 1 : 0) as Record<string, unknown>;
  return {
    id: Number(row["id"]),
    ts: String(row["ts"]),
    total: Number(row["total"]),
    passed: Number(row["passed"]),
    score: Number(row["score"]),
    llmAvailable: Boolean(row["llm_available"]),
  };
}

export function evalHistory(meta: MetaDb, limit = 50): EvalRun[] {
  const rows = meta.db
    .prepare("SELECT * FROM eval_runs ORDER BY id DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row["id"]),
    ts: String(row["ts"]),
    total: Number(row["total"]),
    passed: Number(row["passed"]),
    score: Number(row["score"]),
    llmAvailable: Boolean(row["llm_available"]),
  }));
}
