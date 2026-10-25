# deploy/ — integration artifacts (owned by the integration session)

## Current deployment: Incus OCI instance (this is the way)

The app ships as a container (`Dockerfile`, published to
`ghcr.io/jaggr2/lakehouse-ui` by `.github/workflows/image.yml`, multi-arch)
and runs as the `lakehouse-ui` entry in
`home-control-server-config/x64-rack-server/incus/instances.yaml`:

- warden-net `10.30.0.21`, HTTP published on `10.30.0.1:8091` (Traefik-facing)
- mounts: `/opt/homelab/lakehouse` → `/artifacts` (ro, contracts/products/
  semantics), `/home/gh-runner/lakehouse-artifacts` → `/dbt` (ro, dbt
  manifest/run_results written by the dbt workflow), `/home/roger/config/lakehouse-ui` → `/data` (rw: meta.db, usage.jsonl)
- secrets: `/home/roger/config/lakehouse-ui.env` (AWS least-privilege reader key)

Deploy/redeploy = push to main (CI publishes the image) →
`incus delete lakehouse-ui --force && sudo python3 /opt/homelab/x64-rack-server/scripts/incus-reconcile.py`
(pulls `:latest` fresh). Verify: `curl http://10.30.0.1:8091/api/health`.

## Edge: Traefik + Authelia

`catalog.jaggi.xyz` → `http://10.30.0.1:8091` behind `forcehttps` + `authelia`
(routed in `home-control-server-config/x64-rack-server/config/traefik/dynamic.yml`;
repo-owned config syncs to live Traefik). DNS: wildcard `*.jaggi.xyz` already
resolves to the tunnel. The `authelia` middleware must target the Authelia
serving `auth.jaggi.xyz` (see AGENTS.md gotcha — 10.30.0.3 today).

## env (lakehouse-ui.env on the host)

```
AWS_ACCESS_KEY_ID=...        # lakehouse-mcp-reader (gold/silver read, glue get,
AWS_SECRET_ACCESS_KEY=...    #   athena lakehouse-read workgroup, metadata read)
AWS_REGION=eu-central-1
```

Non-secret config lives in `instances.yaml` (`environment:`): PORT,
WEB_DIST_DIR, LAKEHOUSE_ARTIFACTS_DIR, LAKEHOUSE_DBT_TARGET_DIR,
LAKEHOUSE_META_DB, LAKEHOUSE_USAGE_LOG, MCP_ENDPOINT.

## Legacy note

Earlier drafts used a systemd user unit + host Node. Superseded by the
container; kept out of git history noise. The `scripts/` counterpart on the
host (nothing to install — the image is self-contained).
