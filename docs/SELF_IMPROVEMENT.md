# Self-improvement loop — design

How wrong answers become better answers. Principle: **corrections change
knowledge and test cases, never code** — git revert is always the escape
hatch, and the eval score may never regress.

## The methods

| # | Method | Mechanism | Status |
|---|---|---|---|
| M1 | Feedback capture + review queue | 👎 on query results → `meta.db.feedback` → promote to golden question | **built 2026-10** |
| M2 | `submit_correction` MCP tool | agents submit corrections; Warden `guard: reason` + audit | **built 2026-10** |
| M3 | Semantic patches | corrections → concept synonyms / mapping patches in the data repo (`semantics/`) | **built 2026-10 (improver PRs)** |
| M4 | Autonomous improver | Warden cron → `opencode run --auto` tunes few-shots/synonyms against evals; CI blocks score regressions | **built 2026-10 (GitHub cron, not Warden)** |
| M5 | Weak-signal mining | rephrase-after-answer, SQL copy+edit → candidate golden questions | **built 2026-10** |
| M6 | Correction impact tracking | `score_before → score_after` per promotion; provenance on every golden question | **built 2026-10 (score_before/after)** |

## Data model (meta.db, additive migrations only)

- `feedback` — capture: prompt, generated_sql, corrected_sql, notes, actor,
  status (`open | promoted | rejected`), golden_q, promoted_ts.
- `golden_questions` — promoted additions merged into the eval set and the
  generation few-shot pool; `origin` = `feedback-<id> | improver | manual`.
- `eval_runs` — every `/api/evals` call records ts/total/passed/score/llm
  → the score trend.

The file-based `semantics/golden_questions.yaml` stays the seeded source of
truth; meta.db holds additions until they are synced back to the data repo
(a W3 concern — the artifacts mount is read-only by design).

## Promotion semantics (W1)

`POST /api/feedback/:id/promote` turns a correction into a golden question:

- `q` = the original prompt
- `tables` = tables referenced by the corrected SQL
- `must_use` = equality atoms (`x = 'y'`) + target-table columns appearing in
  the corrected SQL (overridable via the request body)
- `concepts` = inferred later (W3); empty for now

The next `/api/evals` includes it; the next generation can few-shot against it.

## Guardrails

1. **Score never regresses**: CI runs evals; promotion is data-only and
   self-testing (the promoted question IS a test).
2. **Corrections are data**: they influence the golden set and grounding
   inputs only — never code paths or SQL execution.
3. **Agent writes are audited**: Warden `guard: reason` on M2's tool.
4. **Provenance**: every golden question and example records origin + date.
5. **Revert = git + meta.db delete**; both layers are cheap to roll back.

## The full loop (target state, W4)

```
user/agent hits wrong answer
  └─ submit_correction (M1/M2)
       └─ improver agent classifies:
            ├─ SQL-shape issue  → new golden question (M1 promotion)
            ├─ meaning issue    → concept synonym patch (M3, data repo PR)
            └─ style issue      → few-shot example (concept examples)
                 └─ evals re-run (auto) → score trend (M6)
                      └─ CI gate: score >= baseline → merge
```
