/**
 * NL→SQL with semantic grounding (U5).
 *
 * The prompt is grounded against the knowledge graph before generation:
 * golden questions (few-shot + regression), the concept registry (synonyms,
 * units, grain, timezone), the join graph, and per-concept example SQL. The
 * LLM (Warden /llm proxy, budgeted project token) writes the query; if no
 * LLM is configured a deterministic fallback assembles SQL from the matched
 * golden question's `must_use` assertions, so the workbench and evals stay
 * useful offline.
 */
import type { Catalog, ConceptDoc } from "../artifacts/types.js";

export interface GoldenQuestion {
  q: string;
  tables: string[];
  concepts: string[];
  must_use: string[];
  timezone_note?: string;
}

export interface GenerationPlan {
  golden: GoldenQuestion | null;
  goldenScore: number;
  concepts: ConceptDoc[];
  tables: string[];
  joins: string[];
  timezone: string;
  examples: { q: string; sql: string }[];
}

export interface GeneratedSql {
  sql: string;
  plan: GenerationPlan;
  llmUsed: boolean;
  fallback: boolean;
}

export interface LlmConfig {
  endpoint: string;
  token: string;
  model: string;
  timeoutMs: number;
}

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "did", "do", "for", "from",
  "how", "i", "in", "is", "it", "last", "many", "me", "much", "my", "of", "on",
  "or", "the", "this", "to", "was", "were", "what", "when", "which", "who",
  "with", "you", "your", "did",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9_ ]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOPWORDS.has(word)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let score = 0;
  for (const word of a) if (b.has(word)) score += 1;
  return score;
}

/** Ground a natural-language question against golden questions + concepts. */
export function planQuestion(prompt: string, catalog: Catalog, golden: GoldenQuestion[]): GenerationPlan {
  const words = tokens(prompt);
  const lower = prompt.toLowerCase();

  let best: GoldenQuestion | null = null;
  let bestScore = 0;
  for (const question of golden) {
    const qWords = tokens(question.q);
    const score = qWords.size === 0 ? 0 : overlap(words, qWords) / qWords.size;
    if (score > bestScore) {
      bestScore = score;
      best = question;
    }
  }

  const conceptScores: { concept: ConceptDoc; score: number }[] = [];
  for (const concept of catalog.concepts) {
    const labels = tokens(`${concept.label} ${concept.synonyms.join(" ")}`);
    const score = overlap(words, labels);
    if (score > 0) conceptScores.push({ concept, score });
  }
  conceptScores.sort((a, b) => b.score - a.score);
  const concepts = conceptScores.slice(0, 6).map((entry) => entry.concept);

  const tables = new Set<string>(best?.tables ?? []);
  for (const concept of concepts) {
    if (concept.preferredTable) tables.add(concept.preferredTable);
    // Concept→column mappings live in the mapping docs, not the concept doc.
    for (const mapping of catalog.mappings) {
      for (const specs of mapping.columns.values()) {
        if (specs.some((spec) => spec.concept === concept.id)) tables.add(mapping.table);
      }
    }
  }
  for (const tableId of catalog.tables.keys()) {
    const short = tableId.split(".").pop() ?? tableId;
    if (lower.includes(short.replace(/_/g, " ")) || lower.includes(short)) tables.add(tableId);
  }
  if (tables.size === 0 && best) for (const t of best.tables) tables.add(t);

  const joins: string[] = [];
  const chosen = [...tables];
  for (const edge of catalog.graph.edges) {
    if (edge.kind !== "joins_on") continue;
    const from = edge.from ?? "";
    const to = edge.to ?? "";
    const left = from.split(".").slice(0, 2).join(".");
    const right = to.split(".").slice(0, 2).join(".");
    if (left !== right && chosen.includes(left) && chosen.includes(right)) {
      joins.push(edge.on?.length ? `${from} = ${to}` : `${left} ⋈ ${right}`);
    }
  }

  let timezone = "Europe/Zurich";
  for (const concept of concepts) {
    if (concept.timeSemantics?.timezone) {
      timezone = concept.timeSemantics.timezone;
      break;
    }
  }

  const examples: { q: string; sql: string }[] = [];
  for (const concept of concepts) {
    for (const example of concept.examples) {
      if (example.sql && examples.length < 3) examples.push({ q: example.q, sql: example.sql });
    }
  }

  return { golden: best, goldenScore: bestScore, concepts, tables: [...tables], joins, timezone, examples };
}

