---
project: SignalMap Standalone v2
artifact: spec
status: pending-implementation
date: 2026-04-26
input: docs/SignalMap/design-summary.md (council-amended 2026-04-26)
council_record: docs/SignalMap/council-report-2026-04-26.md
---

# SignalMap Standalone v2 — Implementation Spec

## Intent

Replace the multi-variant worldmonitor SignalMap shell with a clean-slate single-product Preact + JSX dashboard that matches `docs/SignalMap/Claude_Design/`. Keep the existing collector pipeline (RSS, Cloudflare Radar, provider status, LanceDB dedup, watchlist) and rewire the data-layer onto a leaner stack: ioredis adapter (drop the `redis-rest` HTTP shim and `@upstash/redis`), code-first OpenAPI + `openapi-fetch` typed client, SSE with Redis-backed replay ring, Perplexity Sonar Pro + OpenRouter Nemotron brief feature with stampede/spend/citation/injection hardening, and a 2-service Docker stack served behind HTTP/2 nginx. Non-SignalMap legacy code is archived to a `archive/v1-legacy` git branch and removed from main.

## Decisions & Notes

| Decision | Choice | Rationale | Source |
|----------|--------|-----------|--------|
| Product model | Single product, no variants | Variants were the source of architectural sprawl | design-summary §Key Decisions |
| UI framework | Preact + JSX with `@preact/signals` (~5KB runtime) | Mockup is JSX; direct adoption saves ~4-5d on new components | council amendment #8 |
| Map renderer | SVG + topojson-client + `d3-geo.geoEquirectangular()` + `d3-zoom`; 44px touch hit areas | Sparse markers, low update rate; mockup mobile/tooltip drift fixed | council amendment #6 |
| Realtime | SSE + heartbeats 20s + jitter + Redis-backed replay ring + HTTP/2 nginx | Bypasses HTTP/1.1 6-conn limit; survives backend restart | council amendment #5 |
| Redis client | `ioredis` only; drop `@upstash/redis`; build adapter first | `@upstash/redis` is REST-only, can't speak TCP RESP | council amendment #3 |
| Brief synth | Single-pass `anthropic/claude-sonnet-4.6`. Background cron writes one global brief to Redis every `SIGNALMAP_BRIEF_REFRESH_MINUTES` (30 default). Frontend reads cached value; SSE pushes update. | User decision 2026-04-26 after real-workflow 3-way test (Sonnet vs Gemini 3 Flash vs GPT-5.4-mini). Sonnet was the only model that noticed and ignored Perplexity's hallucinated context. 2-pass architecture rejected — reasoning-tier draft models leak CoT. | design-summary §Key Decisions, real-workflow-brief-result.md |
| Brief generation pattern | **Server-side cron** is the SOLE writer of the global brief. Frontend is read-only. No filter signature in cache key (single global brief shared by all users; watchlist personalization is client-side visual emphasis only). Per-event briefs remain on-demand via user click (SETNX singleflight + per-IP rate limit on this endpoint only). | User decision 2026-04-26: internal coworker portal behind CF ZTNA; news content is identical for everyone. Per-user fragmentation was over-engineering. | user 2026-04-26 |
| Auth | None at app level. Cloudflare ZTNA at the edge handles access control. App may read `Cf-Access-Authenticated-User-Email` for Phase-2 per-user features. | Coworker portal, not public-facing | user 2026-04-26 |
| Brief retrieval | Perplexity Sonar Pro, allowlist ≤20 domains + citation revalidation + clickbait-resistant prompt | Reduces input tokens 7×; allowlist prevents AI-content-farm pollution | design-summary §Key Decisions |
| Brief budget | Atomic Redis spend reservation + SETNX singleflight + per-IP rate limit | Per-IP alone insufficient (IPv6 rotation, stampede) | council amendment #4 |
| API client | Code-first OpenAPI via `zod-openapi` + `openapi-fetch` + canonical `getApiBaseUrl()` + contract test | Hand-maintained spec drifts; typed client alone doesn't solve URL composition bug | council amendment #7 |
| Legacy archival | `archive/v1-legacy` git branch + delete from main + CI import-guard test | In-tree `.legacy/` rots and gets dragged into Vite/TS build | council amendment #2 |
| Tests | node:test + tsx + Playwright; new contract/security tests | Existing infra works; security hardening needs new test surface | design-summary §Testing |
| Discovery | Perplexity + OpenRouter + Redis adapter spec verified in **Phase 0** | Design conflicts with published Perplexity 20-cap; verify before spec | council amendment #1 |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                  SignalMap Container                             │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │  nginx    │───▶│ Local Node   │───▶│  Collector loop      │   │
│  │  HTTP/2   │    │ API :46123   │    │  (background)        │   │
│  │  :8080    │    │ /api/health  │    │ Cloudflare Radar     │   │
│  │ /static   │    │ /api/bootstrap│   │ Provider status RSS  │   │
│  │ /api/*    │    │ /api/signal- │    │ Curated news RSS     │   │
│  │ buf-off   │    │   map/*      │    │ + classify + geo     │   │
│  │ X-Accel-  │    │ /api/signal- │    │ + LanceDB dedup      │   │
│  │ Buffering │    │   map/stream │    │                      │   │
│  │ no for    │    │ (SSE+replay) │    │                      │   │
│  │ /stream   │    │ /api/signal- │    │                      │   │
│  │           │    │  map/brief/* │    │                      │   │
│  └───────────┘    └──────┬───────┘    └──────────┬───────────┘   │
│                          │ ioredis (TCP RESP)    │               │
│                          ▼                       ▼               │
│                   ┌──────────────────────────────────┐           │
│                   │     Redis (durable store)        │           │
│                   │  signal events + SSE replay ring │           │
│                   │  brief cache + singleflight lock │           │
│                   │  daily LLM spend (atomic)        │           │
│                   └──────────────────────────────────┘           │
│                   ┌──────────────────────────────────┐           │
│                   │     LanceDB (filesystem)         │           │
│                   │  related-story embeddings        │           │
│                   └──────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
       ▲                              ▲                  ▲
       │ HTTPS                        │ HTTPS            │ HTTPS
       ▼                              ▼                  ▼
   Browser (Preact)            OpenRouter         Perplexity Sonar Pro
   `@preact/signals`           (synthesis)        (allowlist ≤20
   `openapi-fetch`                                + cite-revalidation)
```

### Target file structure

```
src/
  main.tsx                           # Preact root, renders <App/>
  app.tsx                            # Top-level layout grid composition
  components/
    chrome/
      CommandBar.tsx
      RadarStrip.tsx
      ProviderStrip.tsx
      BriefStrip.tsx
    rail/
      LeftRail.tsx
      CategoryToggle.tsx
      RegionPicker.tsx
      ProviderPicker.tsx
      MapControls.tsx
    feed/
      LiveFeed.tsx
      FeedCard.tsx
    inspector/
      Inspector.tsx
      WhyItMattersTab.tsx
    map/
      WorldMap.tsx
      MapMarker.tsx
      MapOverlays.tsx
  state/
    filters.ts                       # query/timeRange/categories signals
    watchlist.ts                     # regions/providers signals + persist
    signals.ts                       # collected signal events (read-only from API)
    brief.ts                         # global + per-event brief state
    sse.ts                           # EventSource wrapper + reconnect
  client/
    openapi.ts                       # createClient<paths>({baseUrl})
    base-url.ts                      # canonical getApiBaseUrl() + normalization
  styles/
    tokens.css                       # ported from mockup
    components.css                   # ported from mockup
  fixtures/                          # vite middleware fixtures for dev
server/
  api/
    index.ts                         # entrypoint, mounts routes
    routes/
      health.ts
      bootstrap.ts
      signalmap-list.ts
      signalmap-event.ts
      signalmap-source-health.ts
      signalmap-stream.ts            # SSE
      signalmap-brief-global.ts
      signalmap-brief-event.ts
    schemas/                         # zod-openapi route schemas
      signalmap.ts
      common.ts
    openapi.ts                       # generates public/openapi.yaml at build
  lib/
    redis.ts                         # ioredis adapter
    spend-reservation.ts
    singleflight.ts
    sse-replay-ring.ts
    perplexity.ts
    openrouter.ts
    citation-validator.ts
    rate-limit.ts
scripts/
  news-collector.mjs                 # renamed from signalmap-news-collector
  lancedb-store.mjs                  # renamed
  openrouter-parser.mjs              # renamed
  no-archive-imports.mjs             # CI guard (Phase 9)
public/
  openapi.yaml                       # generated at build (do not hand-edit)
  topojson/
    world-110m.json                  # checked-in TopoJSON world atlas
docker/
  Dockerfile                         # renamed from Dockerfile.signalmap
  nginx.conf                         # HTTP/2 + SSE-specific location
  supervisord.conf
  entrypoint.sh
docker-compose.yml                   # renamed from docker-compose.signalmap.yml
                                     # 2 services: signalmap + redis
                                     # NO redis-rest
```

### Generated artifacts (Phase 3)
- `public/openapi.yaml` — generated at build by `npm run build:openapi` from `server/api/schemas/`
- `src/client/types.ts` — `openapi-typescript`-generated TS types from the spec
- Both are committed; CI verifies they match the source schemas.

## Config Schema (env vars)

```bash
# Required for collector + brief
OPENROUTER_API_KEY=sk-or-...

# Required for global brief context (per-event brief degrades without it)
PERPLEXITY_API_KEY=pplx-...

# Container & networking
SIGNALMAP_PORT=3000                  # host port → container 8080
LOCAL_API_PORT=46123

# Redis
REDIS_URL=redis://signalmap-redis:6379
REDIS_PASSWORD=                      # optional

# Storage
SIGNALMAP_DATA_DIR=/data/signalmap
SIGNALMAP_LANCEDB_URI=/data/signalmap/lancedb
TRANSFORMERS_CACHE=/data/signalmap/models
HF_HOME=/data/signalmap/models

# Collector cadence
SIGNALMAP_RSS_POLL_MINUTES=15
SIGNALMAP_VECTOR_ENABLED=true
CLOUDFLARE_API_TOKEN=

# LLM brief — single-pass Sonnet 4.6, server cron writes
SIGNALMAP_BRIEF_MODEL=anthropic/claude-sonnet-4.6
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
PERPLEXITY_MODEL=sonar-pro
SIGNALMAP_BRIEF_REFRESH_MINUTES=30
SIGNALMAP_DAILY_LLM_BUDGET_USD=2.00
SIGNALMAP_BRIEF_PER_EVENT_LOCK_TIMEOUT_SECONDS=30
SIGNALMAP_BRIEF_PER_EVENT_STAMPEDE_POLL_MS=200
SIGNALMAP_BRIEF_PER_EVENT_RATE_LIMIT_PER_MIN=20
SIGNALMAP_ADMIN_TOKEN=                    # required to use manual "Refresh now" button
SIGNALMAP_DAILY_LLM_BUDGET_USD=5.00
SIGNALMAP_BRIEF_RATE_LIMIT_PER_MIN=10
SIGNALMAP_BRIEF_RATE_LIMIT_PER_DAY=100
SIGNALMAP_BRIEF_REFRESH_MINUTES=30
SIGNALMAP_BRIEF_LOCK_TIMEOUT_SECONDS=30
SIGNALMAP_BRIEF_STAMPEDE_POLL_MS=200
SIGNALMAP_NEWS_DOMAIN_ALLOWLIST=     # ≤20 domains; bundled default if unset

# SSE
SSE_HEARTBEAT_SECONDS=20
SSE_REPLAY_RING_SIZE=1000
SSE_REPLAY_RING_TTL_SECONDS=600
SSE_RECONNECT_RETRY_MIN_MS=5000
SSE_RECONNECT_RETRY_MAX_MS=15000

# Logging
LOG_LEVEL=info
```

## Integration Discovery Findings (Phase 0 — required before further phases)

| Integration | Verification | Output |
|-------------|--------------|--------|
| Perplexity Sonar Pro | `curl -X POST https://api.perplexity.ai/chat/completions -H "Authorization: Bearer $PERPLEXITY_API_KEY" -H "Content-Type: application/json" -d @docs/SignalMap/_discovery/perplexity-probe.json` | Confirm: `search_domain_filter` accepts ≤20 domains; `search_recency_filter` syntax; response shape includes `citations[]`; pricing model docs |
| OpenRouter slugs | `curl https://openrouter.ai/api/v1/models -H "Authorization: Bearer $OPENROUTER_API_KEY" \| jq '.data[] \| select(.id | test("nemotron\|kimi\|deepseek\|gemini-2.0-flash"))'` | Confirm exact slug strings for the fallback chain; document any deprecations |
| Redis adapter contract | Design `src/server/lib/redis.ts` interface (`getJson`, `setJsonEx`, `pipeline`, `setNx`, `incrByFloat`, `subscribe`); write fixture tests against `redis:7-alpine` Docker container | Adapter signature locked; ioredis behavior matches expectations |

If any verification fails, halt Phase 0 and revisit the design summary.

## Core Behavior

1. Browser opens `http://localhost:3000` → nginx serves `index.html` → Preact renders `<App/>`.
2. `App` mounts `CommandBar`, `RadarStrip`, `ProviderStrip`, `BriefStrip`, `LeftRail`, `WorldMap`, `LiveFeed`, `Inspector`.
3. `state/sse.ts` opens `EventSource('/api/signalmap/stream')` (auto-reconnects with server-sent `retry:`).
4. Initial `bootstrap` HTTP call hydrates filter defaults, source health, last 24h signal count.
5. SSE pushes per-event updates; `signals.ts` accumulates into a Map keyed by event ID.
6. User toggles categories/regions/providers in `LeftRail` → signals re-filter reactively → `WorldMap` markers + `LiveFeed` cards re-render.
7. `WorldMap` renders SVG TopoJSON base + d3-geo equirectangular projection + d3-zoom transform group. Markers receive 44px invisible touch hit areas.
8. User clicks marker → `selectedEventId` signal flips → `Inspector` opens, fetches event detail via `openapi-fetch`.
9. User clicks "Why this matters" tab in `Inspector` → calls `POST /api/signalmap/brief/event/:id` → server checks cache → on miss, runs synthesis with the event + LanceDB-related stories → returns `{ whyItMatters, model, generatedAt }`.
10. Every 30 min (or on user "Refresh"), `BriefStrip` calls `POST /api/signalmap/brief/global` with current filter signature → server runs cache→singleflight→spend reservation→Perplexity→citation revalidation→OpenRouter (with XML-wrapped context)→schema validation→cache write.
11. Collector loop (background) polls RSS sources every 15 min, classifies via OpenRouter, geolocates, dedupes via LanceDB, writes events to Redis. SSE handler subscribes to a Redis pub/sub channel and pushes deltas to connected browsers.

## Metrics / Outputs

| Metric | Type | Source | Notes |
|--------|------|--------|-------|
| `signalmap.collector.events_emitted` | counter | collector | Per-source breakdown |
| `signalmap.collector.errors` | counter | collector | Per-source breakdown |
| `signalmap.collector.last_success_ts` | gauge | collector | Per source |
| `signalmap.brief.calls` | counter | brief endpoint | tagged by flavor (global / per-event) |
| `signalmap.brief.cache_hits` | counter | brief endpoint | |
| `signalmap.brief.lock_contention` | counter | brief endpoint | stampede polling triggered |
| `signalmap.brief.budget_refusals` | counter | brief endpoint | spend reservation rejected |
| `signalmap.brief.citations_dropped` | counter | brief endpoint | citations outside allowlist |
| `signalmap.brief.tokens_input` | gauge | brief endpoint | per call (estimated + actual) |
| `signalmap.brief.tokens_output` | gauge | brief endpoint | |
| `signalmap.brief.cost_usd` | gauge | brief endpoint | per call (estimated + actual) |
| `signalmap.sse.connected_clients` | gauge | SSE handler | |
| `signalmap.sse.replay_evictions` | counter | replay ring | |
| `signalmap.redis.connection_state` | gauge | adapter | 0=down, 1=connected |

All emitted as one JSON object per stdout line (Pino-style), level via `LOG_LEVEL`.

## Error Handling

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| Cloudflare Radar 5xx | Collector logs, exponential backoff (1s/5s/30s), source health → `degraded` | UI source-health chip in CommandBar |
| Cloudflare Radar 401 | Source health → `unauthorized`, log once/hour, continue other sources | Manual token refresh |
| RSS feed 4xx/timeout | Per-source: log, source health → `stale`, retry next cycle | Auto-recovery on next poll |
| OpenRouter draft model (Nemotron) 429/5xx | No fallback chain in v1 — return `503 { disabled: true, reason: "draft_model_unavailable", model: "nvidia/nemotron-3-super-120b-a12b" }` → UI hides brief | If recurring: add a fallback model to `SIGNALMAP_BRIEF_DRAFT_MODEL` (Phase-2 candidate) |
| OpenRouter moderator model (Gemini 3.1 Pro) 429/5xx | Return Nemotron's draft directly with `moderationSkipped: true` warning in brief metadata; UI shows a small "polish unavailable" indicator but the brief still renders | Auto-recovery on next refresh cycle |
| Perplexity 429/5xx | Brief retrieval falls back to local-signals-only synthesis | Note in brief output: "External context unavailable" |
| Perplexity returns citation outside allowlist | Drop citation, log `dropped_citation`, continue with valid citations | If 100% dropped: treat as Perplexity 429 |
| Synthesis output fails zod schema | Walk fallback chain | If all fail schema: `502 { reason: "synthesis_unparseable" }` |
| Daily budget exceeded (atomic) | `503 { disabled: true, reason: "budget_exhausted", resets_at }` | UI shows "Daily brief budget reached" |
| Cache stampede (lock contention) | Secondary requests poll cache every `SIGNALMAP_BRIEF_STAMPEDE_POLL_MS` | Timeout 30s → `503 { reason: "stampede_timeout" }` |
| Per-IP rate limit | `429 { retry_after_seconds }` | UI grey-out Refresh button + toast |
| Redis connection lost | Collector buffers in-memory (5-min cap); API endpoints `503 { reason: "store_unavailable" }`; SSE clients reconnect | Auto-recovery on Redis return |
| LanceDB unavailable | Skip related-story dedup (warn log); per-event brief omits "related stories" context | Synthesis still works |
| SSE Last-Event-ID evicted from ring | `204 X-Replay-Lost: true` | UI shows "Reconnecting from latest" briefly |
| SSE backend graceful shutdown | Send `event: shutdown\nretry: <jittered ms>\n\n` | Clients reconnect with stagger |
| All collectors stale > 1h | Source health overall → `degraded` | CommandBar orange "Sources stale" indicator |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | `^6.0.7` (kept) | Build / dev server |
| `typescript` | `^5.7.2` (kept) | Type checker |
| `@biomejs/biome` | `^2.4.7` (kept) | Lint + format |
| `@playwright/test` | `^1.52.0` (kept) | E2E tests |
| `tsx` | `^4.21.0` (kept) | TS test runner |
| `cross-env` | `^10.1.0` (kept) | Env var helper for scripts |
| `preact` | `^10.25.4` (kept; promoted from incidental dep to primary UI runtime) | UI framework |
| `@preact/signals` | UNKNOWN — install latest in Phase 1 (~5KB) | Reactive state |
| `topojson-client` | `^3.1.0` (kept) | World atlas decoder |
| `d3-geo` | UNKNOWN — install latest in Phase 5 | Map projection |
| `d3-zoom` | UNKNOWN — install latest in Phase 5 | Pan/zoom |
| `ioredis` | UNKNOWN — install latest in Phase 2 | Redis client (TCP RESP) |
| `@lancedb/lancedb` | `^0.27.2` (kept) | Vector store |
| `@xenova/transformers` | `^2.17.2` (kept; collector-side only) | Embeddings for related-story dedup |
| `fast-xml-parser` | `^5.3.7` (kept) | RSS parsing |
| `yaml` | `^2.8.3` (kept) | OpenAPI YAML |
| `zod` | UNKNOWN — install latest in Phase 3 | Route schema validation |
| `zod-openapi` | UNKNOWN — install latest in Phase 3 | Code-first OpenAPI generation from zod schemas |
| `openapi-typescript` | UNKNOWN — install latest in Phase 3 (devDep) | TS types from generated spec |
| `openapi-fetch` | UNKNOWN — install latest in Phase 3 | Typed fetch client |

**To drop in Phase 9** (full kill list — 35+ deps): `@anthropic-ai/sdk`, `@aws-sdk/client-s3`, `@clerk/clerk-js`, all `@deck.gl/*` + `deck.gl`, `@dodopayments/convex`, `dodopayments-checkout`, `convex`, `convex-test`, `@vercel/analytics`, `@vercel/og`, `@sentry/browser`, `@upstash/redis`, `@upstash/ratelimit`, `canvas-confetti`, `dompurify`, `exceljs`, `globe.gl`, `hls.js`, `i18next`, `i18next-browser-languagedetector`, `jose`, `marked`, `papaparse`, `satellite.js`, `telegram`, `youtubei.js`, `maplibre-gl`, `pmtiles`, `@protomaps/basemaps`, `supercluster`, `h3-js`, `onnxruntime-web`, `@tauri-apps/cli`, `@bufbuild/buf`, `@edge-runtime/vm`, `vite-plugin-pwa` (no PWA in v1), `markdownlint-cli2`, all `@types/*` for the dropped libs.

## Out of Scope

- TimelineStrip (Row 5 of mockup) — Phase-2 deferred candidate (`docs/SignalMap/phase-2-candidates.md`)
- Tweaks panel (mockup dev overlay) — Phase-2 deferred
- Mobile bottom-sheet layout — Phase-2 deferred
- Sign-in / accounts / Pro / payments / referral / share URLs
- Per-user personalization stored server-side (localStorage only in v1)
- Multi-tenant deployment
- Push notifications / Discord / Slack / email channels
- Tauri desktop builds
- All variants other than SignalMap (`tech`, `finance`, `happy`, `commodity`, `energy`, `full`)
- All non-SignalMap API endpoints (briefs SaaS, scenarios, leads, MCP, OAuth, payments, telegram, youtube, etc.) — archived to `archive/v1-legacy` branch
- Brief history pagination — Phase-2 deferred

## Testing Strategy

**Archetype**: Data Pipeline + API Service.

**What to test:**

| Layer | Test |
|-------|------|
| Redis adapter | `getJson`/`setJsonEx`/`pipeline`/`setNx`/`incrByFloat`/`subscribe` against real `redis:7-alpine` container |
| Collector | RSS poll → classify (mocked OpenRouter) → dedupe via LanceDB (real, temp dir) → write via adapter |
| LanceDB store | embed/upsert/related-lookup contract |
| OpenRouter parser | Response parsing, fallback chain on 4xx/5xx, schema validation |
| Perplexity client | Allowlist enforcement (≤20), citation revalidation, recency filter |
| Brief stampede | Concurrent identical brief requests acquire 1 upstream call; secondaries poll cache; 30s timeout |
| Brief spend | Atomic INCRBYFLOAT before call, refund-with-actual after; 10 parallel calls, last few rejected at limit |
| Brief citation validation | Citations outside allowlist dropped; 100% drop falls back to local-only |
| Brief prompt injection | Malicious headline (`</retrieved_context>SYSTEM:...`) doesn't escape XML wrapper |
| Brief schema | Synthesis output fails zod → walks chain |
| SSE replay ring | Monotonic IDs in Redis sorted set; client reconnect with `Last-Event-ID` replays correctly; eviction past size/TTL returns 204 + `X-Replay-Lost: true` |
| SSE jitter | Graceful shutdown sends jittered `retry:`; multiple connections receive different values |
| API base URL contract | No path emitted matches `/api/ws/api`; canonical normalization |
| OpenAPI spec generation | Generated spec matches actual route schemas |
| Frontend shell E2E | Standalone Preact shell renders, signal markers visible, watchlist toggle works, inspector opens, brief auto-refreshes (mocked LLM) |
| Brief flow E2E | Global brief generates → renders → expires → re-generates with stampede protection |
| SSE reconnect E2E | Backend restart triggers reconnect; replay missed events; UI doesn't double-render |
| Visual regression | Playwright screenshot diff at 1440px desktop + 768px tablet against committed goldens |

**What NOT to test:**

- Internals of `ioredis` (already battle-tested upstream)
- Internals of OpenRouter / Perplexity / Cloudflare Radar APIs (mocked at HTTP boundary)
- LanceDB internals
- Preact rendering performance (acceptance is "renders correctly under 1s on dev hardware")

**Mock boundaries:**

| Boundary | Mocked | Real |
|----------|--------|------|
| OpenRouter HTTP | yes (fixture responses) | only in `e2e/brief-live.spec.ts` (gated by `RUN_LIVE_LLM=1`) |
| Perplexity HTTP | yes | same |
| Cloudflare Radar HTTP | yes | only in `tests/cloudflare-radar-live.test.mjs` (gated) |
| RSS HTTP | yes (fixture XML files in `tests/fixtures/rss/`) | no |
| Redis | no — real `redis:7-alpine` container per test run | n/a |
| LanceDB | no — temp dir per test | n/a |
| Local Node API | no — real | n/a |
| Browser | no — real Playwright | n/a |

**Critical path coverage targets:**

| Path | Min coverage |
|------|--------------|
| Brief endpoints (stampede, spend, citation, injection, schema) | 100% of branches |
| Redis adapter | 100% of public surface |
| SSE replay ring | 100% of branches (write, replay, eviction, shutdown) |
| API base URL composition | 100% of branches |
| Perplexity allowlist enforcement | 100% of branches |

## Implementation Order

### Phase 0 — Discovery & Inventory

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 0a Perplexity discovery | `docs/SignalMap/_discovery/perplexity-probe.json`, `docs/SignalMap/_discovery/perplexity-probe-result.md` | Curl Perplexity Sonar Pro with the JSON probe; capture response shape; verify `search_domain_filter` cap at 20; document recency syntax + pricing model | `curl ... \| tee perplexity-probe-result.md` then `node scripts/verify-perplexity-shape.mjs perplexity-probe-result.md` (script written this unit) | Hard-code response shape into source — only document |
| 0b OpenRouter slugs | `docs/SignalMap/_discovery/openrouter-models.json` | Pull `/api/v1/models`, filter for Nemotron/Kimi/DeepSeek/Gemini; commit verified slugs | `curl ... \| jq` snapshot + manual diff against `SIGNALMAP_LLM_MODELS` default | Use a slug we cannot find in this snapshot |
| 0c Redis adapter contract | `docs/SignalMap/_discovery/redis-adapter.md`, `src/server/lib/redis.types.ts` (interface only, no impl) | Define typed interface for `getJson`/`setJsonEx`/`pipeline`/`setNx`/`incrByFloat`/`subscribe`; write fixture test stubs in `tests/redis-adapter-contract.test.mjs` (skipped, awaiting impl in Phase 2) | `npm run typecheck:all` passes with the interface | Implement against `ioredis` yet — Phase 2 |
| 0d Import graph audit + kill list | `docs/SignalMap/legacy-inventory.md` | Use Grep to enumerate all files importing `SITE_VARIANT`, `UPSTASH_REDIS_REST_URL`, `@upstash/redis`, the dropped panels, the variant scripts; classify each as `keep` / `rename` / `archive` / `delete`. User signs the kill list at end of phase. | Manual review; verify with `npm run typecheck` against current main (no changes yet) | Move any file yet — only document |
| 0e Legacy panel docs | `docs/SignalMap/LegacyPanels.md` | Per-panel section: data sources, mount/dispose lifecycle, refresh cadence, watchlist coupling, error/empty states, dependencies, screenshot reference. Covers: NewsPanel, MarketPanel, InsightsPanel, StatusPanel, RegionalIntelligenceBoard, LiveNewsPanel, panel-layout, data-loader, event-handlers, settings-window, UnifiedSettings | None — doc-only | Skip any panel slated for archival |

**Phase 0 checkpoint:** `npm run typecheck:all` clean; all discovery artifacts committed; user has signed `legacy-inventory.md` kill list.

### Phase 1 — Minimal Standalone Entry

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 1a Preact deps + tsconfig | `package.json`, `tsconfig.json` | Add `@preact/signals`; promote `preact` to primary UI; update `tsconfig.json` to `"jsx": "preserve"`, `"jsxImportSource": "preact"`, add `"src/main.tsx"` to `include` | `npm install && npm run typecheck` | Touch existing variant code; install React |
| 1b New entry skeleton | `index.html` (NEW at repo root, distinct from current `index.html`), `src/main.tsx`, `src/app.tsx` | New `index.html` with single `<div id="root"></div>` and `<script type="module" src="/src/main.tsx">`; `main.tsx` does `render(<App/>, document.getElementById('root')!)`; `app.tsx` returns an empty grid scaffold per mockup | Manual: `npm run dev` opens an empty grid at localhost:3000 | Wire to data yet |
| 1c CSS tokens + styles | `src/styles/tokens.css`, `src/styles/components.css` | Copy verbatim from `docs/SignalMap/Claude_Design/tokens.css` and `styles.css`; import from `app.tsx` with `@layer tokens, components, utilities` | Manual: visual matches mockup empty state | Edit token values to match the existing app's palette |

**Phase 1 checkpoint:** `npm run dev` opens `localhost:3000` with the mockup's empty grid layout (header rows reserved, no content). Legacy build (`npm run build`) still succeeds.

### Phase 2 — Redis Adapter + Container Topology

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 2a ioredis adapter | `src/server/lib/redis.ts` (impl from `redis.types.ts`), `tests/redis-adapter.test.mjs` | Implement against `ioredis`; expose `getJson<T>`, `setJsonEx<T>`, `pipeline(commands)`, `setNx(key, value, ttl)`, `incrByFloat(key, delta)`, `subscribe(channel, handler)`; tests run against `redis:7-alpine` container | `docker run -d --name signalmap-test-redis -p 6380:6379 redis:7-alpine && REDIS_URL=redis://localhost:6380 npx tsx --test tests/redis-adapter.test.mjs` | Use `@upstash/redis` |
| 2b Migrate callers | `server/_shared/redis.ts`, `scripts/signalmap-news-collector.mjs`, `scripts/signalmap-lancedb-store.mjs`, `api/health.js`, `api/bootstrap.js` | Replace all `fetch(${url}/get/...)` calls with adapter usage; preserve key prefixes (`signalmap:`); leave Upstash REST envs unread | `npm run typecheck:all && npx tsx --test tests/news-collector.test.mjs tests/lancedb-store.test.mjs` | Change Redis key shapes |
| 2c Compose + Dockerfile | `docker-compose.signalmap.yml`, `docker/Dockerfile.signalmap`, `docker/supervisord.signalmap.conf` | Drop `redis-rest` service; remove `UPSTASH_REDIS_REST_URL`/`TOKEN` envs; remove `redis-rest-proxy.mjs` build step; pass `REDIS_URL` env to API process | `docker compose -f docker-compose.signalmap.yml config` (validates) | Rename files yet (Phase 8) |
| 2d nginx HTTP/2 + SSE config | `docker/nginx.conf` template | Add `listen 8080 http2;`; add `location /api/signalmap/stream { proxy_buffering off; proxy_cache off; proxy_set_header X-Accel-Buffering no; add_header Cache-Control "no-cache, no-transform"; proxy_read_timeout 1d; }`; verify other locations preserved | `docker compose up -d --build --force-recreate signalmap && curl --http2 -I http://localhost:3000/` shows `HTTP/2 200` | Touch CSP header (gone with the SaaS chrome) |
| 2e Health + acceptance | `api/health.js` | Extend health response: `{ ok, sources, lastEventAt, redis: 'ok'\|'down', sseReplayRingSize }`; Docker `HEALTHCHECK` checks Redis ping + critical source freshness | `docker compose up -d --build --force-recreate && sleep 10 && curl http://localhost:3000/api/health \| jq` | Mark non-critical source stale as unhealthy |

**Phase 2 checkpoint:** `docker compose -f docker-compose.signalmap.yml up -d --build --force-recreate` produces a healthy stack; collector writes via adapter; HTTP/2 negotiated.

### Phase 3 — API Contract + Client + SSE Replay

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 3a zod-openapi route schemas | `server/api/schemas/signalmap.ts`, `server/api/schemas/common.ts`, `server/api/openapi.ts` | Define request/response zod schemas for the 6 endpoints; `openapi.ts` exports `generateSpec()` returning OpenAPI 3.1 doc | `npx tsx --test tests/openapi-spec-generation.test.mjs` | Hand-write any OpenAPI YAML |
| 3b Generated types + client | `public/openapi.yaml` (generated), `src/client/types.ts` (generated), `src/client/openapi.ts`, `src/client/base-url.ts` | Add `npm run build:openapi` script (calls `openapi.ts.generateSpec()` → write YAML); add `npm run build:types` (calls `openapi-typescript public/openapi.yaml -o src/client/types.ts`); `openapi.ts` exports `client = createClient<paths>({ baseUrl: getApiBaseUrl() })`; `base-url.ts` exports canonical `getApiBaseUrl()` with explicit normalization (collapses double slashes, strips trailing) | `npm run build:openapi && npm run build:types && npm run typecheck:all` | Hand-edit `types.ts` or `openapi.yaml` |
| 3c API base URL contract test | `tests/api-base-url-contract.test.mjs` | Tests: every `paths` key lacks `/api/ws/api`; `getApiBaseUrl('/api/ws')` + every path = no `/api/ws/api`; normalization collapses `//`, strips trailing `/` | `npx tsx --test tests/api-base-url-contract.test.mjs` | Hard-code the doubled-prefix as a regex check (must verify behavior, not source) |
| 3d SSE endpoint + replay ring | `server/api/routes/signalmap-stream.ts`, `src/server/lib/sse-replay-ring.ts` | Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay; subscribe to `signalmap:events` pubsub channel; heartbeat every `SSE_HEARTBEAT_SECONDS`; on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n` | `npx tsx --test tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs` | Use in-memory replay |
| 3e SSE tests | `tests/sse-replay-ring.test.mjs`, `tests/sse-stream.test.mjs` | Tests: monotonic ID generation, ring eviction past size+TTL, replay from `Last-Event-ID`, `204 X-Replay-Lost` when ID evicted, jittered shutdown retry, heartbeat cadence | Same command as 3d | Mock Redis (use real container) |

**Phase 3 checkpoint:** `npm run build:openapi && npm run build:types && npm run typecheck:all` clean; all 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green.

### Phase 4 — Frontend Shell against Mocked APIs

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 4a CommandBar + signal plumbing | `src/components/chrome/CommandBar.tsx`, `src/state/filters.ts` | `filters.ts` exports `query`, `timeRange`, `categories` signals with `persist()` to localStorage; CommandBar renders search input + time range buttons + source health pills; binds via `useSignal`/`useSignalEffect` | `npm run dev` shows working CommandBar; `npx playwright test e2e/command-bar.spec.ts` | Wire to data layer |
| 4b RadarStrip + ProviderStrip | `src/components/chrome/RadarStrip.tsx`, `src/components/chrome/ProviderStrip.tsx`, `src/state/signals.ts` | Both render counts derived from a mocked `signals` Map; ProviderStrip respects `watchlist.providers` | `npx playwright test e2e/strips.spec.ts` | Real API call |
| 4c LeftRail | `src/components/rail/LeftRail.tsx`, `src/components/rail/CategoryToggle.tsx`, `src/components/rail/RegionPicker.tsx`, `src/components/rail/ProviderPicker.tsx`, `src/components/rail/MapControls.tsx`, `src/state/watchlist.ts` | Categories from mockup data; RegionPicker/ProviderPicker write to `watchlist` signals (persisted); MapControls writes to `mapControls` signals (cluster, confidence threshold, cables, datacenters) | `npx playwright test e2e/rail.spec.ts` | Real API call |
| 4d LiveFeed + Inspector + BriefStrip placeholders | `src/components/feed/LiveFeed.tsx`, `src/components/feed/FeedCard.tsx`, `src/components/inspector/Inspector.tsx`, `src/components/inspector/WhyItMattersTab.tsx`, `src/components/chrome/BriefStrip.tsx` | LiveFeed shows mocked event titles; Inspector opens on `selectedEventId` change with mocked event detail; WhyItMattersTab shows "Generate" button (no-op until Phase 6); BriefStrip shows "Loading..." placeholder | `npx playwright test e2e/feed.spec.ts e2e/inspector.spec.ts` | Implement brief generation logic |
| 4e Vite middleware fixtures + visible-data E2E | `src/fixtures/signalmap.ts`, `vite.config.ts` (add fixture middleware in dev), `e2e/signalmap.spec.ts` (rewritten) | Fixtures intercept `/api/signalmap/*` and `/api/bootstrap` with deterministic JSON; spec asserts: shell mounts, all rows visible, signals load, filters reactive, inspector opens | `npx playwright test e2e/signalmap.spec.ts` | Use the existing `vite.config.ts` proxies |

**Phase 4 checkpoint:** `npm run dev` opens `localhost:3000` with the standalone shell fully populated from fixtures; signals flow end-to-end; SSE updates animate in (with mocked stream).

### Phase 5 — SVG Map Renderer

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 5a Map skeleton + topojson | `src/components/map/WorldMap.tsx`, `src/components/map/MapMarker.tsx`, `public/topojson/world-110m.json`, `package.json` (add `d3-geo`, `d3-zoom`) | Load TopoJSON via `topojson-client.feature()`; render countries SVG path; use `d3-geo.geoEquirectangular()` (default) projection scaled to fit `viewBox` | `npx playwright test e2e/map-render.spec.ts` | Use mockup's naive `(lon+180)/360` math |
| 5b Zoom + viewport math | `src/components/map/WorldMap.tsx` | Wrap markers + base in single `<g transform>`; bind `d3-zoom` (`min=1`, `max=8`); compute scale/offset for non-2:1 containers (do not rely on `preserveAspectRatio="slice"` alone) | `npx playwright test e2e/map-zoom.spec.ts` (drag, pinch simulation) | Allow tooltip drift on resize |
| 5c Markers + halos + overlays + click | `src/components/map/MapMarker.tsx`, `src/components/map/MapOverlays.tsx`, `src/state/signals.ts` (extend) | Marker styles per category (outage, anomaly, provider, event) + severity; watchlist halos (region bbox stroke); corner overlays (active counts top-left, projection info top-right, legend bottom-left, live indicator bottom-right); click sets `selectedEventId`; each marker has 44px invisible `<rect>` hit area | `npx playwright test e2e/map-interaction.spec.ts` (touch tap test on tablet viewport) | Use `<circle>` alone for hit area |
| 5d Visual regression goldens | `e2e/visual.spec.ts`, `e2e/__screenshots__/` | Screenshots at 1440×900 (desktop) and 768×1024 (tablet); commit goldens; `playwright test --update-snapshots` for refresh | `npx playwright test e2e/visual.spec.ts` | Test on viewport sizes other than the two committed |

**Phase 5 checkpoint:** Visual regression passes on both viewports; touch-tap simulation hits markers reliably; SSE updates animate markers without jitter.

### Phase 6 — Brief Backend (with all hardening)

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 6a Perplexity client + allowlist + revalidation + prompt | `src/server/lib/perplexity.ts`, `src/server/lib/citation-validator.ts`, `tests/perplexity-brief.test.mjs`, `tests/brief-citation-validation.test.mjs` | `perplexity.ts` POSTs to Sonar Pro with `search_domain_filter` (≤20), `search_recency_filter`, the strong system prompt; `citation-validator.ts` parses returned `citations[]`, drops URLs not in allowlist; if 100% dropped, return `{ degraded: true }` | `npx tsx --test tests/perplexity-brief.test.mjs tests/brief-citation-validation.test.mjs` | Send >20 domains in a single call |
| 6b OpenRouter 2-pass + XML wrap + schema | `src/server/lib/openrouter.ts`, `src/server/lib/brief-pipeline.ts`, `tests/brief-prompt-injection.test.mjs`, `tests/brief-pipeline.test.mjs` | `openrouter.ts` exposes a generic `chat(model, messages)` call. `brief-pipeline.ts` orchestrates the 2-pass: (1) call `SIGNALMAP_BRIEF_DRAFT_MODEL` (Nemotron) with synth prompt wrapping Perplexity output in `<retrieved_context>...</retrieved_context>`; (2) call `SIGNALMAP_BRIEF_MODERATOR_MODEL` (Gemini 3.1 Pro) with moderation prompt wrapping Nemotron's draft in `<draft>...</draft>` and the original `<retrieved_context>` (so moderator can verify draft against sources). Both outputs validated against zod schema. Final brief object: `{ bullets: string[], generatedAt, draftModel, moderatorModel, draftRaw, moderationSkipped: false, warnings: string[] }`. Injection test feeds malicious headline at BOTH boundaries (Perplexity → draft, draft → moderator) and asserts schema rejects or wrap remains intact at each stage. If moderator fails, return draft directly with `moderationSkipped: true`. | `npx tsx --test tests/brief-prompt-injection.test.mjs tests/brief-pipeline.test.mjs` | Pass raw text without XML wrap; skip schema validation on draft (validate at every stage) |
| 6c Spend reservation + per-event singleflight + per-event rate limit | `src/server/lib/spend-reservation.ts`, `src/server/lib/singleflight.ts`, `src/server/lib/rate-limit.ts`, `tests/brief-spend-reservation.test.mjs`, `tests/brief-per-event-stampede.test.mjs` | `spend-reservation.ts`: atomic `INCRBYFLOAT signalmap:llm:spend:YYYY-MM-DD <est_cost>`; if total > budget, decrement back and return `false`; on success refund usage-based delta. **Used by both the cron (global brief) AND per-event endpoint** — both must respect daily budget. `singleflight.ts`: `setNx(lock_key, pid, ttl)`; **only used by per-event brief endpoint** (multi-user click stampede possible on a fresh event). Global brief has no singleflight — cron is sole writer. `rate-limit.ts`: per-IP `INCR signalmap:rl:event:<ip>:<minute>` with `EXPIRE 60`; **only on per-event brief endpoint** (global brief reads are cache hits, no need). | `npx tsx --test tests/brief-spend-reservation.test.mjs tests/brief-per-event-stampede.test.mjs` | Apply singleflight or rate-limit to global brief (it's a cache read) |
| 6d Brief endpoints + cron job + admin refresh | `server/api/routes/signalmap-brief-global.ts` (read-only cache lookup), `server/api/routes/signalmap-brief-event.ts` (on-demand with singleflight), `server/api/routes/signalmap-brief-health.ts` (operator visibility), `server/api/routes/signalmap-brief-refresh.ts` (admin-token-gated manual trigger), `scripts/brief-cron.mjs` (background job), `docker/supervisord.signalmap.conf` (add brief-cron program), `tests/brief-endpoints.test.mjs`, `tests/brief-cron.test.mjs` | **Global brief endpoint**: 3-line handler reading `signalmap:brief:global` from Redis, returning JSON. No LLM call ever from this path. **Per-event endpoint**: cache-check → singleflight → spend-reserve → OpenRouter (XML-wrapped synthesis with event + 3 LanceDB-related stories) → schema validation → cache write (forever per event ID). **Health endpoint**: returns `{ lastGeneratedAt, nextScheduledAt, dailySpendUsd, dailyBudgetUsd, modelInUse }`. **Manual refresh endpoint**: requires `X-SignalMap-Admin-Token` header matching `SIGNALMAP_ADMIN_TOKEN` env; triggers immediate brief regen, still respects budget. **Brief cron**: separate Node process (started by supervisord), loops every `SIGNALMAP_BRIEF_REFRESH_MINUTES`, calls Perplexity → citation revalidation → Sonnet 4.6 → spend reservation → write to `signalmap:brief:global` (no TTL, overwrite-in-place) → publish `signalmap:brief:updated` pubsub event for SSE. | `npx tsx --test tests/brief-endpoints.test.mjs tests/brief-cron.test.mjs` | Build a request-driven generation path on the global endpoint |
| 6e UI BriefStrip + WhyItMatters tab + brief E2E | `src/components/chrome/BriefStrip.tsx` (read-only cached brief renderer), `src/components/inspector/WhyItMattersTab.tsx` (on-demand generation), `src/state/brief.ts`, `e2e/brief-flow.spec.ts` | BriefStrip is a thin reader: fetches `/api/signalmap/brief/global` once on mount, then subscribes to SSE `brief-updated` events to swap in fresh content (no client-side timer). Renders: bullets + "Updated 4m ago" indicator + "Sources: Reuters, FT, …" + watchlist-match emphasis (client-side: bold any bullet text whose entity matches user's localStorage watchlist). Manual "Refresh now" button visible only if `localStorage.signalmap_admin_token` is set; calls `/api/signalmap/brief/refresh` with that token in `X-SignalMap-Admin-Token` header. WhyItMattersTab fires on user click → POST `/api/signalmap/brief/event/:id`. Brief E2E asserts: cron runs and SSE pushes update; manual refresh works with token, fails without; per-event 10 parallel clicks → 1 upstream call. | `npx playwright test e2e/brief-flow.spec.ts` | Add a client-side polling timer (SSE-only) |

**Phase 6 checkpoint:** Brief generates against real Perplexity + OpenRouter (or mocked in CI); concurrent stampede produces 1 upstream call; budget refusal works; injection attempt fails schema; citations validated.

### Phase 7 — Strip Variant System

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 7a Delete variant.ts + consumers | `src/config/variant.ts` (DELETE), all `SITE_VARIANT` consumers (per Phase 0d audit), `src/utils/sync-keys.ts`, `src/utils/settings-persistence.ts`, `src/services/runtime.ts` (variant-conditional branches) | Delete or rewrite each consumer to assume single product; touch only files surfaced in 0d audit | `npm run typecheck:all` | Leave dead `if (variant === ...)` branches |
| 7b Drop variant scripts + tests | `package.json` (remove `dev:tech`, `dev:finance`, `build:tech`, etc.), `tests/runtime-env-guards.test.mjs` (rewrite without variant assertions), `e2e/signalmap.spec.ts` (already rewritten in 4e — verify clean) | Remove every `cross-env VITE_VARIANT=...` invocation | `npm run test:data && npx playwright test` | Remove `cross-env` itself (still useful) |
| 7c Variant-locked entry assertion | `tests/no-variant-imports.test.mjs` (NEW) | Grep test asserting no source file imports `variant.ts` or references `SITE_VARIANT` or `VITE_VARIANT` | `npx tsx --test tests/no-variant-imports.test.mjs` | Allow exceptions |

**Phase 7 checkpoint:** Single-bundle build; no variant code remains; all tests pass.

### Phase 8 — Minimal Rename

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 8a UI-facing rename | `src/components/SignalMap*.ts` (already gone — replaced by Phase 4 files), Docker `Dockerfile.signalmap` → `Dockerfile`, `docker-compose.signalmap.yml` → `docker-compose.yml`, `signalmap-entrypoint.sh` → `entrypoint.sh`, `supervisord.signalmap.conf` → `supervisord.conf` | `git mv` so blame survives; update all references | `git status` clean of stragglers; `docker compose build` works | Touch `signalmap:` Redis key prefixes; touch `/api/signalmap/*` URL paths |
| 8b Image + compose project rename | `package.json` (`"name": "signalmap"` from `"world-monitor"`), Docker image tag `worldmonitor-signalmap:latest` → `signalmap:latest`, compose project name; README + deployment docs updated | Update env var references in docs; bump version to `3.0.0` (major: breaking deploy contract) | `docker compose -f docker-compose.yml up -d --build --force-recreate` produces `signalmap:latest` and works | Rename collector script env keys (`SIGNALMAP_*` env vars stay) |

**Phase 8 checkpoint:** `docker compose up -d --build --force-recreate` produces `signalmap:latest` image and a working stack at `localhost:3000`.

### Phase 9 — Archive Legacy + Phase-2 Backlog

| Unit | Files | Directives | Test Command | DO NOT |
|------|-------|------------|--------------|--------|
| 9a Push archive branch + delete from main | git operations; `git checkout -b archive/v1-legacy && git push origin archive/v1-legacy && git checkout main && git rm -r <archived paths from kill list>` | Archived paths from `legacy-inventory.md`: all non-SignalMap `src/components/*.ts`, `src/services/*` (non-signalmap), `src/app/*` (panel-layout/data-loader/event-handlers), all `api/*.ts` and `api/*.js` except kept (`health`, `bootstrap`, signalmap routes), `src-tauri/`, `blog-site/`, `pro-test/`, `docs/Docs_To_Review/` (already deleted in git status) | `npm run typecheck:all && npm run test:data` after delete | Force-push archive branch (preserve full history) |
| 9b CI import-guard test | `scripts/no-archive-imports.mjs`, `.github/workflows/ci.yml` (extended) | Script: clone `archive/v1-legacy`, list its file paths, grep current `src/` and `server/` for any imports matching those paths; fail if any | `node scripts/no-archive-imports.mjs` | Skip CI integration |
| 9c Drop unused deps + scripts + workflows | `package.json` (remove all listed in spec §Dependencies "to drop"), `scripts/` (delete `desktop-package.mjs`, `build-sidecar-*.mjs`, etc.), `.github/workflows/` (remove `build-desktop.yml`, `test-linux-app.yml`, variant matrix workflows) | Target ~15 production deps; clean lockfile via `rm package-lock.json && npm install` | Remove biome / playwright / tsx / typescript / vite (all kept) |
| 9d Final acceptance + Phase-2 backlog | `docs/SignalMap/phase-2-candidates.md` (NEW), `docs/SignalMap/PROGRESS.md` (mark complete) | Acceptance: `docker compose up -d --build --force-recreate` from clean state produces working stack; full E2E + visual regression green; manual smoke at `localhost:3000` confirms all panels working with live (or mocked) data. Phase-2 backlog documents: TimelineStrip, Tweaks overlay, mobile, brief history, embeddable widget mode | `npm run test:data && npx playwright test && docker compose up -d --build --force-recreate && curl http://localhost:3000/api/health \| jq` | Ship without final smoke at `localhost:3000` |

**Phase 9 checkpoint (FINAL):** Repo passes all gates; `package.json` ≤20 deps; `docker compose up -d --build --force-recreate` from clean state works; archive branch verifiable via `git log archive/v1-legacy`; main has no `.legacy/` paths; `docs/SignalMap/phase-2-candidates.md` exists.

---

## Quality Gates Summary

| Phase | Gate Command | Pass Criteria |
|-------|--------------|---------------|
| 0 | `npm run typecheck:all && ls docs/SignalMap/_discovery/ docs/SignalMap/legacy-inventory.md docs/SignalMap/LegacyPanels.md` | Discovery artifacts exist; user signed kill list |
| 1 | `npm run typecheck:all && npm run dev` (manual smoke) | Empty grid renders at localhost:3000 |
| 2 | `docker compose -f docker-compose.signalmap.yml up -d --build --force-recreate && sleep 10 && curl --http2 -I http://localhost:3000/ && curl http://localhost:3000/api/health \| jq '.redis'` | HTTP/2 + Redis adapter operational |
| 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` | All contract + SSE tests pass |
| 4 | `npx playwright test e2e/signalmap.spec.ts` | Standalone shell renders fully from fixtures |
| 5 | `npx playwright test e2e/visual.spec.ts e2e/map-interaction.spec.ts` | Visual regression + touch interaction pass |
| 6 | `npx tsx --test tests/perplexity-brief.test.mjs tests/brief-stampede.test.mjs tests/brief-spend-reservation.test.mjs tests/brief-citation-validation.test.mjs tests/brief-prompt-injection.test.mjs tests/brief-endpoints.test.mjs && npx playwright test e2e/brief-flow.spec.ts` | All brief hardening tests pass |
| 7 | `npm run typecheck:all && npm run test:data && npx playwright test && npx tsx --test tests/no-variant-imports.test.mjs` | Variant system fully removed |
| 8 | `docker compose -f docker-compose.yml up -d --build --force-recreate && sleep 10 && curl http://localhost:3000/api/health \| jq` | Renamed stack works |
| 9 | `npm run typecheck:all && npm run test:data && npx playwright test && node scripts/no-archive-imports.mjs && docker compose up -d --build --force-recreate` | Full acceptance |

Each phase ends with a Foreman clean-context checkpoint review (Codex CLI + Gemini CLI per protocol).
