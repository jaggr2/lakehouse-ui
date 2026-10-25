# deploy/ — integration artifacts (owned by the integration session, not api/ or web/)

## lakehouse-ui.service (systemd user unit — to be installed on derog-server)

Install: copy to `~/.config/systemd/user/` as `roger`, `systemctl --user
daemon-reload && enable --now`. Env in `/home/roger/config/lakehouse-ui.env`
(chmod 600).

```
[Unit]
Description=Lakehouse UI — data catalog & query workbench API
After=network-online.target lakehouse-mcp.service

[Service]
Type=exec
EnvironmentFile=/home/roger/config/lakehouse-ui.env
WorkingDirectory=/opt/lakehouse-ui
ExecStart=/usr/bin/node api/dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

## lakehouse-ui.env (values known today)

```
PORT=8091
LAKEHOUSE_ARTIFACTS_DIR=/opt/homelab/lakehouse
LAKEHOUSE_META_DB=/home/roger/config/lakehouse-ui-meta.db
LAKEHOUSE_USAGE_LOG=/home/roger/config/lakehouse-usage.jsonl
MCP_ENDPOINT=http://127.0.0.1:8090/mcp
MCP_TOKEN=            # service token for Warden /mcp if routed via Warden
AWS_REGION=eu-central-1
# AWS creds: least-privilege reader (lakehouse-mcp-reader key, same pattern)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

## Traefik + Authelia (route to add to config/traefik/dynamic.yml)

`catalog.jaggi.xyz` → `http://10.30.0.1:8091` behind `middlewares: authelia`
(same forwardAuth block as the other protected apps). The API binds the
warden-net gateway address only — not exposed to the LAN.

## Deploy sequence (when api/ lands)

1. `npm ci && npm run build` in api/ (Node 24) → `api/dist/`
2. rsync repo to `/opt/lakehouse-ui` (or clone + pull)
3. install unit + env → `systemctl --user enable --now lakehouse-ui`
4. add Traefik route (repo-owned dynamic.yml — remember it syncs to
   `~/config` via the deploy fix from 2026-10-25)
5. smoke: `curl localhost:8091/api/health` then via `https://catalog.jaggi.xyz`