function systemPrompt(plan: GenerationPlan, catalog: Catalog): string {
  const tableLines = plan.tables.map((tableId) => {
    const table = catalog.tables.get(tableId);
    const columns = (table?.columns ?? [])
      .map((c) => `${c.name}${c.concept ? ` (${c.concept})` : ""}`)
      .join(", ");
    return `- ${tableId}: ${columns}`;
  });
  const conceptLines = plan.concepts
    .map((c) => `- ${c.id} "${c.label}" ${c.unit ? `unit=${JSON.stringify(c.unit)}` : ""} grain=${c.grain ?? "n/a"} tz=${c.timeSemantics?.timezone ?? ""}`)
    .join("\n");
  const goldenLines = plan.golden
    ? `- Q: ${plan.golden.q}\n  must use: ${plan.golden.must_use.join(" | ")}`
    : "(none)";
  const exampleLines = plan.examples.map((e) => `- Q: ${e.q}\n  SQL: ${e.sql}`).join("\n");

  return [
    "You translate questions into Athena/Trino SQL for a governed lakehouse.",
    "RULES:",
    "- Output ONLY SQL (a single SELECT or WITH statement). No commentary.",
    "- Only query the gold tables listed below. No DDL/DML.",
    `- Interpret relative time ("today", "this week") in timezone ${plan.timezone}.`,
    "- Prefer aggregations in SQL; never SELECT * over wide tables unless asked.",
    "TABLES (gold):",
    tableLines.join("\n") || "- (none)",
    "CONCEPTS (meaning of columns):",
    conceptLines || "- (none)",
    "JOINS:",
    plan.joins.length ? plan.joins.map((j) => `- ${j}`).join("\n") : "- (none)",
    "GOLDEN EXAMPLE (match its intent and required predicates):",
    goldenLines,
    "CONCEPT EXAMPLES (SQL style to imitate):",
    exampleLines || "- (none)",
  ].join("\n");
}

/** Deterministic fallback: assemble SQL from the golden question's shape. */
function fallbackSql(plan: GenerationPlan): string {
  const table = plan.tables[0] ?? "lake_gold.media_activity";
  const mustUse = plan.golden?.must_use ?? [];
  const filters = mustUse.filter((assertion) => assertion.includes("=") && !assertion.includes("("));
  const times = mustUse.filter((assertion) => /(_at|_ts|date|time)\b/i.test(assertion));
  const dims = mustUse.filter(
    (assertion) => !assertion.includes("=") && !/(_at|_ts|date|time)\b/i.test(assertion),
  );
  const where = [...filters, ...times.slice(0, 1).map((t) => `${t.trim()} is not null`)];
  const dim = dims[0];
  const timeCol = times[0];
  // "which X was most active" shape: dimension + time => aggregate.
  if (dim !== undefined && timeCol !== undefined) {
    return [
      `select ${dim.trim()}, count(*) as n`,
      `from ${table}`,
      where.length ? `where ${where.join(" and ")}` : "",
      `group by 1 order by n desc limit 20`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const orderBy = timeCol ?? dim;
  // Project every required identifier so `must_use` column assertions hold.
  const selectCols = [
    ...new Set([
      ...dims.map((d) => d.trim()),
      ...filters.map((f) => (f.split("=")[0] ?? "").trim()).filter(Boolean),
      ...times.map((t) => t.trim()),
    ]),
  ];
  return [
    selectCols.length > 0 ? `select ${selectCols.join(", ")}` : "select *",
    `from ${table}`,
    where.length ? `where ${where.join(" and ")}` : "",
    orderBy ? `order by ${orderBy.trim()} desc` : "",
    "limit 50",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateSql(
  catalog: Catalog,
  golden: GoldenQuestion[],
  prompt: string,
  llm: LlmConfig | null,
): Promise<GeneratedSql> {
  const plan = planQuestion(prompt, catalog, golden);
  if (llm && llm.token) {
    try {
      const response = await fetch(llm.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${llm.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: llm.model,
          temperature: 0,
          max_tokens: 800,
          messages: [
            { role: "system", content: systemPrompt(plan, catalog) },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(llm.timeoutMs),
      });
      if (response.ok) {
        const doc = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        const content = doc.choices?.[0]?.message?.content ?? "";
        const sql = content
          .replace(/^```(?:sql)?/i, "")
          .replace(/```$/, "")
          .trim();
        if (/^(select|with)\b/i.test(sql)) {
          return { sql, plan, llmUsed: true, fallback: false };
        }
      }
    } catch {
      // fall through to the deterministic fallback
    }
  }
  return { sql: fallbackSql(plan), plan, llmUsed: false, fallback: true };
}
