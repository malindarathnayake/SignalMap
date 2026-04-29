---
project: SignalMap v2 — Backend (Phase 2 of overall product)
artifact: spec
audience: implementor (foreman pitboss-implementor, Opus, fresh session)
input: docs/SignalMap/v2-backend/design-summary.md
date: 2026-04-29
deliberation: Codex (gpt-5.4 high) × Claude Opus 4.7 — all 8 design decisions arbitrated by user; contract drift in OpenAPI doc reconciled before this spec was written.
---

# SignalMap v2 — Backend Spec

## Intent

Wire the shipped SignalMap UI to a live backend. Three Node services (`api`, `collector`, `cron`) coordinated through Redis, fronted by the existing static UI image's nginx as a reverse proxy. One reusable Node runtime image runs `api`, `collector`, or `cron` depending on its `CMD`. The brief code in `src/server/lib/*` is the shared backend library — services consume it, none of it gets rewritten. End state: `docker compose up -d --build --force-recreate` boots the full stack; the UI's Health panel reflects real Redis / LanceDB / collector / cron / OpenRouter / Perplexity status; clicking **Generate** in the inspector calls Perplexity + OpenRouter for real and returns event-specific bullets; the brief at the top of the page is the cron's most recent global synthesis; and SSE pushes updates to the UI as the collector and cron emit them.

## Decisions & Notes

| Decision | Choice | Rationale | Source |
|----------|--------|-----------|--------|
| HTTP framework | Bare `node:http` + ~80-line method/path router | Existing handlers are typed for `IncomingMessage`/`ServerResponse`; Hono's Node adapter requires `RESPONSE_ALREADY_SENT` and adds a parallel route DSL on top of the existing pure `generateSpec()`. | Codex deliberation |
| Process topology | 3 services: `api` / `collector` / `cron` | Failure isolation, cleaner logs, separate restarts vs supervisord. | design-summary |
| Container strategy | 2 images: `signalmap-ui` + `signalmap-node` | Single `package.json` means three images would duplicate ~200 MB of layers. `signalmap-node` runs `api`, `collector`, or `cron` via different `CMD`. | Codex deliberation |
| Repo layout | Single `package.json`. Entries: `server/api/index.ts`, `server/workers/collector.ts`, `server/workers/cron.ts`. | Matches Phase 9 single-tree decision. `src/server/lib/*` stays as the shared library. | design-summary |
| Broken collector imports | New `scripts/_signalmap-shared.mjs` with `CHROME_UA`, `loadSharedConfig`, country-name → ISO2 lookup. | Inlining duplicates code; one shared helper is one fewer maintenance point. | Codex deliberation |
| SSE replay backing | Keep Phase 3's Redis sorted-set ring (`src/server/lib/sse-replay-ring.ts`) | Streams add consumer-group complexity not needed for short-window reconnect replay. | design-summary |
| Health model | TTL-based heartbeat keys (`SETEX`) + cached last-call results. Direct `PING` for Redis only. | More reliable than immortal timestamps; no cost-per-request to LLM APIs. | Codex deliberation |
| Auth | No end-user auth. Keep `SIGNALMAP_ADMIN_TOKEN` for `/brief/refresh`. | Existing `signalmap-brief-refresh.ts:21` already implements this. | Codex deliberation |
| Singleton enforcement | TTL-based renewable Redis lease (cron AND collector). Renewable per tick, guarded release. | Startup-only `SETNX` doesn't tolerate restarts; renewable lease prevents split-brain. | Codex deliberation |
| Health response schema | `.strict()` — exactly `redis`, `lancedb`, `collector`, `brief`, `openrouter`, `perplexity`, `sources`, `generatedAt`. Production responses redact connection URIs / FS paths / key prefixes. | UI hard-codes the six cards; drift breaks the panel. Security-relevant for prod. | Codex deliberation |
| Fixture vs live | `SIGNALMAP_BACKEND_MODE=fixture\|live` runtime profile. CI runs `fixture`. New `e2e-live/` for staging smoke. | Existing 58 Playwright tests stay pinned to fixture; live tests assert shape not content. | Codex deliberation |
| Outbound HTTP | Native Node 22 `fetch` | `perplexity.ts` / `openrouter.ts` already use it. No `node-fetch` / `undici` import. | Verified during grounding |

## Architecture

