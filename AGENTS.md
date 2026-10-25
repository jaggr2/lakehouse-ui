# AGENTS.md — lakehouse-ui (data catalog & query workbench)

Build the UI for a governed homelab data lakehouse: catalog, search,
column-level lineage, quality/trust scores, usage insights, impact analysis,
and an NL→SQL workbench grounded in a semantic knowledge graph. Feature
baseline = Collate/Ataccama parity scoped in
`jaggr2/home-control-server-config/idea_drafts/LAKEHOUSE_UI_PLAN.md`.

## 1. Hard constraints

- **Stack (fixed)**: TypeScript strict (`noImplicitAny`, `strictNullChecks`),
  ESM, Node 24, **Hono** for the API, **Angular ≥20 standalone + signals**
  for `web/`. No `any`; `unknown` + validation at trust boundaries.
- **Contract-first**: `openapi.yaml` is LAW. API changes land in the spec
  first, then implementation. `web/` codes against the spec (mocks are fine);
  `api/` must satisfy it (contract tests in CI).
- **Layout = parallelism boundary**: sessions touch `api/` OR `web/` OR
  `docs/`; shared files (`openapi.yaml`, `meta.db` schema) are edited in
  small, early commits so other tracks can pull.
- All text files **LF**. No secrets in git — config via env
  (`LAKEHOUSE_ARTIFACTS_DIR`, `LAKEHOUSE_META_DB`, `AWS_*`, `MCP_ENDPOINT`).
- Tests are part of done: vitest (api), Angular tests + Playwright smoke
  (web). Every endpoint needs at least one contract test.
- Conventional Commits. Keep diffs reviewable.

## 2. What it reads (input artifacts — no new data entry needed)

| Artifact | Source | Provides |
|---|---|---|
| `contracts/*.odcs.yaml` | data repo (`LAKEHOUSE_ARTIFACTS_DIR`) | asset metadata, columns, quality rules, SLA |
| `products/*.odps.yaml` | data repo | product layer, purposes, ports |
| `semantics/concepts/*.yaml` + `mappings/` | data repo | glossary, column→concept, units, join graph |
| `graph.json` | compiled by `lakehouse/semantics/build_graph.py` | the knowledge graph |
| `target/manifest.json`, `target/run_results.json` | dbt artifacts (published to `s3://derog-lake/metadata/`) | model lineage + test results |
| Glue + Athena | AWS (read-only role) | live schemas, query history (usage) |
| `lakehouse-mcp` | `http://10.30.0.1:8090/mcp` | governed SQL execution |

`meta.db` (SQLite) is OURS: usage events, graph cache, annotations
(ownership notes, certifications). Schema in `docs/ARTIFACTS.md` — additive
migrations only.

## 3. Architecture

```
web/   Angular SPA: catalog · lineage graph · quality · usage · impact · workbench
api/   Hono (Node 24): serves openapi.yaml, reads artifacts + meta.db,
       calls lakehouse-mcp for query execution, writes usage events
docs/  ARTIFACTS.md, DECISIONS.md (ADRs as we go)
```

Deployment: systemd service on derog-server behind Traefik + Authelia
(`catalog.jaggi.xyz`), read-only AWS identity (least privilege).

## 4. Phases & acceptance criteria

- **U0 foundations**: artifact loaders (contracts/products/semantics/graph/
  dbt), `meta.db` bootstrap, Hono skeleton. *Done:* all endpoints return real
  artifact data locally; `openapi.yaml` validated by CI.
- **U1 catalog UI**: search + product/table/column pages rendering the full
  contract (limitations, quality, SLA, PII hints). *Done:* any column found
  in <10 s.
- **U2 lineage & relations**: interactive graph (product→model→source,
  column-level edges, join edges, quality overlay), drill-down. *Done:*
  clicking `mail_activity` shows its upstream/downstream world.
- **U3 quality & trust**: dbt run_results + ODCS rules + freshness →
  per-asset panels + composite **trust score**. *Done:* one number answers
  "can I use this".
- **U4 usage & impact**: usage counts (Athena history + MCP query log),
  popularity views, **impact tool** ("if I rename X, what breaks"): affected
  models/contracts/products/queries. *Done:* blast radius for any column.
- **U5 semantic workbench**: concept registry browser/editor (writes YAML
  PRs), mapping coverage view, NL→SQL playground showing the grounding
  (concept resolution + join plan) and running golden questions as evals.
  *Done:* "temperature last week" correct *and explained*.
- **U6 agent grade**: catalog MCP (`catalog_lookup`, `lineage_of`,
  `impact_of`) + certification flags + docs. *Done:* opencode consults the
  catalog before choosing a product.

## 5. Decisions already made — do not revisit without asking

- Hono + Angular (not React/htmx); semantic layer v1 = YAML registry +
  property graph (not full RDF — JSON-LD export is a later option).
- Gold-only querying via the existing guarded MCP (no SQL engine of our own).
- Auth = Authelia at the edge (no app-level accounts).
- Product surface parity targets: Collate/Ataccama subset in the plan table;
  no approval workflows, no multi-tenancy.

## 6. Open (ask the maintainer, then record in DECISIONS.md)

- Graph visualization library (evaluate Cytoscape.js vs custom SVG — the
  house style wants explanatory diagrams, not default chart demos).
- Usage history depth/purge policy in meta.db.
- Whether the concept editor writes PRs to the data repo directly or exports
  YAML for manual PRs.
