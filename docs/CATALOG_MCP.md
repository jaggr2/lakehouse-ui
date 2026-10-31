# Catalog MCP — the agent surface (U6)

`POST /api/mcp` speaks MCP (JSON-RPC 2.0, stateless streamable HTTP) so that
coding agents can consult the governed lakehouse catalog **before choosing or
recommending a data product**. The tools wrap the catalog REST API itself —
agents see exactly what the SPA sees (ADR-008).

## Endpoint & protocol

- `POST /api/mcp` — one JSON-RPC message per POST, JSON response.
  Notifications (`no id`) get `202 Accepted`, broken envelopes `400` with
  `-32600`.
- Methods: `initialize`, `ping`, `tools/list`, `tools/call`.
- Protocol revisions: `2025-06-18`, `2025-03-26`, `2024-11-05` (negotiated in
  the `initialize` handshake).
- `initialize` returns `instructions` ("use `catalog_lookup` BEFORE choosing a
  product…"). OpenCode injects server instructions into the system prompt —
  that is how the catalog-first habit reaches the agent.

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `catalog_lookup` | exactly one of `query`, `product`, `table` | search hits, or the product/table summary: purpose, status, limitations, tables/columns, trust score, usage, **certification** |
| `lineage_of` | `table`, opt `column`, `depth` (default 2) | neighborhood `nodes`/`edges` plus transitive `upstream`/`downstream` lists |
| `impact_of` | `table`, opt `column` | blast radius: affected dbt models, contracts, products, recent queries |

Results are pretty-printed JSON text. Tool-level problems ("unknown product")
come back as `isError: true` results, not protocol errors.

## Try it

```sh
curl -s http://localhost:8787/api/mcp -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "catalog_lookup", "arguments": { "query": "mail" } }
}'
```

```sh
curl -s http://localhost:8787/api/mcp -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "impact_of", "arguments": { "table": "mail_activity", "column": "message_id" } }
}'
```

## Wiring an agent (OpenCode V2)

Prefer the CLI (writes to project config):

```sh
opencode mcp add lakehouse --global --url https://catalog.jaggi.xyz/api/mcp
opencode mcp list   # -> "✓ lakehouse  connected"
```

Or configure it by hand in `opencode.json(c)`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "lakehouse": {
        "type": "remote",
        "url": "https://catalog.jaggi.xyz/api/mcp",
        "oauth": false
      }
    }
  }
}
```

Notes:

- The server does not implement OAuth — it sits behind Traefik + Authelia at
  the edge — hence `oauth: false`. If the edge requires a credential, forward
  one as a header: `"headers": { "Authorization": "Bearer {env:LAKEHOUSE_TOKEN}"}`
  (never put the secret in the file).
- OpenCode names the tools `<server>_<tool>`: `lakehouse_catalog_lookup`,
  `lakehouse_lineage_of`, `lakehouse_impact_of`.
- Verify with `opencode mcp list`, then ask the agent something like
  *"which product holds mail data?"* — it should call `catalog_lookup` before
  answering.

## Acceptance (AGENTS.md §4, U6)

> *Done: opencode consults the catalog before choosing a product.*

1. `opencode mcp list` shows `lakehouse connected`.
2. The `initialize` instructions + tool descriptions tell the agent to look
   before it picks (both are tested in `api/test/contract/mcp.test.ts`).
3. `catalog_lookup` exposes the certification flag, so "can I use this?" gets
   the steward's answer too (ADR-009).
