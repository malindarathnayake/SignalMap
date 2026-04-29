# SignalMap v2 Backend — Implementation Progress

## Current Status

- **Phase:** Phase 1 — Shared helper restoration (not yet started)
- **Last completed:** Spec + handoff written and committed (this design session, 2026-04-29). OpenAPI contract drift in `server/api/schemas/signalmap.ts` already reconciled (POST → GET on `brief/global`, `whyItMatters` → `bullets+sources` on `brief/event`, `/api/signalmap/health` added with `.strict()` shape). `npm run build:openapi` regenerated `public/openapi.yaml` (18,585 bytes).
- **Next up:** Phase 1 unit `1a` (Restore `scripts/_signalmap-shared.mjs` with CHROME_UA + loadSharedConfig + country-resolver subset).
- **Blocked on:** none.
- **Session:** none yet (fresh implementor session pending).
- **Sign-offs:** Codex × Claude design-deliberation 2026-04-29; user approved all 4 Codex flips (bare node:http, shared helper module, admin-token preserved, two-image strategy).

## Checklist

### Phase 1 — Shared helper restoration

- [ ] **1a** Restore `scripts/_signalmap-shared.mjs` (CHROME_UA, loadSharedConfig, ~30-country ISO2 resolver)
- [ ] **1b** Patch `signalmap-news-collector.mjs` + `signalmap-geocoder.mjs` to import from new shared helper; add `--once --fixture` flags if missing
- [ ] **1c** Boot-test the collector against fixture RSS — verify it writes ≥1 event to Redis

**Phase 1 gate:** `node scripts/signalmap-news-collector.mjs --once --fixture` exits 0; redis has at least 1 event under `signalmap:events:list`.

### Phase 2 — signalmap-api Node service

- [ ] **2a** `server/api/router.ts` — bare method/path router (~80 lines, no deps)
- [ ] **2b** `server/api/index.ts` — entrypoint, mounts existing handlers, SIGTERM cleanup
- [ ] **2c** `server/api/routes/signalmap-list.ts` + `signalmap-source-health.ts` — read from Redis with server-side filter
- [ ] **2d** `server/api/routes/signalmap-health.ts` — strict-shape with TTL-heartbeat reads + production redaction
- [ ] **2e** Phase 2 checkpoint: smoke all 8 routes against running api in fixture mode

**Phase 2 gate:** `SIGNALMAP_API_PORT=3399 SIGNALMAP_BACKEND_MODE=fixture npm run start:api &` then 8× curl all return 200; SIGTERM → clean exit within 5s.

### Phase 3 — signalmap-collector worker

- [ ] **3a** `server/workers/lease.ts` — TTL-renewable Redis lease helper (Lua atomic CAS)
- [ ] **3b** `server/workers/collector.ts` — main loop with lease + heartbeat + SIGTERM cleanup
- [ ] **3c** Wire SSE channel publish (`signalmap:events:updated`) on successful tick
- [ ] **3d** Phase 3 checkpoint: 30s test run with 0.1-min poll interval, ≥2 ticks, lease + heartbeat verified

**Phase 3 gate:** `SIGNALMAP_RSS_POLL_MINUTES=0.1 timeout 30 npx tsx server/workers/collector.ts` — assert ≥2 ticks recorded, lease renewed at TTL/2, heartbeat fresh, channel messages published.

### Phase 4 — signalmap-cron worker

- [ ] **4a** `server/workers/cron.ts` — main loop reusing `runWorker()` helper from `server/workers/runner.ts` (extract from collector.ts in this unit)
- [ ] **4b** `scripts/brief-cron.mjs` — extract `runBriefCron()` exported function from existing IIFE
- [ ] **4c** Wire SSE channel publish (`signalmap:brief:updated`) after each successful brief write
- [ ] **4d** Phase 4 checkpoint: 60s test run with 0.1-min refresh interval, ≥2 brief writes (mocked LLM), channel messages, SIGTERM cleanup

