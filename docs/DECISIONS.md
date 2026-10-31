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

## ADR-007 — usage_events retention: 3 years (2026-10-25)

Decision from the maintainer: keep usage history for **3 years** by default.
Implemented as a purge job, no schema change needed:

- `LAKEHOUSE_USAGE_RETENTION_DAYS` (default `1095`, i.e. 3 × 365) — `0`
  disables purging entirely (keep forever).
- The server purges `usage_events` rows older than the cutoff at startup and
  once a day; `npm run purge:usage` runs it manually.
- Annotations and `graph_cache` are not affected (annotations are curation
  state, not telemetry).

3 years comfortably covers the usage/impact views (`LAKEHOUSE_USAGE_WINDOW_DAYS`
= 30, `LAKEHOUSE_QUERY_LOOKBACK_DAYS` = 90) while keeping the SQL text of old
queries — which impact analysis matches against — for as long as a table
definition is likely to matter. Purge is idempotent and cheap (`ts` is
indexed via `idx_usage_table_ts`).

## ADR-008 — Catalog MCP: minimal stateless JSON-RPC (2026-11-01)

U6 wants agents (opencode) to consult the catalog *before* choosing a data
product. Decision: expose `POST /api/mcp` as an MCP server with three tools —
`catalog_lookup`, `lineage_of`, `impact_of` — speaking plain JSON-RPC 2.0 over
stateless streamable HTTP (one message per POST, JSON responses, `202` for
notifications). No `@modelcontextprotocol/sdk`: our tool surface is tiny, we
need no sessions/SSE, and the envelope is pinned by contract tests
(`McpRequest`/`McpResponse` in openapi.yaml). Same minimal shape our own
lakehouse-mcp client speaks (`query/mcp.ts`).

- The tools call this app's own REST routes through the internal Hono dispatch,
  so agents see exactly the payloads the SPA sees — one source of truth. Only
  `catalog_lookup` for a product strips the raw ODCS contract (too heavy for a
  tool result; its identity stays visible via the table view).
- `initialize` negotiates protocol versions (2025-06-18 and older) and returns
  `instructions` — OpenCode injects those into the system prompt, which is how
  "consult the catalog first" reaches the agent.
- JSON-RPC errors: `-32600` (bad envelope, HTTP 400), `-32601` (unknown
  method), `-32602` (unknown tool); tool-level failures are results with
  `isError: true`, per MCP convention.

## ADR-009 — Certification flags live on annotations (2026-11-01)

Trust scores answer "can I use this" from evidence (contracts, tests,
freshness, usage). Certification answers it from a human: a steward asserts
that an asset is fit for use — or revokes that. Decision: **no new table**.
The `annotations` table (docs/ARTIFACTS.md) carries the flags as event rows of
kind `certified` | `decertified` (body = note, author = who); the latest event
wins and the history is kept. Additive-only schema honored — zero migrations.

- `GET`/`PUT /api/certification/{assetId}` for products, tables and columns;
  `Product`/`TableDetail` embed their flag, `catalog_lookup` returns it to
  agents.
- No approval workflow (AGENTS.md §5): the flag records who stands behind an
  asset and why, it does not gate anything. Revoking is a new event, so
  re-certification history survives.
- UI toggle on product/table pages writes through the same endpoint with
  `x-actor: ui`.

## Open (from AGENTS.md §6 — ask the maintainer)

- ~~**Usage history depth / purge policy**~~ — decided: 3 years, see ADR-007.
- **Concept editor writes PRs or exports YAML** — U5 scope, undecided.
- **Graph visualization library** — web/ decision (U2), undecided.
