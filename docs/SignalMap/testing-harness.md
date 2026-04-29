---
project: SignalMap Standalone v2
artifact: testing-harness
date: 2026-04-26
input: docs/SignalMap/spec.md
---

# SignalMap Standalone v2 — Testing Harness

## Archetype

**Data Pipeline + API Service** — collector ingests external sources (RSS, Cloudflare Radar, provider status, OpenRouter classification, LanceDB embedding) → writes to Redis → API endpoints serve from Redis to a Preact frontend over HTTPS + SSE. Brief feature is a synchronous LLM workflow (Perplexity → OpenRouter) gated by atomic spend reservation, SETNX singleflight, and per-IP rate limit. Frontend has no own server-side state — purely a thin client over the API.

## Operator Questions

| Question | Answer |
|----------|--------|
| What runs the tests? | `node:test` via `tsx` for unit/integration; Playwright for E2E + visual regression |
| Where do test fixtures live? | `tests/fixtures/` (HTTP fixture JSON), `tests/fixtures/rss/` (RSS XML), `e2e/__screenshots__/` (visual goldens) |
| How do tests get a Redis instance? | Real `redis:7-alpine` Docker container, started per test run via `docker run -d --name signalmap-test-redis -p 6380:6379 redis:7-alpine`. Tear down via `docker rm -f signalmap-test-redis` |
| How do tests get a LanceDB? | Temp dir per test, cleaned in `afterEach` |
| Are external HTTP calls mocked? | Yes — `tests/utils/mock-http.mjs` intercepts `fetch` and routes to fixtures. Live calls only in `*-live.test.mjs` files (gated by env vars: `RUN_LIVE_LLM=1`, `RUN_LIVE_RADAR=1`, etc.) |
| How does CI know which tests to run? | `npm run test:data` for unit/integration; `npx playwright test` for E2E. CI runs both. Visual regression via `playwright test e2e/visual.spec.ts` |
| Where do Playwright snapshots live? | `e2e/__screenshots__/<spec-name>/<test-name>-<browser>.png` — committed to repo |
| Browser version pinned? | UNVERIFIED — Phase 5d locks Playwright Chromium version via `playwright.config.ts` `use.browserName` + project config |
| What's the smoke test post-deploy? | `curl http://localhost:3000/api/health \| jq` returns `{ ok: true, redis: "ok", sources: {...} }` |

## Test Tiers

### Tier 1 — Unit (pure functions, no I/O)

**What it tests:** algorithm correctness, no external systems.

**Files:**
- `tests/citation-validator.test.mjs` — URL allowlist matching, normalize, drop logic
- `tests/spend-estimate.test.mjs` — token-count estimation per model
- `tests/api-base-url-contract.test.mjs` — `getApiBaseUrl()` normalization (no I/O — pure string ops)
- `tests/no-variant-imports.test.mjs` — Phase 7 source-grep guard
- `tests/no-archive-imports.test.mjs` — Phase 9 source-grep guard

**How to run:** `npx tsx --test tests/<file>.test.mjs`

**When to run:** every commit; CI on every PR.

### Tier 2 — Integration with Mocked External (real Redis, real LanceDB, real Node API; mocked OpenRouter / Perplexity / Cloudflare / RSS)

**What it tests:** end-to-end flow within our process boundary.

**Files:**
- `tests/redis-adapter.test.mjs` — adapter contract against real Redis container
- `tests/sse-replay-ring.test.mjs` — write/replay/eviction; sorted set monotonic IDs
- `tests/sse-stream.test.mjs` — full SSE flow with mock client
- `tests/news-collector.test.mjs` — RSS fixture → mocked classify → real LanceDB → real Redis
- `tests/lancedb-store.test.mjs` — embed/upsert/related-lookup
- `tests/openrouter-parser.test.mjs` — mocked OpenRouter responses, fallback chain
- `tests/perplexity-brief.test.mjs` — mocked Sonar Pro response, allowlist enforcement
- `tests/brief-citation-validation.test.mjs` — citations outside allowlist dropped
- `tests/brief-prompt-injection.test.mjs` — XML wrap survives malicious headlines
- `tests/brief-stampede.test.mjs` — concurrent identical requests → 1 upstream call
- `tests/brief-spend-reservation.test.mjs` — atomic spend, refund, race
- `tests/brief-endpoints.test.mjs` — full route handlers with mocked LLMs
- `tests/openapi-spec-generation.test.mjs` — generated spec matches route schemas

