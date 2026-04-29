---
project: SignalMap v2 — Backend (Phase 2)
artifact: design-summary
audience: implementor (foreman pitboss-implementor in fresh session)
date: 2026-04-29
deliberation: Codex (gpt-5.4 high) × Claude Opus 4.7 1M, user-arbitrated
input: This file is the input for `mcp__foreman__spec_generator` → produces spec.md, handoff.md, PROGRESS.md, testing-harness.md at this same directory.
---

# Design Summary — SignalMap v2 Backend (Phase 2)

## Problem
SignalMap v1 shipped a Preact UI fronted by a static-only Docker image that serves baked fixture JSON for every `/api/*` route. Phase 2 wires the UI to a live backend so briefs hit Perplexity + OpenRouter, events flow from RSS / Cloudflare Radar / status feeds via the collector, and the Health panel reflects real Redis / LanceDB / process state.

## Approach
Three Node services coordinated through Redis, fronted by the existing static UI image's nginx as a reverse proxy. One reusable Node runtime image runs `api`, `collector`, or `cron` depending on its `CMD`. The existing brief code in `src/server/lib/*` is the shared backend library — services consume it, none of it gets rewritten. Existing route handlers stay in their `(req: IncomingMessage, res: ServerResponse)` shape and are mounted by a tiny custom router (no HTTP framework dep). LanceDB writes happen inside the collector; Redis is the live coordination plane (events, brief cache, SSE replay ring, heartbeats).

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| HTTP framework | Bare `node:http` + ~80-line method/path router | Existing route handlers are already typed for `IncomingMessage`/`ServerResponse`. Hono's Node adapter exposes raw Node objects via `c.env.incoming/outgoing` and requires `RESPONSE_ALREADY_SENT` — adapting our handlers buys nothing. `@hono/zod-openapi` would duplicate the existing pure `generateSpec()` route DSL. Codex deliberation flipped my initial Hono lean. |
| Process topology | Three services: `api` / `collector` / `cron`, coordinated via Redis | Failure isolation, targeted restarts, separate healthchecks, cleaner logs than supervisord. Memory cost (~150MB × 3) is acceptable for a self-hosted deploy. |
| Container strategy | Two images: `signalmap-ui` (nginx + dist), `signalmap-node` (Node runtime, single image, three compose services with different `CMD`) | Same `package.json`, same `node_modules`, same `src/server/lib/*` — three images would duplicate ~200MB of layers per service. |
| Repo layout | Single `package.json`. New entries: `server/api/index.ts`, `server/workers/collector.ts`, `server/workers/cron.ts`. `npm` scripts: `start:api`, `start:collector`, `start:cron` | Matches Phase 9 single-tree decision. `src/server/lib/*` stays as the shared library. |
| Broken collector imports (`./_seed-utils.mjs`, `./_country-resolver.mjs`) | Recreate a small SignalMap-owned `scripts/_signalmap-shared.mjs` with the minimum surface (CHROME_UA, loadSharedConfig, country-name → ISO2 lookup). Update `signalmap-news-collector.mjs` and `signalmap-geocoder.mjs` to import from it. | Inlining duplicates code across two scripts; one shared helper is one fewer maintenance point. Don't restore the broader archived util tree. |
| SSE replay backing | Keep Phase 3's Redis sorted-set ring (`src/server/lib/sse-replay-ring.ts`) | Streams add consumer-group complexity not needed for short-window reconnect replay. Existing 16 SSE tests still apply. Tighten to pipelined write/trim during impl. |
| Health endpoint model | TTL-based heartbeat keys + cached last-call results. Direct `PING` for Redis. | Codex flip: SETEX-with-TTL is more reliable than immortal timestamps with a "stale-after" check. No live ping-per-request to OpenRouter/Perplexity (cost + latency). |
| Auth model | No end-user auth in the Node app (CF ZTNA gates the published UI). **Keep** `SIGNALMAP_ADMIN_TOKEN` for privileged endpoints (`/brief/refresh`). | Codex flip: "no auth" was too absolute. The existing `signalmap-brief-refresh.ts:21` already implements the admin-token check — preserve and extend that pattern. |
| Singleton enforcement | TTL-based renewable Redis lease for both cron AND collector (renewable per tick, guarded release). NOT a startup-only `SETNX`. | If compose accidentally runs replicas: 2, two crons would fight as "sole writer of `signalmap:brief:global`". Renewable lease tolerates restarts and prevents split-brain. |
| Health response schema | `.strict()` — exactly `redis`, `lancedb`, `collector`, `brief`, `openrouter`, `perplexity`, `sources`, `generatedAt`. Production responses redact connection URIs, filesystem paths, and key prefixes. | UI `HealthPanel.tsx` hard-codes the six component cards; any drift breaks the panel. Fixture in dev keeps the friendly debug fields; prod sanitises. |
| Fixture vs live mode | `SIGNALMAP_BACKEND_MODE=fixture\|live` runtime profile. Fixture mode = vite middleware + `__test/*` admin endpoints (current dev behavior). Live mode = real services, no fixture middleware. | Codex flip on E2E test split. CI stays deterministic via `fixture`; staging/prod runs `live`. Existing 58 Playwright tests stay pinned to `fixture`. |
| Outbound HTTP | Native Node 22 `fetch` (already used by `perplexity.ts` / `openrouter.ts`). No `node-fetch` / `undici` import. | Verified during grounding pass; Node 22 native is sufficient. |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (UI)                                                        │
│  Preact SPA → fetch /api/* → EventSource /api/signalmap/stream       │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
                ┌────────────────────────────────────┐
                │  signalmap-ui  (nginx, port 8080)  │
                │  - serves static dist/             │
                │  - proxies /api/* → signalmap-api  │
                │    proxy_buffering off (SSE)       │
                │    HTTP/1.1                        │
                └─────────────────┬──────────────────┘
                                  │
                                  ▼ (compose network)
                ┌────────────────────────────────────┐
                │  signalmap-api  (node:22, 3000)    │
                │  - server/api/index.ts             │
                │  - GET  /api/signalmap/list        │
                │  - GET  /api/signalmap/source-health│
                │  - GET  /api/signalmap/event/:id   │
                │  - GET  /api/signalmap/stream (SSE)│
                │  - GET  /api/signalmap/brief/global│
                │  - POST /api/signalmap/brief/event/:id│
                │  - POST /api/signalmap/brief/refresh (admin)│
                │  - GET  /api/signalmap/health      │
                └─────────┬──────────────────────────┘
                          │ ioredis
                          ▼
          ┌──────────────────────────────────┐
          │  redis:7-alpine                  │
          │  - signalmap:events:*            │
          │  - signalmap:brief:global        │
          │  - signalmap:brief:event:<id>    │
          │  - signalmap:sse:ring (zset)     │
          │  - signalmap:collector:lease     │
          │  - signalmap:collector:heartbeat │
          │  - signalmap:brief:cron:lease    │
          │  - signalmap:brief:cron:heartbeat│
          │  - signalmap:llm:lastcall:*      │
          │  - signalmap:llm:spend:<date>    │
          └─────────▲──────────────▲─────────┘
                    │              │
                    │              │
        ┌───────────┴────────┐  ┌──┴────────────────────┐
        │ signalmap-collector│  │ signalmap-cron        │
        │ (node:22)          │  │ (node:22)             │
        │ server/workers/    │  │ server/workers/       │
        │   collector.ts     │  │   cron.ts             │
        │ - 15 min RSS poll  │  │ - 30 min brief gen    │
        │ - LanceDB write    │  │ - perplexity → OR     │
        │ - SSE publish      │  │ - publishes update    │
        │ - heartbeat SETEX  │  │ - heartbeat SETEX     │
        └────────────────────┘  └───────────────────────┘
                    │                       │
                    ▼                       ▼ (LLM APIs)
              LanceDB volume          openrouter.ai / perplexity.ai
              (/data/lancedb)
```

## Integration Points

| System | Protocol | Auth | Discovery Status |
|--------|----------|------|------------------|
| Redis (ioredis) | TCP RESP | optional `REDIS_PASSWORD` | done — Phase 2/3 already validated |
| LanceDB (`@lancedb/lancedb`) | embedded native binding | n/a | done — package ships musl + glibc binaries (verified `node_modules/@lancedb/lancedb/package.json:108-109`); Alpine OK |
| Cloudflare Radar | HTTPS REST | optional `CLOUDFLARE_API_TOKEN` | done — Phase 0a probe captured |
| Perplexity Sonar Pro | HTTPS REST | `PERPLEXITY_API_KEY` | done — Phase 0a, real-workflow test |
| OpenRouter | HTTPS REST | `OPENROUTER_API_KEY` | done — Phase 0b model verification |
| RSS feeds (Okta / M365 / Azure / OpenAI / Anthropic / Wasabi / 4× AWS) | HTTPS XML/RSS | none | done — Phase 8 sources list locked |
| GDELT (tier-2) | HTTPS | none | done |
| Generic RSS Tier-2 News | HTTPS XML/RSS | none | done |

## Config Surface

| Setting | Type | Source | Default |
|---------|------|--------|---------|
| `REDIS_URL` | string | env | `redis://signalmap-redis:6379` |
| `REDIS_PASSWORD` | string | env | empty |
| `OPENROUTER_API_KEY` | string | env | required for live mode |
| `OPENROUTER_BASE_URL` | string | env | `https://openrouter.ai/api/v1` |
| `PERPLEXITY_API_KEY` | string | env | required for live mode |
| `CLOUDFLARE_API_TOKEN` | string | env | optional (Radar API works unauth at lower limits) |
| `SIGNALMAP_ADMIN_TOKEN` | string | env | required for `/brief/refresh` |
| `SIGNALMAP_BACKEND_MODE` | enum `fixture\|live` | env | `live` |
| `SIGNALMAP_API_PORT` | number | env | 3000 |
| `SIGNALMAP_RSS_POLL_MINUTES` | number | env | 15 |
| `SIGNALMAP_BRIEF_REFRESH_MINUTES` | number | env | 30 |
| `SIGNALMAP_DAILY_LLM_BUDGET_USD` | number | env | 2.00 |
| `SIGNALMAP_BRIEF_EVENT_EST_COST_USD` | number | env | 0.05 |
| `SIGNALMAP_BRIEF_PER_EVENT_RATE_LIMIT_PER_MIN` | number | env | 20 |
| `SIGNALMAP_BRIEF_PER_EVENT_LOCK_TIMEOUT_SECONDS` | number | env | 30 |
| `SIGNALMAP_BRIEF_PER_EVENT_STAMPEDE_POLL_MS` | number | env | 200 |
| `SSE_HEARTBEAT_SECONDS` | number | env | 20 |
| `SSE_RECONNECT_RETRY_MIN_MS` | number | env | 5000 |
| `SSE_RECONNECT_RETRY_MAX_MS` | number | env | 15000 |
| `SIGNALMAP_LLM_MODELS` | csv | env | `anthropic/claude-sonnet-4.6,nvidia/nemotron-3-super-120b-a12b,moonshotai/kimi-k2_6,google/gemini-3.1-pro-preview` |
| `SIGNALMAP_DATA_DIR` | path | env | `/data/signalmap` |
| `SIGNALMAP_LANCEDB_URI` | path | env | `/data/signalmap/lancedb` |
| `SIGNALMAP_COLLECTOR_LEASE_TTL_SEC` | number | env | 60 |
| `SIGNALMAP_CRON_LEASE_TTL_SEC` | number | env | 60 |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Redis connection lost (api) | Health endpoint returns `redis.status: 'down'`. SSE handler returns 503. Brief endpoints return 503. Other endpoints (list, source-health) read from in-memory cache where present, else 503. |
| Redis connection lost (collector / cron) | Heartbeat skipped. Worker retries connection with exponential backoff (5s → 60s cap). Health flips `degraded` after 2× interval, `down` after 4×. |
| LanceDB unavailable | Collector logs error, skips vector dedup, still ingests via Redis. Health: `lancedb.status: 'down'`. |
| Perplexity 5xx / timeout | Brief pipeline falls back to "local-signals-only" mode (Phase 6.5 already implemented this). `warnings: ['perplexity_unavailable']` in response. |
| Perplexity 401 | Health: `perplexity.status: 'down'`, detail `'invalid_api_key'`. Brief endpoint returns 503 + `error.code: 'perplexity_unauthorized'`. |
| OpenRouter 5xx / timeout | Brief pipeline tries fallback model in `SIGNALMAP_LLM_MODELS` chain. After all models exhausted: 503 + `error.code: 'openrouter_unavailable'`. |
| OpenRouter 401 | Health: `openrouter.status: 'down'`. Brief endpoint returns 503. |
| Daily LLM budget exhausted | Brief endpoint returns 503 + `error.code: 'budget_exhausted'`. Spend reservation refunds the est-cost (Phase 6.5 implemented). |
| Brief stampede (singleflight) | Per-event endpoint polls cache for up to `LOCK_TIMEOUT_SECONDS`. If holder doesn't release, returns 503 + `error.code: 'stampede_timeout'`. |
| SSE connection drop | Server stops writing. Client reconnects with `Last-Event-ID`; replay returns `204 + X-Replay-Lost: true` if id was evicted. |
| Compose accidentally runs `cron: replicas: 2` | First instance acquires `signalmap:brief:cron:lease` (TTL 60s, renewed every 30s). Second instance polls; only acquires if first dies. No split-brain. |
| Stale OpenAPI doc | `npm run build:openapi` regenerates `public/openapi.yaml`. Spec generation is pure (no I/O), tests assert it. |

## Observability

- **Metrics**: `metrics.ts` already emits via `emitMetric(name, value, tags)`. Backend services emit at every interesting boundary. The 8 metric names in `METRICS` const are canonical:
  - `signalmap.brief.synthesize.attempt`, `signalmap.brief.synthesize.success`, `signalmap.brief.synthesize.fail`
  - `signalmap.brief.cache.hit`, `signalmap.brief.cache.miss`
  - `signalmap.brief.spend.reserved`, `signalmap.brief.spend.refunded`
  - `signalmap.brief.citations.dropped`
  - Add new: `signalmap.collector.tick`, `signalmap.collector.events.ingested`, `signalmap.collector.events.dropped`, `signalmap.api.request`, `signalmap.api.error`, `signalmap.sse.connect`, `signalmap.sse.disconnect`
- **Logging**: structured JSON to stdout (one JSON object per line). Fields: `ts` (ISO), `level` (`info|warn|error`), `service` (`api|collector|cron`), `event` (string), plus per-event extras. No external logger lib; ~30 lines of helper.
- **Health checks**: `GET /api/signalmap/health` is the canonical surface. Compose `healthcheck:` for each service hits its own minimal `/health` (or process-level `process.exitCode === 0`). The api's `/api/signalmap/health` is the aggregate the UI consumes.

## Testing Strategy

- **Archetype**: Data Pipeline + API Service (matches Phase 6 testing-harness archetype).
- **Mock boundaries**:
  - Mock: Perplexity HTTP, OpenRouter HTTP (replay-style fixtures in `tests/fixtures/llm/`).
  - Real: Redis (`redis:7-alpine` container in CI), LanceDB (in-process embedded), the Node API server itself, the SSE replay ring.
- **Critical path coverage**:
  - Brief pipeline end-to-end (Perplexity mock → OpenRouter mock → cache → response).
  - SSE replay correctness (`Last-Event-ID` + eviction + `X-Replay-Lost`).
  - Singleflight under stampede (concurrent per-event requests get one synthesis).
  - Spend reservation race (concurrent calls don't double-charge).
  - Cron singleton (lease tested with two simulated instances).
  - Collector ingest → Redis → API list endpoint round-trip.
- **Fixture-vs-live profiles**:
  - `SIGNALMAP_BACKEND_MODE=fixture` — UI fixture middleware enabled, `__test/*` admin reset endpoints enabled, no LLM calls. CI runs here. Existing 58 Playwright tests pass unchanged.
  - `SIGNALMAP_BACKEND_MODE=live` — real backend. New `e2e-live/` directory (default-skipped) for staging smoke. Asserts on shape (status `200`, has bullets array) not content.
- **Real-LLM gate**: `RUN_LIVE_LLM=1` env flag for explicit dev validation against real keys. Never set in CI. Documented loudly in handoff.

## Scope

**In scope (Phase 2 = this spec):**
- `signalmap-api` Node service serving the 8 endpoints listed under Architecture.
- `signalmap-collector` worker: 15-min RSS poll, Cloudflare Radar fetch, provider-status RSS, GDELT, dedup via LanceDB, write events to Redis, publish SSE updates, heartbeat.
- `signalmap-cron` worker: 30-min global brief generation via brief-pipeline (Perplexity → OpenRouter), write to Redis, publish brief-updated SSE event, heartbeat.
- Two-image Docker setup: `signalmap-ui` (existing) + `signalmap-node` (new) with three compose services.
- Updated `docker-compose.yml` wiring api / collector / cron / redis / ui.
- Recreated `scripts/_signalmap-shared.mjs` with CHROME_UA, loadSharedConfig, country-resolver subset.
- Strict OpenAPI doc updated for the 8 endpoints (already shipped as part of contract reconciliation).
- TTL-based renewable singleton leases (cron + collector).
- Health endpoint with prod-redacted strict shape.
- Structured JSON logging across all three services.
- `SIGNALMAP_BACKEND_MODE=fixture|live` runtime profile + test split (`e2e/` vs `e2e-live/`).
- Updated nginx.conf for SSE proxy (`proxy_buffering off`, HTTP/1.1).
- Test profiles in `tests/` and `e2e/` reflecting real backend integration; LLM mocks in `tests/fixtures/llm/`.

**Out of scope (this version):**
- Multi-tenant auth — CF ZTNA only.
- Horizontal scaling beyond `replicas: 1` per service.
- Hot-reload config (env changes require process restart).
- Web push notifications (separate Phase 2.x).
- TimelineStrip / Tweaks overlay / mobile / brief history / embeddable widget mode (Phase-2-candidates §1).
- Hono / @hono/zod-openapi — explicitly rejected this round.
- LanceDB → cloud-managed (Pinecone, Weaviate, etc.) — embedded only for now.

**Phase 3 candidates:**
- Per-event brief on-demand quality scoring (citation revalidation already in pipeline; add reranking).
- Real-time collector via webhooks (currently 15-min poll).
- Brief history (`signalmap:brief:history` list) + UI surfacing.
- Web push integration.
- Multi-region collector (one collector per geographic shard).

## Open Items

| Item | Status | Blocking? |
|------|--------|-----------|
| Country-resolver subset for `_signalmap-shared.mjs` — what country names need ISO2 mapping? | RESOLVED — driven by RSS source list (US, GB, DE, FR, JP, CN, IN, AU, BR, CA, RU, ZA, etc.). Implementor picks the ~30 countries that appear in active RSS sources. | No |
| Compose volume for LanceDB — named volume vs bind mount? | RESOLVED — named volume `signalmap-lancedb` (already in current `docker-compose.yml`). Bind mount only for dev. | No |
| Brief-cron first-tick delay on cold start — should it run immediately or wait one interval? | DECISION: run immediately at startup if `signalmap:brief:global` is missing, else wait. Documented in cron worker. | No |
| LanceDB schema migration story | DEFER — current schema is stable from Phase 6; flag if it changes. | No |
| Collector backpressure if Redis is slow | DECISION: drop oldest events past `signalmap:events:list` cap (1000 events, FIFO via `LPUSH`/`LTRIM`). | No |
| Should `/api/signalmap/list` honor query filters server-side or always return full list and let UI filter? | DECISION: server-side (already implemented in `server/worldmonitor/signalmap/v1/list-signals.ts`). | No |

All items resolved. Ready for spec generation.

## Pre-Spec Cleanup Already Done

During this design session, contract drift between OpenAPI doc + UI consumers was reconciled in `server/api/schemas/signalmap.ts`:
- `/api/signalmap/brief/global` — POST → GET (matches UI `fetchFn('/api/signalmap/brief/global')`).
- `/api/signalmap/brief/event/{id}` — response `{ whyItMatters: string }` → `{ bullets: string[], sources: BriefSource[], generatedAt, model }` (matches UI consuming `result.bullets[0]` and `result.sources`).
- New `/api/signalmap/health` route declared with `.strict()` shape matching `HealthPanel.tsx`.
- New `/api/signalmap/brief/refresh` route declared with admin-token header.
- `npm run build:openapi` regenerated `public/openapi.yaml` (18,585 bytes). Verify with `grep -nE "brief/global|brief/event|signalmap/health|whyItMatters|bullets" public/openapi.yaml`.
