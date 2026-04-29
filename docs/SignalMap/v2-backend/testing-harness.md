---
project: SignalMap v2 — Backend (Phase 2 of overall product)
artifact: testing-harness
audience: implementor (foreman pitboss-implementor, Opus, fresh session)
input: docs/SignalMap/v2-backend/spec.md
date: 2026-04-29
---

# SignalMap v2 Backend — Testing Harness

## Archetype

**Data Pipeline + API Service.** Same as Phase 6 (brief backend), now extended to cover the worker layer (collector + cron) and the composition layer (compose stack, nginx proxy, two-image deployment).

The pipeline shape:
```
RSS / Cloudflare Radar feeds  →  collector (15-min poll)  →  Redis events list  →  api  →  UI
                                                          ↘  LanceDB (dedup)
                                                          ↘  SSE channel  →  api SSE stream  →  UI EventSource
                                          cron (30-min)  →  Perplexity  →  OpenRouter  →  Redis brief  →  api  →  UI
```

The API service shape:
```
8 routes on bare node:http  →  router  →  handlers  →  Redis (read primarily, write rarely)
```

## Operator Questions

These shape the test strategy. Pre-filled where known, `UNKNOWN:` where they need an implementor decision.

| Question | Answer |
|----------|--------|
| What is the canonical CI command? | `npx playwright test` (fixture-mode, 58/58 from v1 + new tests added in this phase) |
| Does CI have access to real LLM keys? | **No.** Real keys only in staging / local-dev with `RUN_LIVE_LLM=1` opt-in. |
| Does CI have access to a real Redis? | **Yes** — spin up `redis:7-alpine` as a service container. |
| Does CI have access to LanceDB? | **Yes** — embedded native binding, in-process, runs everywhere. |
| What's the smoke command after `docker compose up`? | `docker compose ps --filter health=healthy` shows 5/5; `curl http://localhost:8080/api/signalmap/health \| jq '.brief.status'` returns `"ok"` after first cron tick. |
| Where do live-mode e2e tests run? | Staging environment with the full compose stack up and real `.env`. Triggered manually with `RUN_LIVE_E2E=1`; never in CI. |
| What test framework? | `node:test` via `tsx` for unit/integration (matches Phase 6 convention). Playwright for e2e. |
| What's the test discovery pattern? | `npx tsx --test tests/*.test.mjs tests/*.test.mts` (existing pattern from `package.json` `test:data` script). |

## Test Tiers

### Tier 1 — Unit (per-unit checkpoint)

**What it tests:** Single module behaviour. Pure functions, isolated modules, mock all I/O.

**How to run:** `npx tsx --test tests/<unit>.test.mts` for the test file named in each unit's spec row.

**When to run:** Per-unit during implementation; per-phase as part of the gate command; full suite via `npm run test:data` before phase checkpoint.

**Examples:**
- `tests/api-router.test.mts` — router's path matching, method matching, param extraction.
- `tests/lease.test.mts` — Lua CAS atomic operations.
- `tests/api-health-route.test.mts` — strict-shape response, production redaction.
- `tests/logger.test.mts` — JSON serialization correctness, multi-line escape.

### Tier 2 — Mocked Integration (in-process, mock external)

**What it tests:** Multi-module behaviour with real local services (Redis), mocked remote services (Perplexity, OpenRouter, RSS).

**How to run:** Same `npx tsx --test` runner. Tests start a real Redis client (running container or in-memory), inject canned LLM / RSS responses via fetch interceptors.

**When to run:** Per-phase as part of the gate command.

**Examples:**
- `tests/brief-pipeline-integration.test.mts` — real Redis, mocked Perplexity + OpenRouter, exercises `runBriefPipeline()` end-to-end.
- `tests/sse-replay-integration.test.mts` — real Redis, real `node:http` server, real `EventSource` polyfill client; covers replay + eviction.
- `tests/collector-redis-roundtrip.test.mts` — mocked RSS, real Redis, real LanceDB embedded; assert event lands in `signalmap:events:list` and dedup works on second run.
- `tests/cron-lease-twoinstance.test.mts` — spawn two cron processes against same Redis; second waits.

### Tier 3 — Real Integration (compose-up, mocked LLM only)

