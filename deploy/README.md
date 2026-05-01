# SignalMap — Deploy

Self-contained Docker Compose deployment that pulls pre-built images from
GitHub Container Registry. No build step required on the host.

## Requirements

- Docker Engine 24+ and the Compose plugin (`docker compose`, not `docker-compose`).
- ~2 GB RAM available for the stack (Redis 384 MB, API 512 MB, collector 1 GB,
  cron 512 MB, UI 128 MB, plus headroom).
- ~1 GB disk for the embedding model cache (first-boot download).
- Outbound HTTPS to `ghcr.io`, `openrouter.ai`, `api.perplexity.ai`, RSS
  feed origins, and `huggingface.co` (model download).

## Quick start

```bash
# 1. Get the deploy folder onto the host (clone, scp, or download from a release).
git clone https://github.com/your-org/SignalMap.git
cd SignalMap/deploy

# 2. Configure
cp .env.example .env
# edit .env — set REDIS_PASSWORD, SIGNALMAP_REPO_OWNER, and (for live mode)
# OPENROUTER_API_KEY, PERPLEXITY_API_KEY, NEWSAPI_API_KEY.

# 3. Generate the admin token Docker secret
mkdir -p secrets
openssl rand -hex 32 > secrets/SIGNALMAP_ADMIN_TOKEN
chmod 600 secrets/SIGNALMAP_ADMIN_TOKEN

# 4. Pull images and start
docker compose pull
docker compose up -d

# 5. Verify
docker compose ps
curl -fsS http://localhost:8080/api/signalmap/health
```

Open `http://<host>:8080`. The collector takes 30–90 seconds to do its first
tick; the feed populates after that.

## Pinning a version

Default is `latest`. To pin:

```bash
# in .env
SIGNALMAP_VERSION=4.0.0
```

Then `docker compose pull && docker compose up -d`.

## Modes

| Mode | What runs | Cost |
| --- | --- | --- |
| `SIGNALMAP_BACKEND_MODE=fixture` | Deterministic seed data; no LLM calls | Free |
| `SIGNALMAP_BACKEND_MODE=live` | Real RSS + Cloudflare Radar + LLM classification + brief generation | Capped by `SIGNALMAP_DAILY_LLM_BUDGET_USD` (default $2/day) |

In live mode you must set `OPENROUTER_API_KEY` and `PERPLEXITY_API_KEY`.

## Operations

### View logs

```bash
docker compose logs -f signalmap-collector
docker compose logs -f signalmap-api
docker compose logs --since 5m
```

### Force a full reset (wipes Redis cache, LanceDB vectors, model cache)

```bash
docker compose down -v
docker compose up -d
```

### Rotate the admin token

```bash
openssl rand -hex 32 > secrets/SIGNALMAP_ADMIN_TOKEN
docker compose restart signalmap-api signalmap-cron
```

### Upgrade to a new version

```bash
# Pin or leave on latest in .env, then:
docker compose pull
docker compose up -d
docker image prune -f
```

Compose will recreate any container whose image changed; volumes (Redis,
LanceDB, models) survive. The sliding-window news cache also survives,
so the visible feed doesn't blank out across a deploy.

## Reverse proxy / TLS

The `signalmap-ui` service listens on `:8080` (host-mapped from
`SIGNALMAP_PORT`). For TLS, put Caddy / Traefik / nginx in front:

```caddyfile
signalmap.example.com {
  reverse_proxy localhost:8080
}
```

Server-Sent Events (SSE) are used for the live feed
(`/api/signalmap/stream`). Make sure the proxy disables response buffering
on that path — Caddy and Traefik do this automatically; nginx needs
`proxy_buffering off;` in the location block.

## What's where

| Path | Purpose |
| --- | --- |
| `docker-compose.yml` | The five-service stack |
| `.env.example` | Sample env; copy to `.env` and edit |
| `secrets/SIGNALMAP_ADMIN_TOKEN` | File-based Docker secret (generate locally; do not commit) |
| `secrets/.gitkeep` | Placeholder so the directory ships empty |

## Endpoints worth knowing

| URL | Purpose |
| --- | --- |
| `http://<host>:8080/` | The map UI |
| `http://<host>:8080/source-health-details` | Per-source diagnostics + rejection breakdown |
| `http://<host>:8080/api/signalmap/list` | All current events as JSON |
| `http://<host>:8080/api/signalmap/source-health-details` | Same as the page but JSON (LLM-friendly) |
| `http://<host>:8080/api/signalmap/health` | Service health |
| `http://<host>:8080/api/signalmap/stream` | SSE event stream |

## Troubleshooting

**Containers restart loop.** Check `docker compose logs <service>`. Most
common: `REDIS_PASSWORD` unset in `.env` (fail-fast at config), or shell
script CRLF on Windows hosts (use WSL2 or fix line endings).

**Collector tick produces 0 events repeatedly.** Visit
`/source-health-details` and check the per-source rejection breakdown. If
everything is `low_signal_confidence`, lower
`SIGNALMAP_EVENT_CONFIDENCE_MIN` in `.env` (try 0.55) and restart the
collector. If everything is `duplicate_persisted`, the dedupe set is
already covering the RSS retention; do a `docker compose down -v` to
re-classify.

**UI loads but feed is blank.** `curl http://localhost:8080/api/signalmap/list`.
Empty `events` array means the collector hasn't completed a tick yet — wait
60 seconds, refresh.

**LLM budget exhausted.** The collector logs `daily-budget-exhausted`. Bump
`SIGNALMAP_DAILY_LLM_BUDGET_USD` in `.env` and `docker compose up -d`.
