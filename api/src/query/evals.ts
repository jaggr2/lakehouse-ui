/**
 * Golden-question regression harness (U5).
 *
 * Every question in semantics/golden_questions.yaml runs through the NL→SQL
 * path; the generated SQL is asserted against the question's `must_use`
 * predicates. This is what keeps prompt-engineering honest: change the
 * generator, run the evals, see the score.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import type { Catalog } from "../artifacts/types.js";
import type { MetaDb } from "../meta/db.js";
import { insertEvalRun } from "../meta/feedback.js";
import type { Clock } from "../util/time.js";
import { generateSql, type GoldenQuestion, type LlmConfig } from "./generate.js";

export interface EvalResult {
  q: string;
  passed: boolean;
  matched: string[];
  missing: string[];
  sql: string;
  llmUsed: boolean;
  goldenScore: number;
}

export interface EvalReport {
  total: number;
  passed: number;
  score: number;
  llmAvailable: boolean;
  results: EvalResult[];
}

export function loadGoldenQuestions(artifactsDir: string): GoldenQuestion[] {
  const file = path.join(artifactsDir, "semantics", "golden_questions.yaml");
  const doc = parseYaml(fs.readFileSync(file, "utf8")) as { questions?: GoldenQuestion[] };
  return doc.questions ?? [];
}

const normalize = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, " ").replace(/\s*=\s*/g, "=").trim();

export async function runEvals(
  catalog: Catalog,
  golden: GoldenQuestion[],
  llm: LlmConfig | null,
  memory?: { meta: MetaDb; clock: Clock },
): Promise<EvalReport> {
  const results: EvalResult[] = [];
  for (const question of golden) {
    const generated = await generateSql(catalog, golden, question.q, llm);
    const haystack = normalize(generated.sql);
    const matched: string[] = [];
    const missing: string[] = [];
    for (const assertion of question.must_use ?? []) {
      if (haystack.includes(normalize(assertion))) matched.push(assertion);
      else missing.push(assertion);
    }
    results.push({
      q: question.q,
      passed: missing.length === 0,
      matched,
      missing,
      sql: generated.sql,
      llmUsed: generated.llmUsed,
      goldenScore: generated.plan.goldenScore,
    });
  }
  const passed = results.filter((r) => r.passed).length;
  const report: EvalReport = {
    total: results.length,
    passed,
    score: results.length === 0 ? 0 : passed / results.length,
    llmAvailable: Boolean(llm && llm.token),
    results,
  };
  if (memory) {
    insertEvalRun(memory.meta, memory.clock, {
      total: report.total,
      passed: report.passed,
      score: report.score,
      llmAvailable: report.llmAvailable,
    });
  }
  return report;
}
