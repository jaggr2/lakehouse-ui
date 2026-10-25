# Decisions (ADRs)

Short decision records for `lakehouse-ui`. Add a new numbered section per
decision; link to commits/PRs where useful. Open questions from `AGENTS.md` §6
are tracked at the bottom.

## ADR-001 — meta.db uses `node:sqlite` (2026-10-25)

Node 24 ships `node:sqlite` (DatabaseSync). It removes native build tooling
from the deployment story (no better-sqlite3 compile step on derog-server) and
is plenty for a homelab write volume. The experimental warning is accepted;
the schema is ours and additive-only, so a future swap to a driver-grade
SQLite binding is contained in `api/src/meta/db.ts`.

## ADR-002 — Data Trust Index formula (U3) (2026-10-25)

The plan fixes the composite as *contract ∧ tests ∧ fresh ∧ used*. Concretely,
per table:

| component | weight | score |
|---|---|---|
| `contract` | 0.25 | 50 base + 25 × column-description coverage + 15 if quality rules declared + 10 if SLA declared |
| `tests` | 0.35 | 100 × (pass + 0.5 × warn) / total latest dbt test results |
| `freshness` | 0.25 | fresh=100, warn=50, stale=0 |
| `usage` | 0.15 | min(1, queries/20) × 100 over the last 30 days |

- Components without evidence are marked `known: false` and their weight is
  renormalized over the known ones. No evidence at all → `status: unknown`,
  score 0. `usage` counts as evidence only when the table has been queried —
  an untouched table has no field evidence either way.
- ODCS quality rules that the service cannot evaluate (e.g. `rowCount`) report
  `status: unknown` — never a fake green.
- Thresholds for `status`: ≥80 `trusted`, ≥50 `mixed`, else `weak`.

Implementation: `api/src/quality/trust.ts`; served as
`QualityReport.trust` (`trustScore` stays the headline number).

## ADR-003 — Freshness thresholds (U3) (2026-10-25)

Evidence chain per table: dbt source-freshness results (`sources.json`, or
run_results entries carrying `max_loaded_at`) → last successful model build in
`run_results.json` → nothing (`unknown`). Thresholds in order: dbt
`freshness: warn_after/error_after` on the manifest node → contract SLA
`frequency` (warn = 2× cadence, error = 4×) → house default 26 h / 48 h (the
same numbers the dbt source freshness configs use).

## ADR-004 — Parse `query_product`'s pipe table (2026-10-25)

Locked decision: all SQL goes through the guarded lakehouse-mcp. Its
`query_product` tool returns a rendered pipe table (see
`lakehouse/mcp/lakehouse_mcp/server.py`), so `POST /query` parses that format
(`api/src/query/parse.ts`). Known limitation: a cell containing ` | ` splits
wrong. Fix upstream when the MCP grows a JSON result mode; until then the
parser is covered by tests against the documented format.

## ADR-005 — Graph fallback + edge direction (2026-10-25)

`semantics/graph.json` (compiled by the data repo) is authoritative. When it
is absent the API compiles an equivalent from contracts + products + concepts
+ mappings + dbt refs at load time — and deliberately emits **no `joins_on`
edges**: inventing joins is the failure mode the graph exists to prevent.
Compiled node ids: tables `<database>.<table>`, columns
`<table>.<column>`, concepts by concept id, products `product:<product-id>`,
non-gold dbt models/sources by unique_id. Edge direction is subject-verb-
object: `{"from": A, "to": B, "kind": "derives_from"}` reads "A derives_from
B", i.e. B is upstream. (The example edge in `docs/ARTIFACTS.md` predates this
convention and reads the other way round.)

## ADR-006 — Usage ingestion loop (U4) (2026-10-25)

Two sources, one table (`usage_events`):

1. `POST /query` records one event per table referenced by the SQL, actor from
   the `x-actor` header (`workbench` by default), `query_id` from the MCP.
2. `npm run ingest:athena -- --days 30` imports Athena
   `ListQueryExecutions` history (least-privilege `lakehouse-read`),
   actor `athena:<workgroup>`.

`query_id` carries a unique index and ingestion is idempotent — first write
wins, so the richer workbench actor survives an Athena re-import. SQL text is
stored so impact analysis can find affected queries; table/column matching is
text-level (regex, same heuristic the MCP guard uses) until U2 brings column
lineage.

## Scope notes from the U0/U3/U4 session (2026-10-25)

- U0 delivered all `openapi.yaml` endpoints backed by real artifact data.
  Catalog (`/search`, `/products`, `/tables`, `/concepts`) and lineage
  (`/lineage`) are skeleton-level: correct data, straightforward logic. U3
  (`/quality`) and U4 (`/usage`, `/impact`, usage ingestion) are the full
  implementation.
- `POST /query` executes SQL through the guarded MCP and answers `501` for
  natural-language prompts — NL→SQL grounding is U5's scope.

## Open (from AGENTS.md §6 — ask the maintainer)

- **Usage history depth / purge policy** — nothing is purged yet;
  `usage_events` grows unbounded and `sql` text is retained. Needs a
  retention decision (then an additive migration + a purge job).
- **Concept editor writes PRs or exports YAML** — U5 scope, undecided.
- **Graph visualization library** — web/ decision (U2), undecided.