**What it tests:** Full stack composition. nginx proxy + signalmap-api + signalmap-collector + signalmap-cron + redis. LLM still mocked (CI doesn't burn credits).

**How to run:**
```
SIGNALMAP_BACKEND_MODE=fixture docker compose up -d --build --force-recreate
sleep 60
docker compose ps --filter health=healthy   # expect 5
curl http://localhost:8080/                  # 200
curl http://localhost:8080/api/signalmap/health | jq '.redis.status'  # "ok"
docker compose down -v
```

**When to run:** Phase 5 checkpoint, Phase 8 final acceptance.

### Tier 4 — Live (real LLM, staging)

**What it tests:** Real Perplexity + OpenRouter calls. Burns LLM credits. Validates that the spec's contract really matches what those services return.

**How to run:**
```
cp docker/signalmap-shared.env.example .env
# fill in real OPENROUTER_API_KEY, PERPLEXITY_API_KEY, SIGNALMAP_ADMIN_TOKEN
SIGNALMAP_BACKEND_MODE=live docker compose up -d --build --force-recreate
sleep 60
RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts
```

**When to run:** Phase 8a (manual). Never in CI.

**Cost guard:** Daily budget cap is `SIGNALMAP_DAILY_LLM_BUDGET_USD=2.00`. A single test run should cost <$0.10 (one global brief + 2-3 per-event briefs).

## Archetype-Specific Patterns

### A. Hermetic Server Pattern (for API tests)

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createServer } from '../server/api/index.ts';