See [`design-summary.md`](./design-summary.md#architecture) for the full ASCII diagram. Quick reference:

```
Browser → signalmap-ui (nginx :8080) → signalmap-api (:3000) → redis
                                            ↑
                       signalmap-collector  ─┘  (15-min RSS poll + LanceDB)
                       signalmap-cron       ─┘  (30-min brief gen)
```

## File Structure

```
SignalMap/
├── server/
│   ├── api/
│   │   ├── index.ts              # NEW — Node entrypoint, mounts router
│   │   ├── router.ts             # NEW — bare method/path router
│   │   ├── routes/
│   │   │   ├── signalmap-brief-event.ts        # KEPT — wire into router
│   │   │   ├── signalmap-brief-global.ts       # KEPT — wire (GET, was POST)
│   │   │   ├── signalmap-brief-refresh.ts      # KEPT — wire + admin-token
│   │   │   ├── signalmap-brief-health.ts       # KEPT — wire (deprecated; superseded by signalmap-health)
│   │   │   ├── signalmap-health.ts             # NEW — strict-shape health
│   │   │   ├── signalmap-list.ts               # NEW — read events from Redis
│   │   │   ├── signalmap-source-health.ts      # NEW — read sources cache
│   │   │   └── signalmap-stream.ts             # KEPT — SSE replay ring
│   │   ├── schemas/                # KEPT — already reconciled
│   │   └── openapi.ts              # KEPT
│   ├── workers/
│   │   ├── collector.ts            # NEW — wraps scripts/signalmap-news-collector.mjs as a tick loop with lease
│   │   ├── cron.ts                 # NEW — wraps scripts/brief-cron.mjs as a tick loop with lease
│   │   └── lease.ts                # NEW — TTL-renewable Redis lease helper
│   └── _shared/
│       └── logger.ts               # NEW — JSON-line structured logger
├── src/server/lib/                 # KEPT verbatim — shared backend library
│   ├── perplexity.ts
│   ├── openrouter.ts
│   ├── brief-pipeline.ts
│   ├── per-event-synth.ts
│   ├── redis.ts
│   ├── singleflight.ts
│   ├── spend-reservation.ts
│   ├── sse-replay-ring.ts
│   ├── metrics.ts
│   ├── client-ip.ts
│   ├── citation-validator.ts
│   └── rate-limit.ts
├── scripts/
│   ├── _signalmap-shared.mjs       # NEW — restored helpers (CHROME_UA, loadSharedConfig, country-resolver)
│   ├── signalmap-news-collector.mjs   # PATCH — change broken import
│   ├── signalmap-geocoder.mjs         # PATCH — change broken imports
│   ├── brief-cron.mjs              # KEPT verbatim — cron worker invokes this body
│   └── signalmap-{lancedb-store,openrouter-parser,embedding-model,distill-bridge}.mjs  # KEPT
├── docker/
│   ├── Dockerfile                  # KEPT — signalmap-ui (nginx + dist)
│   ├── Dockerfile.node             # NEW — signalmap-node (api/collector/cron)
│   ├── nginx.conf                  # PATCH — proxy /api/* to signalmap-api, SSE handling
│   ├── entrypoint-node.sh          # NEW — small entry that picks api|collector|cron from $1
│   └── signalmap-shared.env.example  # NEW — sample env file
├── docker-compose.yml              # PATCH — 5 services: ui, api, collector, cron, redis
├── package.json                    # PATCH — add scripts: start:api / start:collector / start:cron
├── e2e/                            # KEPT — pinned to fixture mode
└── e2e-live/                       # NEW — staging smoke, default-skipped in CI
```

## Config Schema (env file format)

See [`design-summary.md`](./design-summary.md#config-surface) for full table. Sample env file:

```bash
# Backend mode — fixture (dev, deterministic) vs live (real APIs)
SIGNALMAP_BACKEND_MODE=live

# Redis
REDIS_URL=redis://signalmap-redis:6379
REDIS_PASSWORD=

# LLM keys (required in live mode)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
PERPLEXITY_API_KEY=pplx-...

# Optional — Cloudflare Radar (works unauth at lower limits)
CLOUDFLARE_API_TOKEN=

# Admin token for /brief/refresh
SIGNALMAP_ADMIN_TOKEN=<random-long-string>

# API service
SIGNALMAP_API_PORT=3000

# Cadence + budget
SIGNALMAP_RSS_POLL_MINUTES=15
SIGNALMAP_BRIEF_REFRESH_MINUTES=30
SIGNALMAP_DAILY_LLM_BUDGET_USD=2.00
SIGNALMAP_BRIEF_EVENT_EST_COST_USD=0.05
SIGNALMAP_BRIEF_PER_EVENT_RATE_LIMIT_PER_MIN=20

# Lease TTLs (singleton enforcement)
SIGNALMAP_COLLECTOR_LEASE_TTL_SEC=60
SIGNALMAP_CRON_LEASE_TTL_SEC=60

# SSE
SSE_HEARTBEAT_SECONDS=20
SSE_RECONNECT_RETRY_MIN_MS=5000
SSE_RECONNECT_RETRY_MAX_MS=15000

# Storage
SIGNALMAP_DATA_DIR=/data/signalmap
SIGNALMAP_LANCEDB_URI=/data/signalmap/lancedb

# LLM model fallback chain
SIGNALMAP_LLM_MODELS=anthropic/claude-sonnet-4.6,nvidia/nemotron-3-super-120b-a12b,moonshotai/kimi-k2_6,google/gemini-3.1-pro-preview
```

## Core Behavior (happy path)

1. `docker compose up -d --build --force-recreate` boots redis → signalmap-api → signalmap-collector → signalmap-cron → signalmap-ui in dependency order.
2. `signalmap-collector` acquires `signalmap:collector:lease` (TTL 60s). On miss it polls every 5s until acquired. After acquiring it runs `tick()` immediately, then every `SIGNALMAP_RSS_POLL_MINUTES` (default 15).
3. Each `tick()` of the collector: pulls every kept RSS source + Cloudflare Radar; dedups via LanceDB; writes to `signalmap:events:list` (capped FIFO, 1000 events); publishes a `signalmap:events:updated` channel message; renews lease; writes `signalmap:collector:heartbeat` with `SETEX <2× interval>`.
4. `signalmap-cron` acquires `signalmap:brief:cron:lease` (TTL 60s). On startup, if `signalmap:brief:global` is missing, runs immediately; otherwise waits one interval. Every `SIGNALMAP_BRIEF_REFRESH_MINUTES` (default 30) it calls `runBriefPipeline()`: reserve spend → Perplexity Sonar Pro → OpenRouter (model chain) → write to `signalmap:brief:global` → publish `signalmap:brief:updated`. Renews lease + heartbeat each tick.
5. `signalmap-api` listens on `SIGNALMAP_API_PORT` (default 3000). Routes:
   - `GET /api/signalmap/list` → reads `signalmap:events:list` from Redis, applies query filters server-side
   - `GET /api/signalmap/source-health` → reads `signalmap:sources:health` from Redis
   - `GET /api/signalmap/event/{id}` → reads single event from Redis
   - `GET /api/signalmap/stream` → SSE; replays from sorted-set ring on `Last-Event-ID`; subscribes to `signalmap:events:updated` + `signalmap:brief:updated`
   - `GET /api/signalmap/brief/global` → reads `signalmap:brief:global` from Redis (cached read)
   - `POST /api/signalmap/brief/event/{id}` → singleflight + spend-reserve + Perplexity + OpenRouter via `synthesizePerEvent()`; cache forever per-event
   - `POST /api/signalmap/brief/refresh` → admin-token guarded; publishes `signalmap:brief:cron:trigger` channel which cron listens for
   - `GET /api/signalmap/health` → reads heartbeats + `PING`s Redis + reads `signalmap:llm:lastcall:*` + assembles strict-shape response
6. `signalmap-ui` nginx serves the SPA + proxies `/api/*` to `signalmap-api:3000` over the compose network. SSE proxy sets `proxy_buffering off` and `proxy_http_version 1.1`.
7. The Browser SPA loads, fetches `/api/signalmap/list`, renders events. Opens an SSE connection to `/api/signalmap/stream`. Health pill polls `/api/signalmap/health`. When user clicks Generate, the inspector POSTs `/api/signalmap/brief/event/<id>`, the API generates a brief via Perplexity + OpenRouter, the response renders in the WhyItMatters tab.

## Metrics / Outputs

| Metric | Type | Source | Notes |
|--------|------|--------|-------|
| `signalmap.api.request` | counter | api | tags: `method`, `path`, `status` |
| `signalmap.api.error` | counter | api | tags: `code`, `path` |
| `signalmap.sse.connect` | counter | api | tags: `replay_lost` (bool) |
| `signalmap.sse.disconnect` | counter | api | |
| `signalmap.collector.tick` | counter | collector | tags: `outcome` (`success`/`fail`/`skipped_no_lease`) |
| `signalmap.collector.events.ingested` | counter | collector | per-tick |
| `signalmap.collector.events.dropped` | counter | collector | dedup hits |
| `signalmap.brief.synthesize.attempt` | counter | cron + api/per-event | already in `metrics.ts` |
| `signalmap.brief.synthesize.success` | counter | cron + api/per-event | already in `metrics.ts` |
| `signalmap.brief.synthesize.fail` | counter | cron + api/per-event | already in `metrics.ts` |
| `signalmap.brief.cache.hit` / `.miss` | counter | api/per-event | already in `metrics.ts` |
| `signalmap.brief.spend.reserved` / `.refunded` | counter | brief-pipeline | already in `metrics.ts` |
| `signalmap.brief.citations.dropped` | counter | brief-pipeline | already in `metrics.ts` |

Logging: structured JSON to stdout. Fields: `ts` (ISO), `level` (`info`/`warn`/`error`), `service` (`api`/`collector`/`cron`), `event` (string), plus per-event extras. ~30-line helper in `server/_shared/logger.ts`.

## Error Handling

See [`design-summary.md`](./design-summary.md#error-handling) for full per-scenario table. Key invariants:

- **No silent fallbacks.** Every degraded path emits a `warnings: [...]` array in the response or a structured log line.
- **Health is the single source of truth for status.** UI doesn't probe components directly.
- **Daily LLM budget is hard-cap.** When exhausted, return 503 + `error.code: 'budget_exhausted'`. Spend reservation refunds correctly (already implemented in Phase 6.5).
- **Singleton lease prevents split-brain.** If a process loses its lease mid-tick, it aborts the tick and re-tries acquisition.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `ioredis` | ^5.10.1 (existing) | Redis client |
| `@lancedb/lancedb` | ^0.27.2 (existing) | Vector store for collector dedup |
| `fast-xml-parser` | ^5.3.7 (existing) | RSS / XML parsing |
| `zod` | ^3.25.76 (existing) | Schema validation in route handlers |
| `zod-openapi` | ^4.2.4 (existing) | OpenAPI doc generation (`generateSpec()`) |
| `tsx` | ^4.21.0 (devDep, existing) | Run TS at startup (no build step needed for backend) |
| `cross-env` | ^10.1.0 (devDep, existing) | npm scripts on Windows |

**No new dependencies.** All listed are already in `package.json` after Phase 9c.

## Out of Scope (this spec)

- Multi-tenant auth (CF ZTNA only).
- Horizontal scaling beyond `replicas: 1` per service.
- Hot-reload config (env changes require process restart).
- Web push notifications (separate Phase 2.x).
- TimelineStrip / Tweaks overlay / mobile / brief history / embeddable widget mode (Phase-2-candidates §1).
- Hono / `@hono/zod-openapi` — explicitly rejected this spec.
- LanceDB → cloud-managed (embedded only).
- Rewriting any code under `src/server/lib/*` — that is the shared library, treat as read-only.

## Testing Strategy

**Archetype:** Data Pipeline + API Service.

| What to test | How |
|--------------|-----|
| Brief pipeline end-to-end | Mock Perplexity + OpenRouter HTTP via `tests/fixtures/llm/`. Real Redis. Real `runBriefPipeline()`. Assert response shape + metric emissions. |
| SSE replay correctness | Real Redis + a real HTTP client. Existing 14 SSE tests under `tests/` already cover this — confirm they still pass. |
| Singleflight under stampede | Spawn 10 concurrent `synthesizePerEvent()` calls; assert exactly one Perplexity + OpenRouter call hit (via mock). |
| Spend reservation race | Concurrent `reserveSpend()` calls totalling > budget; assert exactly one rejection per overage. |
| Cron lease | Start two cron processes; assert second waits for first to die before acquiring. |
| Collector lease | Same as cron. |
| Collector ingest round-trip | Real Redis. Inject canned RSS payload via mock. Assert event lands in `signalmap:events:list` and `/api/signalmap/list` returns it. |
| Health endpoint shape | `GET /api/signalmap/health` returns the strict 8-key shape; production response redacts `detail` fields containing URIs / paths / key prefixes. |
| Compose stack boot | `docker compose up -d --build --force-recreate` exits 0; healthcheck on each service goes green within 60s. |

**What NOT to test:**
- The shipped UI (Playwright suite already covers it).
- `src/server/lib/*` internals — those are tested by their existing Phase 6 + 6.5 tests under `tests/`.
- LLM response content — only response *shape*. Live LLM tests assert on shape only.

**Mock boundaries:**

| Component | Mocked in tests? | Real in tests? |
|-----------|------------------|----------------|
| Redis | no — `redis:7-alpine` container in CI | always real |
| LanceDB | no — embedded native binding, in-process | always real |
| Perplexity HTTP | yes — fixture replay in `tests/fixtures/llm/perplexity-*.json` | only in `e2e-live/` with `RUN_LIVE_LLM=1` |
| OpenRouter HTTP | yes — fixture replay in `tests/fixtures/llm/openrouter-*.json` | only in `e2e-live/` with `RUN_LIVE_LLM=1` |
| HTTP API server | no — real `node:http` listening on localhost | always real |
| RSS fetches | yes — fixture XML in `tests/fixtures/rss/` | only manual `RUN_LIVE_COLLECTOR=1` |
| `signalmap-ui` nginx | no in unit tests; real in compose-up tests | both |

**Critical path:** `signalmap-api` boot → first request to each route → SSE connect → brief generation end-to-end → graceful shutdown. Coverage target: 80% line on new code (`server/api/`, `server/workers/`).

## Implementation Order

8 phases. Each phase has 2–4 units. Phase checkpoints are runnable from `C:\Coding_Workspace\Github\SignalMap`.

### Phase 1 — Shared helper restoration (3 units: 1a, 1b, 1c)

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 1a | `scripts/_signalmap-shared.mjs` (NEW) | Export `CHROME_UA` (string), `loadSharedConfig()` (returns `{ rssSources, providerStatusFeeds, cloudflareRadarToken, openrouterApiKey, perplexityApiKey, ... }` from env), `resolveCountryISO2(name)` (string|null lookup over ~30 country names that appear in the active RSS source list — US, GB, DE, FR, JP, CN, IN, AU, BR, CA, RU, ZA, IE, NL, SE, NO, DK, FI, PL, ES, IT, MX, AR, KR, TW, HK, SG, TH, ID, VN, PH, MY, IL, AE, SA, EG, NG, KE, UG). Use a flat map literal. No external deps. | `node -e "import('./scripts/_signalmap-shared.mjs').then(m => { console.log(typeof m.CHROME_UA, typeof m.loadSharedConfig, typeof m.resolveCountryISO2); console.log(m.resolveCountryISO2('United States')); })"` should print `string function function us`. | Don't restore `_country-resolver.mjs` or `_seed-utils.mjs` from worldmonitor verbatim — keep only the surface SignalMap actually uses. |
| 1b | `scripts/signalmap-news-collector.mjs` (PATCH), `scripts/signalmap-geocoder.mjs` (PATCH) | Replace `import { CHROME_UA, loadSharedConfig } from './_seed-utils.mjs';` with `import { CHROME_UA, loadSharedConfig } from './_signalmap-shared.mjs';`. In geocoder: replace `import {...} from './_country-resolver.mjs';` with the equivalent function from `_signalmap-shared.mjs`. | `node -c scripts/signalmap-news-collector.mjs && node -c scripts/signalmap-geocoder.mjs` (syntax + import resolution check, no execution). | Don't change collector logic. |
| 1c | n/a (validation only) | Run the collector once with `SIGNALMAP_BACKEND_MODE=fixture` against canned RSS — verify it boots, parses, writes to local Redis. | `RUN_COLLECTOR_BOOT_TEST=1 node scripts/signalmap-news-collector.mjs --once --fixture` (script must support `--once --fixture` flags; add them in 1b if missing). | Don't run with real RSS feeds yet. |

**Phase 1 checkpoint:** `node scripts/signalmap-news-collector.mjs --once --fixture` exits 0; redis has at least 1 event under `signalmap:events:list`.

### Phase 2 — signalmap-api Node service (5 units: 2a, 2b, 2c, 2d, 2e)

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 2a | `server/api/router.ts` (NEW) | Tiny method/path router. Export `createRouter()`. Methods: `get(path, handler)`, `post(path, handler)`, `route(req, res)`. Path syntax: `/api/foo/{id}` → matches `/api/foo/123` and exposes `id` via a request-scoped object. ~80 lines, no deps. | `npx tsx --test tests/api-router.test.mts` (NEW test, ~6 cases: exact match, param match, method mismatch → 405, no match → 404, wildcard `*` → optional, header injection of params). | Don't add middleware system. Don't add async error wrapping (handlers handle their own errors). |
| 2b | `server/api/index.ts` (NEW) | Entrypoint. Imports `createRouter`, mounts every route handler in `server/api/routes/`. Reads `SIGNALMAP_API_PORT` (default 3000). Initializes Redis adapter via `getRedisAdapter()`. Wires graceful SIGTERM (close server, close redis, exit 0 within 5s). Calls a `boot.ts` helper that emits a structured "api:started" log line with bound port + pid + node version. | `SIGNALMAP_API_PORT=3399 SIGNALMAP_BACKEND_MODE=fixture npx tsx server/api/index.ts &` then `curl http://127.0.0.1:3399/api/signalmap/list` returns 200 with at least the `events` key. Kill the server with SIGTERM, assert clean exit. | Don't bring up collector or cron. Don't import them into the api process. |
| 2c | `server/api/routes/signalmap-list.ts` (NEW), `server/api/routes/signalmap-source-health.ts` (NEW) | Wrap the existing `server/worldmonitor/signalmap/v1/list-signals.ts` handler shape so it works as a Node http handler. Read `signalmap:events:list` from Redis; apply `ListSignalsQuery` filters server-side; return `ListSignalsResponse` shape (events + sourceHealth + fetchedAt + upstreamUnavailable). Source-health route reads `signalmap:sources:health`. | `npx tsx --test tests/api-list-route.test.mts tests/api-source-health-route.test.mts` (NEW). Hermetic server pattern (start node:http on random port, fetch, assert, shutdown). | Don't call the collector inline. Just read Redis. |
| 2d | `server/api/routes/signalmap-health.ts` (NEW) | Implement strict-shape `/api/signalmap/health`. PING redis (note latencyMs). For each of the 6 components: read `signalmap:<component>:heartbeat` (TTL key) and `signalmap:<component>:status` (last-tick result). Compute `status` from heartbeat age: present → `ok`; expired but key existed → `degraded`; missing → `down`. Read `signalmap:llm:lastcall:openrouter` and `signalmap:llm:lastcall:perplexity` for those two cards. Read `signalmap:sources:health` for the `sources` array. **In production mode (`SIGNALMAP_BACKEND_MODE=live`), strip `detail` fields that contain `redis://`, `/data/`, `sk-`, or `pplx-` substrings before returning.** Schema must match `HealthResponse` from `server/api/schemas/signalmap.ts` exactly. | `npx tsx --test tests/api-health-route.test.mts` (NEW). 6 cases: all-ok, one-down, one-degraded, missing redis (down), live-mode redaction stripping URIs, fixture-mode keeps debug fields. | Don't probe OpenRouter/Perplexity per-request. Don't add a "version" or "uptime" field — the UI doesn't render them. |
| 2e | n/a (checkpoint) | `npm run start:api` brings up the server. UI's static Docker image proxies `/api/*` to it via updated nginx (Phase 5 lands the proxy; for now smoke against the api port directly). Smoke each route. | Phase 2 checkpoint: `SIGNALMAP_API_PORT=3399 SIGNALMAP_BACKEND_MODE=fixture npm run start:api &` then for each of the 8 routes do a `curl` and assert HTTP 200. Kill server. | n/a |

**Phase 2 checkpoint:** All 8 routes respond 200 in fixture mode. Health response is strict-shape with 8 top-level keys and 6 component cards. SIGTERM → clean shutdown within 5s.

### Phase 3 — signalmap-collector worker (4 units: 3a, 3b, 3c, 3d)

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 3a | `server/workers/lease.ts` (NEW) | TTL-based renewable lease helper. Export `acquireLease(redis, key, ttlSec, ownerId)`, `renewLease(redis, key, ttlSec, ownerId)`, `releaseLease(redis, key, ownerId)`. Use Lua `EVAL` for atomic compare-and-set (renew only if owner matches; release only if owner matches). | `npx tsx --test tests/lease.test.mts` (NEW). Cases: acquire-when-free, acquire-when-held-fails, renew-success, renew-by-non-owner-fails, release-by-non-owner-noop, release-by-owner-deletes, expired-lease-acquirable. | Don't use `SETNX` alone. Don't poll inside the helper — caller decides. |
| 3b | `server/workers/collector.ts` (NEW) | Main loop. On startup: read env, create Redis client, generate `ownerId = randomUUID()`. Loop: try `acquireLease('signalmap:collector:lease', 60s, ownerId)`. If acquired: run `tick()` (delegate to `scripts/signalmap-news-collector.mjs --once --live` via subprocess OR import its body and call directly). On success: `SETEX signalmap:collector:heartbeat <ttl> <pid>`, `SETEX signalmap:collector:status <ttl> <json-result>`, `renewLease()` halfway through TTL, sleep `RSS_POLL_MINUTES`. On failure: log, sleep, retry. SIGTERM: release lease, close redis, exit 0. | `RUN_COLLECTOR_BOOT_TEST=1 SIGNALMAP_RSS_POLL_MINUTES=0.05 npx tsx server/workers/collector.ts &` then within 10s assert `signalmap:collector:heartbeat` exists in Redis and at least one event is in `signalmap:events:list`. SIGTERM, assert lease released. | Don't run two ticks concurrently within the same process. Don't skip lease release on SIGTERM. |
| 3c | `server/workers/collector.ts` (PATCH) | After each successful ingestion, publish `signalmap:events:updated` channel message with the new event ids. The api's SSE handler subscribes to this channel and re-broadcasts on the EventSource stream. | Test via `tests/collector-sse-publish.test.mts` (NEW). Subscribe to channel; trigger one tick; assert message received with expected event ids. | Don't rebuild the SSE replay ring inside the collector — that's `publishStreamEvent()`'s job. |
| 3d | n/a (checkpoint) | Full collector loop running against fixture RSS for at least 2 ticks. Verify lease renewal, heartbeat freshness, event ingestion, channel publish. | `SIGNALMAP_RSS_POLL_MINUTES=0.1 SIGNALMAP_BACKEND_MODE=fixture timeout 30 npx tsx server/workers/collector.ts` — at the end, redis should show at least 2 ticks recorded, lease renewed, channel messages published. | n/a |

**Phase 3 checkpoint:** Collector boots, acquires lease, runs ticks, heartbeats, publishes SSE updates. Two-instance test: second collector instance waits for the first to die before acquiring lease.

### Phase 4 — signalmap-cron worker (4 units: 4a, 4b, 4c, 4d)

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 4a | `server/workers/cron.ts` (NEW) | Same shell as `collector.ts` — lease, heartbeat, status, SIGTERM cleanup. Lease key: `signalmap:brief:cron:lease`. Heartbeat: `signalmap:brief:cron:heartbeat`. Tick body: import `runBriefCron()` from a thin wrapper around `scripts/brief-cron.mjs`. | `SIGNALMAP_BRIEF_REFRESH_MINUTES=0.1 SIGNALMAP_BACKEND_MODE=fixture timeout 30 npx tsx server/workers/cron.ts` — verify lease + heartbeat + at least one brief written to `signalmap:brief:global`. | Don't duplicate brief-pipeline logic — call the existing module. |
| 4b | `scripts/brief-cron.mjs` (PATCH if needed) → ensure exports a callable `runBriefCron({ redis, abortSignal })` function in addition to the IIFE entry. `server/workers/cron.ts` imports this function. | Verify the existing `scripts/brief-cron.mjs` body factors cleanly. If it currently runs only as a script (no exported function), refactor minimally to extract the loop body. | `node -e "import('./scripts/brief-cron.mjs').then(m => console.log(typeof m.runBriefCron))"` prints `function`. | Don't change pipeline logic. Just enable callable use. |
| 4c | `server/workers/cron.ts` (PATCH) | After each successful brief write, publish `signalmap:brief:updated` channel message. The api's SSE handler subscribes and emits a `brief-updated` event on the EventSource stream. | `tests/cron-sse-publish.test.mts` (NEW). Subscribe; trigger one cron tick; assert message received. | Don't rebuild SSE replay logic. |
| 4d | n/a (checkpoint) | Full cron loop with fixture LLM (no real keys needed). Verify two ticks, lease, heartbeat, brief published. | `SIGNALMAP_BRIEF_REFRESH_MINUTES=0.1 SIGNALMAP_BACKEND_MODE=fixture timeout 60 npx tsx server/workers/cron.ts` — assert ≥2 ticks, ≥2 brief writes (first overwrites second), channel messages, SIGTERM cleans up. | n/a |

**Phase 4 checkpoint:** Cron boots, generates briefs (mocked LLM), publishes updates, lease prevents split-brain.

### Phase 5 — Two-image Docker + compose (4 units: 5a, 5b, 5c, 5d)

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 5a | `docker/Dockerfile.node` (NEW), `docker/entrypoint-node.sh` (NEW) | Single Node 22-alpine image with `npm ci --legacy-peer-deps`, `npx tsx` available, source mounted in. Entrypoint takes one arg: `api`/`collector`/`cron`. Maps to `npm run start:<role>`. Healthcheck per role: api → `wget http://127.0.0.1:3000/api/signalmap/health`, collector/cron → check heartbeat key in Redis (via `redis-cli`). | `docker build -t signalmap-node:latest -f docker/Dockerfile.node .` exits 0. `docker run --rm signalmap-node:latest api` boots the api on port 3000. | Don't add supervisord. Don't bundle redis. |
| 5b | `docker-compose.yml` (PATCH) | 5 services: `redis` (existing), `signalmap-api` (new), `signalmap-collector` (new), `signalmap-cron` (new), `signalmap-ui` (existing — image pinned to `signalmap-ui:latest`, was `signalmap:latest` — rename in this commit). Each `signalmap-node`-derived service mounts shared LanceDB volume + reads env from `.env` file. `replicas: 1` on cron + collector explicitly. | `docker compose -f docker-compose.yml config` exits 0. `docker compose up -d --build --force-recreate` boots all 5 services with healthchecks green within 60s. | Don't use `version:` directive (compose v2). Don't expose redis port to host in prod (only on compose network). |
| 5c | `docker/nginx.conf` (PATCH) | UI image's nginx now proxies `/api/*` to `http://signalmap-api:3000` over compose network. SSE: `proxy_buffering off`, `proxy_cache off`, `proxy_http_version 1.1`, `proxy_read_timeout 1d`, `proxy_set_header X-Accel-Buffering no`. Static asset rules unchanged. The 503-fallback rules from Phase 9 are removed. | After `docker compose up -d`, `curl http://localhost:8080/api/signalmap/list` returns 200 (proxied through nginx → api). `curl -N http://localhost:8080/api/signalmap/stream` opens an SSE stream that doesn't buffer. | Don't keep the old `/api/<path>.json` static fallback — remove it. |
| 5d | n/a (checkpoint) | Full compose stack up, every service healthy, UI reachable on `localhost:8080`, /api/* proxied. | `docker compose up -d --build --force-recreate && sleep 60 && docker compose ps --filter health=healthy` shows all 5 services healthy. `curl -fsSL http://localhost:8080/ -o /dev/null && curl -fsSL http://localhost:8080/api/signalmap/health` both succeed. | n/a |

**Phase 5 checkpoint:** Full stack `docker compose up` produces a working stack at `localhost:8080`. All services pass healthcheck. UI talks to API talks to Redis talks to collector + cron.

### Phase 6 — Backend mode profile + e2e split (3 units: 6a, 6b, 6c)

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 6a | `vite.config.ts` (PATCH), `server/api/index.ts` (PATCH) | Gate the existing `signalmapFixturePlugin` on `SIGNALMAP_BACKEND_MODE === 'fixture' \|\| process.env.NODE_ENV === 'development'`. In live mode the plugin no-ops and api server takes over. Same flag in `server/api/index.ts`: in fixture mode it can use baked fixtures instead of real Redis (for dev convenience), in live mode it requires Redis. | `SIGNALMAP_BACKEND_MODE=fixture npm run dev` works as before. `SIGNALMAP_BACKEND_MODE=live npm run dev` requires Redis to be reachable. | Don't break existing 58 Playwright tests. They run in fixture mode by default. |
| 6b | `e2e/` (no change), `e2e-live/` (NEW) | Copy 4–6 of the most representative e2e tests and rewrite to assert SHAPE not content. e.g. `signalmap-feed-list` exists, `signalmap-source-pill` shows `N/M`, `signalmap-worldmap-markers` has ≥1 child, `signalmap-health-panel` opens with 6 component cards, brief generate produces a non-empty bullets array. Default-skipped via `playwright.config.live.ts` that requires `RUN_LIVE_E2E=1`. | `RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts` runs against `localhost:8080` (assumes compose stack already up). | Don't copy ALL 58 tests into e2e-live — pick the smoke set. |
| 6c | n/a (checkpoint) | Both profiles work. CI command unchanged (`npx playwright test`). New live command exists and is documented. | Existing CI: `npx playwright test` passes 58/58 in fixture mode. New live: `RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts` passes (count varies, target ≥6). | n/a |

**Phase 6 checkpoint:** Existing 58/58 still green in fixture mode. Live mode runnable against compose stack and asserts shape-only.

### Phase 7 — Structured JSON logging (2 units: 7a, 7b)

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 7a | `server/_shared/logger.ts` (NEW) | Export `createLogger(service: string)`. Returns `{ info, warn, error }` methods. Each writes one JSON line per call to `process.stdout`: `{ ts, level, service, event, ...extras }`. ~30 lines. | `npx tsx --test tests/logger.test.mts` (NEW). 4 cases: info-emits-json, error-includes-stack, no-circular-refs, multi-line-string-escaped. | Don't add log levels beyond info/warn/error. Don't use a logging library. |
| 7b | `server/api/index.ts`, `server/workers/collector.ts`, `server/workers/cron.ts` (PATCH) | Replace `console.log` / `console.error` calls with `log.info(event, extras)` / `log.error(event, extras)`. Critical events: api-started, api-stopped, request-error, sse-connect, sse-disconnect, collector-tick-start, collector-tick-success, collector-tick-fail, lease-acquired, lease-renewed, lease-lost, cron-tick-* | `SIGNALMAP_API_PORT=3399 npx tsx server/api/index.ts > /tmp/api.log 2>&1 &` then `head -1 /tmp/api.log \| jq` returns valid JSON with `service: "api"`, `event: "api-started"`. | Don't replace logs in `src/server/lib/*` — those are kept-library. |

**Phase 7 checkpoint:** All logs from api/collector/cron are valid JSON lines parseable by `jq`. Each line has `ts`, `level`, `service`, `event`.

### Phase 8 — Final acceptance + release (3 units: 8a, 8b, 8c)

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 8a | `.env` (created with real keys per `signalmap-shared.env.example`), `docker-compose.yml` (no change) | Bring up the full stack with **real** OpenRouter + Perplexity keys. Watch for actual brief generation. Smoke for 30 minutes (one full cron interval at 0.5× = 15 min). | `cp docker/signalmap-shared.env.example .env && <fill in real keys> && docker compose up -d --build --force-recreate && sleep 60`. Then: `curl http://localhost:8080/api/signalmap/health \| jq '.brief.status'` should be `"ok"` after first cron tick. Click Generate in the UI; bullets render with real Perplexity sources. | Don't commit `.env`. |
| 8b | `e2e-live/` (already exists from 6b) | Run live e2e suite against the running stack. | `RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts`. Target: 100% of the live tests pass. | n/a |
| 8c | `docs/SignalMap/v2-backend/PROGRESS.md` (PATCH — mark complete), `README.md` (PATCH — add backend-running section) | Update the `README.md` quickstart to document `docker compose up -d --build --force-recreate` as the canonical full-stack command. Document `.env` requirements. Phase 9 of the v1 spec marked the legacy archive complete; v2-backend close-out marks the production stack ready. | `npm run typecheck:all` exits 0; `npx playwright test` (fixture) exits 0; `RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts` exits 0; `docker compose ps --filter health=healthy` shows all 5 services healthy. | Don't ship a `.env` with secrets. Don't promise SLA / uptime in README. |

**Phase 8 checkpoint (FINAL):** Full stack up. Real LLM calls. UI talks to live API. Health panel shows live status. Generate button hits real Perplexity + OpenRouter. SSE pushes live updates. README + spec updated.

---

## Quality Gates Summary

| Phase | Gate Command | Pass Criteria |
|-------|--------------|---------------|
| 1 | `node -c scripts/signalmap-news-collector.mjs && node scripts/signalmap-news-collector.mjs --once --fixture` | Collector boots and writes ≥1 event |
| 2 | `SIGNALMAP_API_PORT=3399 SIGNALMAP_BACKEND_MODE=fixture npm run start:api &` + smoke 8 routes | All 8 routes 200 |
| 3 | `SIGNALMAP_RSS_POLL_MINUTES=0.1 timeout 30 npx tsx server/workers/collector.ts` | ≥2 ticks, lease renewed, heartbeat fresh |
| 4 | `SIGNALMAP_BRIEF_REFRESH_MINUTES=0.1 timeout 60 npx tsx server/workers/cron.ts` | ≥2 brief writes, channel messages |
| 5 | `docker compose up -d --build --force-recreate && sleep 60 && docker compose ps --filter health=healthy` | All 5 services healthy |
| 6 | `npx playwright test` + `RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts` | 58/58 fixture, ≥6 live shape-only |
| 7 | `head -1 /tmp/api.log \| jq` (and same for collector/cron) | Valid JSON line with required fields |
| 8 | `docker compose ps --filter health=healthy` + UI smoke + `RUN_LIVE_E2E=1` | Full stack green with real keys |