**Phase 4 gate:** `SIGNALMAP_BRIEF_REFRESH_MINUTES=0.1 SIGNALMAP_BACKEND_MODE=fixture timeout 60 npx tsx server/workers/cron.ts` — assert ≥2 brief writes, channel publishes, lease prevented split-brain.

### Phase 5 — Two-image Docker + compose

- [ ] **5a** `docker/Dockerfile.node` + `docker/entrypoint-node.sh` — single Node 22-alpine image, role via `$1`
- [ ] **5b** `docker-compose.yml` — 5 services (redis, signalmap-api, signalmap-collector, signalmap-cron, signalmap-ui), `replicas: 1` on workers, healthchecks
- [ ] **5c** `docker/nginx.conf` — proxy `/api/*` to signalmap-api, SSE-specific `proxy_buffering off`, remove 503-fallback rules from Phase 9
- [ ] **5d** Phase 5 checkpoint: `docker compose up -d --build --force-recreate` boots all 5 services healthy within 60s

**Phase 5 gate:** `docker compose ps --filter health=healthy` shows all 5 services healthy; `curl http://localhost:8080/` (UI shell) and `curl http://localhost:8080/api/signalmap/health` (proxied to api) both return 200.

### Phase 6 — Backend mode profile + e2e split

- [ ] **6a** Gate `signalmapFixturePlugin` on `SIGNALMAP_BACKEND_MODE === 'fixture'` in `vite.config.ts`; disable `__test/*` admin endpoints in live mode
- [ ] **6b** Create `e2e-live/` directory with 4–6 shape-only tests (feed-count > 0, source-pill not 0/0, health-panel renders 6 cards, brief-bullets array non-empty); `playwright.config.live.ts` extends base, `webServer: undefined`, requires `RUN_LIVE_E2E=1`
- [ ] **6c** Phase 6 checkpoint: existing 58/58 fixture pass; live suite passes against compose stack

**Phase 6 gate:** `npx playwright test` exits 0 (58/58); `RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts` exits 0 (≥6).

### Phase 7 — Structured JSON logging

- [ ] **7a** `server/_shared/logger.ts` — JSON-line logger, ~30 lines, no deps
- [ ] **7b** Replace `console.log/error` in `server/api/index.ts`, `server/workers/collector.ts`, `server/workers/cron.ts` with structured logger calls
- [ ] **7c** Phase 7 checkpoint: `head -1 /tmp/api.log | jq` returns valid JSON; same for collector + cron logs

**Phase 7 gate:** All log lines from api/collector/cron parse as JSON via `jq` and contain required fields (`ts`, `level`, `service`, `event`).

### Phase 8 — Final acceptance + release

- [ ] **8a** Bring up full stack with real LLM keys (`.env` populated from `signalmap-shared.env.example`); verify cron generates ≥1 real brief and Generate button calls Perplexity + OpenRouter
- [ ] **8b** Run `RUN_LIVE_E2E=1 npx playwright test --config=playwright.config.live.ts` against the live stack — all live tests pass
- [ ] **8c** Update README quickstart to document the full-stack `docker compose up` command and `.env` requirements; mark v2-backend complete

**Phase 8 gate (FINAL):** `docker compose ps --filter health=healthy` (all 5 healthy) AND `curl http://localhost:8080/api/signalmap/health | jq '.brief.status'` returns `"ok"` after first cron tick AND clicking Generate in the UI produces real Perplexity-sourced bullets.

## Decisions & Notes