**How to run:**
```bash
docker run -d --name signalmap-test-redis -p 6380:6379 redis:7-alpine
REDIS_URL=redis://localhost:6380 npx tsx --test tests/*.test.mjs
docker rm -f signalmap-test-redis
```

**When to run:** every commit; CI on every PR; per-phase gate.

### Tier 3 — Real External (gated by env)

**What it tests:** live integration sanity (cheap calls, no destructive ops).

**Files:**
- `tests/cloudflare-radar-live.test.mjs` — gated by `RUN_LIVE_RADAR=1` and `CLOUDFLARE_API_TOKEN`
- `tests/perplexity-live.test.mjs` — gated by `RUN_LIVE_LLM=1` and `PERPLEXITY_API_KEY`
- `tests/openrouter-live.test.mjs` — gated by `RUN_LIVE_LLM=1` and `OPENROUTER_API_KEY`

**How to run:**
```bash
RUN_LIVE_LLM=1 PERPLEXITY_API_KEY=... OPENROUTER_API_KEY=... npx tsx --test tests/perplexity-live.test.mjs tests/openrouter-live.test.mjs
```

**When to run:** developer manually before PR if touching brief endpoints; CI nightly only (cost guard).

### Tier 4 — End-to-End (Playwright in real browser)

**What it tests:** full user flows across the running stack.

**Files:**
- `e2e/signalmap.spec.ts` — shell mounts, all panels render from fixtures, signals load, watchlist toggle, inspector opens
- `e2e/command-bar.spec.ts` — search, time range, source health pills
- `e2e/strips.spec.ts` — Radar + Provider strip counts react to signal changes
- `e2e/rail.spec.ts` — category toggles, region/provider pickers, map controls
- `e2e/feed.spec.ts` — LiveFeed renders, click-to-inspect
- `e2e/inspector.spec.ts` — inspector opens, source/locations/tags rendered
- `e2e/map-render.spec.ts` — TopoJSON loads, projection works, markers placed correctly
- `e2e/map-zoom.spec.ts` — d3-zoom drag/pinch
- `e2e/map-interaction.spec.ts` — touch tap on tablet viewport hits 44px target
- `e2e/brief-flow.spec.ts` — global brief generates, renders, expires, re-generates with stampede protection (10 parallel tabs → 1 upstream)
- `e2e/sse-reconnect.spec.ts` — backend restart triggers reconnect, replays missed events, no double-render
- `e2e/visual.spec.ts` — screenshot diff at 1440×900 + 768×1024 vs committed goldens

**How to run:**
```bash
npm run dev &     # Vite dev server with fixture middleware
npx playwright test
```

**When to run:** every commit; CI on every PR; per-phase gate.

## Archetype-Specific Patterns

### Hermetic Server Pattern (HTTP tests)

For tests that exercise route handlers, spin up the server hermetically per test:

```js
import { startServer } from '../server/api/index.js'
let server, port
beforeEach(async () => {
  server = await startServer({ port: 0 })  // 0 = random
  port = server.address().port
})
afterEach(async () => {
  await server.close()
})
```

This avoids cross-test state leak via shared Express/Hono instances.

### Real Redis Per Test File

```js
import Redis from 'ioredis'
let redis
before(async () => {
  redis = new Redis('redis://localhost:6380')
  await redis.flushdb()
})
after(async () => {
  await redis.quit()
})
beforeEach(async () => {
  await redis.flushdb()  // reset between tests
})
```

