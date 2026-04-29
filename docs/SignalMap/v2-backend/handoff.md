---
project: SignalMap v2 — Backend (Phase 2 of overall product)
artifact: handoff
audience: implementor (foreman pitboss-implementor, Opus, fresh session)
input: docs/SignalMap/v2-backend/spec.md
date: 2026-04-29
---

# SignalMap v2 — Backend Implementor Handoff

## Project Overview

You're implementing the SignalMap v2 backend: three Node services (`api`, `collector`, `cron`) coordinated through Redis, fronted by the existing static UI image's nginx as a reverse proxy. The full spec is in [`spec.md`](./spec.md). The design rationale + Codex deliberation outcome is in [`design-summary.md`](./design-summary.md).

**Top-level goal:** Make the UI talk to a live backend. End state — `docker compose up -d --build --force-recreate` boots the full stack; the Health panel reflects real Redis / LanceDB / collector / cron / OpenRouter / Perplexity status; clicking Generate calls Perplexity + OpenRouter for real and returns event-specific bullets; the BriefStrip is the cron's most recent global synthesis; SSE pushes updates as events ingest and briefs regenerate.

## Before Starting

Read in this order:
1. [`spec.md`](./spec.md) — what to build, in what order, with what test commands.
2. This file — implementor rules, per-unit pitfalls, dependency context.
3. [`PROGRESS.md`](./PROGRESS.md) — your phase + unit pointer; check `next_up` before doing anything.

Then call `mcp__foreman__session_orient` to confirm the ledger position matches PROGRESS.md.

## Rules

1. **Ledger is authority.** Never trust your own memory of "what's done" — read `mcp__foreman__read_ledger` and `mcp__foreman__read_progress` at session start.
2. **One unit at a time.** Do not start unit `Nb` before unit `Na` is marked complete in the ledger.
3. **Tests before completion.** A unit is not complete until its test command passes. Update the ledger only after the test command exits 0.
4. **No scope additions.** If something looks wrong outside your unit's files, log it in PROGRESS.md "Error Recovery Log" and continue. Don't refactor opportunistically.
5. **Don't touch `src/server/lib/*`.** That is the shared library. Phase 6 + 6.5 already validated it. Treat as read-only.
6. **Don't touch the UI.** The 58 Playwright tests already pass; keeping them green is a constraint, not a goal. The new backend must not require any UI change to wire up — the UI fetches against `/api/*` paths that are already finalized.
7. **OpenAPI schemas are LOCKED.** The contract reconciliation was done before this spec was written (see `design-summary.md` § Pre-Spec Cleanup). Do not re-edit `server/api/schemas/signalmap.ts` unless adding a brand-new endpoint.
8. **No new dependencies.** Everything you need is in the post-Phase-9c `package.json`. If you genuinely need a new dep, STOP and escalate.
9. **No `--no-verify`, no `--force` push.**
10. **For destructive ops** (rm of legacy paths, dropping deps): commit smaller chunks so revert is cheap.
11. **Production redaction in `/health` is non-negotiable.** Never expose Redis URI, LanceDB filesystem path, or LLM key prefixes in a `SIGNALMAP_BACKEND_MODE=live` response. Test in 2d covers this.
12. **Singleton lease is non-negotiable for cron + collector.** Two cron processes silently overwriting each other is a Phase 6 documented hazard. Lease renewal every TTL/2 is the standard pattern.

## Implementation Order

