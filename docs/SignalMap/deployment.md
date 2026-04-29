# SignalMap Deployment

SignalMap v3 is deployed as a Docker web/API/collector runtime. The container builds the `signalmap` Vite variant, serves it through nginx, runs the local Node API sidecar, and runs the SignalMap news collector under supervisord.

## Runtime Files

| File | Purpose |
|------|---------|
| `docker/Dockerfile` | SignalMap image build. |
| `docker/supervisord.conf` | Starts nginx, local API, collector loop, and brief-cron. |
| `docker/entrypoint.sh` | Bridges Docker secrets, sets defaults, creates data dirs, templates nginx. |
| `docker-compose.yml` | Local/self-hosted stack with Redis (TCP via ioredis), persistent volumes, and distill mount. |

## Quick Start

From the repo root:

```powershell
docker compose config
docker compose up -d --build
```

Default local URL:

```text
http://localhost:3000
```

Stop:

```powershell
docker compose down
```

## Migration From v2 (Phase 8 Rename)

v3 changes the deploy contract. If you ran the stack as v2 (`worldmonitor-signalmap` image / `worldmonitor` compose project), apply these one-time migrations before `docker compose up`:

**1. Volume aliasing.** Compose prefixes named volumes with the project name. v2 created `worldmonitor_signalmap-lancedb`, `worldmonitor_signalmap-models`, `worldmonitor_signalmap-redis-data`. v3 expects `signalmap_signalmap-lancedb`, etc. Without migration, v3's first `up` creates fresh empty volumes and the LanceDB embedding cache + Hugging Face model cache rebuilds from scratch (hours of collector + downloads).

```powershell
# Copy data forward (one-time):
docker volume create signalmap_signalmap-lancedb
docker run --rm -v worldmonitor_signalmap-lancedb:/from -v signalmap_signalmap-lancedb:/to alpine cp -a /from/. /to/
# Repeat for: signalmap-models, signalmap-redis-data
```

Or accept the rebuild cost: `docker volume rm worldmonitor_signalmap-{lancedb,models,redis-data}` then `docker compose up -d --build`.

**2. Image registry path.** GHCR publishing moved from `ghcr.io/koala73/worldmonitor` to `ghcr.io/koala73/signalmap`. Anything pinned to `:latest` of the old path stops receiving updates after v3.0.0. Update k8s manifests, Watchtower configs, and CI deploy steps before the first v3 release. The old image remains available for rollback.

**3. Container name.** External tooling that does `docker exec worldmonitor-signalmap` or `docker logs worldmonitor-signalmap` must update to `signalmap`.

**4. Internal supervisord program name.** `[program:worldmonitor-api]` is intentionally retained for Phase 8 (out of "image + project rename" scope per spec). Log-grep filters keyed on this name continue to work; cosmetic rename deferred to Phase 9d.

## Required Runtime Inputs

| Name | Required | Default | Notes |
|------|----------|---------|-------|
| `REDIS_PASSWORD` | production optional | empty | Set when bundled `redis:7-alpine` is configured with a password (compose passes via `REDIS_PASSWORD` env). Production using an external Redis: pass via env or Docker secret. |
| `REDIS_URL` | no | `redis://signalmap-redis:6379` | TCP connection string used by the ioredis adapter. Override only when pointing at an external Redis instance. |
| `OPENROUTER_API_KEY` | yes for story parsing | empty | Server/collector secret. Never expose to browser bundles. |
| `OPENROUTER_BASE_URL` | no | parser default | Use only for OpenAI-compatible provider override. |
| `SIGNALMAP_LLM_MODELS` | recommended | empty | Comma-separated allowlist for parser/model selection. |
| `CLOUDFLARE_API_TOKEN` | yes for Radar collectors when wired | empty | Runtime secret, env/secrets only. |
| `SIGNALMAP_DISTILL_HOST_ROOT` | local/self-host yes | `../distill` | Host path mounted read-only to `/opt/distill`. |

Use Docker secrets for production where possible. `docker/entrypoint.sh` exports files from `/run/secrets/<NAME>` as env vars.

## Persistent Volumes

| Container Path | Compose Volume | Purpose |
|----------------|----------------|---------|
| `/data/signalmap/lancedb` | `signalmap-lancedb` | LanceDB table and vector memory. |
| `/data/signalmap/models` | `signalmap-models` | Local embedding/model cache. |
| `/opt/distill` | host bind mount | Read-only distill build/descriptors. |

Do not store `OPENROUTER_API_KEY`, Redis tokens, or Radar tokens in volumes or image layers.

## SignalMap Env Defaults

| Name | Default |
|------|---------|
| `SIGNALMAP_DATA_DIR` | `/data/signalmap` |
| `SIGNALMAP_LANCEDB_URI` | `/data/signalmap/lancedb` |
| `TRANSFORMERS_CACHE` | `/data/signalmap/models` |
| `HF_HOME` | `/data/signalmap/models` |
| `SIGNALMAP_DISTILL_ROOT` | `/opt/distill` |
| `SIGNALMAP_RSS_POLL_MINUTES` | `15` |
| `SIGNALMAP_VECTOR_ENABLED` | `true` |
| `SIGNALMAP_VECTOR_TABLE` | `signalmap_events` |
| `SIGNALMAP_VECTOR_RETENTION_DAYS` | `30` |
| `SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS` | `3000` |
| `SIGNALMAP_VECTOR_TOP_K` | `8` |
| `SIGNALMAP_VECTOR_MIN_SCORE` | `0.72` |
| `SIGNALMAP_EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` |
| `SIGNALMAP_EMBEDDING_DIM` | `384` |

