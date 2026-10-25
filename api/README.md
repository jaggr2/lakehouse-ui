# lakehouse-api

Hono (Node 24) backend for the lakehouse UI: it reads the data repo's
artifacts (ODCS contracts, ODPS products, semantics, dbt `target/`), serves
the `openapi.yaml` surface, keeps usage/annotations in `meta.db`, and runs
SQL through the guarded `lakehouse-mcp` (gold-only).

Contract-first: `../openapi.yaml` is the law. `test/contract/` validates every
response against its schema, and `test/contract/spec-coverage.test.ts` fails
when the spec grows an operation this service does not implement.

## Run

```bash
npm install
npm test                # vitest: contract + unit tests (hermetic fixtures)
npm run check:spec      # openapi.yaml parses, $refs resolve, ops covered
npm run build && npm start
```

Environment (no secrets in git):

| variable | default | meaning |
|---|---|---|
| `LAKEHOUSE_ARTIFACTS_DIR` | `./artifacts` | checkout of `home-control-server-config/lakehouse` |
| `LAKEHOUSE_META_DB` | `./meta.db` | our SQLite (usage events, annotations, graph cache) |
| `LAKEHOUSE_DBT_TARGET_DIR` | `$ARTIFACTS/dbt/target` | `manifest.json`, `run_results.json`, `sources.json` |
| `LAKEHOUSE_DATABASE` | `lake_gold` | gold database (table ids are `<database>.<table>`) |
| `MCP_ENDPOINT` | `http://10.30.0.1:8090/mcp` | guarded lakehouse-mcp |
| `MCP_TIMEOUT_MS` | `120000` | query execution timeout |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | listener |
| `LAKEHOUSE_USAGE_WINDOW_DAYS` | `30` | usage/trust window |
| `LAKEHOUSE_QUERY_LOOKBACK_DAYS` | `90` | impact query lookback |
| `LAKEHOUSE_USAGE_RETENTION_DAYS` | `1095` (3 years) | `usage_events` purge window; `0` = keep forever |

Retention: `usage_events` older than the retention window is purged at startup
and daily (ADR-007); `npm run purge:usage` runs it manually.

Usage ingestion (U4) — imports Athena query history into `usage_events`
(idempotent per query id, actor `athena:<workgroup>`):

```bash
AWS_REGION=eu-central-1 LAKEHOUSE_WORKGROUP=lakehouse-read npm run ingest:athena -- --days 30
```

## Endpoints (see openapi.yaml)

| operation | phase | notes |
|---|---|---|
| `GET /api/health` | U0 | artifact freshness/health per source |
| `GET /api/search` | U0 | products, tables, columns, concepts |
| `GET /api/products`, `GET /api/products/{id}` | U0 | trust + usage rollups |
| `GET /api/tables/{id}` | U0 | columns, concepts, rule names, trust score |
| `GET /api/lineage` | U0 | graph neighborhood (nodes + edges) |
| `GET /api/concepts` | U0 | concept registry + mapping coverage |
| `GET /api/quality/{id}` | **U3** | rules (ODCS + dbt + freshness), test history, trust index |
| `GET /api/usage/{id}` | **U4** | query counts per day, top consumers |
| `GET /api/impact` | **U4** | blast radius: models, contracts, products, queries |
| `POST /api/query` | U0 | SQL via the guarded MCP + usage logging (NL prompts → 501 until U5) |

## Layout

```
src/
  config.ts            env → ApiConfig
  artifacts/           parsers + loadCatalog(): contracts, products,
                       semantics, graph.json (or compiled fallback), dbt
  meta/                meta.db bootstrap + usage_events store
  quality/             rules, freshness, trust index (U3)
  usage/               usage reports (U4) + Athena history ingestion
  impact/              blast-radius report (U4)
  query/               MCP client, query_product output parsing, /query logic
  http/app.ts          Hono routes
  cli/                 ingest-athena-usage.ts
test/
  contract/            one suite per endpoint, validated against openapi.yaml
  unit/                parsers, trust/freshness math, usage store, ingestion
  fixtures/artifacts/  snapshot of real contracts/products/semantics + a
                       dbt target/ fixture in dbt's real format
```

Test fixtures: the contracts/products/semantics files are copies of the real
data repo artifacts; `test/fixtures/make-dbt-target.mjs` regenerates the dbt
`target/` fixture (dbt artifacts are produced by CI and are not committed in
the data repo).