The full breakdown lives in [`spec.md` § Implementation Order](./spec.md#implementation-order). Below adds the per-unit dependency context + common pitfalls.

### Phase 1 — Shared helper restoration (3 units: 1a, 1b, 1c)

**Why first:** The collector + geocoder scripts are broken until `_signalmap-shared.mjs` exists. Phase 3 (collector worker) wraps the collector script — it can't run until Phase 1 ships.

**Pitfalls:**
- **1a:** Don't restore the entire archived `_seed-utils.mjs` from worldmonitor — it's 200+ lines and SignalMap only uses 3 functions. Read the imports in `signalmap-news-collector.mjs:8` and `signalmap-geocoder.mjs:1` and only port the surface SignalMap actually consumes.
- **1a:** The country-resolver in worldmonitor was a 200+ entry table. SignalMap only needs ~30 names that appear in the active RSS source list. Use the list in spec.md § Implementation Order Phase 1a.
- **1b:** Use `Edit` not `Write` when patching collector + geocoder — the changes are 1–3 lines each. Don't rewrite either file.
- **1c:** The `--once --fixture` flags may not exist in the collector yet. If running 1c reveals they're missing, add them as a small extension in 1b (one new arg parsing block at the top of the script). Don't bury this in 1c silently.

### Phase 2 — signalmap-api Node service (5 units: 2a, 2b, 2c, 2d, 2e)

**Why second:** The api server is the easiest piece to validate independently — no LLM calls, no RSS fetches. Once it serves all 8 routes correctly in fixture mode, the workers (Phase 3 + 4) layer on top.

**Pitfalls:**
- **2a:** Bare `node:http` doesn't have built-in path-param parsing. Implement matching with a simple split-on-`/` + per-segment compare; no need for a regex compiler. The router IS the framework — keep it under 100 lines or you're overengineering.
- **2a:** Don't add async error wrapping (try/catch). Each handler handles its own errors and writes its own response. The router's only job is `(req, res, params) => handler(req, res, params)`.
- **2b:** When wiring the existing route handlers (`signalmap-brief-event.ts` etc.) into the router, they expect path params injected via a request-scoped object. Either patch each handler to read `params` from `(req as any).params` (cheap) or wrap them in a tiny adapter. Pick one and apply consistently.
- **2b:** Graceful SIGTERM is a real test — don't hand-wave it. The api must close listening sockets, finish in-flight requests within 5s, close Redis, exit 0. Use `server.close()` + `Promise.race` with a timeout.
- **2c:** `signalmap-list.ts` reuses logic from `server/worldmonitor/signalmap/v1/list-signals.ts` (kept). That file expects a different harness (RPC-style) — extract the read-from-Redis-and-filter helper into a function and call it from both contexts. Don't duplicate the filter code.
- **2d:** **The strict-shape health response is the most error-prone part of the spec.** The UI hard-codes the 8 keys. If `HealthResponse` from `server/api/schemas/signalmap.ts` and the actual response shape drift even slightly, the panel breaks. Use the schema's `parse()` on every response before sending — fail loudly in tests.
- **2d:** Production redaction (`SIGNALMAP_BACKEND_MODE=live`) must happen as the LAST step before `JSON.stringify` — strip `detail` fields containing `redis://`, `/data/`, `sk-`, `pplx-` substrings. Test 2d test #5 covers this.
- **2e:** Phase 2 checkpoint requires real Redis (`docker run --rm -p 6379:6379 redis:7-alpine` is fine). Don't use a mock — the integration tests are what catch shape bugs.

### Phase 3 — signalmap-collector worker (4 units: 3a, 3b, 3c, 3d)

**Why third:** Collector is the data source. Without ticks running, the API serves an empty events list, the UI shows "0 signals", and Phase 6 e2e-live can't smoke meaningfully.

**Pitfalls:**
- **3a:** The Lua script for atomic compare-and-set is short:
  ```lua
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
  else
    return 0
  end
  ```
  Test 3a's "renew-by-non-owner-fails" case must use a different `ownerId` for the renew call than the original acquire — easy to mess up.
- **3b:** Don't `child_process.spawn(collector.mjs)` from cron.ts. Import and call. Subprocess spawning hides errors and complicates SIGTERM. The collector module already has an exported function (`runCollectorTick` — verify in 1b grounding).
- **3b:** Lease renewal must happen at TTL/2, not TTL/3 or TTL-1. Standard pattern, prevents accidental loss during slow ticks.
- **3c:** SSE channel publish is a bare `redis.publish(channel, JSON.stringify(events))`. The api's stream handler subscribes via the existing `sse-replay-ring.ts` infrastructure — don't reimplement it.
- **3d:** Two-instance lease test: spawn the collector once, wait 5s, spawn it again. The second should log "lease held by <other-pid>", poll, and only acquire after the first dies (SIGTERM the first manually).

### Phase 4 — signalmap-cron worker (4 units: 4a, 4b, 4c, 4d)

**Why fourth:** Cron is identical scaffolding to collector but generates briefs instead of ingesting events. Doing it after collector means the lease + heartbeat patterns are already validated.

**Pitfalls:**
- **4a:** Don't copy-paste `collector.ts` into `cron.ts`. Extract the worker shell (lease loop, heartbeat, SIGTERM cleanup) into a `runWorker(config)` helper in `server/workers/runner.ts` and have both files use it. Otherwise a bug fix to one drifts from the other.
- **4b:** `scripts/brief-cron.mjs` may currently run only as a script (top-level IIFE). Refactor minimally — extract the loop body into `export async function runBriefCron({ redis, abortSignal })` and have the IIFE call it. Don't change pipeline logic.
- **4b:** The brief cron's "sole writer" guarantee for `signalmap:brief:global` is enforced ONLY by the lease in this design. If the lease helper has a bug, two crons can race-write. Test 3a's "renew-by-non-owner-fails" case is what protects this guarantee — make sure it actually fails.
- **4c:** The `signalmap:brief:updated` channel was already implemented in Phase 6e (`sse-stream.ts` subscribes to it). Don't rebuild — just ensure cron publishes after the brief write.
- **4d:** Use the fixture LLM for this checkpoint. Real-LLM testing is Phase 8a only — saves money during early debugging.

### Phase 5 — Two-image Docker + compose (4 units: 5a, 5b, 5c, 5d)

**Why fifth:** Phases 1-4 produce code that runs locally. Phase 5 packages it for deployment. Docker first, then compose, then nginx — order matters because each depends on the previous.

**Pitfalls:**
- **5a:** `Dockerfile.node` should NOT run `tsc` — `tsx` runs TS directly. The image is `node:22-alpine`, copy `package.json`+`package-lock.json`+`tsconfig.json`+`server/`+`src/`+`scripts/`. Skip everything else (no `dist/`, no `e2e/`, no `docs/`).
- **5a:** The entrypoint script is just `exec npm run "start:$1"` — keep it tiny.
- **5b:** Compose file v2 — no `version:` field. `name: signalmap` at top level (already there in v1).
- **5b:** Healthchecks: api uses `wget --spider`, collector + cron use `redis-cli -h signalmap-redis ping` (need redis-cli in the image — `apk add redis` in the runtime stage).
- **5b:** Don't expose Redis port to host in production compose. Only on the compose internal network.
- **5b:** UI image rename from `signalmap:latest` → `signalmap-ui:latest`. Old name is gone after this commit; update any docs that reference it.
- **5c:** The nginx 503-fallback rules from Phase 9 (the `try_files /api/$api_path.json @api_unavailable` pattern) MUST be removed. Failing to remove them means nginx serves baked fixtures even when the live api is up. Test 5c specifically asserts a live response, not a baked fixture.
- **5c:** `proxy_buffering off` MUST be inside the SSE-specific `location` block, not the catch-all `/api/`. SSE needs no buffering; everything else benefits from default buffering.
- **5d:** "All services healthy within 60s" is the gate. If a service flaps, compose restarts it; if it never goes healthy, that's a real bug, not flakiness — investigate.

### Phase 6 — Backend mode profile + e2e split (3 units: 6a, 6b, 6c)

**Why sixth:** The runtime profile flag must exist before live e2e tests can be written; live e2e tests must exist before Phase 8 acceptance.

**Pitfalls:**
- **6a:** The vite fixture middleware was added in Phase 4e, expanded in Phase 9 (cameras, news, health, etc.). It's now a substantial block in `vite.config.ts`. Gate it on `SIGNALMAP_BACKEND_MODE` at the top of `signalmapFixturePlugin()` — early-return if mode is `live`. Don't tear out the plugin.
- **6a:** The `__test/signalmap/fixture/*` admin endpoints (e.g. `__test/signalmap/fixture/reset`, `__test/signalmap/fixture/set?bullets=...`) MUST be disabled in live mode. They're test seams and shouldn't exist in production.
- **6b:** New `playwright.config.live.ts` extends the base config but sets `webServer: undefined` (the live stack is brought up via compose, not playwright) and `baseURL: 'http://localhost:8080'`. Make `RUN_LIVE_E2E` a hard requirement — `if (!process.env.RUN_LIVE_E2E) test.skip()` in every live spec.
- **6b:** Live tests assert on SHAPE not content. Example: `await expect(page.getByTestId('signalmap-feed-count')).not.toHaveText('0')` — that proves events flowed. `await expect(page.getByTestId('signalmap-brief-strip-loading')).not.toBeVisible()` — that proves the brief loaded. Don't assert specific bullet text or specific source URLs.
- **6c:** CI command stays `npx playwright test`. Don't add live tests to CI; they require a running compose stack and real LLM keys.

### Phase 7 — Structured JSON logging (2 units: 7a, 7b)

**Why seventh:** Logging is a cross-cutting concern; doing it after services are functional means you log the right things. Doing it last (after Phase 8) means you can't observe Phase 8 acceptance.

**Pitfalls:**
- **7a:** Don't import a logging library. `JSON.stringify({ ts: new Date().toISOString(), level, service, event, ...extras })` is the entire implementation. Stack traces: include `err?.stack` as a string, not the Error object (which won't serialize).
- **7a:** Multi-line strings in event names will break `jq` parsing. Replace `\n` with `\\n` before stringify. Add a test for this.
- **7b:** Don't log inside `src/server/lib/*` — those have their own existing telemetry via `metrics.ts`. Logger is for api/collector/cron only.
- **7b:** Log the request, not the response body. Logging response bodies leaks LLM output into logs. Just status code + path + duration.