### LanceDB Temp Dir Per Test

```js
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
let lanceDir
beforeEach(async () => {
  lanceDir = await mkdtemp(join(tmpdir(), 'signalmap-lance-'))
})
afterEach(async () => {
  await rm(lanceDir, { recursive: true, force: true })
})
```

### Mocked Fetch (HTTP boundary)

```js
import { mockHttp } from './utils/mock-http.mjs'
beforeEach(() => {
  mockHttp.reset()
  mockHttp.mock('https://api.perplexity.ai/chat/completions', { /* fixture response */ })
  mockHttp.mock('https://openrouter.ai/api/v1/chat/completions', { /* fixture */ })
})
```

The `mockHttp` helper monkey-patches global `fetch` for the test process. Real fetch restored in `afterEach`.

### SSE Client Helper (E2E)

```js
import { EventSource } from 'eventsource'  // node polyfill (devDep)
const es = new EventSource('http://localhost:3000/api/signalmap/stream')
const events = []
es.addEventListener('message', e => events.push(JSON.parse(e.data)))
// ... assertions ...
es.close()
```

### Visual Regression Pattern

```js
test('renders correctly at 1440px desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForSelector('[data-testid=signalmap-shell-mounted]')
  await expect(page).toHaveScreenshot('shell-1440x900.png', { maxDiffPixelRatio: 0.001 })
})
```

Animations disabled in `playwright.config.ts` via `use.reducedMotion: 'reduce'` to prevent flaky diffs.

## Quick Reference

### Run command (developer iteration)

```bash
# Quick: just unit + integration with real Redis
docker run -d --name signalmap-test-redis -p 6380:6379 redis:7-alpine
REDIS_URL=redis://localhost:6380 npm run test:data

# E2E (Vite dev server + Playwright)
npm run dev & PID=$!
npx playwright test
kill $PID

# Full CI gate
npm run typecheck:all && npm run test:data && npx playwright test
```

### Seed command (mock external sources for E2E manually)

Vite dev server middleware (in `vite.config.ts`) intercepts `/api/signalmap/*` and serves from `src/fixtures/`. No additional seed step needed.

For Phase 3+ when the real Node API is in play, point dev to local API:

```bash
LOCAL_API_PORT=46123 node server/api/index.ts &
VITE_API_BASE_URL=http://localhost:46123 npm run dev
```

### Reset command

```bash
# Wipe Redis test container
docker rm -f signalmap-test-redis

# Wipe Vite cache
rm -rf node_modules/.vite

# Wipe Playwright state
rm -rf playwright-report test-results
```

## Pre-Implementation Discovery (Phase 0)

Before any test in this harness can run end-to-end, Phase 0 must complete:

1. **Perplexity Sonar Pro shape** — `tests/perplexity-brief.test.mjs` mocks the response shape; the mock must match the real shape. Phase 0 unit `0a` captures the real shape via curl into `docs/SignalMap/_discovery/perplexity-probe-result.md`. Update the mock fixture in `tests/fixtures/perplexity-sonar-pro.json` to match.
2. **OpenRouter slug verification** — `tests/openrouter-parser.test.mjs` uses model slugs from `SIGNALMAP_LLM_MODELS`. Phase 0 unit `0b` confirms each slug exists in the live `models` listing.
3. **Redis adapter contract** — `tests/redis-adapter.test.mjs` is stubbed (skipped) until Phase 0 unit `0c` defines `src/server/lib/redis.types.ts`. Then Phase 2a fills in the implementation and unblocks the test.
4. **Legacy panel inventory** — `e2e/signalmap.spec.ts` rewrite in Phase 4e drops all assertions about legacy panels; the kill list from Phase 0 unit `0d` defines what's gone.

If any Phase 0 unit fails (e.g., Perplexity returns a schema we can't work with), halt and revisit the design summary before continuing.