## Docker Build And Runtime Env

| Name | Default | Scope | Notes |
|------|---------|-------|-------|
| `VITE_VARIANT` | `signalmap` | build | Builds the SignalMap SPA variant. |
| `VITE_WS_API_URL` | `/api/ws` | build | Browser WebSocket/API path compiled into the SPA. |
| `LOCAL_API_PORT` | `46123` | runtime internal | Node sidecar port behind nginx; nginx config is rendered from this value. |
| `LOCAL_API_MODE` | `docker` | runtime internal | Prevents desktop-only cloud fallback behavior inside the self-hosted container. |
| `LOCAL_API_CLOUD_FALLBACK` | `false` | runtime internal | Must stay false for Docker; self-hosted instances should not proxy to `api.worldmonitor.app`. |

## Process Model

`docker/supervisord.conf` manages:

| Process | Command | Notes |
|---------|---------|-------|
| `nginx` | `/usr/sbin/nginx -c /tmp/nginx.conf -g "daemon off;"` | Serves SPA and proxies `/api/` to local API. |
| `worldmonitor-api` | `node /app/local-api-server.mjs` | Loads bundled `api/` handlers. |
| `signalmap-news-collector` | loop around `node /app/scripts/signalmap-news-collector.mjs` | Publishes `signalmap:news:v1`, health keys, and seed-meta. |
| `brief-cron` | `node /app/scripts/brief-cron.mjs` | Generates the global brief on a schedule (Phase 6 backend). |

The collector interval is `SIGNALMAP_RSS_POLL_SECONDS` if set, otherwise `SIGNALMAP_RSS_POLL_MINUTES * 60`.

## HTTPS, DNS, And Proxy

The container listens on HTTP port `8080`; compose publishes it through `SIGNALMAP_PORT` (`3000` by default). Production HTTPS should terminate at the deployment reverse proxy or load balancer.

Recommended external proxy behavior:

```text
https://signalmap.example.com/      -> http://signalmap-container:8080/
https://signalmap.example.com/api/  -> http://signalmap-container:8080/api/
```

Requirements:

- Forward `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`.
- Preserve WebSocket upgrade headers if `/api/ws` is used.
- Use TLS certificates managed by the proxy platform.
- Point DNS `A`/`AAAA` or `CNAME` for the public hostname at the proxy, not directly at a random container port.

## Redis

`docker-compose.yml` includes a `redis:7-alpine` container reachable as `signalmap-redis:6379`. The app connects via the `REDIS_URL` env (default `redis://signalmap-redis:6379`) using the `ioredis` adapter (Phase 2c replaced the prior Redis REST proxy with a plain TCP client). Production may override `REDIS_URL` and `REDIS_PASSWORD` to point at an external Redis instance.

## Distill

The collector uses `SIGNALMAP_DISTILL_ROOT=/opt/distill`. Mount the local distill repo read-only:

```text
${SIGNALMAP_DISTILL_HOST_ROOT:-../distill}:/opt/distill:ro
```

The mounted repo must have its built runtime available at `dist/index.js` and the Risky Business News / The Hacker News descriptors. If distill is missing or not built, the collector degrades to RSS snippet fallback and records degraded source health.

## LanceDB And Embeddings

LanceDB lives at `SIGNALMAP_LANCEDB_URI=/data/signalmap/lancedb`. This path must be writable and persistent. Embedding/model cache lives at `/data/signalmap/models`.

If LanceDB is unavailable, SignalMap should continue serving Redis-backed map events while vector search/upsert health degrades. The collector writes sanitized LanceDB and embedding health payloads to Redis, including table name, record count, open/writable flags, and last vector error class. `/api/health` reports the freshness/status of those health keys rather than returning the full payload body. Check `/api/health` for:

- `signalMapLanceDb`
- `signalMapEmbeddings`

## Vercel Static Option

Vercel can host a static SignalMap build only when it points at the Docker runtime APIs and does not bypass container-side collectors, local LanceDB, distill, or server-side secrets. Do not run the SignalMap story collector or LanceDB workflow in Vercel Edge.

For v1, the Docker runtime is the authoritative deployment path.

## Tauri Freeze

Tauri desktop remains frozen for SignalMap v1. Do not remove or redesign the desktop shell as part of SignalMap deployment. Existing desktop build/test paths remain for WorldMonitor, but SignalMap v1 deployment work targets Docker web/API/collector runtime.

## Validation

Static/runtime config checks:

```powershell
docker compose config
```

Repo checks:

```powershell
npm run typecheck:all
npm run test:data
npm run test:sidecar
```

Runtime smoke after `up -d --build`:

```powershell
curl http://localhost:3000/
curl http://localhost:3000/api/health
docker compose logs signalmap
```

Expected health behavior:

- Missing Redis data keys should not report healthy solely because seed-meta exists.
- Empty SignalMap domains can be healthy only when the data key exists and seed-meta is fresh.
- LanceDB/vector degradation should not block Redis-backed live map payloads.