### Phase 8 — Final acceptance + release (3 units: 8a, 8b, 8c)

**Why last:** Acceptance requires real LLM keys, real RSS feeds, real budget. Doing it last means everything else is validated and only the live integration is being smoked.

**Pitfalls:**
- **8a:** **DO NOT commit `.env`.** It contains real keys. Add `.env` to `.gitignore` if it isn't there. The user will create it manually from `signalmap-shared.env.example`.
- **8a:** First brief generation costs ~$0.02. Don't loop the test — generate once, verify, stop. The 30-min cron interval (or 0.5× = 15 min for the test) means a single tick is enough.
- **8a:** Watch the OpenRouter spend dashboard. The daily budget cap (`SIGNALMAP_DAILY_LLM_BUDGET_USD=2.00`) is meant for runaway-protection but the test SHOULD cost <$0.10 total.
- **8b:** Live e2e against the compose stack expects all 5 services running. If one is unhealthy, the test reads it as a UI bug. Health-pill assertion is the leading indicator — if it's red, fix the underlying service before debugging the e2e.
- **8c:** Don't promise SLA / uptime in the README. Document what works, not what's guaranteed.

## Testing Strategy

Archetype: **Data Pipeline + API Service** — same as Phase 6 (brief backend), now extended to cover the worker + composition layer.