test('GET /api/signalmap/list returns events from Redis', async () => {
  const { server, port, close } = await createServer({ port: 0 });  // 0 = OS-assigned
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/signalmap/list`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.events));
  } finally {
    await close();
  }
});
```

The api boots on a random port; client uses `fetch` against it; cleanup is guaranteed via `try/finally`.

### B. Fixture Replay Pattern (for LLM tests)

```typescript
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const PERPLEXITY_FIXTURE = JSON.parse(readFileSync('tests/fixtures/llm/perplexity-iraq-internet.json', 'utf-8'));
const OPENROUTER_FIXTURE = JSON.parse(readFileSync('tests/fixtures/llm/openrouter-sonnet-46-iraq.json', 'utf-8'));

const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('perplexity.ai')) return new Response(JSON.stringify(PERPLEXITY_FIXTURE), { status: 200 });
  if (u.includes('openrouter.ai')) return new Response(JSON.stringify(OPENROUTER_FIXTURE), { status: 200 });
  return origFetch(url, opts);
};

test('runBriefPipeline produces expected bullets', async () => {
  // ...
});

test.after(() => { globalThis.fetch = origFetch; });
```

Capture canned responses once (e.g. via a `RUN_LIVE_LLM=1 RECORD_FIXTURES=1` flag in the brief pipeline) and replay deterministically in CI.

### C. Two-Instance Lease Pattern (for singleton tests)

```typescript
import { spawn } from 'node:child_process';

test('cron lease prevents split-brain', async () => {
  const a = spawn('npx', ['tsx', 'server/workers/cron.ts'], { env: { ...process.env, SIGNALMAP_BRIEF_REFRESH_MINUTES: '1' } });
  await sleep(2000);  // a has acquired lease
  const b = spawn('npx', ['tsx', 'server/workers/cron.ts'], { env: { ...process.env, SIGNALMAP_BRIEF_REFRESH_MINUTES: '1' } });
  await sleep(2000);  // b should be polling

  // Verify only a has the lease
  const owner = await redis.get('signalmap:brief:cron:lease');
  assert.equal(owner, /* a's ownerId — captured via stdout */);

  a.kill('SIGTERM');
  await sleep(2000);  // a released, b should now have it
  const newOwner = await redis.get('signalmap:brief:cron:lease');
  assert.notEqual(newOwner, owner);

  b.kill('SIGTERM');
});
```

### D. Compose-Up Smoke Pattern (for Tier 3)

```bash
#!/usr/bin/env bash
set -euo pipefail

docker compose up -d --build --force-recreate
trap 'docker compose down -v' EXIT

# Wait for healthchecks
for i in {1..60}; do
  healthy=$(docker compose ps --filter health=healthy --format json | jq length)
  if [ "$healthy" = "5" ]; then break; fi
  sleep 1
done
[ "$healthy" = "5" ] || { echo "Not all services healthy"; docker compose ps; exit 1; }

# Smoke routes
curl -fsS http://localhost:8080/ > /dev/null
curl -fsS http://localhost:8080/api/signalmap/health | jq '.redis.status' | grep -q '"ok"'
curl -fsS http://localhost:8080/api/signalmap/list | jq '.events | length'

echo "Compose smoke passed"
```

## Quick Reference

| Action | Command |
|--------|---------|
| Run all unit tests | `npm run test:data` |
| Run a single test file | `npx tsx --test tests/<name>.test.mts` |
| Run Playwright (fixture, CI) | `npx playwright test` |
| Run Playwright (live, staging) | `RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts` |
| Spin up Redis for tests | `docker run -d --name redis-test -p 6379:6379 redis:7-alpine` |
| Reset all Redis state | `docker exec redis-test redis-cli FLUSHALL` |
| Bring up full stack (fixture LLM) | `SIGNALMAP_BACKEND_MODE=fixture docker compose up -d --build --force-recreate` |
| Bring up full stack (live LLM) | `SIGNALMAP_BACKEND_MODE=live docker compose up -d --build --force-recreate` (requires `.env`) |
| Tail api logs | `docker compose logs -f signalmap-api` |
| Tear down + clean volumes | `docker compose down -v` |

## Pre-Implementation Discovery

All central integrations were discovered before this spec. No discovery sub-phase is required during implementation:

| Integration | Discovery Status | Where validated |
|-------------|------------------|-----------------|
| Perplexity Sonar Pro | Done | Phase 0a probe + real-workflow brief 2026-04-26 |
| OpenRouter (Nemotron, Sonnet 4.6, Kimi, Gemini 3 Flash) | Done | Phase 0b model-slug verification |
| Cloudflare Radar | Done | Phase 0a probe |
| Provider status RSS feeds (Cloudflare, Okta, M365, Azure, Wasabi, OpenAI, Anthropic, AWS Lambda/RDS/S3) | Done | Source list locked in Phase 8 (this product); test fixtures captured in `tests/fixtures/signalmap/*` |
| GDELT | Done | Phase 0 inventory |
| Redis (ioredis) | Done | Phase 2 contract test |
| LanceDB (`@lancedb/lancedb`) | Done | Phase 2c-derived; musl binaries verified in `node_modules/@lancedb/lancedb/package.json:108-109` |

## Coverage Targets

| Surface | Target |
|---------|--------|
| `server/api/router.ts` | 100% line (small, easy to cover exhaustively) |
| `server/api/index.ts` | ≥80% line |
| `server/api/routes/*.ts` (kept + new) | ≥80% line; new routes must have shape + redaction tests |
| `server/workers/lease.ts` | 100% line (security-critical lease logic) |
| `server/workers/collector.ts` | ≥75% line; behavioural tests dominate (lease, heartbeat, SIGTERM) |
| `server/workers/cron.ts` | same as collector |
| `server/_shared/logger.ts` | 100% line |
| `src/server/lib/*` (kept) | already covered by Phase 6 + 6.5 tests; no new coverage required |
| `e2e/` (Playwright) | 58/58 fixture-mode pass remains the bar |
| `e2e-live/` (Playwright) | shape-only assertions; ≥6 tests covering the critical paths (feed renders, brief generates, health is OK, SSE updates) |

## Integration Test Seams

The places where bugs are most likely to hide:

1. **Lease handover during SIGTERM** — collector dies mid-tick, second instance takes over. Test 3a's "renew-by-non-owner-fails" is the canary.
2. **Strict-shape health response** — UI hard-codes 8 keys; if health adds/removes one without a UI sync, panel breaks. Tested via `HealthResponse.parse()` in 2d.
3. **Spend reservation race** — two concurrent per-event brief calls both pass `reserveSpend()` if the increment isn't atomic. Phase 6 already covered this with `incrByFloat` — confirm the existing test still applies.
4. **SSE replay across reconnect** — client passes `Last-Event-ID`; server replays from sorted-set ring. If ring is evicted, server returns `204 + X-Replay-Lost: true`. Phase 3 has 14 tests on this; ensure new wrapper code (`server/api/index.ts` mounting) doesn't break them.
5. **Production redaction** — `SIGNALMAP_BACKEND_MODE=live` must strip URIs / paths / key prefixes. Test 2d test #5 is the gate. Don't merge if it's missing.
6. **Compose volume permissions** — LanceDB writes to `/data/signalmap/lancedb`. The named volume must be writable by the appuser inside the container. Phase 5 healthcheck catches it indirectly; Phase 5d explicit check is `docker exec signalmap-collector touch /data/signalmap/lancedb/.write-test`.
