# Input artifacts & meta.db

## Artifacts (read-only inputs)

Point `LAKEHOUSE_ARTIFACTS_DIR` at a checkout of
`jaggr2/home-control-server-config/lakehouse` (on derog-server this is
`/opt/homelab/lakehouse`).

| Path | Format | Produced by |
|---|---|---|
| `contracts/*.odcs.yaml` | ODCS 3.1 | data repo (hand-authored, CI-validated) |
| `products/*.odps.yaml` | ODPS v1 | data repo |
| `semantics/concepts/*.yaml` | concept schema (see data repo `semantics/README.md`) | data repo |
| `semantics/mappings/*.yaml` | column→concept mappings | data repo |
| `semantics/graph.json` | compiled property graph | `build_graph.py` in data repo |
| `<dbt>/target/manifest.json` | dbt manifest (refs → lineage) | `lakehouse-dbt.yml` (publish to `s3://derog-lake/metadata/`) |
| `<dbt>/target/run_results.json` | dbt test/model results | same |
| `<dbt>/target/sources.json` | dbt source freshness (optional) | `dbt source freshness` |

Live sources (read-only AWS role + local MCP):

- **Glue** `lake_bronze|lake_silver|lake_gold` → physical schemas
- **Athena** `ListQueryExecutions` on `lakehouse-read` → usage events
- **lakehouse-mcp** (`http://10.30.0.1:8090/mcp`) → governed SQL for the workbench

## graph.json (compiled semantic graph)

```json
{
  "nodes": [
    {"id": "home.temperature.celsius", "kind": "concept", "label": "Temperature",
     "unit": "CEL", "grain": "one reading per entity per state change",
     "timezone": "Europe/Zurich"},
    {"id": "lake_gold.home_environment.value", "kind": "column", "label": "value"}
  ],
  "edges": [
    {"from": "lake_gold.home_environment.value", "to": "home.temperature.celsius",
     "kind": "implements", "role": "observed_value"},
    {"from": "lake_gold.mail_activity", "to": "lake_gold.parcel_events",
     "kind": "derives_from"}
  ]
}
```

Kinds: nodes `concept|column|table|model|source|product|metric`;
edges `contains|derives_from|joins_on|implements|measures|part_of|synonym_of`.
`joins_on` edges carry `on: [<left.col>, <right.col>]`.
Edge direction is subject-verb-object ("A derives_from B" ⇒ B is upstream) —
see `DECISIONS.md` (ADR-005). When `graph.json` is absent the API compiles an
equivalent from the YAML parts + dbt refs (no `joins_on` edges are invented).

## meta.db (SQLite — ours, additive migrations only)

```sql
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,              -- ISO 8601 UTC
  table_id TEXT NOT NULL,        -- e.g. lake_gold.mail_activity
  actor TEXT,                    -- 'mcp', 'ui', 'workbench', 'athena:<workgroup>', ...
  query_id TEXT,                 -- Athena QID when known
  rows_returned INTEGER,
  sql TEXT                       -- statement text (impact analysis matches on it)
);
CREATE TABLE IF NOT EXISTS annotations (
  asset_id TEXT NOT NULL,        -- product/table/column id
  kind TEXT NOT NULL,            -- 'certified' | 'owner_note' | 'warning'
  body TEXT NOT NULL,
  author TEXT,
  ts TEXT NOT NULL,
  PRIMARY KEY (asset_id, kind, ts)
);
CREATE TABLE IF NOT EXISTS graph_cache (
  id INTEGER PRIMARY KEY,
  built_ts TEXT NOT NULL,
  graph_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_table_ts ON usage_events (table_id, ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_query_id ON usage_events (query_id)
  WHERE query_id IS NOT NULL;
```

API layer adds rows to `usage_events` for every `/query` call and for every
Athena execution imported by `npm run ingest:athena` — that closes the loop
the impact/usage views read from. `query_id` is unique when present, so
re-ingestion is idempotent (first write wins).