| Decision | Value | Source |
|----------|-------|--------|
| HTTP framework | Bare `node:http` + tiny router | Codex deliberation 2026-04-29 (flipped from Hono lean) |
| Process topology | 3 services (api / collector / cron) | design-summary |
| Container strategy | 2 images (signalmap-ui + signalmap-node) | Codex deliberation (flipped from 3-images) |
| Repo layout | Single `package.json`; entries under `server/api/` + `server/workers/` | design-summary |
| Broken collector imports | New `scripts/_signalmap-shared.mjs` (don't restore archived util tree, don't inline) | Codex deliberation (flipped from inline) |
| SSE replay | Keep Phase 3 sorted-set ring | design-summary |
| Health model | TTL heartbeats + cached last-call results; redis PING is the only live probe | Codex deliberation |
| Auth | No end-user auth; keep `SIGNALMAP_ADMIN_TOKEN` for `/brief/refresh` | Codex deliberation (flipped from no-auth-anywhere) |
| Singleton enforcement | TTL-renewable Redis lease (cron + collector) | Codex deliberation (flipped from SETNX-on-startup) |
| Health response shape | `.strict()` 8-key shape; production redaction strips URIs / paths / key prefixes | Codex deliberation |
| Fixture vs live | `SIGNALMAP_BACKEND_MODE=fixture\|live` runtime profile; `e2e/` pinned fixture, new `e2e-live/` for staging | Codex deliberation |
| Outbound HTTP | Native Node 22 `fetch` | Verified during grounding |
| OpenAPI contracts | Reconciled before this spec was written; `server/api/schemas/signalmap.ts` is LOCKED | Pre-spec cleanup |

## Session Log

| Date | Phase | Unit | Outcome | Notes |
|------|-------|------|---------|-------|
| 2026-04-29 | — | — | design-session | Codex × Claude deliberation on 8 decisions; user arbitration approved all 4 flips. Contract drift on 3 endpoints reconciled in `server/api/schemas/signalmap.ts`. Design summary, spec, handoff, PROGRESS, testing-harness written. |

## Error Recovery Log

| Date | Error | Fix | Status |
|------|-------|-----|--------|

(Empty — implementation hasn't started.)

**Recovery protocol when an error occurs:**
1. Log the error in this table immediately (date, error, attempted fix, status).
2. Do NOT proceed to the next unit while an error is unresolved.
3. If the fix attempt fails after 2 tries, mark status `escalate-to-user` and stop.
4. Update the table when the user resolves it.

## Context Management

At session start, the implementor must answer these from the ledger (not memory):

| Question | Answer source |
|----------|---------------|
| Where am I? | `mcp__foreman__session_orient` → `current_phase` + `current_unit` |
| Where am I going? | This file → "Next up" |
| What is the goal? | `docs/SignalMap/v2-backend/spec.md` § Intent |
| What has been tried? | This file → "Session Log" + `mcp__foreman__read_journal` |
| What failed? | This file → "Error Recovery Log" + `mcp__foreman__read_ledger` rejections |

**New-chat policy:** When opening a fresh chat, do not start coding before re-running `session_orient`, reading this file, and reading the next unit's row in `spec.md`.

## Environment Notes

- **Language:** TypeScript 5.7.2; ES2020 target; ESM modules.
- **Runtime:** Node 22 (alpine in Docker); native `fetch` available.
- **Server:** Bare `node:http` + tiny custom router (Phase 2a). No Hono / Express / Fastify.
- **Test runners:** `node:test` via `tsx` for unit/integration; Playwright 1.52.0 for e2e (fixture mode CI; live mode staging).
- **Container base:** `node:22-alpine` for `signalmap-node`; `nginx:1.27-alpine` for `signalmap-ui`.
- **Required env vars (live mode):** `OPENROUTER_API_KEY`, `PERPLEXITY_API_KEY`, `REDIS_URL`, `SIGNALMAP_ADMIN_TOKEN`. See `docker/signalmap-shared.env.example` (Phase 8a).
- **Setup:** `npm install --legacy-peer-deps` (existing convention from Phase 9c). Run from repo root: `C:\Coding_Workspace\Github\SignalMap\`.
- **Dev mode:** `SIGNALMAP_BACKEND_MODE=fixture npm run dev` — vite middleware serves baked fixtures; existing 58 Playwright tests pass against this. `SIGNALMAP_BACKEND_MODE=live` requires Redis up + LLM keys.