Run tests at three tiers:

1. **Unit (per-unit)** — `npx tsx --test <file>` for the test command in each unit's table row.
2. **Phase checkpoint** — the `Quality Gates Summary` table in `spec.md` lists the exact command per phase.
3. **Final acceptance** — Phase 8c checkpoint command.

Full testing harness details: [`testing-harness.md`](./testing-harness.md).

## Quick Reference

### Phase checkpoint commands

| Phase | Command |
|-------|---------|
| 1 | `node scripts/signalmap-news-collector.mjs --once --fixture` |
| 2 | `SIGNALMAP_API_PORT=3399 SIGNALMAP_BACKEND_MODE=fixture npm run start:api &` then smoke 8 routes |
| 3 | `SIGNALMAP_RSS_POLL_MINUTES=0.1 timeout 30 npx tsx server/workers/collector.ts` |
| 4 | `SIGNALMAP_BRIEF_REFRESH_MINUTES=0.1 timeout 60 npx tsx server/workers/cron.ts` |
| 5 | `docker compose up -d --build --force-recreate && sleep 60 && docker compose ps --filter health=healthy` |
| 6 | `npx playwright test` (fixture, 58/58) + `RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts` |
| 7 | `head -1 /tmp/api.log \| jq` returns valid JSON |
| 8 | `docker compose ps --filter health=healthy` (all 5 healthy) + UI smoke + `RUN_LIVE_E2E=1` |

### Error recovery

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `EADDRINUSE` on api port 3000 | Earlier api process didn't shut down | `lsof -i :3000` (or PowerShell `Get-NetTCPConnection -LocalPort 3000`) and kill |
| Cron writes nothing to `signalmap:brief:global` | Lease never acquired (held by ghost from previous run) | `redis-cli DEL signalmap:brief:cron:lease` to clear; investigate why previous run didn't release |
| Health endpoint `redis.status: 'unknown'` | Redis client not initialized at request time | Initialize Redis adapter at api startup, not per-request |
| SSE connection drops every 30s | nginx proxy_read_timeout default = 60s | Set `proxy_read_timeout 1d` in `/api/signalmap/stream` location block |
| `@lancedb/lancedb` fails to load on alpine | musl binary not picked up | Verify `node_modules/@lancedb/lancedb-linux-x64-musl/` exists; if not, `npm install --legacy-peer-deps --target_arch=x64 --target_platform=linux --target_libc=musl` (rare) |
| Live e2e fails with "events count = 0" | Collector lease ghost OR cron didn't tick yet | `docker compose logs signalmap-collector` — confirm tick. If it ticked but feed is empty, check fixture vs live mode env; if `BACKEND_MODE=fixture` is leaking, that's a Phase 6 bug |
| OpenRouter 401 in production | `OPENROUTER_API_KEY` not in env file | Confirm `.env` exists at repo root; `docker compose config` shows it expanded |
| Brief stampede returns 503 even with one user | Singleflight lock holder didn't release | Verify `acquireOrPoll`'s `finally` block calls `release()`. Check Redis: `KEYS signalmap:brief:event:lock:*` — any stale keys? |

## Start

### First session

1. Read `spec.md` end to end (~10 min — it's tighter than v1's spec.md).
2. Read this file (you're here).
3. `mcp__foreman__session_orient` → confirm at `phase-1-be / 1a` (the ledger may be empty if this is a fresh repo init — that's fine, init it now).
4. Begin unit `1a Restore _signalmap-shared.mjs` per spec.

### Resuming

1. `mcp__foreman__session_orient` → tells you `next_pending_unit`.
2. `mcp__foreman__read_progress` → see last completed + checklist.
3. Read the *next* unit's row in `spec.md` § Implementation Order.
4. Execute. Update ledger after test command passes.

If `session_orient` shows you in a unit that's already partially complete from a prior session: re-read the files, re-validate state, re-run the test command. Do not assume prior progress is correct — replay the unit.
