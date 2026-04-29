Reading additional input from stdin...
OpenAI Codex v0.125.0 (research preview)
--------
workdir: C:\Coding_Workspace\Github_P\worldmonitor
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR, C:\Users\MalindaRathnayake\.codex\memories]
reasoning effort: xhigh
reasoning summaries: none
session id: 019dd066-a8f8-77f0-8ea1-e5f96f1a8400
--------
user
# Phase 3 Adversarial Review — SignalMap Standalone v2

You are an adversarial code reviewer. Read the spec and the Phase 3 implementation files in this repo and produce a list of concrete findings.

## What to read

**Spec (authoritative)**: `docs/SignalMap/spec.md` — focus on:
- §"Implementation Order" Phase 3 table (search for "### Phase 3 — API Contract + Client + SSE Replay")
- §"Config Schema (env vars)" — SSE_* settings
- §"Generated artifacts (Phase 3)"
- §"Core Behavior" steps 8-11 (event detail, brief, SSE)
- §"Quality Gates Summary" Phase 3 row

**Phase 3 implementation files**:
- `server/api/schemas/common.ts`
- `server/api/schemas/signalmap.ts`
- `server/api/openapi.ts`
- `scripts/build-openapi.mjs`
- `src/client/base-url.ts`
- `src/client/openapi.ts`
- `public/openapi.yaml` (generated)
- `src/client/types.ts` (generated)
- `src/server/lib/redis.types.ts`
- `src/server/lib/redis.ts`
- `src/server/lib/sse-replay-ring.ts`
- `server/api/routes/signalmap-stream.ts`

**Phase 3 tests**:
- `tests/openapi-spec-generation.test.mjs`
- `tests/api-base-url-contract.test.mjs`
- `tests/sse-replay-ring.test.mjs`
- `tests/sse-stream.test.mjs`

**Package.json scripts** added/modified:
- `build:openapi` (rewired to `tsx scripts/build-openapi.mjs`)
- `build:types` (`openapi-typescript public/openapi.yaml -o src/client/types.ts`)
- new deps: `zod`, `zod-openapi`, `openapi-fetch`, `openapi-typescript`

## What to produce

For each finding, classify it as one of:
- **(a) spec directive not implemented** — the spec says X, the code does not do X
- **(b) implementation contradicts spec** — the spec says X, the code does Y where Y ≠ X
- **(c) missing error handling** — a failure mode the spec mentions or that's obviously needed isn't handled
- **(d) test gap** — a behavior the spec asserts isn't covered by tests

Each finding MUST include:
- Severity: CRITICAL / HIGH / MEDIUM / LOW
- File:line reference (exact line numbers, not "around line X")
- Quote of the relevant spec sentence (when claiming spec drift)
- One-paragraph reasoning showing the trace from spec → code

Format:

```
## [SEVERITY] [CATEGORY] Title

**File**: path/to/file.ts:LINE
**Spec**: "exact quote from spec"
**Issue**: <what's wrong>
**Recommendation**: <concrete fix>
```

## Rules

1. **No vague claims**. Every finding needs file:line + spec quote.
2. **Don't repeat passing behavior**. If something is correct, don't list it. Findings only.
3. **Don't flag style or architecture preferences** unless they violate the spec.
4. **If you find no issues in a category, say so explicitly** ("Category (b): no findings").
5. **Be brutal but truthful**. Surface real issues. Don't invent ones to look thorough.

## Context the spec doesn't mention but you should know

- Phase 3a deferred wiring of `build:openapi`/`build:types` from the spec to keep the unit testable independently. Phase 3b owns the wiring.
- The 6 endpoints defined in `signalmap.ts` are: `GET /api/signalmap/list`, `GET /api/signalmap/event/{id}`, `GET /api/signalmap/source-health`, `GET /api/signalmap/stream` (SSE), `POST /api/signalmap/brief/global`, `POST /api/signalmap/brief/event/{id}`. Spec text "the 6 endpoints" maps to these.
- `RedisAdapter` was extended with sorted-set ops in 3d (the contract file's own comment block at `redis.types.ts:13-15` explicitly reserved that for 3d).
- `replayFrom` had a gap-detection bug fixed during 3e: when `lastId` is below the ring floor but `zrangeByScore` returns rows, the original code missed `lost: true`. Fixed at `sse-replay-ring.ts:91-95`.
- `getApiBaseUrl()` rejects path-only inputs (no `scheme://`) by returning `''` to prevent `/api/ws/api` doubling. The `resolveApiBaseUrl(envValue)` helper exposes this for testing without mocking `import.meta.env`.

## Begin
codex
I’ll use the review skill for this turn because you’re asking for an adversarial code review with concrete findings. I’m going to inspect the spec sections first, then trace each Phase 3 file and only report confirmed mismatches or gaps.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -Path C:\\Users\\MalindaRathnayake\\.codex\\skills\\review\\SKILL.md" in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1000ms:
---
name: review
description: Review code, validate findings against actual source, and optionally turn confirmed issues into a remediation plan. Use when the user asks for a code review, wants risks verified with file evidence, wants a multi-model review if PAL MCP is available, or wants review findings converted into implementation docs.
---

# Review

Verify before reporting. Report before planning. Plan before coding.

## Modes

Use one of two modes depending on the request:

1. Review mode: inspect code and report confirmed findings.
2. Remediation planning mode: take existing findings, re-verify them, then generate remediation docs.

If the user asks for a review and a plan, do both in that order.

## Review Mode

### Required Validation

For every finding, do all of the following before reporting it:

1. Trace the real execution flow. Do not pattern-match snippets.
2. Check the relevant error paths, retries, and timeout behavior.
3. Verify library or platform claims with code, docs, tests, or label them `UNVERIFIED`.
4. Check whether comments or existing docs already explain the pattern.
5. Distinguish actual bugs and regressions from style preferences.

### Findings Format

Present findings first, ordered by severity. For each one include:

- Severity
- File and line reference when identifiable
- Why it is a problem in this code path
- Evidence used to confirm it
- Concrete fix direction

If no findings are confirmed, say so explicitly and note any residual risk or test gaps.

### Status Labels

Use these when they help:

- `CONFIRMED`
- `REJECTED`
- `UNVERIFIED`
- `CONTEXT NEEDED`

Do not present speculative issues as confirmed bugs.

## Optional Multi-Model Review

If the environment exposes `mcp__pal__codereview` and the user explicitly wants PAL review, use:

- `deepseek/deepseek-r1-0528`
- `gemini-3-pro-preview`
- `openai/o3`

After the tool responds, validate every claim locally before presenting it. External model agreement is not evidence by itself.

If that MCP tool is unavailable, perform the review locally using the same validation standard.

## Remediation Planning Mode

When the user wants findings converted into an implementation plan:

### 1. Normalize the Findings

For each finding capture:

- ID
- Summary
- Severity
- Files and lines
- Proposed fix, if any
- Category

### 2. Re-Verify Each Finding

Open the referenced code and classify each item:

- `CONFIRMED`
- `STALE`
- `INCORRECT`
- `UNVERIFIED`

Challenge the severity and fix approach in context:

- Is it actually risky in this deployment?
- Is the proposed fix correct for the real signatures and callers?
- Is there a smaller fix?
- Would the fix break other call paths or tests?

### 3. Group by Dependency

Group work by:

- File overlap
- Logical dependency
- Test dependency
- Risk coupling

Prefer groups that minimize file churn and are testable in isolation.

### 4. Assign Phases

Default phase order:

1. Security and correctness issues
2. Reliability and error handling
3. Observability and diagnostics
4. Drift, cleanup, and non-critical convergence

Merge phases when that reduces context switching without harming testability.

### 5. Produce Remediation Docs

Match the repo's existing docs directory casing. If the repo uses `docs/`, keep `docs/`; otherwise use `Docs/`.

Create or update:

- `remediation-spec.md`
- `remediation-handoff.md`
- `PROGRESS.md`
- `testing-harness.md`

Each implementation unit should specify:

- Files to modify or create
- Specific implementation directives
- Acceptance criteria
- Real test commands

## Brownfield Rules

- Do not refactor unrelated code.
- Match existing patterns unless the fix explicitly requires a new one.
- Do not change public interfaces unless the finding requires it.
- Preserve existing passing tests and add focused new coverage.

## What This Skill Does Not Do

- Do not trust review output without verification.
- Do not plan fixes for findings you cannot confirm.
- Do not code the remediation unless the user separately asks for implementation.

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "Phase 3|Config Schema|Generated artifacts|Core Behavior|Quality Gates Summary|SSE_|event detail|brief|SSE|Replay" docs/SignalMap/spec.md' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files | rg "''^(server/api/schemas/common'"\\.ts|server/api/schemas/signalmap\\.ts|server/api/openapi\\.ts|scripts/build-openapi\\.mjs|src/client/base-url\\.ts|src/client/openapi\\.ts|public/openapi\\.yaml|src/client/types\\.ts|src/server/lib/redis\\.types\\.ts|src/server/lib/redis\\.ts|src/server/lib/sse-replay-ring\\.ts|server/api/routes/signalmap-stream\\.ts|tests/openapi-spec-generation\\.test\\.mjs|tests/api-base-url-contract\\.test\\.mjs|tests/sse-replay-ring\\.test\\.mjs|tests/sse-stream\\.test\\.mjs|package\\.json)"'$"' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 873ms:
14:Replace the multi-variant worldmonitor SignalMap shell with a clean-slate single-product Preact + JSX dashboard that matches `docs/SignalMap/Claude_Design/`. Keep the existing collector pipeline (RSS, Cloudflare Radar, provider status, LanceDB dedup, watchlist) and rewire the data-layer onto a leaner stack: ioredis adapter (drop the `redis-rest` HTTP shim and `@upstash/redis`), code-first OpenAPI + `openapi-fetch` typed client, SSE with Redis-backed replay ring, Perplexity Sonar Pro + OpenRouter Nemotron brief feature with stampede/spend/citation/injection hardening, and a 2-service Docker stack served behind HTTP/2 nginx. Non-SignalMap legacy code is archived to a `archive/v1-legacy` git branch and removed from main.
23:| Realtime | SSE + heartbeats 20s + jitter + Redis-backed replay ring + HTTP/2 nginx | Bypasses HTTP/1.1 6-conn limit; survives backend restart | council amendment #5 |
25:| Brief synth | Single-pass `anthropic/claude-sonnet-4.6`. Background cron writes one global brief to Redis every `SIGNALMAP_BRIEF_REFRESH_MINUTES` (30 default). Frontend reads cached value; SSE pushes update. | User decision 2026-04-26 after real-workflow 3-way test (Sonnet vs Gemini 3 Flash vs GPT-5.4-mini). Sonnet was the only model that noticed and ignored Perplexity's hallucinated context. 2-pass architecture rejected — reasoning-tier draft models leak CoT. | design-summary §Key Decisions, real-workflow-brief-result.md |
26:| Brief generation pattern | **Server-side cron** is the SOLE writer of the global brief. Frontend is read-only. No filter signature in cache key (single global brief shared by all users; watchlist personalization is client-side visual emphasis only). Per-event briefs remain on-demand via user click (SETNX singleflight + per-IP rate limit on this endpoint only). | User decision 2026-04-26: internal coworker portal behind CF ZTNA; news content is identical for everyone. Per-user fragmentation was over-engineering. | user 2026-04-26 |
49:│  │ no for    │    │ (SSE+replay) │    │                      │   │
51:│  │           │    │  map/brief/* │    │                      │   │
57:│                   │  signal events + SSE replay ring │           │
58:│                   │  brief cache + singleflight lock │           │
106:    brief.ts                         # global + per-event brief state
124:      signalmap-stream.ts            # SSE
125:      signalmap-brief-global.ts
126:      signalmap-brief-event.ts
151:  nginx.conf                         # HTTP/2 + SSE-specific location
159:### Generated artifacts (Phase 3)
164:## Config Schema (env vars)
167:# Required for collector + brief
170:# Required for global brief context (per-event brief degrades without it)
192:# LLM brief — single-pass Sonnet 4.6, server cron writes
210:# SSE
211:SSE_HEARTBEAT_SECONDS=20
212:SSE_REPLAY_RING_SIZE=1000
213:SSE_REPLAY_RING_TTL_SECONDS=600
214:SSE_RECONNECT_RETRY_MIN_MS=5000
215:SSE_RECONNECT_RETRY_MAX_MS=15000
231:## Core Behavior
237:5. SSE pushes per-event updates; `signals.ts` accumulates into a Map keyed by event ID.
240:8. User clicks marker → `selectedEventId` signal flips → `Inspector` opens, fetches event detail via `openapi-fetch`.
241:9. User clicks "Why this matters" tab in `Inspector` → calls `POST /api/signalmap/brief/event/:id` → server checks cache → on miss, runs synthesis with the event + LanceDB-related stories → returns `{ whyItMatters, model, generatedAt }`.
242:10. Every 30 min (or on user "Refresh"), `BriefStrip` calls `POST /api/signalmap/brief/global` with current filter signature → server runs cache→singleflight→spend reservation→Perplexity→citation revalidation→OpenRouter (with XML-wrapped context)→schema validation→cache write.
243:11. Collector loop (background) polls RSS sources every 15 min, classifies via OpenRouter, geolocates, dedupes via LanceDB, writes events to Redis. SSE handler subscribes to a Redis pub/sub channel and pushes deltas to connected browsers.
252:| `signalmap.brief.calls` | counter | brief endpoint | tagged by flavor (global / per-event) |
253:| `signalmap.brief.cache_hits` | counter | brief endpoint | |
254:| `signalmap.brief.lock_contention` | counter | brief endpoint | stampede polling triggered |
255:| `signalmap.brief.budget_refusals` | counter | brief endpoint | spend reservation rejected |
256:| `signalmap.brief.citations_dropped` | counter | brief endpoint | citations outside allowlist |
257:| `signalmap.brief.tokens_input` | gauge | brief endpoint | per call (estimated + actual) |
258:| `signalmap.brief.tokens_output` | gauge | brief endpoint | |
259:| `signalmap.brief.cost_usd` | gauge | brief endpoint | per call (estimated + actual) |
260:| `signalmap.sse.connected_clients` | gauge | SSE handler | |
273:| OpenRouter draft model (Nemotron) 429/5xx | No fallback chain in v1 — return `503 { disabled: true, reason: "draft_model_unavailable", model: "nvidia/nemotron-3-super-120b-a12b" }` → UI hides brief | If recurring: add a fallback model to `SIGNALMAP_BRIEF_DRAFT_MODEL` (Phase-2 candidate) |
274:| OpenRouter moderator model (Gemini 3.1 Pro) 429/5xx | Return Nemotron's draft directly with `moderationSkipped: true` warning in brief metadata; UI shows a small "polish unavailable" indicator but the brief still renders | Auto-recovery on next refresh cycle |
275:| Perplexity 429/5xx | Brief retrieval falls back to local-signals-only synthesis | Note in brief output: "External context unavailable" |
278:| Daily budget exceeded (atomic) | `503 { disabled: true, reason: "budget_exhausted", resets_at }` | UI shows "Daily brief budget reached" |
281:| Redis connection lost | Collector buffers in-memory (5-min cap); API endpoints `503 { reason: "store_unavailable" }`; SSE clients reconnect | Auto-recovery on Redis return |
282:| LanceDB unavailable | Skip related-story dedup (warn log); per-event brief omits "related stories" context | Synthesis still works |
283:| SSE Last-Event-ID evicted from ring | `204 X-Replay-Lost: true` | UI shows "Reconnecting from latest" briefly |
284:| SSE backend graceful shutdown | Send `event: shutdown\nretry: <jittered ms>\n\n` | Clients reconnect with stagger |
307:| `zod` | UNKNOWN — install latest in Phase 3 | Route schema validation |
308:| `zod-openapi` | UNKNOWN — install latest in Phase 3 | Code-first OpenAPI generation from zod schemas |
309:| `openapi-typescript` | UNKNOWN — install latest in Phase 3 (devDep) | TS types from generated spec |
310:| `openapi-fetch` | UNKNOWN — install latest in Phase 3 | Typed fetch client |
325:- All non-SignalMap API endpoints (briefs SaaS, scenarios, leads, MCP, OAuth, payments, telegram, youtube, etc.) — archived to `archive/v1-legacy` branch
341:| Brief stampede | Concurrent identical brief requests acquire 1 upstream call; secondaries poll cache; 30s timeout |
346:| SSE replay ring | Monotonic IDs in Redis sorted set; client reconnect with `Last-Event-ID` replays correctly; eviction past size/TTL returns 204 + `X-Replay-Lost: true` |
347:| SSE jitter | Graceful shutdown sends jittered `retry:`; multiple connections receive different values |
350:| Frontend shell E2E | Standalone Preact shell renders, signal markers visible, watchlist toggle works, inspector opens, brief auto-refreshes (mocked LLM) |
351:| Brief flow E2E | Global brief generates → renders → expires → re-generates with stampede protection |
352:| SSE reconnect E2E | Backend restart triggers reconnect; replay missed events; UI doesn't double-render |
366:| OpenRouter HTTP | yes (fixture responses) | only in `e2e/brief-live.spec.ts` (gated by `RUN_LIVE_LLM=1`) |
381:| SSE replay ring | 100% of branches (write, replay, eviction, shutdown) |
416:| 2d nginx HTTP/2 + SSE config | `docker/nginx.conf` template | Add `listen 8080 http2;`; add `location /api/signalmap/stream { proxy_buffering off; proxy_cache off; proxy_set_header X-Accel-Buffering no; add_header Cache-Control "no-cache, no-transform"; proxy_read_timeout 1d; }`; verify other locations preserved | `docker compose up -d --build --force-recreate signalmap && curl --http2 -I http://localhost:3000/` shows `HTTP/2 200` | Touch CSP header (gone with the SaaS chrome) |
417:| 2e Health + acceptance | `api/health.js` | Extend health response: `{ ok, sources, lastEventAt, redis: 'ok'\|'down', sseReplayRingSize }`; Docker `HEALTHCHECK` checks Redis ping + critical source freshness | `docker compose up -d --build --force-recreate && sleep 10 && curl http://localhost:3000/api/health \| jq` | Mark non-critical source stale as unhealthy |
421:### Phase 3 — API Contract + Client + SSE Replay
428:| 3d SSE endpoint + replay ring | `server/api/routes/signalmap-stream.ts`, `src/server/lib/sse-replay-ring.ts` | Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay; subscribe to `signalmap:events` pubsub channel; heartbeat every `SSE_HEARTBEAT_SECONDS`; on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n` | `npx tsx --test tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs` | Use in-memory replay |
429:| 3e SSE tests | `tests/sse-replay-ring.test.mjs`, `tests/sse-stream.test.mjs` | Tests: monotonic ID generation, ring eviction past size+TTL, replay from `Last-Event-ID`, `204 X-Replay-Lost` when ID evicted, jittered shutdown retry, heartbeat cadence | Same command as 3d | Mock Redis (use real container) |
431:**Phase 3 checkpoint:** `npm run build:openapi && npm run build:types && npm run typecheck:all` clean; all 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green.
440:| 4d LiveFeed + Inspector + BriefStrip placeholders | `src/components/feed/LiveFeed.tsx`, `src/components/feed/FeedCard.tsx`, `src/components/inspector/Inspector.tsx`, `src/components/inspector/WhyItMattersTab.tsx`, `src/components/chrome/BriefStrip.tsx` | LiveFeed shows mocked event titles; Inspector opens on `selectedEventId` change with mocked event detail; WhyItMattersTab shows "Generate" button (no-op until Phase 6); BriefStrip shows "Loading..." placeholder | `npx playwright test e2e/feed.spec.ts e2e/inspector.spec.ts` | Implement brief generation logic |
443:**Phase 4 checkpoint:** `npm run dev` opens `localhost:3000` with the standalone shell fully populated from fixtures; signals flow end-to-end; SSE updates animate in (with mocked stream).
454:**Phase 5 checkpoint:** Visual regression passes on both viewports; touch-tap simulation hits markers reliably; SSE updates animate markers without jitter.
460:| 6a Perplexity client + allowlist + revalidation + prompt | `src/server/lib/perplexity.ts`, `src/server/lib/citation-validator.ts`, `tests/perplexity-brief.test.mjs`, `tests/brief-citation-validation.test.mjs` | `perplexity.ts` POSTs to Sonar Pro with `search_domain_filter` (≤20), `search_recency_filter`, the strong system prompt; `citation-validator.ts` parses returned `citations[]`, drops URLs not in allowlist; if 100% dropped, return `{ degraded: true }` | `npx tsx --test tests/perplexity-brief.test.mjs tests/brief-citation-validation.test.mjs` | Send >20 domains in a single call |
461:| 6b OpenRouter 2-pass + XML wrap + schema | `src/server/lib/openrouter.ts`, `src/server/lib/brief-pipeline.ts`, `tests/brief-prompt-injection.test.mjs`, `tests/brief-pipeline.test.mjs` | `openrouter.ts` exposes a generic `chat(model, messages)` call. `brief-pipeline.ts` orchestrates the 2-pass: (1) call `SIGNALMAP_BRIEF_DRAFT_MODEL` (Nemotron) with synth prompt wrapping Perplexity output in `<retrieved_context>...</retrieved_context>`; (2) call `SIGNALMAP_BRIEF_MODERATOR_MODEL` (Gemini 3.1 Pro) with moderation prompt wrapping Nemotron's draft in `<draft>...</draft>` and the original `<retrieved_context>` (so moderator can verify draft against sources). Both outputs validated against zod schema. Final brief object: `{ bullets: string[], generatedAt, draftModel, moderatorModel, draftRaw, moderationSkipped: false, warnings: string[] }`. Injection test feeds malicious headline at BOTH boundaries (Perplexity → draft, draft → moderator) and asserts schema rejects or wrap remains intact at each stage. If moderator fails, return draft directly with `moderationSkipped: true`. | `npx tsx --test tests/brief-prompt-injection.test.mjs tests/brief-pipeline.test.mjs` | Pass raw text without XML wrap; skip schema validation on draft (validate at every stage) |
462:| 6c Spend reservation + per-event singleflight + per-event rate limit | `src/server/lib/spend-reservation.ts`, `src/server/lib/singleflight.ts`, `src/server/lib/rate-limit.ts`, `tests/brief-spend-reservation.test.mjs`, `tests/brief-per-event-stampede.test.mjs` | `spend-reservation.ts`: atomic `INCRBYFLOAT signalmap:llm:spend:YYYY-MM-DD <est_cost>`; if total > budget, decrement back and return `false`; on success refund usage-based delta. **Used by both the cron (global brief) AND per-event endpoint** — both must respect daily budget. `singleflight.ts`: `setNx(lock_key, pid, ttl)`; **only used by per-event brief endpoint** (multi-user click stampede possible on a fresh event). Global brief has no singleflight — cron is sole writer. `rate-limit.ts`: per-IP `INCR signalmap:rl:event:<ip>:<minute>` with `EXPIRE 60`; **only on per-event brief endpoint** (global brief reads are cache hits, no need). | `npx tsx --test tests/brief-spend-reservation.test.mjs tests/brief-per-event-stampede.test.mjs` | Apply singleflight or rate-limit to global brief (it's a cache read) |
463:| 6d Brief endpoints + cron job + admin refresh | `server/api/routes/signalmap-brief-global.ts` (read-only cache lookup), `server/api/routes/signalmap-brief-event.ts` (on-demand with singleflight), `server/api/routes/signalmap-brief-health.ts` (operator visibility), `server/api/routes/signalmap-brief-refresh.ts` (admin-token-gated manual trigger), `scripts/brief-cron.mjs` (background job), `docker/supervisord.signalmap.conf` (add brief-cron program), `tests/brief-endpoints.test.mjs`, `tests/brief-cron.test.mjs` | **Global brief endpoint**: 3-line handler reading `signalmap:brief:global` from Redis, returning JSON. No LLM call ever from this path. **Per-event endpoint**: cache-check → singleflight → spend-reserve → OpenRouter (XML-wrapped synthesis with event + 3 LanceDB-related stories) → schema validation → cache write (forever per event ID). **Health endpoint**: returns `{ lastGeneratedAt, nextScheduledAt, dailySpendUsd, dailyBudgetUsd, modelInUse }`. **Manual refresh endpoint**: requires `X-SignalMap-Admin-Token` header matching `SIGNALMAP_ADMIN_TOKEN` env; triggers immediate brief regen, still respects budget. **Brief cron**: separate Node process (started by supervisord), loops every `SIGNALMAP_BRIEF_REFRESH_MINUTES`, calls Perplexity → citation revalidation → Sonnet 4.6 → spend reservation → write to `signalmap:brief:global` (no TTL, overwrite-in-place) → publish `signalmap:brief:updated` pubsub event for SSE. | `npx tsx --test tests/brief-endpoints.test.mjs tests/brief-cron.test.mjs` | Build a request-driven generation path on the global endpoint |
464:| 6e UI BriefStrip + WhyItMatters tab + brief E2E | `src/components/chrome/BriefStrip.tsx` (read-only cached brief renderer), `src/components/inspector/WhyItMattersTab.tsx` (on-demand generation), `src/state/brief.ts`, `e2e/brief-flow.spec.ts` | BriefStrip is a thin reader: fetches `/api/signalmap/brief/global` once on mount, then subscribes to SSE `brief-updated` events to swap in fresh content (no client-side timer). Renders: bullets + "Updated 4m ago" indicator + "Sources: Reuters, FT, …" + watchlist-match emphasis (client-side: bold any bullet text whose entity matches user's localStorage watchlist). Manual "Refresh now" button visible only if `localStorage.signalmap_admin_token` is set; calls `/api/signalmap/brief/refresh` with that token in `X-SignalMap-Admin-Token` header. WhyItMattersTab fires on user click → POST `/api/signalmap/brief/event/:id`. Brief E2E asserts: cron runs and SSE pushes update; manual refresh works with token, fails without; per-event 10 parallel clicks → 1 upstream call. | `npx playwright test e2e/brief-flow.spec.ts` | Add a client-side polling timer (SSE-only) |
494:| 9d Final acceptance + Phase-2 backlog | `docs/SignalMap/phase-2-candidates.md` (NEW), `docs/SignalMap/PROGRESS.md` (mark complete) | Acceptance: `docker compose up -d --build --force-recreate` from clean state produces working stack; full E2E + visual regression green; manual smoke at `localhost:3000` confirms all panels working with live (or mocked) data. Phase-2 backlog documents: TimelineStrip, Tweaks overlay, mobile, brief history, embeddable widget mode | `npm run test:data && npx playwright test && docker compose up -d --build --force-recreate && curl http://localhost:3000/api/health \| jq` | Ship without final smoke at `localhost:3000` |
500:## Quality Gates Summary
507:| 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` | All contract + SSE tests pass |
510:| 6 | `npx tsx --test tests/perplexity-brief.test.mjs tests/brief-stampede.test.mjs tests/brief-spend-reservation.test.mjs tests/brief-citation-validation.test.mjs tests/brief-prompt-injection.test.mjs tests/brief-endpoints.test.mjs && npx playwright test e2e/brief-flow.spec.ts` | All brief hardening tests pass |

2026-04-27T19:25:05.398631Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.1 seconds
Output:

 exited 1 in 1110ms:
codex
I’ve located the authoritative Phase 3 rows and the SSE/config/core behavior sections in the spec. Next I’m checking the listed implementation and test files with line numbers so any finding can be tied to actual execution, not just a snippet.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 789ms:
vitest.config.mts
vite.config.ts
vercel.json
tsconfig.json
tsconfig.api.json
e2e\widget-builder.spec.ts
e2e\tsconfig.json
e2e\theme-toggle.spec.ts
e2e\signalmap.spec.ts
e2e\runtime-fetch.spec.ts
e2e\rag-vector-store.spec.ts
e2e\mobile-map-popup.spec.ts
e2e\mobile-map-native.spec.ts
brief-palette-playground.html
Dockerfile.relay
Dockerfile.digest-notifications
Dockerfile
docker-compose.yml
docker-compose.signalmap.yml
todos\026-complete-p2-simulation-redis-key-duplicated-ts-mjs.md
todos\025-complete-p2-simulation-round1-token-budget-too-tight.md
todos\024-complete-p2-simulation-ismaritimechokeenergy-adapter-drift.md
todos\023-complete-p2-simulation-llm-array-fields-unsanitized-r2.md
todos\022-complete-p2-simulation-package-runid-mismatch-not-checked.md
todos\021-pending-p1-simulation-no-http-trigger-endpoint.md
todos\020-complete-p1-simulation-outcome-handler-unvalidated-cast.md
todos\019-complete-p1-simulation-runid-unvalidated-redis-r2-paths.md
todos\018-complete-p1-simulation-prompt-unsanitized-entity-fields.md
todos\017-pending-p3-simulation-package-phase2-prerequisites.md
todos\016-pending-p3-simulation-package-simplifications.md
todos\015-pending-p2-simulation-package-missing-guards.md
todos\014-pending-p2-simulation-package-perf-set-intersectany.md
todos\013-pending-p2-simulation-package-prompt-injection.md
todos\012-pending-p1-actorregistry-dead-at-callsite.md
todos\011-pending-p1-entity-key-collision-same-domregion.md
todos\010-pending-p1-inferentityclassfromname-force-overmatch.md
todos\009-complete-p2-redis-key-constants-not-exported.md
todos\008-complete-p2-extract-news-cluster-items-not-memoized.md
todos\007-complete-p2-redis-gets-on-high-quality-runs.md
todos\006-complete-p2-resolve-impact-channel-missing-cases.md
todos\005-complete-p2-learned-section-overflow-erases-history.md
todos\004-complete-p1-rate-limit-toctou-race.md
todos\003-complete-p1-sanitize-proposed-addition-bypass.md
todos\002-complete-p1-refinement-fires-on-empty-validation.md
todos\001-complete-p1-third-order-mapped-floor-unreachable.md
todos\053-pending-p2-yahoo-shipping-stress-no-shared-rate-gate.md
todos\053-pending-p2-daily-market-brief-framework-no-api-equivalent.md
todos\052-pending-p2-mappropup-missing-test-site-type-label.md
todos\052-pending-p2-framework-settings-strings-not-i18n.md
todos\051-pending-p2-sha256-calls-sequential-should-be-parallel.md
todos\051-pending-p1-lop-nur-coordinate-mismatch-seed-vs-geoconfig.md
todos\050-pending-p2-country-brief-framework-change-no-debounce.md
todos\050-pending-p1-disease-outbreak-location-field-never-populated.md
todos\049-pending-p2-get-active-framework-hot-path-localStorage-reads.md
todos\049-pending-p1-standalone-keys-misclassification-seeded-keys.md
todos\048-pending-p2-analysis-framework-store-not-in-settings-export.md
todos\047-pending-p2-insights-panel-double-update-generation-increment.md
todos\046-pending-p2-deductionpanel-dual-framework-injection.md
todos\045-pending-p1-summarize-article-systemappend-excluded-from-cache-key.md
todos\044-pending-p1-systemappend-prompt-injection-no-sanitization.md
todos\043-pending-p1-ssrf-bypass-fetch-agentskills.md
todos\042-pending-p1-no-server-side-premium-gate-for-frameworks.md
todos\041-pending-p1-deduct-situation-framework-excluded-from-cache-key.md
todos\040-pending-p3-font-settings-toggleattribute-simplification.md
todos\039-pending-p2-font-settings-missing-tests.md
todos\038-complete-p2-legend-setlayers-not-wired.md
todos\037-complete-p1-legend-i18n-text-match-breaks-locales.md
todos\036-complete-p1-legend-maplayers-key-mismatch.md
todos\035-pending-p1-jwtverify-missing-algorithms-allowlist.md
todos\034-pending-p1-auth-init-gated-behind-isProUser-deadlock.md
todos\033-pending-p3-allowed-series-missing-bamlc-sofr.md
todos\032-pending-p3-finance-panels-rpc-client-singletons.md
todos\031-pending-p3-fsi-panel-no-hydrated-data-fast-path.md
todos\030-pending-p3-macro-tiles-fragile-delta-formatter.md
todos\029-pending-p3-simulation-llm-provider-routing-missing-cases.md
todos\028-pending-p3-simulation-no-completion-status-field.md
todos\027-complete-p2-simulation-runid-filter-noop-undocumented.md
todos\072-pending-p3-summarize-article-skipreasons-rebuilt-per-request.md
todos\071-pending-p3-premium-check-stub-missing-request-param.md
todos\070-pending-p2-framework-selector-refresh-stale-fallback.md
todos\069-pending-p2-agentskills-response-fields-no-length-cap.md
todos\068-pending-p2-inconsistent-hash-algorithm-framework-cache-key.md
todos\067-pending-p2-isCallerpremium-called-unconditionally-on-empty-fields.md
todos\066-pending-p2-framework-param-missing-from-widget-agent-system-prompt.md
todos\065-pending-p2-relay-blocklist-wrong-method-name-deduce-vs-deduct.md
todos\064-pending-p2-activeCache-nonnull-assertion-nullable-map.md
todos\063-pending-p2-summarize-article-as-any-llm-response.md
todos\062-complete-p1-contextsnapshot-unsanitized-in-user-prompt.md
todos\061-complete-p1-sanitizesystemappend-weaker-than-sanitizeforprompt.md
todos\060-complete-p1-isCallerpremium-auth-bypass-trusted-origin.md
todos\059-pending-p3-disease-keywords-duplicated-in-detect-function.md
todos\058-pending-p3-promed-feed-dead-code-commented-out.md
todos\057-pending-p3-framework-selector-id-collision-datestamp.md
todos\057-pending-p3-concern-score-weights-undocumented-magic-numbers.md
todos\056-pending-p3-strip-thinking-tags-duplicated-in-summarize-article.md
todos\056-pending-p3-stable-hash-unnecessary-disease-seed.md
todos\055-pending-p3-insights-hardcoded-in-framework-selector.md
todos\055-pending-p2-social-velocity-ttl-at-minimum-boundary.md
todos\054-pending-p3-fetch-agentskills-dead-rate-limit-stub.md
todos\054-pending-p2-reddit-permalink-no-url-scheme-validation.md
todos\085-complete-p2-oauth-token-js-code-duplication.md
todos\084-complete-p2-bearer-resolution-swallows-redis-errors.md
todos\083-complete-p2-timing-unsafe-key-comparison.md
todos\082-complete-p1-err-message-leaks-internals-to-api-response.md
todos\081-complete-p1-api-key-exposed-in-url-query-param.md
todos\080-complete-p2-oauth-store-key-hash-not-plaintext-in-redis.md
todos\079-complete-p2-discovery-doc-fixes-content-type-and-response-types.md
todos\078-complete-p2-oauth-token-simplification-remove-dead-code.md
todos\077-complete-p1-token-response-missing-cache-control-no-store.md
todos\076-complete-p1-mcp-auth-failure-must-return-http-401.md
todos\075-complete-p1-oauth-token-endpoint-missing-rate-limiting.md
todos\074-pending-p3-max-len-duplicated-agentskills-vs-framework-store.md
todos\073-pending-p3-fwdata-stored-as-dom-property-preferences-content.md
todos\091-complete-p2-sanitizeprompt-unicode-line-separators.md
todos\090-complete-p2-bonusoverlap-ternary-none-actorsource-fallthrough.md
todos\089-complete-p2-keyactorroles-guardrail-iife-extract-to-named-function.md
todos\088-complete-p1-keyactorroles-missing-from-uitheaters-redis-projection.md
todos\087-complete-p1-simulation-package-theater-interface-missing.md
todos\086-complete-p3-bearer-resolution-deferred-check-and-discriminated-return.md
todos\103-complete-p1-premium-rpc-paths-cdn-bypass.md
todos\093-complete-p3-tryparsesimulation-jsdoc-and-sanitize-at-boundary.md
todos\092-complete-p3-roleoverlap-intermediate-array-simplify.md
todos\105-complete-p1-seeder-lock-skipped-no-ttl-extend.md
todos\104-complete-p1-cache-key-injection-iso2-hs2.md
todos\106-complete-p1-seeder-data-ttl-one-times-interval.md
middleware.ts
Makefile
live-channels.html
LICENSE
index.legacy.html
index.html
package.json
package-lock.json
nixpacks.toml
playwright.config.ts
todos\199-complete-p3-phase-a-nits-bundle.md
todos\198-complete-p2-test-and-observability-polish.md
todos\197-complete-p2-workflow-and-shadow-archive-hardening.md
todos\196-complete-p2-orchestrator-cleanup-bundle.md
todos\195-complete-p1-dead-env-getters-in-dedup-consts.md
todos\194-complete-p1-embedding-timeout-floor-and-negative-budget.md
todos\193-complete-p1-dedup-regex-and-redis-pipeline-duplication.md
todos\192-pending-p3-perf-micro-cleanups.md
todos\191-pending-p3-various-helper-and-config-cleanups.md
todos\190-pending-p3-many-redundant-jsonstringify-casefile-loops.md
todos\189-pending-p2-refetchforregion-silent-error-swallowing.md
todos\188-pending-p2-dangling-docs-internal-references-in-code.md
todos\187-pending-p2-orphan-scripts-shared-iso2-mirror.md
todos\186-pending-p2-regime-transition-driver-always-empty.md
todos\185-pending-p2-trigger-watching-runs-on-delta-operators.md
todos\184-pending-p2-pipeline-non-atomic-partial-persist.md
todos\183-pending-p2-writeextrakeywithmeta-positional-args-fragile.md
todos\182-pending-p2-inconsistent-unknown-region-error-handling.md
todos\181-pending-p2-undated-inputs-treated-as-fresh-confidence-bug.md
todos\180-pending-p2-regions-find-duplicated-use-getregion-helper.md
todos\179-pending-p2-getforecasts-handler-no-cachedfetchjson.md
todos\178-pending-p2-aborontroller-on-rapid-region-pill-clicks.md
todos\177-pending-p2-stored-strings-from-redis-unsanitized-xss-risk-phase-1.md
todos\176-pending-p2-redis-keys-coupled-to-compute-modules-no-adapter.md
todos\175-pending-p2-region-taxonomy-3-sources-of-truth.md
todos\174-pending-p2-seeder-bypasses-runseed-gold-standard.md
todos\173-pending-p2-sequential-per-region-persist-1600ms.md
todos\172-pending-p2-sequential-readlatestsnapshot-1600ms-overhead.md
todos\171-pending-p2-iscclosethreshold-inverted-for-lt-operators.md
todos\170-complete-p1-jsdoc-types-not-enforced-jsconfig-missing.md
todos\169-complete-p1-diff-field-leaks-into-persisted-snapshot.md
todos\168-complete-p1-zombie-freshness-registry-keys.md
todos\167-complete-p1-oref-trigger-key-not-in-freshness-registry.md
todos\166-complete-p1-health-seed-meta-not-in-keys-loops.md
todos\165-pending-p3-scenario-rate-limiter-keys-off-ip-not-identity.md
todos\164-pending-p3-fetch-sector-dependency-no-circuit-breaker.md
todos\163-complete-p3-scenario-banner-shows-raw-id.md
todos\162-complete-p2-attach-scenario-triggers-no-in-flight-guard.md
todos\161-pending-p2-mapcontainer-supply-chain-panel-bidirectional-coupling.md
todos\160-complete-p2-scenario-fetch-missing-auth-header.md
todos\159-pending-p2-globe-flush-polygons-scenario-precompute.md
todos\158-complete-p2-scenario-heat-layer-set-alloc-every-build.md
todos\157-complete-p2-scenario-templates-server-import-boundary.md
todos\156-complete-p2-globe-scenario-missing-stroke-color-branch.md
todos\155-complete-p1-scenario-callbacks-not-wired-in-panel-layout.md
todos\154-complete-p1-result-nonnull-assertion-without-guard.md
todos\153-complete-p1-polling-no-statusresp-ok-check.md
todos\152-complete-p1-t-shadows-i18n-import.md
todos\109-complete-p1-agent-native-rpc-missing-system-prompt.md
todos\108-complete-p1-sector-ring-dom-data-leakage-through-blur.md
todos\107-complete-p1-chokepoint-exposure-seed-meta-key-mismatch.md
proto\buf.lock
proto\buf.gen.yaml
e2e\map-harness.spec.ts-snapshots\layer-tech-weather-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-waterways-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-tech-hqs-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-tech-events-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-startup-hubs-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-spaceports-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-protests-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-ports-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-pipelines-z4.png
e2e\map-harness.spec.ts-snapshots\layer-tech-outages-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-nuclear-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-news-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-natural-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-minerals-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-military-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-irradiators-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-hotspots-z4.png
e2e\map-harness.spec.ts-snapshots\layer-tech-flights-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-fires-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-economic-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-datacenters-icons-z6.png
e2e\map-harness.spec.ts-snapshots\layer-tech-datacenters-cluster-z3.png
e2e\map-harness.spec.ts-snapshots\layer-tech-cyber-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-conflicts-z4.png
e2e\map-harness.spec.ts-snapshots\layer-tech-cloud-regions-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-cables-z4.png
e2e\map-harness.spec.ts-snapshots\layer-tech-bases-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-ais-z5.png
e2e\map-harness.spec.ts-snapshots\layer-tech-accelerators-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-weather-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-waterways-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-spaceports-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-protests-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-ports-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-pipelines-z4.png
e2e\map-harness.spec.ts-snapshots\layer-full-outages-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-nuclear-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-news-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-natural-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-minerals-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-military-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-irradiators-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-hotspots-z4.png
e2e\map-harness.spec.ts-snapshots\layer-full-flights-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-fires-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-economic-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-datacenters-icons-z6.png
e2e\map-harness.spec.ts-snapshots\layer-full-datacenters-cluster-z3.png
e2e\map-harness.spec.ts-snapshots\layer-full-cyber-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-conflicts-z4.png
e2e\map-harness.spec.ts-snapshots\layer-full-cables-z4.png
e2e\map-harness.spec.ts-snapshots\layer-full-bases-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-apt-groups-z5.png
e2e\map-harness.spec.ts-snapshots\layer-full-ais-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-weather-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-waterways-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-stock-exchanges-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-spaceports-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-protests-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-ports-z5.png
plans\map-performance-improvements.md
plans\fix-forecast-semantic-quality.md
e2e\map-harness.spec.ts-snapshots\layer-finance-pipelines-z4.png
e2e\map-harness.spec.ts-snapshots\layer-finance-outages-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-nuclear-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-news-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-natural-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-minerals-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-military-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-irradiators-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-hotspots-z4.png
e2e\map-harness.spec.ts-snapshots\layer-finance-flights-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-fires-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-financial-centers-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-economic-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-datacenters-icons-z6.png
e2e\map-harness.spec.ts-snapshots\layer-finance-datacenters-cluster-z3.png
e2e\map-harness.spec.ts-snapshots\layer-finance-cyber-z5.png
proto\buf.yaml
e2e\map-harness.spec.ts-snapshots\layer-finance-conflicts-z4.png
e2e\map-harness.spec.ts-snapshots\layer-finance-commodity-hubs-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-central-banks-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-cables-z4.png
e2e\map-harness.spec.ts-snapshots\layer-finance-bases-z5.png
e2e\map-harness.spec.ts-snapshots\layer-finance-ais-z5.png
e2e\map-harness.spec.ts
e2e\keyword-spike-flow.spec.ts
e2e\investments-panel.spec.ts
e2e\deduct-situation.spec.ts
e2e\circuit-breaker-persistence.spec.ts
e2e\auth-ui.spec.ts
signalmap-loaded.png
pro-test\vite.config.ts
docker\supervisord.signalmap.conf
pro-test\tsconfig.json
docker\supervisord.conf
docker\signalmap-entrypoint.sh
docker\redis-rest-proxy.mjs
docker\nginx.conf.template
docker\nginx.conf
docker\nginx-security-headers.conf
docker\entrypoint.sh
docker\Dockerfile.signalmap
docker\Dockerfile.redis-rest
docker\Dockerfile
docker\docker-entrypoint.sh
docker\build-handlers.mjs
DEPLOYMENT-PLAN.md
convex\__tests__\webhook.test.ts
convex\__tests__\entitlements.test.ts
convex\__tests__\emailSuppressions.test.ts
convex\__tests__\comp-entitlement.test.ts
convex\__tests__\checkout.test.ts
convex\__tests__\billing.test.ts
convex\__tests__\apiKeys.test.ts
blog-site\tsconfig.json
scripts\_yahoo-fetch.mjs
scripts\_trade-parse-utils.mjs
scripts\_ticker-validation.mjs
scripts\_storage-facility-registry.mjs
scripts\_sigterm-once-fixture-1777116163265.mjs
scripts\_shared-av.mjs
scripts\_seed-utils.mjs
scripts\_seed-envelope-source.mjs
scripts\_seed-contract.mjs
scripts\_r2-storage.mjs
scripts\_proxy-utils.cjs
scripts\_prediction-scoring.mjs
scripts\_pipeline-registry.mjs
scripts\_open-meteo-archive.mjs
scripts\_military-surges.mjs
scripts\_llm-json.mjs
scripts\_insights-brief.mjs
scripts\_gdelt-fetch.mjs
scripts\_fuel-shortage-registry.mjs
scripts\_eurostat-utils.mjs
scripts\_energy-disruption-registry.mjs
scripts\_ema-threat-engine.mjs
scripts\_digest-markdown.mjs
scripts\_country-resolver.mjs
scripts\_clustering.mjs
scripts\_climate-zones.mjs
scripts\_bundle-runner.mjs
scripts\verify-seed-envelope-parity.mjs
scripts\verify-perplexity-shape.mjs
scripts\vercel-ignore.sh
scripts\validate-seed-migration.mjs
scripts\validate-rss-feeds.mjs
scripts\validate-resilience-sensitivity.mjs
scripts\validate-resilience-correlation.mjs
scripts\validate-resilience-backtest.mjs
scripts\test-real-workflow-brief.mjs
proto\sebuf\http\annotations.proto
convex\_generated\server.js
proto\worldmonitor\wildfire\v1\service.proto
proto\worldmonitor\wildfire\v1\list_fire_detections.proto
proto\worldmonitor\wildfire\v1\fire_detection.proto
convex\_generated\server.d.ts
convex\_generated\dataModel.d.ts
convex\_generated\api.js
convex\_generated\api.d.ts
convex\userPreferences.ts
convex\tsconfig.json
convex\telegramPairingTokens.ts
convex\schema.ts
convex\resendWebhookHandler.ts
convex\registerInterest.ts
scripts\telegram\session-auth.mjs
scripts\sync-desktop-version.mjs
scripts\signalmap-openrouter-parser.mjs
scripts\signalmap-news-collector.mjs
scripts\signalmap-lancedb-store.mjs
scripts\signalmap-geocoder.mjs
scripts\signalmap-embedding-model.mjs
scripts\signalmap-distill-bridge.mjs
server\__tests__\entitlement-check.test.ts
pro-test\src\services\entitlement-watchdog.ts
pro-test\src\services\checkout.ts
pro-test\src\services\checkout-intent-url.ts
pro-test\src\main.tsx
pro-test\src\mailcheck.d.ts
shared\un-to-iso2.json
shared\stocks.json
shared\stablecoins.json
shared\source-tiers.json
shared\source-tiers.cjs
shared\sectors.json
shared\rss-allowed-domains.json
shared\rss-allowed-domains.cjs
shared\regions.types.d.ts
shared\other-tokens.json
shared\mining-sites.js
shared\iso3-to-iso2.json
shared\iso2-to-region.json
shared\iso2-to-iso3.json
shared\gulf.json
shared\grocery-basket.json
shared\geography.js
shared\geography.d.ts
shared\forecast-macro-regions.js
shared\forecast-macro-regions.d.ts
shared\etfs.json
shared\defi-tokens.json
shared\crypto.json
shared\crypto-sectors.json
shared\country-names.json
shared\country-bboxes.json
shared\country-bboxes.js
shared\country-bboxes.d.ts
shared\commodities.json
shared\brief-llm-core.js
shared\brief-llm-core.d.ts
shared\brief-filter.js
shared\brief-filter.d.ts
shared\brief-envelope.js
shared\brief-envelope.d.ts
shared\ai-tokens.json
settings.html
tests\brief-why-matters-analyst.test.mjs
tests\brief-web-push.test.mjs
tests\brief-url.test.mjs
tests\brief-url-sign.test.mjs
tests\brief-share-url.test.mts
tests\brief-referral-code.test.mjs
tests\brief-magazine-render.test.mjs
tests\brief-llm.test.mjs
tests\brief-llm-core.test.mjs
tests\brief-from-digest-stories.test.mjs
tests\brief-filter.test.mjs
tests\brief-edge-route-smoke.test.mjs
tests\brief-dedup-replay-log.test.mjs
tests\brief-dedup-jaccard.test.mjs
tests\brief-dedup-embedding.test.mjs
tests\brief-composer-rule-dedup.test.mjs
tests\brief-carousel.test.mjs
tests\bootstrap.test.mjs
tests\bis-extended-seed.test.mjs
tests\benchmark-resilience-external.test.mjs
tests\backtest-resilience-outcomes.test.mjs
tests\aviation-prices.test.mjs
tests\aviation-cmd-date.test.mjs
tests\auth-session.test.mts
tests\audit-cohort-formula-detection.test.mts
tests\attribution-footer.test.mts
tests\api-base-url-contract.test.mjs
tests\airline-codes.test.mjs
tests\air-quality-seed.test.mjs
tests\agent-skills-index.test.mjs
docs\WorldMap\webcam-layer.mdx
docs\WorldMap\user-requests.md
docs\WorldMap\usage-rate-limits.mdx
docs\WorldMap\usage-quickstart.mdx
docs\WorldMap\usage-errors.mdx
docs\WorldMap\usage-auth.mdx
docs\WorldMap\tradingview-screener-integration.md
docs\WorldMap\TAURI_VALIDATION_REPORT.md
docs\WorldMap\strategic-risk.mdx
deploy\nginx\brotli-api-proxy.conf
scripts\shared\un-to-iso2.json
scripts\shared\swf-manifest-loader.mjs
scripts\shared\swf-classification-manifest.yaml
scripts\shared\stocks.json
scripts\shared\stablecoins.json
scripts\shared\source-tiers.json
scripts\shared\source-tiers.cjs
scripts\shared\sectors.json
scripts\shared\rss-allowed-domains.json
scripts\shared\rss-allowed-domains.cjs
scripts\shared\package.json
scripts\shared\other-tokens.json
scripts\shared\iso3-to-iso2.json
scripts\shared\iso2-to-region.json
scripts\shared\iso2-to-iso3.json
scripts\shared\gulf.json
scripts\shared\grocery-basket.json
scripts\shared\geography.js
scripts\shared\geo-extract.mjs
scripts\shared\etfs.json
scripts\shared\defi-tokens.json
scripts\shared\crypto.json
scripts\shared\crypto-sectors.json
scripts\shared\country-port-clusters.json
scripts\shared\country-names.json
scripts\shared\country-bboxes.json
scripts\shared\commodities.json
scripts\shared\brief-llm-core.js
scripts\shared\brief-llm-core.d.ts
scripts\shared\ai-tokens.json
scripts\shared\acled-oauth.mjs
scripts\shadow-score-report.mjs
scripts\shadow-score-rank.mjs
scripts\seo-indexnow-submit.mjs
scripts\seed-yield-curve-eu.mjs
scripts\seed-webcams.mjs
scripts\seed-weather-alerts.mjs
scripts\seed-wb-indicators.mjs
scripts\seed-vpd-tracker.mjs
scripts\seed-usa-spending.mjs
scripts\seed-unrest-events.mjs
scripts\seed-ucdp-events.mjs
scripts\seed-trade-flows.mjs
scripts\seed-token-panels.mjs
scripts\seed-thermal-escalation.mjs
scripts\seed-supply-chain-trade.mjs
scripts\seed-submarine-cables.mjs
scripts\seed-storage-facilities.mjs
scripts\seed-stablecoin-markets.mjs
scripts\seed-spr-policies.mjs
scripts\seed-sovereign-wealth.mjs
scripts\seed-service-statuses.mjs
scripts\seed-security-advisories.mjs
scripts\seed-sanctions-pressure.mjs
scripts\seed-resilience-static.mjs
scripts\seed-resilience-scores.mjs
scripts\seed-resilience-intervals.mjs
scripts\seed-research.mjs
scripts\seed-regulatory-actions.mjs
scripts\seed-regional-snapshots.mjs
scripts\seed-regional-briefs.mjs
scripts\seed-recovery-reserve-adequacy.mjs
scripts\seed-recovery-reexport-share.mjs
scripts\seed-recovery-import-hhi.mjs
scripts\seed-recovery-fuel-stocks.mjs
scripts\seed-recovery-fiscal-space.mjs
scripts\seed-recovery-external-debt.mjs
scripts\seed-radiation-watch.mjs
scripts\seed-prediction-markets.mjs
scripts\seed-power-reliability.mjs
scripts\seed-portwatch.mjs
scripts\seed-portwatch-port-activity.mjs
scripts\seed-portwatch-disruptions.mjs
scripts\seed-portwatch-chokepoints-ref.mjs
scripts\seed-pipelines-oil.mjs
scripts\seed-pipelines-gas.mjs
scripts\seed-owid-energy-mix.mjs
scripts\seed-natural-events.mjs
scripts\seed-national-debt.mjs
scripts\seed-military-maritime-news.mjs
scripts\seed-military-flights.mjs
scripts\seed-military-bases.mjs
scripts\seed-market-quotes.mjs
scripts\seed-market-breadth.mjs
scripts\seed-low-carbon-generation.mjs
scripts\seed-jodi-oil.mjs
scripts\seed-jodi-gas.mjs
scripts\seed-iran-events.mjs
scripts\seed-internet-outages.mjs
scripts\seed-insights.mjs
scripts\seed-infra.mjs
scripts\seed-imf-macro.mjs
scripts\seed-imf-labor.mjs
scripts\seed-imf-growth.mjs
scripts\seed-imf-external.mjs
scripts\seed-iea-oil-stocks.mjs
scripts\seed-hyperliquid-flow.mjs
scripts\seed-hs2-chokepoint-exposure.mjs
scripts\seed-hormuz.mjs
scripts\seed-health-air-quality.mjs
scripts\seed-gulf-quotes.mjs
scripts\seed-grocery-basket.mjs
scripts\seed-gold-etf-flows.mjs
scripts\seed-gold-cb-reserves.mjs
scripts\seed-gie-gas-storage.mjs
scripts\seed-gdelt-intel.mjs
scripts\seed-gas-storage-countries.mjs
scripts\seed-fx-yoy.mjs
scripts\seed-fx-rates.mjs
scripts\seed-fuel-shortages.mjs
scripts\seed-fuel-prices.mjs
scripts\seed-fsi-eu.mjs
scripts\seed-fossil-electricity-share.mjs
scripts\seed-forecasts.types.d.ts
scripts\seed-forecasts.mjs
scripts\seed-fire-detections.mjs
scripts\seed-fear-greed.mjs
scripts\seed-fao-food-price-index.mjs
scripts\seed-eurostat-industrial-production.mjs
scripts\seed-eurostat-house-prices.mjs
scripts\seed-eurostat-gov-debt-q.mjs
scripts\seed-eurostat-country-data.mjs
scripts\seed-etf-flows.mjs
scripts\seed-energy-spine.mjs
scripts\seed-energy-intelligence.mjs
scripts\seed-energy-disruptions.mjs
scripts\seed-energy-crisis-policies.mjs
scripts\seed-ember-electricity.mjs
scripts\seed-electricity-prices.mjs
scripts\seed-eia-petroleum.mjs
scripts\seed-economy.mjs
scripts\seed-economic-calendar.mjs
scripts\seed-ecb-short-rates.mjs
scripts\seed-ecb-fx-rates.mjs
scripts\seed-earthquakes.mjs
scripts\seed-earnings-calendar.mjs
scripts\seed-displacement-summary.mjs
scripts\seed-disease-outbreaks.mjs
scripts\seed-digest-notifications.mjs
scripts\seed-defense-patents.mjs
scripts\seed-cyber-threats.mjs
scripts\seed-crypto-sectors.mjs
scripts\seed-crypto-quotes.mjs
scripts\seed-cross-source-signals.mjs
scripts\seed-cot.mjs
scripts\seed-correlation.mjs
scripts\seed-consumer-prices.mjs
scripts\seed-conflict-intel.mjs
scripts\seed-comtrade-bilateral-hs4.mjs
scripts\seed-commodity-quotes.mjs
scripts\seed-co2-monitoring.mjs
scripts\seed-climate-zone-normals.mjs
scripts\seed-climate-ocean-ice.mjs
scripts\seed-climate-news.mjs
scripts\seed-climate-disasters.mjs
scripts\seed-climate-anomalies.mjs
scripts\seed-chokepoint-flows.mjs
scripts\seed-chokepoint-baselines.mjs
scripts\seed-bundle-static-ref.mjs
scripts\seed-bundle-resilience.mjs
scripts\seed-bundle-resilience-validation.mjs
scripts\seed-bundle-resilience-recovery.mjs
scripts\seed-bundle-resilience-energy-v2.mjs
scripts\seed-bundle-relay-backup.mjs
scripts\seed-bundle-regional.mjs
scripts\seed-bundle-portwatch.mjs
scripts\seed-bundle-portwatch-port-activity.mjs
scripts\seed-bundle-market-backup.mjs
scripts\seed-bundle-macro.mjs
scripts\seed-bundle-imf-extended.mjs
scripts\seed-bundle-health.mjs
scripts\seed-bundle-energy-sources.mjs
scripts\seed-bundle-ecb-eu.mjs
scripts\seed-bundle-derived-signals.mjs
scripts\seed-bundle-climate.mjs
scripts\seed-bls-series.mjs
scripts\seed-bis-extended.mjs
scripts\seed-bis-data.mjs
scripts\seed-bigmac.mjs
scripts\seed-aviation.mjs
scripts\seed-aaii-sentiment.mjs
scripts\scenario-worker.mjs
scripts\run-seeders.sh
scripts\rss-feeds-report.csv
scripts\replay-forecast-run.mjs
pro-test\src\locales\zh.json
pro-test\src\locales\vi.json
pro-test\src\locales\tr.json
pro-test\src\locales\th.json
pro-test\src\locales\sv.json
pro-test\src\locales\ru.json
pro-test\src\locales\ro.json
pro-test\src\locales\pt.json
pro-test\src\locales\pl.json
pro-test\src\locales\nl.json
pro-test\src\locales\ko.json
pro-test\src\locales\ja.json
pro-test\src\locales\it.json
pro-test\src\locales\fr.json
pro-test\src\locales\es.json
pro-test\src\locales\en.json
pro-test\src\locales\el.json
pro-test\src\locales\de.json
pro-test\src\locales\cs.json
pro-test\src\locales\bg.json
pro-test\src\locales\ar.json
proto\worldmonitor\webcam\v1\service.proto
proto\worldmonitor\webcam\v1\list_webcams.proto
proto\worldmonitor\webcam\v1\get_webcam_image.proto
proto\worldmonitor\core\v1\time.proto
proto\worldmonitor\core\v1\severity.proto
proto\worldmonitor\core\v1\pagination.proto
pro-test\src\index.css
proto\worldmonitor\core\v1\identifiers.proto
pro-test\src\i18n.ts
proto\worldmonitor\core\v1\i18n.proto
proto\worldmonitor\core\v1\geo.proto
proto\worldmonitor\core\v1\general_error.proto
proto\worldmonitor\core\v1\country.proto
proto\worldmonitor\climate\v1\service.proto
proto\worldmonitor\climate\v1\ocean_ice_data.proto
proto\worldmonitor\climate\v1\list_climate_news.proto
proto\worldmonitor\climate\v1\list_climate_disasters.proto
proto\worldmonitor\climate\v1\list_climate_anomalies.proto
proto\worldmonitor\climate\v1\list_air_quality_data.proto
proto\worldmonitor\climate\v1\get_ocean_ice_data.proto
proto\worldmonitor\climate\v1\get_co2_monitoring.proto
proto\worldmonitor\climate\v1\co2_monitoring.proto
proto\worldmonitor\climate\v1\climate_news_item.proto
proto\worldmonitor\climate\v1\climate_disaster.proto
proto\worldmonitor\climate\v1\climate_anomaly.proto
server\_shared\user-api-key.ts
server\_shared\turnstile.ts
server\_shared\timing-safe.ts
server\_shared\source-tiers.ts
server\_shared\sidecar-cache.ts
server\_shared\seed-envelope.ts
server\_shared\response-headers.ts
server\_shared\resilience-stats.ts
server\_shared\resilience-freshness.ts
server\_shared\relay.ts
server\_shared\referral-code.ts
server\_shared\redis.ts
server\_shared\rate-limit.ts
server\_shared\premium-check.ts
server\_shared\parse-string-array.ts
server\_shared\normalize-list.ts
server\_shared\llm.ts
server\_shared\llm-sanitize.js
server\_shared\llm-sanitize.d.ts
server\_shared\llm-health.ts
server\_shared\internal-auth.ts
server\_shared\hash.ts
server\_shared\fetch-json.ts
server\_shared\entitlement-check.ts
server\_shared\email-validation.ts
server\_shared\country-token.ts
server\_shared\country-normalize.ts
server\_shared\constants.ts
server\_shared\chokepoint-registry.ts
server\_shared\cache-keys.ts
server\_shared\bypass-corridors.ts
server\_shared\brief-url.ts
server\_shared\brief-share-url.ts
server\_shared\brief-render.js
server\_shared\brief-render.d.ts
server\_shared\brief-carousel-render.ts
server\_shared\auth-session.ts
server\_shared\airline-codes.ts
server\_shared\air-quality-stations.ts
server\_shared\acled.ts
server\_shared\acled-auth.ts
docs\WorldMap\snapshots\resilience-ranking-pillar-combined-projected-2026-04-21.json
docs\WorldMap\snapshots\resilience-ranking-live-pre-repair-2026-04-22.json
docs\WorldMap\snapshots\resilience-ranking-2026-04-21.json
docs\WorldMap\snapshots\resilience-pillar-sensitivity-2026-04-21.json
docs\WorldMap\signal-intelligence.mdx
docs\WorldMap\scenario-engine.mdx
docs\WorldMap\route-explorer.mdx
docs\WorldMap\release-packaging.mdx
docs\WorldMap\relay-parameters.mdx
docs\WorldMap\railway-seed-consolidation-runbook.md
docs\WorldMap\PRESS_KIT.md
docs\WorldMap\premium-finance.mdx
docs\WorldMap\premium-finance-search.mdx
data\telegram-channels.json
data\oref-threat-translations-he-en.json
data\israeli-localities-he-en.json
data\gamma-irradiators.json
data\gamma-irradiators-raw.json
docs\WorldMap\data-sources.mdx
docs\WorldMap\country-instability-index.mdx
docs\WorldMap\cors.mdx
docs\WorldMap\corrections.mdx
docs\WorldMap\contributing.mdx
docs\WorldMap\COMMUNITY-PROMOTION-GUIDE.md
docs\WorldMap\climate-variant-full.md
docs\WorldMap\changelog.mdx
convex\payments\webhookMutations.ts
convex\payments\webhookHandlers.ts
convex\payments\subscriptionHelpers.ts
convex\payments\subscriptionEmails.ts
convex\payments\seedProductPlans.ts
convex\payments\checkout.ts
convex\payments\cacheActions.ts
convex\payments\billing.ts
convex\notificationChannels.ts
blog-site\src\styles\global.css
scripts\regional-snapshot\_helpers.mjs
scripts\regional-snapshot\weekly-brief.mjs
scripts\regional-snapshot\triggers.config.mjs
scripts\regional-snapshot\trigger-evaluator.mjs
scripts\regional-snapshot\transmission-templates.mjs
scripts\regional-snapshot\snapshot-meta.mjs
scripts\regional-snapshot\scenario-builder.mjs
scripts\regional-snapshot\regime-history.mjs
scripts\regional-snapshot\regime-derivation.mjs
scripts\regional-snapshot\persist-snapshot.mjs
scripts\regional-snapshot\narrative.mjs
scripts\regional-snapshot\mobility.mjs
scripts\regional-snapshot\freshness.mjs
scripts\regional-snapshot\evidence-collector.mjs
scripts\regional-snapshot\diff-snapshot.mjs
scripts\regional-snapshot\balance-vector.mjs
scripts\regional-snapshot\alert-emitter.mjs
scripts\regional-snapshot\actor-scoring.mjs
scripts\promote-forecast-benchmark-candidate.mjs
scripts\process-simulation-tasks.mjs
scripts\process-deep-forecast-tasks.mjs
scripts\package.json
scripts\package-lock.json
scripts\notification-relay.cjs
scripts\nixpacks.toml
scripts\need-work.csv
scripts\lint-boundaries.mjs
pro-test\src\generated\tiers.json
docs\WorldMap\plans\resilience-phase-2-structural-rebuild.md
docs\WorldMap\brainstorms\2026-03-27-pro-mcp-server-requirements.md
docs\WorldMap\brainstorms\2026-03-27-intelligence-analytical-frameworks-requirements.md
docs\WorldMap\authentication.mdx
docs\WorldMap\architecture.mdx
src-tauri\tauri.tech.conf.json
src-tauri\tauri.finance.conf.json
src-tauri\tauri.conf.json
blog-site\src\pages\rss.xml.ts
pro-test\src\components\SoonBadge.tsx
pro-test\src\components\PricingSection.tsx
scripts\lib\_upstash-pipeline.mjs
scripts\lib\user-context.cjs
scripts\lib\thermal-escalation.mjs
scripts\lib\resend-from.cjs
scripts\lib\quiet-hours.cjs
scripts\lib\llm-chain.cjs
scripts\lib\entity-gazetteer.mjs
scripts\lib\digest-only-user.mjs
scripts\lib\crypto.cjs
scripts\lib\brief-url-sign.mjs
scripts\lib\brief-llm.mjs
scripts\lib\brief-embedding.mjs
scripts\lib\brief-dedup.mjs
scripts\lib\brief-dedup-replay-log.mjs
scripts\lib\brief-dedup-jaccard.mjs
scripts\lib\brief-dedup-embed.mjs
scripts\lib\brief-dedup-consts.mjs
scripts\lib\brief-compose.mjs
scripts\jsconfig.json
scripts\import-bounced-emails.mjs
scripts\generate-product-config.mjs
scripts\generate-oref-locations.mjs
scripts\generate-iso3-maps.cjs
scripts\generate-country-bboxes.cjs
scripts\freeze-resilience-ranking.mjs
scripts\fetch-pizzint-bases.mjs
scripts\fetch-osm-bases.mjs
scripts\fetch-mirta-bases.mjs
scripts\fetch-gpsjam.mjs
scripts\fetch-country-boundary-overrides.mjs
scripts\extract-forecast-benchmark-candidates.mjs
scripts\evaluate-forecast-run.mjs
scripts\evaluate-forecast-benchmark.mjs
scripts\enforce-sebuf-api-contract.mjs
scripts\enforce-rate-limit-policies.mjs
scripts\enforce-premium-fetch.mjs
scripts\download-node.sh
scripts\diff-forecast-runs.mjs
scripts\desktop-package.mjs
tests\yahoo-fetch.test.mjs
tests\wsb-ticker-seed.test.mjs
tests\widget-builder.test.mjs
tests\widget-agent-auth.test.mts
tests\webmcp.test.mjs
tests\variant-layer-guardrail.test.mjs
tests\user-context.test.mjs
tests\urlState.test.mts
tests\url-sync-initial.test.mts
tests\ucdp-seed-resilience.test.mjs
tests\turnstile.test.mjs
tests\ttl-acled-ais-guards.test.mjs
tests\transit-summaries.test.mjs
tests\trade-policy-tariffs.test.mjs
tests\thermal-escalation-model.test.mjs
tests\thermal-escalation-handler-guardrail.test.mjs
tests\tech-readiness-circuit-breakers.test.mjs
tests\swf-classification-manifest.test.mjs
tests\sw-update.test.mts
tests\supply-chain-validation.test.mjs
tests\supply-chain-v2.test.mjs
tests\supply-chain-sprint2.test.mjs
tests\supply-chain-panel-transit-chart.test.mjs
tests\supply-chain-handlers.test.mjs
tests\supplier-route-risk.test.mjs
tests\summary-cache-key.test.mts
tests\summary-cache-capacity.test.mts
tests\summarize-reasoning.test.mjs
tests\storage-facility-registry-store.test.mts
tests\storage-facilities-registry.test.mts
tests\storage-evidence-derivation.test.mts
tests\stock-news-search.test.mts
tests\stock-dividend-profile.test.mts
tests\stock-backtest.test.mts
tests\stock-analysis.test.mts
tests\stock-analysis-history.test.mts
tests\sse-stream.test.mjs
tests\sse-replay-ring.test.mjs
tests\spr-policies-seed.test.mjs
tests\smart-poll-loop.test.mjs
tests\signup-analytics-gate.test.mts
tests\signalmap-watchlist.test.mjs
tests\signalmap-rpc-shell.test.mjs
tests\signalmap-radar-normalization.test.mjs
tests\signalmap-public-access.test.mjs
tests\signalmap-provider-status.test.mjs
tests\signalmap-news-collector.test.mjs
tests\signalmap-llm-schema.test.mjs
tests\signalmap-lancedb-store.test.mjs
tests\signalmap-docker-runtime.test.mjs
tests\signal-quality.test.mts
tests\shortage-evidence.test.mts
tests\shipping-v2-handler.test.mjs
tests\shared-relay.test.mjs
tests\shared-llm.test.mts
tests\server-handlers.test.mjs
tests\sentry-beforesend.test.mjs
tests\seed-warm-ping-origin.test.mjs
tests\seed-utils.test.mjs
tests\seed-utils-sigterm-cleanup.test.mjs
tests\seed-utils-envelope-reads.test.mjs
tests\seed-utils-empty-data-failure.test.mjs
tests\seed-sovereign-wealth.test.mjs
tests\seed-sovereign-wealth-reads-redis-reexport-share.test.mts
tests\seed-recovery-reserve-adequacy.test.mjs
tests\seed-recovery-reexport-share-comtrade.test.mts
tests\seed-recovery-import-hhi.test.mjs
tests\seed-recovery-fuel-stocks.test.mjs
tests\seed-recovery-external-debt.test.mjs
tests\seed-learned-routes.test.mjs
tests\seed-insights-brief.test.mjs
tests\seed-imf-extended.test.mjs
tests\seed-fx-yoy.test.mjs
tests\seed-fuel-prices.test.mjs
tests\seed-envelope.test.mjs
tests\seed-envelope-parity.test.mjs
tests\seed-empty-data-is-failure.test.mjs
tests\seed-eia-petroleum.test.mjs
tests\seed-contract.test.mjs
tests\seed-contract-transform-regressions.test.mjs
tests\seed-contract-probe.test.mjs
tests\seed-comtrade-5xx-retry.test.mjs
tests\seed-bundle-resilience-validation.test.mjs
tests\seed-bundle-resilience-recovery.test.mjs
tests\seed-aaii-sentiment.test.mjs
tests\sector-valuations.test.mjs
tests\sector-route-explorer.test.mjs
tests\scripts-shared-mirror.test.mjs
tests\scenario-handler.test.mjs
tests\sanctions-seed-unit.test.mjs
tests\sanctions-pressure.test.mjs
tests\runtime-harness.html
tests\runtime-env-guards.test.mjs
tests\runtime-config-panel-visibility.test.mjs
tests\route-explorer-url-state.test.mts
tests\route-explorer-pickers.test.mts
tests\route-explorer-lane.test.mts
tests\route-explorer-keyboard.test.mts
tests\route-drawing-layers.test.mjs
tests\route-cache-tier.test.mjs
tests\resilience-widget.test.mts
tests\resilience-stats.test.mts
tests\resilience-static-seed.test.mjs
tests\resilience-source-failure.test.mts
tests\resilience-sensitivity-v2.test.mts
tests\resilience-scores-seed.test.mjs
tests\resilience-scorers.test.mts
tests\resilience-sanctions-field-mapping.test.mts
tests\resilience-retired-dimensions-parity.test.mts
tests\resilience-release-gate.test.mts
tests\resilience-recovery-weight-rebalance.test.mts
tests\resilience-recovery-ordering.test.mts
tests\resilience-ranking.test.mts
tests\resilience-ranking-snapshot.test.mts
tests\resilience-pillar-schema.test.mts
tests\resilience-pillar-combine-activation.test.mts
tests\resilience-pillar-aggregation.test.mts
tests\resilience-net-imports-denominator.test.mts
tests\resilience-methodology-lint.test.mts
tests\resilience-map-layer.test.mts
tests\resilience-language-normalization.test.mts
tests\resilience-intervals.test.mjs
tests\resilience-intervals-handler.test.mts
tests\resilience-indicator-tiering.test.mts
tests\resilience-indicator-registry.test.mts
tests\resilience-indicator-extraction-plan.test.mjs
tests\resilience-handlers.test.mts
tests\resilience-freshness.test.mts
tests\resilience-foodwater-field-mapping.test.mts
tests\resilience-energy-v2.test.mts
tests\resilience-displacement-field-mapping.test.mts
tests\resilience-dimension-scorers.test.mts
tests\resilience-dimension-monotonicity.test.mts
tests\resilience-dimension-freshness.test.mts
tests\resilience-coverage-influence-gate.test.mts
tests\resilience-country-brief.test.mjs
tests\resilience-construct-invariants.test.mts
tests\resilience-confidence-averaging.test.mts
tests\resilience-cohort-config.test.mts
tests\resilience-cache-keys-health-sync.test.mts
tests\resilience-baseline-snapshot-ordering.test.mjs
tests\resend-sender-normalize.test.mjs
tests\relay-importance-recompute.test.mjs
tests\relay-helper.test.mjs
tests\regulatory-seed-unit.test.mjs
tests\regulatory-contract.test.mjs
tests\regional-snapshot.test.mjs
tests\regional-snapshot-weekly-brief.test.mjs
tests\regional-snapshot-regime-history.test.mjs
tests\regional-snapshot-narrative.test.mjs
tests\regional-snapshot-mobility.test.mjs
tests\regional-snapshot-alerts.test.mjs
tests\regional-intelligence-board.test.mts
tests\referral-capture.test.mts
tests\redis-caching.test.mjs
tests\redis-adapter.test.mjs
tests\redis-adapter-contract.test.mts
tests\quiet-hours.test.mjs
tests\quiet-hours-rollout-flags.test.mjs
tests\product-catalog-freshness.test.mjs
tests\pro-checkout-intent-url.test.mts
tests\premium-stock-gateway.test.mts
tests\premium-fetch.test.mts
tests\prediction-scoring.test.mjs
tests\portwatch-upstream.test.mjs
tests\portwatch-port-activity-seed.test.mjs
tests\portwatch-disruptions-seed.test.mjs
tests\portwatch-chokepoints-ref-seed.test.mjs
tests\pipelines-registry.test.mts
tests\pipeline-registry-store.test.mts
tests\pipeline-panel-bootstrap.test.mts
tests\pipeline-evidence-derivation.test.mts
tests\panel-config-guardrails.test.mjs
tests\owid-energy-mix-seed.test.mjs
tests\oref-proxy.test.mjs
tests\oref-locations.test.mjs
tests\oref-breaking.test.mjs
tests\openapi-spec-generation.test.mjs
tests\open-meteo-proxy-fallback.test.mjs
tests\oil-inventories.test.mjs
tests\notification-relay-shadow-log.test.mjs
tests\notification-relay-payload-audit.test.mjs
tests\news-story-track-description-persistence.test.mts
tests\news-rss-description-extract.test.mts
tests\national-debt-ticker.test.mts
tests\national-debt-seed.test.mjs
tests\multi-sector-cost-shock.test.mjs
tests\mobile-map-integration-harness.html
tests\mobile-map-harness.html
tests\military-surges.test.mjs
tests\military-flight-classification.test.mjs
tests\military-classification.test.mjs
tests\middleware-bot-gate.test.mts
tests\mdx-lint.test.mjs
tests\mcp.test.mjs
tests\mcp-proxy.test.mjs
tests\mcp-presets.test.mjs
tests\mcp-connect-modal-interval.test.mts
tests\market-service-symbol-casing.test.mjs
tests\market-quote-cache-keying.test.mjs
tests\market-implications.test.mts
tests\market-breadth.test.mjs
tests\map-locale.test.mts
tests\map-layer-executable.test.mts
tests\map-harness.html
tests\map-fullscreen-resize.test.mjs
tests\makefile-generate-plugin-path.test.mjs
tests\llm-sanitize.test.mjs
tests\live-news-panel-guard.test.mts
tests\live-news-hls.test.mjs
tests\lint-md-script-scope.test.mjs
tests\jodi-oil-seed.test.mjs
tests\jodi-gas-seed.test.mjs
tests\intelligence-gap-badge-polling.test.mts
tests\insights-loader.test.mjs
tests\insider-transactions.test.mts
tests\importance-score-parity.test.mjs
tests\imf-country-data.test.mts
tests\iea-oil-stocks-seed.test.mjs
tests\hyperliquid-flow-seed.test.mjs
docs\WorldMap\plans\archive\roadmap-pro-HISTORICAL.md
docs\WorldMap\plans\2026-04-09-001-feat-worldwide-supply-chain-routing-intelligence-plan.md
docs\WorldMap\plans\2026-03-29-001-feat-gold-layer-commodity-variant-plan.md
server\worldmonitor\_bootstrap-cache-key-refs.ts
proto\worldmonitor\aviation\v1\track_aircraft.proto
proto\worldmonitor\aviation\v1\service.proto
proto\worldmonitor\aviation\v1\search_google_flights.proto
proto\worldmonitor\aviation\v1\search_google_dates.proto
proto\worldmonitor\aviation\v1\search_flight_prices.proto
proto\worldmonitor\aviation\v1\price_quote.proto
proto\worldmonitor\aviation\v1\position_sample.proto
proto\worldmonitor\aviation\v1\list_aviation_news.proto
proto\worldmonitor\aviation\v1\list_airport_flights.proto
proto\worldmonitor\aviation\v1\list_airport_delays.proto
proto\worldmonitor\aviation\v1\get_youtube_live_stream_info.proto
proto\worldmonitor\aviation\v1\get_flight_status.proto
proto\worldmonitor\aviation\v1\get_carrier_ops.proto
proto\worldmonitor\aviation\v1\get_airport_ops_summary.proto
proto\worldmonitor\aviation\v1\flight_instance.proto
proto\worldmonitor\aviation\v1\carrier.proto
proto\worldmonitor\aviation\v1\aviation_news_item.proto
proto\worldmonitor\aviation\v1\airport_delay.proto
src-tauri\src\main.rs
docs\WorldMap\architecture\pro-monetization.md
docs\WorldMap\api-shipping-v2.mdx
docs\WorldMap\api-scenarios.mdx
docs\WorldMap\api-proxies.mdx
docs\WorldMap\api-platform.mdx
docs\WorldMap\api-oauth.mdx
docs\WorldMap\api-notifications.mdx
docs\WorldMap\api-key-deployment.mdx
docs\WorldMap\api-commerce.mdx
docs\WorldMap\api-brief.mdx
convex\lib\identitySigning.ts
convex\lib\env.ts
convex\lib\entitlements.ts
convex\lib\dodo.ts
convex\lib\auth.ts
convex\http.ts
convex\entitlements.ts
convex\emailSuppressions.ts
convex\crons.ts
convex\convex.config.ts
convex\contactMessages.ts
convex\constants.ts
blog-site\src\pages\posts\[...id].astro
blog-site\src\pages\index.astro
pro-test\src\assets\worldmonitor-7-mar-2026.jpg
pro-test\src\assets\wired-logo.svg
pro-test\src\App.tsx
pro-test\README.md
pro-test\prerender.mjs
pro-test\package.json
pro-test\package-lock.json
pro-test\metadata.json
pro-test\index.html
pro-test\.env.production
pro-test\.env.example
proto\worldmonitor\consumer_prices\v1\service.proto
proto\worldmonitor\consumer_prices\v1\list_retailer_price_spreads.proto
proto\worldmonitor\consumer_prices\v1\list_consumer_price_movers.proto
proto\worldmonitor\consumer_prices\v1\list_consumer_price_categories.proto
proto\worldmonitor\consumer_prices\v1\get_consumer_price_overview.proto
proto\worldmonitor\consumer_prices\v1\get_consumer_price_freshness.proto
proto\worldmonitor\consumer_prices\v1\get_consumer_price_basket_series.proto
proto\worldmonitor\consumer_prices\v1\consumer_prices_data.proto
scripts\data\storage-facilities.json
scripts\data\spr-policies.json
scripts\data\prediction-tags.json
scripts\data\pipelines-oil.json
scripts\data\pipelines-gas.json
scripts\data\mirta-processed.json
scripts\data\fuel-shortages.json
scripts\data\forecast-historical-benchmark.json
scripts\data\forecast-evaluation-benchmark.json
scripts\data\entity-graph.json
scripts\data\energy-disruptions.json
scripts\data\energy-crisis-policies.json
scripts\data\curated-bases.json
scripts\data\country-codes.json
scripts\data\cascade-rules.json
scripts\compare-resilience-current-vs-proposed.mjs
scripts\compare-draft-models.mjs
scripts\check-unicode-safety.mjs
scripts\build-sidecar-sebuf.mjs
scripts\build-sidecar-handlers.mjs
scripts\build-openapi.mjs
scripts\build-military-bases-final.mjs
scripts\build-country-names.cjs
scripts\build-agent-skills-index.mjs
scripts\benchmark-resilience-external.mjs
scripts\backtest-resilience-outcomes.mjs
scripts\backfill-fuel-prices-prev.mjs
scripts\audit-resilience-cohorts.mjs
scripts\ais-relay.cjs
scripts\ais-relay-rss.test.cjs
README.md
docs\WorldMap\panels\wsb-ticker-scanner.mdx
docs\WorldMap\panels\world-clock.mdx
docs\WorldMap\panels\trade-policy.mdx
docs\WorldMap\panels\thermal-escalation.mdx
docs\WorldMap\panels\telegram-intel.mdx
docs\WorldMap\panels\tech-readiness.mdx
docs\WorldMap\panels\supply-chain.mdx
docs\WorldMap\panels\strategic-posture.mdx
docs\WorldMap\panels\stock-backtest.mdx
docs\WorldMap\panels\stock-analysis.mdx
docs\WorldMap\panels\sanctions-pressure.mdx
docs\WorldMap\panels\regional-intelligence.mdx
docs\WorldMap\panels\radiation-watch.mdx
docs\WorldMap\panels\oref-sirens.mdx
docs\WorldMap\panels\news-feeds.mdx
docs\WorldMap\panels\monitors.mdx
docs\WorldMap\panels\market-implications.mdx
docs\WorldMap\panels\latest-brief.mdx
docs\WorldMap\panels\indicators-and-signals.mdx
docs\WorldMap\panels\hormuz-tracker.mdx
docs\WorldMap\panels\fsi.mdx
docs\WorldMap\panels\forecast.mdx
docs\WorldMap\panels\energy-crisis.mdx
docs\WorldMap\panels\disease-outbreaks.mdx
docs\WorldMap\panels\deduction.mdx
docs\WorldMap\panels\daily-market-brief.mdx
docs\WorldMap\panels\consumer-prices.mdx
docs\WorldMap\panels\chat-analyst.mdx
docs\WorldMap\panels\airline-intel.mdx
docs\WorldMap\overview.mdx
docs\WorldMap\orbital-surveillance.mdx
docs\WorldMap\og-image.png
docs\WorldMap\natural-disasters.mdx
docs\WorldMap\military-tracking.mdx
src-tauri\sidecar\package.json
proto\worldmonitor\unrest\v1\unrest_event.proto
proto\worldmonitor\unrest\v1\service.proto
proto\worldmonitor\unrest\v1\list_unrest_events.proto
blog-site\src\layouts\BlogPost.astro
blog-site\src\layouts\Base.astro
blog-site\src\content.config.ts
docs\WorldMap\api\worldmonitor.openapi.yaml
docs\WorldMap\api\WildfireService.openapi.yaml
docs\WorldMap\api\WildfireService.openapi.json
docs\WorldMap\api\WebcamService.openapi.yaml
docs\WorldMap\api\WebcamService.openapi.json
docs\WorldMap\api\UnrestService.openapi.yaml
docs\WorldMap\api\UnrestService.openapi.json
docs\WorldMap\api\TradeService.openapi.yaml
docs\WorldMap\api\TradeService.openapi.json
docs\WorldMap\api\ThermalService.openapi.yaml
docs\WorldMap\api\ThermalService.openapi.json
docs\WorldMap\api\SupplyChainService.openapi.yaml
docs\WorldMap\api\SupplyChainService.openapi.json
docs\WorldMap\api\ShippingV2Service.openapi.yaml
docs\WorldMap\api\ShippingV2Service.openapi.json
docs\WorldMap\api\SeismologyService.openapi.yaml
docs\WorldMap\api\SeismologyService.openapi.json
docs\WorldMap\api\ScenarioService.openapi.yaml
docs\WorldMap\api\ScenarioService.openapi.json
docs\WorldMap\api\SanctionsService.openapi.yaml
docs\WorldMap\api\SanctionsService.openapi.json
docs\WorldMap\api\ResilienceService.openapi.yaml
docs\WorldMap\api\ResilienceService.openapi.json
docs\WorldMap\api\ResearchService.openapi.yaml
docs\WorldMap\api\ResearchService.openapi.json
docs\WorldMap\api\RadiationService.openapi.yaml
docs\WorldMap\api\RadiationService.openapi.json
docs\WorldMap\api\PredictionService.openapi.yaml
docs\WorldMap\api\PredictionService.openapi.json
docs\WorldMap\api\PositiveEventsService.openapi.yaml
docs\WorldMap\api\PositiveEventsService.openapi.json
docs\WorldMap\api\NewsService.openapi.yaml
docs\WorldMap\api\NewsService.openapi.json
docs\WorldMap\api\NaturalService.openapi.yaml
docs\WorldMap\api\NaturalService.openapi.json
docs\WorldMap\api\MilitaryService.openapi.yaml
docs\WorldMap\api\MilitaryService.openapi.json
docs\WorldMap\api\MarketService.openapi.yaml
docs\WorldMap\api\MarketService.openapi.json
docs\WorldMap\api\MaritimeService.openapi.yaml
docs\WorldMap\api\MaritimeService.openapi.json
docs\WorldMap\api\LeadsService.openapi.yaml
docs\WorldMap\api\LeadsService.openapi.json
docs\WorldMap\api\IntelligenceService.openapi.yaml
docs\WorldMap\api\IntelligenceService.openapi.json
docs\WorldMap\api\InfrastructureService.openapi.yaml
docs\WorldMap\api\InfrastructureService.openapi.json
docs\WorldMap\api\ImageryService.openapi.yaml
docs\WorldMap\api\ImageryService.openapi.json
docs\WorldMap\api\HealthService.openapi.yaml
docs\WorldMap\api\HealthService.openapi.json
docs\WorldMap\api\GivingService.openapi.yaml
docs\WorldMap\api\GivingService.openapi.json
docs\WorldMap\api\ForecastService.openapi.yaml
docs\WorldMap\api\ForecastService.openapi.json
docs\WorldMap\api\EconomicService.openapi.yaml
docs\WorldMap\api\EconomicService.openapi.json
docs\WorldMap\api\DisplacementService.openapi.yaml
docs\WorldMap\api\DisplacementService.openapi.json
docs\WorldMap\api\CyberService.openapi.yaml
docs\WorldMap\api\CyberService.openapi.json
docs\WorldMap\api\ConsumerPricesService.openapi.yaml
docs\WorldMap\api\ConsumerPricesService.openapi.json
docs\WorldMap\api\ConflictService.openapi.yaml
docs\WorldMap\api\ConflictService.openapi.json
docs\WorldMap\api\ClimateService.openapi.yaml
docs\WorldMap\api\ClimateService.openapi.json
docs\WorldMap\api\AviationService.openapi.yaml
docs\WorldMap\api\AviationService.openapi.json
docs\WorldMap\algorithms.mdx
docs\WorldMap\ai-intelligence.mdx
docs\WorldMap\adding-endpoints.mdx
public\wm-widget-sandbox.html
tests\helpers\runtime-config-panel-harness.mjs
tests\helpers\resilience-release-fixtures.mts
tests\helpers\resilience-matched-pairs.mts
tests\helpers\resilience-fixtures.mts
tests\helpers\resilience-cohorts.mts
tests\helpers\premium-check-stub.ts
tests\helpers\llm-health-stub.ts
tests\helpers\fake-upstash-redis.mts
tests\helpers\country-deep-dive-panel-harness.mjs
tests\hapi-gdelt-circuit-breakers.test.mjs
tests\handlers.test.mts
tests\gulf-fdi-data.test.mjs
tests\gscpi-shape-extraction.test.mjs
tests\google-flights.test.mts
tests\gold-intelligence.test.mjs
tests\gold-intelligence-seed.test.mjs
tests\gold-etf-flows-seed.test.mjs
tests\gold-cb-reserves-seed.test.mjs
tests\globe-tooltip-enrichment.test.mjs
tests\globe-2d-3d-parity.test.mjs
tests\get-regional-snapshot.test.mts
tests\get-regime-history.test.mts
tests\get-chokepoint-history.test.mjs
tests\geo-keyword-matching.test.mts
tests\gdelt-fetch.test.mjs
tests\gateway-cdn-origin-policy.test.mts
tests\gas-storage-countries-seed.test.mjs
tests\fuel-shortages-registry.test.mts
tests\fuel-shortage-registry-store.test.mts
tests\freight-indices.test.mjs
tests\forecast-trace-export.test.mjs
tests\forecast-history.test.mjs
tests\forecast-detectors.test.mjs
tests\flush-stale-refreshes.test.mjs
src-tauri\sidecar\node\.gitkeep
src-tauri\sidecar\local-api-server.test.mjs
src-tauri\sidecar\local-api-server.mjs
docs\WorldMap\methodology\swf-classification-rubric.md
docs\WorldMap\methodology\storage.mdx
docs\WorldMap\methodology\shortages.mdx
docs\WorldMap\methodology\pipelines.mdx
docs\WorldMap\methodology\known-limitations.md
docs\WorldMap\methodology\indicator-sources.yaml
docs\WorldMap\methodology\energy-v2-flag-flip-runbook.md
docs\WorldMap\methodology\disruptions.mdx
docs\WorldMap\methodology\country-resilience-index.mdx
proto\worldmonitor\conflict\v1\ucdp_event.proto
proto\worldmonitor\conflict\v1\service.proto
proto\worldmonitor\conflict\v1\list_ucdp_events.proto
proto\worldmonitor\conflict\v1\list_iran_events.proto
proto\worldmonitor\conflict\v1\list_acled_events.proto
proto\worldmonitor\conflict\v1\humanitarian_summary.proto
proto\worldmonitor\conflict\v1\get_humanitarian_summary_batch.proto
proto\worldmonitor\conflict\v1\get_humanitarian_summary.proto
proto\worldmonitor\conflict\v1\acled_event.proto
proto\worldmonitor\imagery\v1\service.proto
proto\worldmonitor\imagery\v1\search_imagery.proto
convex\config\productCatalog.ts
convex\auth.config.ts
convex\apiKeys.ts
convex\alertRules.ts
CONTRIBUTING.md
docs\snapshots\resilience-ranking-2026-04-25.json
src-tauri\nsis\installer-hooks.nsh
proto\worldmonitor\trade\v1\trade_data.proto
proto\worldmonitor\trade\v1\service.proto
proto\worldmonitor\trade\v1\list_comtrade_flows.proto
proto\worldmonitor\trade\v1\get_trade_restrictions.proto
proto\worldmonitor\trade\v1\get_trade_flows.proto
proto\worldmonitor\trade\v1\get_trade_barriers.proto
proto\worldmonitor\trade\v1\get_tariff_trends.proto
proto\worldmonitor\trade\v1\get_customs_revenue.proto
proto\worldmonitor\natural\v1\service.proto
proto\worldmonitor\natural\v1\list_natural_events.proto
blog-site\src\content\blog\worldmonitor-vs-traditional-intelligence-tools.md
blog-site\src\content\blog\worldmonitor-in-21-languages-global-intelligence-for-everyone.md
blog-site\src\content\blog\what-is-worldmonitor-real-time-global-intelligence.md
blog-site\src\content\blog\tracking-global-trade-routes-chokepoints-freight-costs.md
blog-site\src\content\blog\track-global-conflicts-in-real-time.md
blog-site\src\content\blog\satellite-imagery-orbital-surveillance.md
blog-site\src\content\blog\real-time-market-intelligence-for-traders-and-analysts.md
blog-site\src\content\blog\prediction-markets-ai-forecasting-geopolitics.md
blog-site\src\content\blog\osint-for-everyone-open-source-intelligence-democratized.md
blog-site\src\content\blog\natural-disaster-monitoring-earthquakes-fires-volcanoes.md
blog-site\src\content\blog\monitor-global-supply-chains-and-commodity-disruptions.md
blog-site\src\content\blog\live-webcams-from-geopolitical-hotspots.md
blog-site\src\content\blog\five-dashboards-one-platform-worldmonitor-variants.md
blog-site\src\content\blog\cyber-threat-intelligence-for-security-teams.md
blog-site\src\content\blog\command-palette-search-everything-instantly.md
blog-site\src\content\blog\build-on-worldmonitor-developer-api-open-source.md
blog-site\src\content\blog\ai-powered-intelligence-without-the-cloud.md
public\textures\night-sky.png
public\textures\earth-water.png
public\textures\earth-topo-bathy.jpg
public\textures\earth-day.jpg
public\textures\earth-blue-marble.jpg
public\sitemap.xml
public\robots.txt
public\push-handler.js
consumer-prices-core\vitest.config.ts
consumer-prices-core\tsconfig.json
server\worldmonitor\wildfire\v1\list-fire-detections.ts
server\worldmonitor\wildfire\v1\handler.ts
src-tauri\icons\StoreLogo.png
src-tauri\icons\Square89x89Logo.png
src-tauri\icons\Square71x71Logo.png
src-tauri\icons\Square44x44Logo.png
src-tauri\icons\Square310x310Logo.png
src-tauri\icons\Square30x30Logo.png
src-tauri\icons\Square284x284Logo.png
src-tauri\icons\Square150x150Logo.png
src-tauri\icons\Square142x142Logo.png
src-tauri\icons\Square107x107Logo.png
docs\WorldMap\methodology\country-resilience-index\validation\benchmark-results.json
docs\WorldMap\methodology\cohort-sanity-release-gate.md
docs\WorldMap\methodology\chokepoints.mdx
docs\WorldMap\mcp.mdx
docs\WorldMap\maritime-intelligence.mdx
docs\WorldMap\maps-and-geocoding.mdx
docs\WorldMap\map-engine.mdx
docs\WorldMap\logo.png
docs\WorldMap\local-backend-audit.md
docs\WorldMap\license.mdx
docs\WorldMap\infrastructure-cascade.mdx
proto\worldmonitor\forecast\v1\service.proto
proto\worldmonitor\forecast\v1\get_simulation_package.proto
proto\worldmonitor\forecast\v1\get_simulation_outcome.proto
proto\worldmonitor\forecast\v1\get_forecasts.proto
proto\worldmonitor\forecast\v1\forecast.proto
blog-site\scripts\generate-og-images.mjs
docs\SignalMap\_review\phase-3-review-prompt.md
docs\SignalMap\_review\phase-3-gemini-review.md
docs\SignalMap\_review\phase-3-codex-review.md
proto\worldmonitor\thermal\v1\thermal_escalation_cluster.proto
proto\worldmonitor\thermal\v1\service.proto
proto\worldmonitor\thermal\v1\list_thermal_escalations.proto
proto\worldmonitor\health\v1\service.proto
proto\worldmonitor\health\v1\list_disease_outbreaks.proto
proto\worldmonitor\health\v1\list_air_quality_alerts.proto
blog-site\scripts\fonts\inter-regular.ttf
blog-site\scripts\fonts\inter-bold.ttf
blog-site\README.md
proto\worldmonitor\military\v1\usni_fleet.proto
proto\worldmonitor\military\v1\service.proto
proto\worldmonitor\military\v1\military_vessel.proto
proto\worldmonitor\military\v1\military_flight.proto
proto\worldmonitor\military\v1\list_military_flights.proto
proto\worldmonitor\military\v1\list_military_bases.proto
proto\worldmonitor\military\v1\list_defense_patents.proto
proto\worldmonitor\military\v1\get_wingbits_status.proto
proto\worldmonitor\military\v1\get_wingbits_live_flight.proto
proto\worldmonitor\military\v1\get_usni_fleet_report.proto
proto\worldmonitor\military\v1\get_theater_posture.proto
proto\worldmonitor\military\v1\get_aircraft_details_batch.proto
proto\worldmonitor\military\v1\get_aircraft_details.proto
docs\SignalMap\_discovery\redis-adapter.md
docs\SignalMap\_discovery\real-workflow-brief-result.md
docs\SignalMap\_discovery\perplexity-probe.json
docs\SignalMap\_discovery\perplexity-probe-result.md
docs\SignalMap\_discovery\perplexity-probe-raw.json
docs\SignalMap\_discovery\perplexity-probe-21-domains-raw.json
docs\SignalMap\_discovery\openrouter-models.json
docs\SignalMap\_discovery\openrouter-models-result.md
docs\SignalMap\_discovery\openrouter-models-raw.json
docs\SignalMap\_discovery\draft-model-comparison-result.md
docs\SignalMap\_discovery\draft-cmp-raw-nvidia_nemotron-3-super-120b-a12b-1777251628240.json
docs\SignalMap\_discovery\draft-cmp-raw-moonshotai_kimi-k2_6-1777251561654.json
docs\SignalMap\_discovery\draft-cmp-raw-google_gemini-3_1-pro-preview-1777251645756.json
docs\SignalMap\_discovery\draft-cmp-raw-google_gemini-3_1-pro-preview-1777251637552.json
docs\SignalMap\_discovery\draft-cmp-raw-google_gemini-3_1-pro-preview-1777251560446.json
consumer-prices-core\tests\unit\title.test.ts
consumer-prices-core\tests\unit\size.test.ts
consumer-prices-core\tests\unit\search-extract-size.test.ts
consumer-prices-core\tests\unit\pinning.test.ts
consumer-prices-core\tests\unit\matcher.test.ts
public\pro\index.html
src-tauri\icons\ios\AppIcon-83.5x83.5@2x.png
src-tauri\icons\ios\AppIcon-76x76@2x.png
src-tauri\icons\ios\AppIcon-76x76@1x.png
src-tauri\icons\ios\AppIcon-60x60@3x.png
src-tauri\icons\ios\AppIcon-60x60@2x.png
src-tauri\icons\ios\AppIcon-512@2x.png
src-tauri\icons\ios\AppIcon-40x40@3x.png
src-tauri\icons\ios\AppIcon-40x40@2x.png
src-tauri\icons\ios\AppIcon-40x40@2x-1.png
src-tauri\icons\ios\AppIcon-40x40@1x.png
src-tauri\icons\ios\AppIcon-29x29@3x.png
src-tauri\icons\ios\AppIcon-29x29@2x.png
src-tauri\icons\ios\AppIcon-29x29@2x-1.png
src-tauri\icons\ios\AppIcon-29x29@1x.png
src-tauri\icons\ios\AppIcon-20x20@3x.png
src-tauri\icons\ios\AppIcon-20x20@2x.png
src-tauri\icons\ios\AppIcon-20x20@2x-1.png
src-tauri\icons\ios\AppIcon-20x20@1x.png
src-tauri\icons\icon.png
src-tauri\icons\icon.ico
src-tauri\icons\icon.icns
server\worldmonitor\webcam\v1\list-webcams.ts
server\worldmonitor\webcam\v1\handler.ts
server\worldmonitor\webcam\v1\get-webcam-image.ts
blog-site\public\robots.txt
proto\worldmonitor\economic\v1\service.proto
proto\worldmonitor\economic\v1\list_world_bank_indicators.proto
proto\worldmonitor\economic\v1\list_grocery_basket_prices.proto
proto\worldmonitor\economic\v1\list_fuel_prices.proto
proto\worldmonitor\economic\v1\list_bigmac_prices.proto
proto\worldmonitor\economic\v1\get_oil_stocks_analysis.proto
proto\worldmonitor\economic\v1\get_oil_inventories.proto
proto\worldmonitor\economic\v1\get_nat_gas_storage.proto
proto\worldmonitor\economic\v1\get_national_debt.proto
proto\worldmonitor\economic\v1\get_macro_signals.proto
proto\worldmonitor\economic\v1\get_fred_series_batch.proto
proto\worldmonitor\economic\v1\get_fred_series.proto
proto\worldmonitor\economic\v1\get_fao_food_price_index.proto
proto\worldmonitor\economic\v1\get_eu_yield_curve.proto
proto\worldmonitor\economic\v1\get_eu_gas_storage.proto
proto\worldmonitor\economic\v1\get_eu_fsi.proto
proto\worldmonitor\economic\v1\get_eurostat_country_data.proto
proto\worldmonitor\economic\v1\get_energy_prices.proto
proto\worldmonitor\economic\v1\get_energy_crisis_policies.proto
proto\worldmonitor\economic\v1\get_energy_capacity.proto
proto\worldmonitor\economic\v1\get_economic_stress.proto
proto\worldmonitor\economic\v1\get_economic_calendar.proto
proto\worldmonitor\economic\v1\get_ecb_fx_rates.proto
proto\worldmonitor\economic\v1\get_crude_inventories.proto
proto\worldmonitor\economic\v1\get_bls_series.proto
proto\worldmonitor\economic\v1\get_bis_policy_rates.proto
proto\worldmonitor\economic\v1\get_bis_exchange_rates.proto
proto\worldmonitor\economic\v1\get_bis_credit.proto
proto\worldmonitor\economic\v1\economic_data.proto
proto\worldmonitor\economic\v1\bis_data.proto
docs\SignalMap\v1\testing-harness.md
docs\SignalMap\v1\spec.md
docs\SignalMap\v1\signalmap-hardening-news-pipeline.md
docs\SignalMap\v1\PROGRESS.md
docs\SignalMap\v1\handoff.md
docs\SignalMap\v1\design-summary.md
docs\SignalMap\testing-harness.md
docs\SignalMap\spec.md
docs\SignalMap\PROGRESS.md
docs\SignalMap\LegacyPanels.md
docs\SignalMap\legacy-inventory.md
docs\SignalMap\handoff.md
docs\SignalMap\distill-reference.md
docs\SignalMap\design-summary.md
docs\SignalMap\deployment.md
docs\SignalMap\council-report-2026-04-26.md
proto\worldmonitor\supply_chain\v1\supply_chain_data.proto
proto\worldmonitor\supply_chain\v1\service.proto
proto\worldmonitor\supply_chain\v1\list_storage_facilities.proto
proto\worldmonitor\supply_chain\v1\list_pipelines.proto
proto\worldmonitor\supply_chain\v1\list_fuel_shortages.proto
proto\worldmonitor\supply_chain\v1\list_energy_disruptions.proto
proto\worldmonitor\supply_chain\v1\get_shipping_stress.proto
proto\worldmonitor\supply_chain\v1\get_shipping_rates.proto
proto\worldmonitor\supply_chain\v1\get_sector_dependency.proto
proto\worldmonitor\supply_chain\v1\get_route_impact.proto
proto\worldmonitor\supply_chain\v1\get_route_explorer_lane.proto
proto\worldmonitor\supply_chain\v1\get_multi_sector_cost_shock.proto
proto\worldmonitor\supply_chain\v1\get_critical_minerals.proto
proto\worldmonitor\supply_chain\v1\get_country_products.proto
proto\worldmonitor\supply_chain\v1\get_country_cost_shock.proto
proto\worldmonitor\supply_chain\v1\get_country_chokepoint_index.proto
proto\worldmonitor\supply_chain\v1\get_chokepoint_status.proto
proto\worldmonitor\supply_chain\v1\get_chokepoint_history.proto
proto\worldmonitor\supply_chain\v1\get_bypass_options.proto
docs\WorldMap\images\worldmonitor-7-mar-2026.jpg
docs\WorldMap\images\new-world-monitor.png
docs\WorldMap\hotspots.mdx
docs\WorldMap\health-variant-full.md
docs\WorldMap\health-endpoints.mdx
docs\WorldMap\harness-engineering-roadmap.md
docs\WorldMap\getting-started.mdx
docs\WorldMap\geographic-convergence.mdx
docs\WorldMap\finance-data.mdx
docs\WorldMap\features.mdx
docs\WorldMap\fear-greed-index-2.0-brief.md
docs\WorldMap\favicon.png
docs\WorldMap\documentation.mdx
tests\fixtures\signalmap\wasabi-status.xml
tests\fixtures\signalmap\okta-status.xml
tests\fixtures\signalmap\m365-status.xml
tests\fixtures\signalmap\cloudflare-status-summary.json
tests\fixtures\signalmap\cloudflare-radar-outage.json
tests\fixtures\signalmap\cloudflare-radar-anomaly.json
tests\fixtures\signalmap\azure-status.xml
tests\fixtures\resilience-audit-fixture.json
tests\fixtures\portwatch-arcgis-sample.json
tests\fixtures\owid-energy-sample.csv
tests\fixtures\jodi-oil-sample.csv
tests\fixtures\jodi-gas-sample.csv
tests\fixtures\iea-stocks-sample.json
tests\fixtures\ember-monthly-sample.csv
tests\fixtures\chokepoint-baselines-sample.json
tests\eurostat-seeders.test.mjs
tests\escalation-country-merge.test.mts
tests\entitlement-watchdog.test.mts
tests\entitlement-watchdog-parity.test.mts
tests\entitlement-transition.test.mts
tests\enrichment-caching.test.mjs
tests\energy-spine-seed.test.mjs
tests\energy-shock-v2.test.mjs
tests\energy-shock-seed.test.mts
tests\energy-intelligence-seed.test.mjs
tests\energy-ember-seed.test.mjs
tests\energy-disruptions-registry.test.mts
tests\email-validation.test.mjs
tests\email-masking.test.mts
tests\electricity-prices-seed.test.mjs
tests\edge-functions.test.mjs
tests\economy-eia-spr-seed.test.mjs
tests\download-handler.test.mjs
tests\dockerfile-relay-imports.test.mjs
tests\digest-score-floor.test.mjs
tests\digest-rollout-flags.test.mjs
tests\digest-only-user.test.mjs
tests\digest-no-reclassify.test.mjs
tests\digest-markdown.test.mjs
tests\digest-cache-key-sensitivity.test.mjs
tests\deploy-config.test.mjs
tests\deduction-prompt.test.mjs
tests\deckgl-layer-state-aliasing.test.mjs
tests\daily-market-brief.test.mts
tests\customs-revenue.test.mjs
tests\csp-filter.test.mjs
tests\crypto-key-rotation.test.mjs
tests\crypto-config.test.mjs
tests\cross-source-signals-regulatory.test.mjs
tests\country-resolver.test.mjs
tests\country-port-activity.test.mjs
tests\country-news-dedupe.test.mts
tests\country-geometry-overrides.test.mts
tests\country-chokepoint-index.test.mts
tests\countries-geojson.test.mjs
tests\corridorrisk-upstream.test.mjs
tests\contact-handler.test.mjs
tests\comtrade-bilateral-hs4.test.mjs
tests\clustering.test.mjs
tests\cloud-prefs-migrations.test.mjs
tests\climate-seeds.test.mjs
tests\climate-ocean-ice-client.test.mts
tests\climate-disasters-seed.test.mjs
tests\circuit-breaker-persistent-stale-ceiling.test.mts
tests\cii-scoring.test.mts
tests\chokepoint-transit-counter.test.mjs
tests\chokepoint-id-mapping.test.mjs
tests\chokepoint-flows-seed.test.mjs
tests\chokepoint-exposure-seed.test.mjs
tests\chokepoint-baselines-seed.test.mjs
tests\checkout-return-discriminant.test.mts
tests\checkout-report-error.test.mts
tests\checkout-plan-names.test.mts
tests\checkout-no-user-policy.test.mts
tests\checkout-error-classification.test.mts
tests\checkout-banner-initial-state.test.mts
tests\checkout-attempt-lifecycle.test.mts
tests\chat-analyst.test.mts
tests\bundle-runner.test.mjs
proto\worldmonitor\giving\v1\service.proto
proto\worldmonitor\giving\v1\giving.proto
proto\worldmonitor\giving\v1\get_giving_summary.proto
proto\worldmonitor\market\v1\service.proto
proto\worldmonitor\market\v1\market_quote.proto
proto\worldmonitor\market\v1\list_stored_stock_backtests.proto
proto\worldmonitor\market\v1\list_stablecoin_markets.proto
proto\worldmonitor\market\v1\list_other_tokens.proto
proto\worldmonitor\market\v1\list_market_quotes.proto
proto\worldmonitor\market\v1\list_gulf_quotes.proto
proto\worldmonitor\market\v1\list_etf_flows.proto
proto\worldmonitor\market\v1\list_earnings_calendar.proto
proto\worldmonitor\market\v1\list_defi_tokens.proto
proto\worldmonitor\market\v1\list_crypto_sectors.proto
proto\worldmonitor\market\v1\list_crypto_quotes.proto
proto\worldmonitor\market\v1\list_commodity_quotes.proto
proto\worldmonitor\market\v1\list_ai_tokens.proto
proto\worldmonitor\market\v1\get_stock_analysis_history.proto
proto\worldmonitor\market\v1\get_sector_summary.proto
proto\worldmonitor\market\v1\get_market_breadth_history.proto
proto\worldmonitor\market\v1\get_insider_transactions.proto
proto\worldmonitor\market\v1\get_hyperliquid_flow.proto
proto\worldmonitor\market\v1\get_gold_intelligence.proto
proto\worldmonitor\market\v1\get_fear_greed_index.proto
proto\worldmonitor\market\v1\get_country_stock_index.proto
proto\worldmonitor\market\v1\get_cot_positioning.proto
proto\worldmonitor\market\v1\backtest_stock.proto
proto\worldmonitor\market\v1\analyze_stock.proto
consumer-prices-core\src\snapshots\worldmonitor.ts
server\worldmonitor\unrest\v1\_shared.ts
server\worldmonitor\unrest\v1\list-unrest-events.ts
server\worldmonitor\unrest\v1\handler.ts
public\pro\assets\zh-BxyDCIra.js
public\pro\assets\worldmonitor-7-mar-2026-CtI5YvxO.jpg
public\pro\assets\vi-D1texoPw.js
public\pro\assets\tr-F4p4sScu.js
public\pro\assets\th-CD3FOyKH.js
public\pro\assets\sv-DuX3Lsqd.js
public\pro\assets\ru-BgqyPHlN.js
public\pro\assets\ro-OfGDlDfm.js
public\pro\assets\pt-RlnECMQU.js
public\pro\assets\pl-P7FWM5y7.js
public\pro\assets\nl-CIy0NOIy.js
public\pro\assets\ko-Bp1BAWvm.js
public\pro\assets\ja-BvG2yjL7.js
public\pro\assets\it-xRd9wXeo.js
public\pro\assets\index.esm-BiNDwt_v.js
public\pro\assets\index-xSEP0-ib.css
public\pro\assets\index-C-qy2Yt9.js
public\pro\assets\fr-CqZfnoPg.js
public\pro\assets\es-DKuPMUhm.js
public\pro\assets\el-B9-X35aF.js
public\pro\assets\de-C3_MVNE9.js
public\pro\assets\cs-ptRTyzJj.js
public\pro\assets\clerk-PNSFEZs8.js
public\pro\assets\bg-meSd4JsJ.js
public\pro\assets\ar-Cm8L16fJ.js
public\offline.html
public\mapbox-gl-rtl-text.min.js
proto\worldmonitor\displacement\v1\service.proto
proto\worldmonitor\displacement\v1\get_population_exposure.proto
proto\worldmonitor\displacement\v1\get_displacement_summary.proto
proto\worldmonitor\displacement\v1\displacement.proto
blog-site\public\images\blog\worldmonitor-vs-traditional-intelligence-tools.jpg
blog-site\public\images\blog\worldmonitor-in-21-languages-global-intelligence-for-everyone.jpg
blog-site\public\images\blog\what-is-worldmonitor-real-time-global-intelligence.jpg
blog-site\public\images\blog\track-global-conflicts-in-real-time.jpg
blog-site\public\images\blog\satellite-imagery-orbital-surveillance.jpg
blog-site\public\images\blog\real-time-market-intelligence-for-traders-and-analysts.jpg
blog-site\public\images\blog\prediction-markets-ai-forecasting-geopolitics.jpg
blog-site\public\images\blog\osint-for-everyone-open-source-intelligence-democratized.jpg
blog-site\public\images\blog\natural-disaster-monitoring-earthquakes-fires-volcanoes.jpg
blog-site\public\images\blog\monitor-global-supply-chains-and-commodity-disruptions.jpg
blog-site\public\images\blog\live-webcams-from-geopolitical-hotspots.jpg
blog-site\public\images\blog\hormuz-chokepoint-crisis.png
blog-site\public\images\blog\five-dashboards-one-platform-worldmonitor-variants.jpg
blog-site\public\images\blog\cyber-threat-intelligence-for-security-teams.jpg
blog-site\public\images\blog\command-palette-search-everything-instantly.jpg
blog-site\public\images\blog\build-on-worldmonitor-developer-api-open-source.jpg
blog-site\public\images\blog\ai-powered-intelligence-without-the-cloud.jpg
blog-site\package.json
blog-site\package-lock.json
blog-site\astro.config.mjs
biome.json
ARCHITECTURE.md
proto\worldmonitor\signalmap\v1\service.proto
docs\WorldMap\Docs_To_Review\TODO_Performance.md
docs\WorldMap\Docs_To_Review\todo_docs.md
docs\WorldMap\Docs_To_Review\todo.md
docs\WorldMap\Docs_To_Review\TAURI_VALIDATION_REPORT.md
docs\WorldMap\Docs_To_Review\STATE_MANAGEMENT.md
docs\WorldMap\Docs_To_Review\RELEASE_PACKAGING.md
docs\WorldMap\Docs_To_Review\README.md
docs\WorldMap\Docs_To_Review\PANELS.md
docs\WorldMap\Docs_To_Review\NEWS_TRANSLATION_ANALYSIS.md
docs\WorldMap\Docs_To_Review\local-backend-audit.md
docs\WorldMap\Docs_To_Review\DOCUMENTATION.md
docs\WorldMap\Docs_To_Review\DESKTOP_CONFIGURATION.md
docs\WorldMap\Docs_To_Review\DATA_MODEL.md
docs\WorldMap\Docs_To_Review\COMPONENTS.md
docs\WorldMap\Docs_To_Review\bugs.md
docs\WorldMap\Docs_To_Review\ARCHITECTURE.md
docs\WorldMap\docs.json
docs\WorldMap\desktop-app.mdx
docs\SignalMap\Claude_Design\uploads\claude-design-prompt-signalmap.md
docs\SignalMap\Claude_Design\tweaks-panel.jsx
docs\SignalMap\Claude_Design\tokens.css
docs\SignalMap\Claude_Design\styles.css
docs\SignalMap\Claude_Design\SignalMap Dashboard.html
docs\SignalMap\Claude_Design\map.jsx
docs\SignalMap\Claude_Design\data.js
docs\SignalMap\Claude_Design\components.jsx
docs\SignalMap\Claude_Design\app.jsx
docs\SignalMap\claude-design-prompt-signalmap.md
docs\foreman-real-world-usage-review.md
src-tauri\icons\android\mipmap-xxxhdpi\ic_launcher_round.png
src-tauri\icons\android\mipmap-xxxhdpi\ic_launcher_foreground.png
src-tauri\icons\android\mipmap-xxxhdpi\ic_launcher.png
proto\worldmonitor\intelligence\v1\service.proto
proto\worldmonitor\intelligence\v1\search_gdelt_documents.proto
proto\worldmonitor\intelligence\v1\satellite.proto
proto\worldmonitor\intelligence\v1\list_telegram_feed.proto
proto\worldmonitor\intelligence\v1\list_security_advisories.proto
proto\worldmonitor\intelligence\v1\list_satellites.proto
proto\worldmonitor\intelligence\v1\list_oref_alerts.proto
proto\worldmonitor\intelligence\v1\list_market_implications.proto
proto\worldmonitor\intelligence\v1\list_gps_interference.proto
proto\worldmonitor\intelligence\v1\list_cross_source_signals.proto
proto\worldmonitor\intelligence\v1\list_company_signals.proto
proto\worldmonitor\intelligence\v1\intelligence.proto
proto\worldmonitor\intelligence\v1\gps_jamming.proto
proto\worldmonitor\intelligence\v1\get_social_velocity.proto
proto\worldmonitor\intelligence\v1\get_risk_scores.proto
proto\worldmonitor\intelligence\v1\get_regional_snapshot.proto
proto\worldmonitor\intelligence\v1\get_regional_brief.proto
proto\worldmonitor\intelligence\v1\get_regime_history.proto
proto\worldmonitor\intelligence\v1\get_pizzint_status.proto
proto\worldmonitor\intelligence\v1\get_gdelt_topic_timeline.proto
proto\worldmonitor\intelligence\v1\get_country_risk.proto
proto\worldmonitor\intelligence\v1\get_country_port_activity.proto
proto\worldmonitor\intelligence\v1\get_country_intel_brief.proto
proto\worldmonitor\intelligence\v1\get_country_facts.proto
proto\worldmonitor\intelligence\v1\get_country_energy_profile.proto
proto\worldmonitor\intelligence\v1\get_company_enrichment.proto
proto\worldmonitor\intelligence\v1\deduct_situation.proto
proto\worldmonitor\intelligence\v1\compute_energy_shock.proto
proto\worldmonitor\intelligence\v1\classify_event.proto
proto\worldmonitor\maritime\v1\vessel_snapshot.proto
proto\worldmonitor\maritime\v1\service.proto
proto\worldmonitor\maritime\v1\list_navigational_warnings.proto
proto\worldmonitor\maritime\v1\get_vessel_snapshot.proto
proto\worldmonitor\cyber\v1\service.proto
proto\worldmonitor\cyber\v1\list_cyber_threats.proto
proto\worldmonitor\cyber\v1\cyber_threat.proto
server\worldmonitor\trade\v1\_shared.ts
server\worldmonitor\trade\v1\list-comtrade-flows.ts
server\worldmonitor\trade\v1\handler.ts
server\worldmonitor\trade\v1\get-trade-restrictions.ts
server\worldmonitor\trade\v1\get-trade-flows.ts
server\worldmonitor\trade\v1\get-trade-barriers.ts
server\worldmonitor\trade\v1\get-tariff-trends.ts
server\worldmonitor\trade\v1\get-customs-revenue.ts
consumer-prices-core\src\normalizers\title.ts
consumer-prices-core\src\normalizers\size.ts
consumer-prices-core\src\normalizers\brand.ts
public\map-styles\happy-light.json
public\map-styles\happy-dark.json
public\llms.txt
public\llms-full.txt
public\favicon.ico
api\_upstash-json.js
api\_sentry-edge.js
api\_seed-envelope.js
api\_rss-allowed-domains.js
api\_relay.js
api\_rate-limit.js
api\_product-fallback-prices.js
api\_oauth-token.js
api\_json-response.js
api\_github-release.js
api\_crypto.js
api\_cors.test.mjs
api\_cors.js
api\_api-key.js
src-tauri\icons\android\mipmap-xxhdpi\ic_launcher_round.png
src-tauri\icons\android\mipmap-xxhdpi\ic_launcher_foreground.png
src-tauri\icons\android\mipmap-xxhdpi\ic_launcher.png
proto\worldmonitor\shipping\v2\service.proto
proto\worldmonitor\shipping\v2\route_intelligence.proto
proto\worldmonitor\shipping\v2\register_webhook.proto
proto\worldmonitor\shipping\v2\list_webhooks.proto
api\youtube\live.js
api\youtube\embed.test.mjs
api\youtube\embed.js
public\favico\worldmonitor-icon-1024.png
src-tauri\icons\android\mipmap-xhdpi\ic_launcher_round.png
src-tauri\icons\android\mipmap-xhdpi\ic_launcher_foreground.png
src-tauri\icons\android\mipmap-xhdpi\ic_launcher.png
consumer-prices-core\src\matchers\canonical.ts
docs\api\worldmonitor.openapi.yaml
docs\api\WildfireService.openapi.yaml
docs\api\WildfireService.openapi.json
proto\worldmonitor\positive_events\v1\service.proto
docs\api\WebcamService.openapi.yaml
docs\api\WebcamService.openapi.json
proto\worldmonitor\positive_events\v1\list_positive_geo_events.proto
docs\api\UnrestService.openapi.yaml
docs\api\UnrestService.openapi.json
docs\api\TradeService.openapi.yaml
docs\api\TradeService.openapi.json
docs\api\ThermalService.openapi.yaml
docs\api\ThermalService.openapi.json
docs\api\SupplyChainService.openapi.yaml
docs\api\SupplyChainService.openapi.json
docs\api\SignalMapService.openapi.yaml
docs\api\SignalMapService.openapi.json
docs\api\ShippingV2Service.openapi.yaml
docs\api\ShippingV2Service.openapi.json
docs\api\SeismologyService.openapi.yaml
docs\api\SeismologyService.openapi.json
docs\api\ScenarioService.openapi.yaml
docs\api\ScenarioService.openapi.json
docs\api\SanctionsService.openapi.yaml
docs\api\SanctionsService.openapi.json
docs\api\ResilienceService.openapi.yaml
docs\api\ResilienceService.openapi.json
docs\api\ResearchService.openapi.yaml
docs\api\ResearchService.openapi.json
docs\api\RadiationService.openapi.yaml
docs\api\RadiationService.openapi.json
docs\api\PredictionService.openapi.yaml
docs\api\PredictionService.openapi.json
docs\api\PositiveEventsService.openapi.yaml
docs\api\PositiveEventsService.openapi.json
docs\api\NewsService.openapi.yaml
docs\api\NewsService.openapi.json
docs\api\NaturalService.openapi.yaml
docs\api\NaturalService.openapi.json
docs\api\MilitaryService.openapi.yaml
docs\api\MilitaryService.openapi.json
docs\api\MarketService.openapi.yaml
docs\api\MarketService.openapi.json
docs\api\MaritimeService.openapi.yaml
docs\api\MaritimeService.openapi.json
docs\api\LeadsService.openapi.yaml
docs\api\LeadsService.openapi.json
docs\api\IntelligenceService.openapi.yaml
docs\api\IntelligenceService.openapi.json
docs\api\InfrastructureService.openapi.yaml
docs\api\InfrastructureService.openapi.json
docs\api\ImageryService.openapi.yaml
docs\api\ImageryService.openapi.json
docs\api\HealthService.openapi.yaml
docs\api\HealthService.openapi.json
docs\api\GivingService.openapi.yaml
docs\api\GivingService.openapi.json
docs\api\ForecastService.openapi.yaml
docs\api\ForecastService.openapi.json
docs\api\EconomicService.openapi.yaml
docs\api\EconomicService.openapi.json
docs\api\DisplacementService.openapi.yaml
docs\api\DisplacementService.openapi.json
docs\api\CyberService.openapi.yaml
docs\api\CyberService.openapi.json
docs\api\ConsumerPricesService.openapi.yaml
docs\api\ConsumerPricesService.openapi.json
docs\api\ConflictService.openapi.yaml
docs\api\ConflictService.openapi.json
docs\api\ClimateService.openapi.yaml
docs\api\ClimateService.openapi.json
docs\api\AviationService.openapi.yaml
docs\api\AviationService.openapi.json
Dockerfile.seed-bundle-resilience-validation
Dockerfile.seed-bundle-portwatch-port-activity
public\favico\favicon-16x16.png
public\favico\apple-touch-icon.png
public\favico\android-chrome-512x512.png
public\favico\android-chrome-192x192.png
proto\worldmonitor\research\v1\service.proto
proto\worldmonitor\research\v1\research_item.proto
proto\worldmonitor\research\v1\list_trending_repos.proto
proto\worldmonitor\research\v1\list_tech_events.proto
proto\worldmonitor\research\v1\list_hackernews_items.proto
proto\worldmonitor\research\v1\list_arxiv_papers.proto
proto\worldmonitor\leads\v1\submit_contact.proto
proto\worldmonitor\leads\v1\service.proto
proto\worldmonitor\leads\v1\register_interest.proto
src-tauri\icons\android\mipmap-mdpi\ic_launcher_round.png
src-tauri\icons\android\mipmap-mdpi\ic_launcher_foreground.png
src-tauri\icons\android\mipmap-mdpi\ic_launcher.png
consumer-prices-core\src\jobs\validate.ts
consumer-prices-core\src\jobs\scrape.ts
consumer-prices-core\src\jobs\publish.ts
consumer-prices-core\src\jobs\aggregate.ts
server\worldmonitor\thermal\v1\list-thermal-escalations.ts
server\worldmonitor\thermal\v1\handler.ts
public\favico\tech\og-image.png
proto\worldmonitor\seismology\v1\service.proto
proto\worldmonitor\seismology\v1\list_earthquakes.proto
public\favico\tech\favicon.ico
proto\worldmonitor\seismology\v1\earthquake.proto
public\favico\tech\favicon-32x32.png
public\favico\tech\favicon-16x16.png
public\favico\tech\apple-touch-icon.png
public\favico\tech\android-chrome-512x512.png
public\favico\tech\android-chrome-192x192.png
public\favico\og-image.png
api\wildfire\v1\[rpc].ts
api\widget-agent.ts
consumer-prices-core\src\fx\rates.ts
proto\worldmonitor\infrastructure\v1\service.proto
proto\worldmonitor\infrastructure\v1\reverse_geocode.proto
proto\worldmonitor\infrastructure\v1\record_baseline_snapshot.proto
proto\worldmonitor\infrastructure\v1\list_temporal_anomalies.proto
proto\worldmonitor\infrastructure\v1\list_service_statuses.proto
proto\worldmonitor\infrastructure\v1\list_internet_traffic_anomalies.proto
proto\worldmonitor\infrastructure\v1\list_internet_outages.proto
proto\worldmonitor\infrastructure\v1\list_internet_ddos_attacks.proto
proto\worldmonitor\infrastructure\v1\infrastructure.proto
proto\worldmonitor\infrastructure\v1\get_temporal_baseline.proto
proto\worldmonitor\infrastructure\v1\get_ip_geo.proto
proto\worldmonitor\infrastructure\v1\get_cable_health.proto
proto\worldmonitor\infrastructure\v1\get_bootstrap_data.proto
proto\worldmonitor\news\v1\summarize_article.proto
proto\worldmonitor\news\v1\service.proto
proto\worldmonitor\news\v1\news_item.proto
proto\worldmonitor\news\v1\list_feed_digest.proto
proto\worldmonitor\news\v1\get_summarize_article_cache.proto
public\data\country-boundary-overrides.geojson
public\data\countries.geojson
public\a7f3e9d1b2c44e8f9a0b1c2d3e4f5a6b.txt
public\favico\happy\apple-touch-icon.png
public\favico\happy\android-chrome-512x512.png
public\favico\happy\android-chrome-192x192.png
public\favico\happy\og-image.png
public\favico\happy\favicon.svg
public\favico\happy\favicon.ico
public\favico\happy\favicon-32x32.png
public\favico\happy\favicon-16x16.png
server\router.ts
server\gateway.ts
server\error-mapper.ts
server\env.d.ts
server\cors.ts
server\auth-session.ts
src-tauri\icons\android\mipmap-hdpi\ic_launcher_round.png
src-tauri\icons\android\mipmap-hdpi\ic_launcher_foreground.png
src-tauri\icons\android\mipmap-hdpi\ic_launcher.png
server\worldmonitor\health\v1\list-disease-outbreaks.ts
server\worldmonitor\health\v1\list-air-quality-alerts.ts
server\worldmonitor\health\v1\handler.ts
src-tauri\icons\32x32.png
src-tauri\icons\128x128@2x.png
src-tauri\icons\128x128.png
src-tauri\Cargo.toml
src-tauri\Cargo.lock
api\webcam\v1\[rpc].ts
api\version.js
server\worldmonitor\supply-chain\v1\_storage-evidence.ts
server\worldmonitor\supply-chain\v1\_scoring.mjs
server\worldmonitor\supply-chain\v1\_route-explorer-static-tables.ts
server\worldmonitor\supply-chain\v1\_portwatch-upstream.ts
server\worldmonitor\supply-chain\v1\_pipeline-evidence.ts
server\worldmonitor\supply-chain\v1\_multi-sector-shock.ts
server\worldmonitor\supply-chain\v1\_minerals-data.ts
server\worldmonitor\supply-chain\v1\_insurance-tier.ts
server\worldmonitor\supply-chain\v1\_corridorrisk-upstream.ts
server\worldmonitor\supply-chain\v1\_chokepoint-ids.ts
server\worldmonitor\supply-chain\v1\_bilateral-hs4-lazy.ts
server\worldmonitor\supply-chain\v1\scenario-templates.ts
server\worldmonitor\supply-chain\v1\list-storage-facilities.ts
server\worldmonitor\supply-chain\v1\list-pipelines.ts
server\worldmonitor\supply-chain\v1\list-fuel-shortages.ts
server\worldmonitor\supply-chain\v1\list-energy-disruptions.ts
server\worldmonitor\supply-chain\v1\handler.ts
server\worldmonitor\supply-chain\v1\get-storage-facility-detail.ts
server\worldmonitor\supply-chain\v1\get-shipping-stress.ts
server\worldmonitor\supply-chain\v1\get-shipping-rates.ts
server\worldmonitor\supply-chain\v1\get-sector-dependency.ts
server\worldmonitor\supply-chain\v1\get-route-impact.ts
server\worldmonitor\supply-chain\v1\get-route-explorer-lane.ts
server\worldmonitor\supply-chain\v1\get-pipeline-detail.ts
server\worldmonitor\supply-chain\v1\get-multi-sector-cost-shock.ts
server\worldmonitor\supply-chain\v1\get-fuel-shortage-detail.ts
server\worldmonitor\supply-chain\v1\get-critical-minerals.ts
server\worldmonitor\supply-chain\v1\get-country-products.ts
server\worldmonitor\supply-chain\v1\get-country-cost-shock.ts
server\worldmonitor\supply-chain\v1\get-country-chokepoint-index.ts
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts
server\worldmonitor\supply-chain\v1\get-chokepoint-history.ts
server\worldmonitor\supply-chain\v1\get-bypass-options.ts
server\worldmonitor\supply-chain\v1\chokepoint-exposure-utils.ts
proto\worldmonitor\prediction\v1\service.proto
proto\worldmonitor\scenario\v1\service.proto
proto\worldmonitor\prediction\v1\prediction_market.proto
proto\worldmonitor\scenario\v1\run_scenario.proto
proto\worldmonitor\prediction\v1\list_prediction_markets.proto
proto\worldmonitor\scenario\v1\list_scenario_templates.proto
proto\worldmonitor\scenario\v1\get_scenario_status.proto
server\api\schemas\signalmap.ts
server\api\schemas\common.ts
consumer-prices-core\src\db\queries\products.ts
consumer-prices-core\src\db\queries\observations.ts
consumer-prices-core\src\db\queries\matches.ts
consumer-prices-core\src\db\models.ts
consumer-prices-core\src\db\migrate.ts
consumer-prices-core\src\db\client.ts
public\favico\finance\og-image.png
public\favico\finance\favicon.ico
public\favico\finance\favicon-32x32.png
public\favico\finance\favicon-16x16.png
public\favico\finance\apple-touch-icon.png
public\favico\finance\android-chrome-512x512.png
public\favico\finance\android-chrome-192x192.png
public\favico\favicon.ico
public\favico\favicon-32x32.png
SELF_HOSTING.md
SECURITY.md
server\alias-rewrite.ts
server\api\openapi.ts
src-tauri\capabilities\youtube-login.json
src-tauri\capabilities\default.json
src-tauri\build.rs
proto\worldmonitor\sanctions\v1\service.proto
proto\worldmonitor\radiation\v1\service.proto
proto\worldmonitor\sanctions\v1\sanctions_entry.proto
proto\worldmonitor\sanctions\v1\program_sanctions_pressure.proto
proto\worldmonitor\sanctions\v1\lookup_entity.proto
proto\worldmonitor\sanctions\v1\list_sanctions_pressure.proto
proto\worldmonitor\sanctions\v1\country_sanctions_pressure.proto
proto\worldmonitor\radiation\v1\radiation_observation.proto
proto\worldmonitor\radiation\v1\list_radiation_observations.proto
api\bootstrap.js
consumer-prices-core\src\config\types.ts
consumer-prices-core\src\config\loader.ts
server\api\routes\signalmap-stream.ts
consumer-prices-core\src\cli\validate.ts
api\v2\shipping\[rpc].ts
proto\worldmonitor\resilience\v1\service.proto
proto\worldmonitor\resilience\v1\resilience.proto
proto\worldmonitor\resilience\v1\get_resilience_score.proto
proto\worldmonitor\resilience\v1\get_resilience_ranking.proto
server\worldmonitor\signalmap\v1\_radar.ts
server\worldmonitor\signalmap\v1\_provider-status.ts
server\worldmonitor\signalmap\v1\list-signals.ts
server\worldmonitor\signalmap\v1\handler.ts
api\health\v1\[rpc].ts
api\gpsjam.js
server\worldmonitor\giving\v1\handler.ts
server\worldmonitor\giving\v1\get-giving-summary.ts
api\climate\v1\[rpc].ts
api\chat-analyst.ts
api\cache-purge.js
server\worldmonitor\consumer-prices\v1\list-retailer-price-spreads.ts
server\worldmonitor\consumer-prices\v1\list-consumer-price-movers.ts
server\worldmonitor\consumer-prices\v1\list-consumer-price-categories.ts
server\worldmonitor\consumer-prices\v1\handler.ts
server\worldmonitor\consumer-prices\v1\get-consumer-price-overview.ts
server\worldmonitor\consumer-prices\v1\get-consumer-price-freshness.ts
server\worldmonitor\consumer-prices\v1\get-consumer-price-basket-series.ts
consumer-prices-core\src\api\server.ts
api\aviation\v1\[rpc].ts
api\api-route-exceptions.json
AGENTS.md
api\natural\v1\[rpc].ts
api\v2\shipping\webhooks\[subscriberId].ts
consumer-prices-core\src\api\routes\worldmonitor.ts
consumer-prices-core\src\api\routes\health.ts
src\workers\vector-db.ts
src\workers\ml.worker.ts
src\workers\analysis.worker.ts
src\vite-env.d.ts
api\giving\v1\[rpc].ts
api\geo.js
api\fwdstart.js
server\worldmonitor\shipping\v2\webhook-shared.ts
server\worldmonitor\forecast\v1\handler.ts
server\worldmonitor\shipping\v2\route-intelligence.ts
server\worldmonitor\forecast\v1\get-simulation-package.ts
server\worldmonitor\shipping\v2\register-webhook.ts
server\worldmonitor\forecast\v1\get-simulation-outcome.ts
server\worldmonitor\shipping\v2\list-webhooks.ts
server\worldmonitor\forecast\v1\get-forecasts.ts
server\worldmonitor\shipping\v2\handler.ts
server\worldmonitor\conflict\v1\_shared.ts
server\worldmonitor\conflict\v1\list-ucdp-events.ts
server\worldmonitor\conflict\v1\list-iran-events.ts
server\worldmonitor\conflict\v1\list-acled-events.ts
server\worldmonitor\conflict\v1\handler.ts
server\worldmonitor\conflict\v1\get-humanitarian-summary.ts
server\worldmonitor\conflict\v1\get-humanitarian-summary-batch.ts
api\leads\v1\[rpc].ts
api\latest-brief.ts
api\invalidate-user-api-key-cache.ts
server\worldmonitor\displacement\v1\handler.ts
server\worldmonitor\displacement\v1\get-population-exposure.ts
server\worldmonitor\displacement\v1\get-displacement-summary.ts
src\utils\widget-sanitizer.ts
src\utils\utm.ts
src\utils\user-location.ts
src\utils\urlState.ts
src\utils\transit-chart.ts
src\utils\theme-manager.ts
src\utils\theme-colors.ts
src\utils\sync-keys.ts
src\utils\supplier-route-risk.ts
src\utils\summary-cache-key.ts
src\utils\storage-quota.ts
src\utils\sparkline.ts
src\utils\signal-quality.ts
src\utils\settings-persistence.ts
src\utils\sanitize.ts
src\utils\reverse-geocode.ts
src\utils\proxy.ts
src\utils\news-context.ts
src\utils\map-locale.ts
src\utils\layer-warning.ts
src\utils\keyword-match.ts
src\utils\index.ts
src\utils\imagery-preview.ts
src\utils\hs2-ring-chart.ts
src\utils\hash.ts
src\utils\format-intel-brief.ts
src\utils\export.ts
src\utils\embedded-preview.ts
src\utils\dom-utils.ts
src\utils\distance.ts
src\utils\cross-domain-storage.ts
src\utils\country-flag.ts
src\utils\country-codes.ts
src\utils\cloud-prefs-sync.ts
src\utils\circuit-breaker.ts
src\utils\attribution-footer.ts
src\utils\analyst-markdown.ts
src\utils\analysis-constants.ts
api\internal\brief-why-matters.ts
api\v2\shipping\webhooks\[subscriberId]\[action].ts
api\user-prefs.ts
api\resilience\v1\[rpc].ts
consumer-prices-core\src\adapters\validator.ts
consumer-prices-core\src\adapters\validator.test.ts
consumer-prices-core\src\adapters\types.ts
consumer-prices-core\src\adapters\search.ts
consumer-prices-core\src\adapters\search.test.ts
consumer-prices-core\src\adapters\search.smoke.ts
consumer-prices-core\src\adapters\market-names.ts
consumer-prices-core\src\adapters\generic.ts
consumer-prices-core\src\adapters\exa-search.ts
src\types\signalmap.ts
src\types\index.ts
src\types\globe-gl.d.ts
api\military\v1\[rpc].ts
server\worldmonitor\cyber\v1\_shared.ts
server\worldmonitor\cyber\v1\list-cyber-threats.ts
server\worldmonitor\cyber\v1\handler.ts
server\worldmonitor\economic\v1\get-fao-food-price-index.ts
server\worldmonitor\economic\v1\get-eurostat-country-data.ts
server\worldmonitor\economic\v1\get-eu-yield-curve.ts
server\worldmonitor\economic\v1\get-eu-gas-storage.ts
server\worldmonitor\economic\v1\get-eu-fsi.ts
server\worldmonitor\economic\v1\get-energy-prices.ts
server\worldmonitor\economic\v1\get-energy-crisis-policies.ts
server\worldmonitor\economic\v1\get-energy-capacity.ts
server\worldmonitor\economic\v1\get-economic-stress.ts
server\worldmonitor\economic\v1\get-economic-calendar.ts
server\worldmonitor\economic\v1\get-ecb-fx-rates.ts
server\worldmonitor\economic\v1\get-crude-inventories.ts
server\worldmonitor\economic\v1\get-bls-series.ts
server\worldmonitor\economic\v1\get-bis-policy-rates.ts
server\worldmonitor\economic\v1\get-bis-exchange-rates.ts
server\worldmonitor\economic\v1\get-bis-credit.ts
server\worldmonitor\economic\v1\handler.ts
server\worldmonitor\economic\v1\get-oil-stocks-analysis.ts
server\worldmonitor\economic\v1\get-oil-inventories.ts
server\worldmonitor\economic\v1\get-national-debt.ts
server\worldmonitor\economic\v1\get-nat-gas-storage.ts
server\worldmonitor\economic\v1\get-macro-signals.ts
server\worldmonitor\economic\v1\get-fred-series.ts
server\worldmonitor\economic\v1\get-fred-series-batch.ts
server\worldmonitor\economic\v1\list-world-bank-indicators.ts
server\worldmonitor\economic\v1\list-grocery-basket-prices.ts
server\worldmonitor\economic\v1\list-fuel-prices.ts
server\worldmonitor\economic\v1\list-bigmac-prices.ts
server\worldmonitor\economic\v1\_fetch-with-timeout.ts
server\worldmonitor\economic\v1\_bis-shared.ts
server\worldmonitor\economic\v1\_fred-shared.ts
server\worldmonitor\economic\v1\_shared.ts
api\brief\[userId]\[issueDate].ts
api\brief\share-url.ts
src\styles\tokens.css
src\styles\supply-chain-panel.css
src\styles\settings-window.css
src\styles\rtl-overrides.css
src\styles\route-explorer.css
src\styles\panels.css
src\styles\map-context-menu.css
src\styles\main.css
src\styles\happy-theme.css
src\styles\country-deep-dive.css
src\styles\components.css
src\styles\base-layer.css
api\forecast\v1\[rpc].ts
src\shims\child-process.ts
src\shims\child-process-proxy.ts
consumer-prices-core\src\acquisition\types.ts
consumer-prices-core\src\acquisition\registry.ts
consumer-prices-core\src\acquisition\playwright.ts
consumer-prices-core\src\acquisition\p0.ts
consumer-prices-core\src\acquisition\firecrawl.ts
consumer-prices-core\src\acquisition\exa.ts
server\worldmonitor\seismology\v1\list-earthquakes.ts
server\worldmonitor\seismology\v1\handler.ts
api\research\v1\[rpc].ts
server\worldmonitor\climate\v1\list-climate-news.ts
server\worldmonitor\climate\v1\list-climate-disasters.ts
server\worldmonitor\climate\v1\list-climate-anomalies.ts
server\worldmonitor\climate\v1\list-air-quality-data.ts
server\worldmonitor\climate\v1\handler.ts
server\worldmonitor\climate\v1\get-ocean-ice-data.ts
server\worldmonitor\climate\v1\get-co2-monitoring.ts
api\brief\public\[hash].ts
api\me\entitlement.ts
api\mcp.ts
api\mcp-proxy.js
server\worldmonitor\radiation\v1\list-radiation-observations.ts
server\worldmonitor\radiation\v1\handler.ts
src\shared\storage-facility-registry-store.ts
src\shared\storage-evidence.ts
src\shared\shortage-evidence.ts
src\shared\premium-paths.ts
src\shared\pipeline-registry-store.ts
src\shared\pipeline-evidence.ts
src\shared\fuel-shortage-registry-store.ts
src\shared\disruption-timeline.ts
src\settings-window.ts
src\settings-main.ts
api\intelligence\v1\[rpc].ts
api\referral\me.ts
consumer-prices-core\plans\scraper-stability.md
consumer-prices-core\package.json
consumer-prices-core\package-lock.json
api\unrest\v1\[rpc].ts
server\worldmonitor\natural\v1\list-natural-events.ts
server\worldmonitor\natural\v1\handler.ts
api\economic\v1\[rpc].ts
api\download.js
server\worldmonitor\prediction\v1\list-prediction-markets.ts
server\worldmonitor\prediction\v1\handler.ts
api\radiation\v1\[rpc].ts
api\product-catalog.js
src\services\wingbits.ts
server\worldmonitor\scenario\v1\run-scenario.ts
server\worldmonitor\scenario\v1\list-scenario-templates.ts
server\worldmonitor\scenario\v1\handler.ts
server\worldmonitor\scenario\v1\get-scenario-status.ts
api\infrastructure\v1\[rpc].ts
consumer-prices-core\migrations\008_candidate_match_status.sql
consumer-prices-core\migrations\007_pinning_columns.sql
consumer-prices-core\migrations\006_seed_global_baskets.sql
consumer-prices-core\migrations\005_computed_indices_null_idx.sql
consumer-prices-core\migrations\004_drop_unused_schema.sql
consumer-prices-core\migrations\003_canonical_products_null_idx.sql
consumer-prices-core\migrations\002_seed_reference_data.sql
consumer-prices-core\migrations\001_initial.sql
consumer-prices-core\Dockerfile
server\worldmonitor\aviation\v1\_shared.ts
api\displacement\v1\[rpc].ts
api\prediction\v1\[rpc].ts
api\brief\carousel\[userId]\[issueDate]\[page].ts
api\market\v1\[rpc].ts
server\worldmonitor\military\v1\_wingbits-aircraft-details.ts
server\worldmonitor\military\v1\_shared.ts
server\worldmonitor\military\v1\list-military-flights.ts
server\worldmonitor\military\v1\list-military-bases.ts
server\worldmonitor\military\v1\list-defense-patents.ts
server\worldmonitor\military\v1\handler.ts
server\worldmonitor\military\v1\get-wingbits-status.ts
server\worldmonitor\military\v1\get-wingbits-live-flight.ts
server\worldmonitor\military\v1\get-usni-fleet-report.ts
server\worldmonitor\military\v1\get-theater-posture.ts
server\worldmonitor\military\v1\get-aircraft-details.ts
server\worldmonitor\military\v1\get-aircraft-details-batch.ts
server\worldmonitor\positive-events\v1\list-positive-geo-events.ts
server\worldmonitor\positive-events\v1\handler.ts
src\services\wildfires\index.ts
src\services\widget-store.ts
src\services\webmcp.ts
server\worldmonitor\aviation\v1\_providers\travelpayouts_data.ts
server\worldmonitor\aviation\v1\_providers\demo_prices.ts
server\worldmonitor\aviation\v1\track-aircraft.ts
server\worldmonitor\aviation\v1\search-google-flights.ts
server\worldmonitor\aviation\v1\search-google-dates.ts
server\worldmonitor\aviation\v1\search-flight-prices.ts
server\worldmonitor\aviation\v1\list-aviation-news.ts
server\worldmonitor\aviation\v1\list-airport-flights.ts
server\worldmonitor\aviation\v1\list-airport-delays.ts
server\worldmonitor\aviation\v1\handler.ts
server\worldmonitor\aviation\v1\get-youtube-live-stream-info.ts
server\worldmonitor\aviation\v1\get-flight-status.ts
server\worldmonitor\aviation\v1\get-carrier-ops.ts
server\worldmonitor\aviation\v1\get-airport-ops-summary.ts
api\trade\v1\[rpc].ts
api\imagery\v1\[rpc].ts
api\health.js
api\loaders-xml-wms-regression.test.mjs
api\oauth-protected-resource.ts
src\services\webcams\pinned-store.ts
src\services\webcams\index.ts
src\services\weather.ts
src\services\velocity.ts
src\services\usni-fleet.ts
src\services\user-identity.ts
src\services\usa-spending.ts
server\worldmonitor\sanctions\v1\lookup-entity.ts
server\worldmonitor\sanctions\v1\list-sanctions-pressure.ts
server\worldmonitor\sanctions\v1\handler.ts
consumer-prices-core\configs\retailers\woolworths_au.yaml
consumer-prices-core\configs\retailers\wholefoods_us.yaml
consumer-prices-core\configs\retailers\walmart_us.yaml
consumer-prices-core\configs\retailers\tesco_gb.yaml
consumer-prices-core\configs\retailers\tamimi_sa.yaml
consumer-prices-core\configs\retailers\spinneys_ae.yaml
consumer-prices-core\configs\retailers\sainsburys_gb.yaml
consumer-prices-core\configs\retailers\pao_de_acucar_br.yaml
consumer-prices-core\configs\retailers\panda_sa.yaml
consumer-prices-core\configs\retailers\ocado_gb.yaml
consumer-prices-core\configs\retailers\noon_sa.yaml
consumer-prices-core\configs\retailers\noon_grocery_ae.yaml
consumer-prices-core\configs\retailers\naivas_ke.yaml
consumer-prices-core\configs\retailers\migros_ch.yaml
consumer-prices-core\configs\retailers\lulu_ae.yaml
consumer-prices-core\configs\retailers\kroger_us.yaml
consumer-prices-core\configs\retailers\jiomart_in.yaml
consumer-prices-core\configs\retailers\fairprice_sg.yaml
consumer-prices-core\configs\retailers\coop_ch.yaml
consumer-prices-core\configs\retailers\coles_au.yaml
consumer-prices-core\configs\retailers\coldstorage_sg.yaml
consumer-prices-core\configs\retailers\carrefour_sa.yaml
consumer-prices-core\configs\retailers\carrefour_br.yaml
consumer-prices-core\configs\retailers\carrefour_ae.yaml
consumer-prices-core\configs\retailers\bigbasket_in.yaml
consumer-prices-core\configs\retailers\ananinja_sa.yaml
consumer-prices-core\configs\retailers\adcoop_ae.yaml
src\services\unrest\index.ts
src\services\tv-mode.ts
src\services\trending-keywords.ts
server\worldmonitor\market\v1\_shared.ts
server\worldmonitor\market\v1\stock-news-search.ts
server\worldmonitor\market\v1\premium-stock-store.ts
server\worldmonitor\market\v1\list-stored-stock-backtests.ts
server\worldmonitor\market\v1\list-stablecoin-markets.ts
server\worldmonitor\market\v1\list-other-tokens.ts
server\worldmonitor\market\v1\list-market-quotes.ts
server\worldmonitor\market\v1\list-gulf-quotes.ts
server\worldmonitor\market\v1\list-etf-flows.ts
server\worldmonitor\market\v1\list-earnings-calendar.ts
server\worldmonitor\market\v1\list-defi-tokens.ts
server\worldmonitor\market\v1\list-crypto-sectors.ts
server\worldmonitor\market\v1\list-crypto-quotes.ts
server\worldmonitor\market\v1\list-commodity-quotes.ts
server\worldmonitor\market\v1\list-ai-tokens.ts
server\worldmonitor\market\v1\handler.ts
server\worldmonitor\market\v1\get-stock-analysis-history.ts
server\worldmonitor\market\v1\get-sector-summary.ts
server\worldmonitor\market\v1\get-market-breadth-history.ts
server\worldmonitor\market\v1\get-insider-transactions.ts
server\worldmonitor\market\v1\get-hyperliquid-flow.ts
server\worldmonitor\market\v1\get-gold-intelligence.ts
server\worldmonitor\market\v1\get-fear-greed-index.ts
server\worldmonitor\market\v1\get-country-stock-index.ts
server\worldmonitor\market\v1\get-cot-positioning.ts
server\worldmonitor\market\v1\backtest-stock.ts
server\worldmonitor\market\v1\analyze-stock.ts
src\services\trade\index.ts
src\services\throttled-target-requests.ts
src\services\threat-classifier.ts
src\services\thermal-escalation.ts
src\services\temporal-baseline.ts
src\services\telegram-intel.ts
src\services\tech-hub-index.ts
src\services\tech-activity.ts
src\services\tauri-bridge.ts
api\discord\oauth\start.ts
api\discord\oauth\callback.ts
server\worldmonitor\resilience\v1\_source-failure.ts
server\worldmonitor\resilience\v1\_shared.ts
server\worldmonitor\resilience\v1\_pillar-membership.ts
server\worldmonitor\resilience\v1\_language-coverage.ts
server\worldmonitor\resilience\v1\_indicator-registry.ts
server\worldmonitor\resilience\v1\_dimension-scorers.ts
server\worldmonitor\resilience\v1\_dimension-freshness.ts
server\worldmonitor\resilience\v1\handler.ts
server\worldmonitor\resilience\v1\get-resilience-score.ts
server\worldmonitor\resilience\v1\get-resilience-ranking.ts
server\worldmonitor\intelligence\v1\_shock-compute.ts
server\worldmonitor\intelligence\v1\_shared.ts
server\worldmonitor\intelligence\v1\_relay.ts
server\worldmonitor\intelligence\v1\_comtrade-reporters.ts
server\worldmonitor\intelligence\v1\search-gdelt-documents.ts
server\worldmonitor\intelligence\v1\list-telegram-feed.ts
server\worldmonitor\intelligence\v1\list-security-advisories.ts
server\worldmonitor\intelligence\v1\list-satellites.ts
server\worldmonitor\intelligence\v1\list-oref-alerts.ts
server\worldmonitor\intelligence\v1\list-market-implications.ts
server\worldmonitor\intelligence\v1\list-gps-interference.ts
server\worldmonitor\intelligence\v1\list-cross-source-signals.ts
server\worldmonitor\intelligence\v1\list-company-signals.ts
server\worldmonitor\intelligence\v1\handler.ts
server\worldmonitor\intelligence\v1\get-social-velocity.ts
server\worldmonitor\intelligence\v1\get-risk-scores.ts
server\worldmonitor\intelligence\v1\get-regional-snapshot.ts
server\worldmonitor\intelligence\v1\get-regional-brief.ts
server\worldmonitor\intelligence\v1\get-regime-history.ts
server\worldmonitor\intelligence\v1\get-pizzint-status.ts
server\worldmonitor\intelligence\v1\get-gdelt-topic-timeline.ts
server\worldmonitor\intelligence\v1\get-country-risk.ts
server\worldmonitor\intelligence\v1\get-country-port-activity.ts
server\worldmonitor\intelligence\v1\get-country-intel-brief.ts
server\worldmonitor\intelligence\v1\get-country-facts.ts
server\worldmonitor\intelligence\v1\get-country-energy-profile.ts
server\worldmonitor\intelligence\v1\get-company-enrichment.ts
server\worldmonitor\intelligence\v1\deduction-prompt.ts
server\worldmonitor\intelligence\v1\deduct-situation.ts
server\worldmonitor\intelligence\v1\compute-energy-shock.ts
server\worldmonitor\intelligence\v1\classify-event.ts
server\worldmonitor\intelligence\v1\chat-analyst-prompt.ts
server\worldmonitor\intelligence\v1\chat-analyst-context.ts
server\worldmonitor\intelligence\v1\chat-analyst-actions.ts
server\worldmonitor\intelligence\v1\brief-why-matters-prompt.ts
server\worldmonitor\intelligence\v1\brief-story-context.ts
server\worldmonitor\news\v1\_shared.ts
server\worldmonitor\news\v1\_feeds.ts
server\worldmonitor\news\v1\_classifier.ts
server\worldmonitor\news\v1\summarize-article.ts
server\worldmonitor\news\v1\list-feed-digest.ts
server\worldmonitor\news\v1\handler.ts
server\worldmonitor\news\v1\get-summarize-article-cache.ts
server\worldmonitor\news\v1\dedup.mjs
src\services\cable-health.ts
src\services\cable-activity.ts
src\services\breaking-news-alerts.ts
src\services\bootstrap.ts
src\services\billing.ts
src\services\supply-chain\index.ts
src\services\summarization.ts
src\services\story-share.ts
src\services\story-renderer.ts
src\services\story-data.ts
src\services\storage.ts
src\services\stock-backtest.ts
src\services\stock-analysis.ts
src\services\stock-analysis-history.ts
src\services\social-velocity.ts
src\services\signalmap.ts
src\services\signalmap-watchlist.ts
src\services\signal-aggregator.ts
src\services\settings-manager.ts
src\services\settings-constants.ts
src\services\sentiment-gate.ts
src\services\security-advisories.ts
consumer-prices-core\configs\brands\aliases.json
api\seismology\v1\[rpc].ts
api\seed-health.js
api\seed-contract-probe.ts
server\worldmonitor\maritime\v1\list-navigational-warnings.ts
server\worldmonitor\maritime\v1\handler.ts
server\worldmonitor\maritime\v1\get-vessel-snapshot.ts
api\data\city-coords.ts
api\thermal\v1\[rpc].ts
api\telegram-feed.js
api\oauth\token.js
api\oauth\register.js
api\oauth\authorize.js
api\notify.ts
api\notification-channels.ts
api\maritime\v1\[rpc].ts
api\opensky.js
api\og-story.test.mjs
api\og-story.js
api\oref-alerts.js
api\polymarket.js
api\rss-proxy.js
api\reverse-geocode.js
src\services\scenario\index.ts
src\services\satellites.ts
src\services\sanctions-pressure.ts
src\services\runtime.ts
src\services\runtime-config.ts
src\services\rss.ts
src\services\rpc-client.ts
src\services\resilience.ts
api\positive-events\v1\[rpc].ts
server\worldmonitor\research\v1\list-trending-repos.ts
server\worldmonitor\research\v1\list-tech-events.ts
server\worldmonitor\research\v1\list-hackernews-items.ts
server\worldmonitor\research\v1\list-arxiv-papers.ts
server\worldmonitor\research\v1\handler.ts
src\services\disease-outbreaks.ts
src\services\desktop-readiness.ts
src\services\data-freshness.ts
src\services\daily-market-brief.ts
src\services\aviation\watchlist.ts
src\services\aviation\index.ts
src\services\auth-state.ts
src\services\api-keys.ts
src\services\analytics.ts
src\services\analysis-worker.ts
src\services\analysis-framework-store.ts
src\services\analysis-core.ts
src\services\ai-flow-settings.ts
src\services\ai-classify-queue.ts
src\services\activity-tracker.ts
src\services\research\index.ts
src\services\renewable-installations.ts
src\services\renewable-energy-data.ts
src\services\related-assets.ts
src\services\referral.ts
src\services\referral-capture.ts
src\services\radiation.ts
src\services\push-notifications.ts
src\services\progress-data.ts
src\services\premium-fetch.ts
src\services\preferences-content.ts
src\services\cyber\index.ts
src\services\cross-source-signals.ts
src\services\cross-module-integration.ts
src\services\country-instability.ts
src\services\country-geometry.ts
src\services\correlation.ts
api\supply-chain\v1\[rpc].ts
api\supply-chain\v1\multi-sector-cost-shock.ts
api\supply-chain\v1\country-products.ts
api\supply-chain\hormuz-tracker.js
api\story.js
consumer-prices-core\configs\baskets\essentials_us.yaml
consumer-prices-core\configs\baskets\essentials_sg.yaml
consumer-prices-core\configs\baskets\essentials_sa.yaml
consumer-prices-core\configs\baskets\essentials_ke.yaml
consumer-prices-core\configs\baskets\essentials_in.yaml
consumer-prices-core\configs\baskets\essentials_gb.yaml
consumer-prices-core\configs\baskets\essentials_ch.yaml
consumer-prices-core\configs\baskets\essentials_br.yaml
consumer-prices-core\configs\baskets\essentials_au.yaml
consumer-prices-core\configs\baskets\essentials_ae.yaml
compound-engineering.local.md
CODE_OF_CONDUCT.md
CHANGELOG.md
server\worldmonitor\leads\v1\submit-contact.ts
server\worldmonitor\leads\v1\register-interest.ts
server\worldmonitor\leads\v1\handler.ts
api\sanctions\v1\[rpc].ts
api\cyber\v1\[rpc].ts
api\customer-portal.ts
api\create-checkout.ts
server\worldmonitor\infrastructure\v1\_shared.ts
server\worldmonitor\infrastructure\v1\reverse-geocode.ts
server\worldmonitor\infrastructure\v1\record-baseline-snapshot.ts
src\services\prediction\index.ts
server\worldmonitor\infrastructure\v1\list-traffic-anomalies.ts
server\worldmonitor\infrastructure\v1\list-temporal-anomalies.ts
server\worldmonitor\infrastructure\v1\list-service-statuses.ts
server\worldmonitor\infrastructure\v1\list-internet-outages.ts
server\worldmonitor\infrastructure\v1\list-ddos-attacks.ts
server\worldmonitor\infrastructure\v1\handler.ts
server\worldmonitor\infrastructure\v1\get-temporal-baseline.ts
server\worldmonitor\infrastructure\v1\get-ip-geo.ts
server\worldmonitor\infrastructure\v1\get-cable-health.ts
server\worldmonitor\infrastructure\v1\get-bootstrap-data.ts
src\services\positive-events-geo.ts
src\services\positive-classifier.ts
src\services\population-exposure.ts
src\services\pizzint.ts
src\services\persistent-cache.ts
src\services\parallel-analysis.ts
src\services\panel-gating.ts
src\services\oref-locations.ts
src\services\oref-alerts.ts
src\services\ollama-models.ts
src\services\notifications-settings.ts
src\services\notification-channels.ts
api\scenario\v1\[rpc].ts
api\skills\fetch-agentskills.ts
api\scenario\v1\templates.ts
api\scenario\v1\status.ts
api\scenario\v1\run.ts
src\App.ts
src\app.tsx
src\services\correlation-engine\types.ts
src\services\correlation-engine\index.ts
src\services\correlation-engine\engine.ts
src\data\world-happiness.json
src\data\renewable-installations.json
src\data\conservation-wins.json
src\services\news\index.ts
src\services\ml-worker.ts
src\services\ml-capabilities.ts
src\services\military-vessels.ts
src\services\military-surge.ts
src\services\military-flights.ts
src\services\military-bases.ts
api\signalmap\v1\[rpc].ts
src\app\search-manager.ts
src\app\refresh-scheduler.ts
src\app\pending-panel-data.ts
src\app\panel-layout.ts
src\app\index.ts
src\app\event-handlers.ts
src\app\desktop-updater.ts
src\app\data-loader.ts
src\app\country-intel.ts
src\app\app-context.ts
src\components\CountryIntelModal.ts
src\live-channels-window.ts
src\components\CountryDeepDivePanel.ts
src\components\CountryDeepDivePanel-news-utils.ts
src\components\CountryBriefPanel.ts
src\components\CountryBriefPage.ts
src\components\CountersPanel.ts
src\components\CotPositioningPanel.ts
src\components\CorrelationPanel.ts
src\components\ConsumerPricesPanel.ts
src\components\CommunityWidget.ts
src\components\ClimateNewsPanel.ts
src\components\ClimateAnomalyPanel.ts
src\components\CIIPanel.ts
src\components\ChokepointStripPanel.ts
src\components\checkout-failure-banner.ts
src\components\ChatAnalystPanel.ts
src\components\CascadePanel.ts
src\components\BreakthroughsTickerPanel.ts
src\components\BreakingNewsBanner.ts
src\components\BigMacPanel.ts
src\components\AviationCommandBar.ts
src\components\AuthLauncher.ts
src\components\AuthHeaderWidget.ts
src\components\AirlineIntelPanel.ts
src\components\AAIISentimentPanel.ts
src\services\correlation-engine\adapters\military.ts
src\services\correlation-engine\adapters\escalation.ts
src\services\correlation-engine\adapters\economic.ts
src\services\correlation-engine\adapters\disaster.ts
src\services\convex-client.ts
src\live-channels-main.ts
api\news\v1\[rpc].ts
src\components\GdeltIntelPanel.ts
src\components\FuelShortagePanel.ts
src\components\FuelPricesPanel.ts
src\components\FSIPanel.ts
src\components\FrameworkSelector.ts
src\components\ForecastPanel.ts
src\components\FearGreedPanel.ts
src\components\FaoFoodPriceIndexPanel.ts
src\components\ETFFlowsPanel.ts
src\components\EscalationCorrelationPanel.ts
src\components\EnergyDisruptionsPanel.ts
src\components\EnergyCrisisPanel.ts
src\components\EnergyComplexPanel.ts
src\components\EconomicPanel.ts
src\components\EconomicCorrelationPanel.ts
src\components\EconomicCalendarPanel.ts
src\components\EarningsCalendarPanel.ts
src\components\DownloadBanner.ts
src\components\DisplacementPanel.ts
src\components\DiseaseOutbreaksPanel.ts
src\components\DisasterCorrelationPanel.ts
src\components\DefensePatentsPanel.ts
src\components\DeductionPanel.ts
src\components\DeckGLMap.ts
src\components\DailyMarketBriefPanel.ts
src\components\CustomWidgetPanel.ts
src\components\CrossSourceSignalsPanel.ts
src\components\CountryTimeline.ts
src\components\LiveNewsPanel.ts
src\components\LiquidityShiftsPanel.ts
src\components\LatestBriefPanel.ts
src\components\InvestmentsPanel.ts
src\components\InternetDisruptionsPanel.ts
src\components\IntelligenceGapBadge.ts
src\components\InsightsPanel.ts
src\components\index.ts
src\components\HormuzPanel.ts
src\components\HeroSpotlightPanel.ts
src\components\GulfEconomiesPanel.ts
src\components\GroceryBasketPanel.ts
src\components\GoodThingsDigestPanel.ts
src\components\GoldIntelligencePanel.ts
src\components\GlobeMap.ts
src\components\GivingPanel.ts
src\components\GeoHubsPanel.ts
src\components\MarketBreadthPanel.ts
src\components\MapPopup.ts
src\components\MapContextMenu.ts
src\components\MapContainer.ts
src\components\Map.ts
src\components\MacroTilesPanel.ts
src\components\MacroSignalsPanel.ts
src\components\LlmStatusIndicator.ts
src\components\LiveWebcamsPanel.ts
src\components\MilitaryCorrelationPanel.ts
src\components\McpDataPanel.ts
src\components\McpConnectModal.ts
src\components\MarketPanel.ts
src\components\MarketImplicationsPanel.ts
src\components\NationalDebtPanel.ts
src\components\MonitorPanel.ts
src\components\MobileWarningModal.ts
src\components\OilInventoriesPanel.ts
src\components\NewsPanel.ts
src\components\Panel.ts
src\components\OrefSirensPanel.ts
src\components\payment-failure-banner.ts
src\components\PinnedWebcamsPanel.ts
src\server\lib\sse-replay-ring.ts
src\server\lib\redis.types.ts
src\server\lib\redis.ts
src\pwa.d.ts
src\main.tsx
src\main.ts
src\services\military\index.ts
src\services\meta-tags.ts
src\services\mcp-store.ts
src\services\market-watchlist.ts
src\services\market-implications.ts
src\components\YieldCurvePanel.ts
src\components\WsbTickerScannerPanel.ts
src\components\WorldClockPanel.ts
src\components\WidgetChatModal.ts
src\components\VirtualList.ts
src\components\VerificationChecklist.ts
src\components\UnifiedSettings.ts
src\components\UcdpEventsPanel.ts
src\components\TradePolicyPanel.ts
src\components\ThermalEscalationPanel.ts
src\components\TelegramIntelPanel.ts
src\components\TechReadinessPanel.ts
src\components\TechHubsPanel.ts
src\components\TechEventsPanel.ts
src\components\SupplyChainPanel.ts
src\components\StrategicRiskPanel.ts
src\components\StrategicPosturePanel.ts
src\components\StoryModal.ts
src\components\StorageFacilityMapPanel.ts
src\components\StockBacktestPanel.ts
src\components\StockAnalysisPanel.ts
src\components\StatusPanel.ts
src\components\StablecoinPanel.ts
src\components\SpeciesComebackPanel.ts
src\components\SocialVelocityPanel.ts
src\components\SignalModal.ts
src\components\SignalMapStatusStrips.ts
src\components\SignalMapShell.ts
src\components\SignalMapInspector.ts
src\components\SignalMapFeed.ts
src\components\ServiceStatusPanel.ts
src\components\SecurityAdvisoriesPanel.ts
src\components\SearchModal.ts
src\components\SatelliteFiresPanel.ts
src\components\SanctionsPressurePanel.ts
src\components\RuntimeConfigPanel.ts
src\services\consumer-prices\index.ts
src\services\conservation-data.ts
api\slack\oauth\start.ts
api\slack\oauth\callback.ts
src\config\index.ts
src\config\hs2-sectors.ts
src\config\gulf-fdi.ts
src\config\geo.ts
src\config\finance-geo.ts
src\config\feeds.ts
src\config\entities.ts
src\config\countries.ts
src\config\commodity-miners.ts
src\config\commodity-markets.ts
src\config\commodity-geo.ts
src\config\commands.ts
src\config\cii-colors.ts
src\config\chokepoint-registry.ts
src\config\bypass-corridors.ts
src\config\beta.ts
src\config\bases-expanded.ts
src\config\basemap.ts
src\config\apt-groups.ts
src\config\airports.ts
src\config\ai-research-labs.ts
src\config\ai-regulations.ts
src\config\ai-datacenters.ts
src\bootstrap\chunk-reload.ts
src\config\products.generated.ts
src\config\ports.ts
src\config\pipelines.ts
src\config\panels.ts
src\config\ml-config.ts
src\config\wind-colors.ts
src\config\mineral-colors.ts
src\config\military.ts
src\config\military-base-colors.ts
src\config\markets.ts
src\config\map-layer-definitions.ts
src\config\irradiators.ts
src\bootstrap\sw-update.ts
src\config\startup-ecosystems.ts
src\config\signalmap.ts
src\config\scenario-templates.ts
src\config\push.ts
src\config\products.ts
src\config\trade-routes.ts
src\config\tech-geo.ts
src\config\tech-companies.ts
src\config\variant-meta.ts
src\config\variant.ts
src\services\checkout-no-user-policy.ts
src\services\checkout-errors.ts
src\services\checkout-error-toast.ts
src\services\checkout-duplicate-dialog.ts
src\services\checkout-banner-state.ts
src\services\checkout-attempt.ts
src\services\celebration.ts
src\services\cached-theater-posture.ts
src\services\cached-risk-scores.ts
src\services\checkout.ts
src\services\checkout-sentry-policy.ts
src\services\checkout-return.ts
src\services\checkout-plan-names.ts
src\services\climate-air-quality.ts
src\services\clustering.ts
src\services\happy-share-renderer.ts
src\services\happiness-data.ts
src\services\gps-interference.ts
src\services\globe-render-settings.ts
src\services\market\index.ts
src\components\RouteExplorer\url-state.ts
src\client\types.ts
src\client\openapi.ts
src\client\base-url.ts
src\components\RegionalIntelligenceBoard.ts
src\components\regional-intelligence-board-utils.ts
src\components\RadiationWatchPanel.ts
src\components\ProgressChartsPanel.ts
src\components\ProBanner.ts
src\components\PredictionPanel.ts
src\components\PositiveNewsFeedPanel.ts
src\components\PositioningPanel.ts
src\components\PopulationExposurePanel.ts
src\components\PlaybackControl.ts
src\components\PizzIntIndicator.ts
src\components\PipelineStatusPanel.ts
src\components\RouteExplorer\CargoTypeDropdown.ts
src\components\ResilienceWidget.ts
src\components\resilience-widget-utils.ts
src\components\resilience-choropleth-utils.ts
src\components\RenewableEnergyPanel.ts
src\components\RegulationPanel.ts
src\components\RouteExplorer\Hs2Picker.ts
src\components\RouteExplorer\CountryPicker.ts
server\worldmonitor\imagery\v1\search-imagery.ts
server\worldmonitor\imagery\v1\handler.ts
src\services\eonet.ts
src\services\entity-index.ts
src\services\entity-extraction.ts
src\services\entitlements.ts
src\services\entitlement-watchdog.ts
src\e2e\mobile-map-integration-harness.ts
src\e2e\mobile-map-harness.ts
src\e2e\map-harness.ts
src\components\RouteExplorer\RouteExplorer.ts
src\components\RouteExplorer\KeyboardHelp.ts
src\components\RouteExplorer\RouteExplorer.utils.ts
src\config\variants\tech.ts
src\config\variants\happy.ts
src\config\variants\full.ts
src\config\variants\finance.ts
src\config\variants\energy.ts
src\config\variants\commodity.ts
src\config\variants\base.ts
src\locales\zh.json
src\locales\zh.d.ts
src\locales\vi.json
src\locales\vi.d.ts
src\locales\tr.json
src\locales\tr.d.ts
src\locales\th.json
src\locales\th.d.ts
src\locales\sv.json
src\locales\sv.d.ts
src\locales\ru.json
src\locales\ru.d.ts
src\locales\it.json
src\locales\ro.json
src\locales\it.d.ts
src\locales\pt.json
src\locales\fr.json
src\locales\pt.d.ts
src\locales\es.json
src\locales\es.d.ts
src\locales\en.json
src\locales\el.json
src\locales\de.json
src\locales\cs.json
src\locales\bg.json
src\locales\ar.json
src\locales\ar.d.ts
src\locales\nl.d.ts
src\locales\ko.json
src\locales\ja.json
src\locales\nl.json
src\locales\pl.d.ts
src\services\index.ts
src\services\imf-country-data.ts
src\services\imagery.ts
src\services\i18n.ts
src\services\humanity-counters.ts
src\services\hub-activity-scoring.ts
src\services\hotspot-escalation.ts
src\services\hormuz-tracker.ts
src\services\health-air-quality.ts
src\components\RouteExplorer\tabs\route-utils.ts
src\components\RouteExplorer\tabs\LandTab.ts
src\components\RouteExplorer\tabs\CurrentRouteTab.ts
src\components\RouteExplorer\tabs\CountryImpactTab.ts
src\components\RouteExplorer\tabs\AlternativesTab.ts
src\services\clerk.ts
src\locales\pl.json
src\services\kindness-data.ts
src\services\investments-focus.ts
src\services\live-news.ts
src\services\live-stream-settings.ts
api\consumer-prices\v1\[rpc].ts
src\components\RouteExplorer\components\LeftRail.ts
src\components\RouteExplorer\components\RouteCard.ts
src\services\earthquakes.ts
src\services\forecast.ts
src\services\font-settings.ts
src\services\focal-point-detector.ts
src\services\feed-date.ts
src\services\geo-activity.ts
src\services\gdelt-intel.ts
src\services\geo-convergence.ts
src\services\geo-hub-index.ts
src\services\infrastructure-cascade.ts
src\services\insider-transactions.ts
src\services\insights-loader.ts
src\services\conflict\index.ts
src\services\climate\ocean-ice.ts
src\services\climate\index.ts
src\services\giving\index.ts
src\generated\server\worldmonitor\wildfire\v1\service_server.ts
src\services\maritime\index.ts
src\services\economic\index.ts
src\services\displacement\index.ts
src\generated\client\worldmonitor\wildfire\v1\service_client.ts
src\services\intelligence\index.ts
api\conflict\v1\[rpc].ts
src\services\infrastructure\index.ts
src\generated\server\worldmonitor\military\v1\service_server.ts
src\generated\server\worldmonitor\sanctions\v1\service_server.ts
src\generated\server\worldmonitor\webcam\v1\service_server.ts
src\generated\server\worldmonitor\market\v1\service_server.ts
src\generated\server\worldmonitor\resilience\v1\service_server.ts
src\generated\server\worldmonitor\unrest\v1\service_server.ts
src\generated\client\worldmonitor\scenario\v1\service_client.ts
src\generated\server\worldmonitor\maritime\v1\service_server.ts
src\generated\client\worldmonitor\military\v1\service_client.ts
src\generated\server\worldmonitor\research\v1\service_server.ts
src\generated\server\worldmonitor\trade\v1\service_server.ts
src\generated\server\worldmonitor\leads\v1\service_server.ts
src\generated\server\worldmonitor\radiation\v1\service_server.ts
src\generated\server\worldmonitor\thermal\v1\service_server.ts
src\generated\client\worldmonitor\supply_chain\v1\service_client.ts
src\generated\client\worldmonitor\shipping\v2\service_client.ts
src\generated\server\worldmonitor\prediction\v1\service_server.ts
src\generated\client\worldmonitor\prediction\v1\service_client.ts
src\generated\client\worldmonitor\seismology\v1\service_client.ts
src\generated\client\worldmonitor\trade\v1\service_client.ts
src\generated\client\worldmonitor\webcam\v1\service_client.ts
src\generated\server\worldmonitor\supply_chain\v1\service_server.ts
src\generated\client\worldmonitor\market\v1\service_client.ts
src\generated\client\worldmonitor\signalmap\v1\service_client.ts
src\generated\server\worldmonitor\intelligence\v1\service_server.ts
src\generated\client\worldmonitor\positive_events\v1\service_client.ts
src\generated\client\worldmonitor\unrest\v1\service_client.ts
src\generated\client\worldmonitor\sanctions\v1\service_client.ts
src\generated\client\worldmonitor\maritime\v1\service_client.ts
src\generated\client\worldmonitor\thermal\v1\service_client.ts
src\generated\server\worldmonitor\positive_events\v1\service_server.ts
src\generated\client\worldmonitor\news\v1\service_client.ts
src\generated\client\worldmonitor\resilience\v1\service_client.ts
src\generated\server\worldmonitor\imagery\v1\service_server.ts
src\generated\client\worldmonitor\leads\v1\service_client.ts
src\generated\server\worldmonitor\displacement\v1\service_server.ts
src\generated\server\worldmonitor\giving\v1\service_server.ts
src\generated\server\worldmonitor\signalmap\v1\service_server.ts
src\generated\client\worldmonitor\natural\v1\service_client.ts
src\generated\client\worldmonitor\research\v1\service_client.ts
src\generated\client\worldmonitor\intelligence\v1\service_client.ts
src\generated\server\worldmonitor\economic\v1\service_server.ts
src\generated\client\worldmonitor\radiation\v1\service_client.ts
src\generated\client\worldmonitor\infrastructure\v1\service_client.ts
src\generated\client\worldmonitor\imagery\v1\service_client.ts
src\generated\server\worldmonitor\infrastructure\v1\service_server.ts
src\generated\server\worldmonitor\forecast\v1\service_server.ts
src\generated\server\worldmonitor\natural\v1\service_server.ts
src\generated\server\worldmonitor\health\v1\service_server.ts
src\generated\server\worldmonitor\news\v1\service_server.ts
src\generated\client\worldmonitor\health\v1\service_client.ts
src\generated\server\worldmonitor\cyber\v1\service_server.ts
src\generated\client\worldmonitor\cyber\v1\service_client.ts
src\generated\server\worldmonitor\shipping\v2\service_server.ts
src\generated\server\worldmonitor\seismology\v1\service_server.ts
src\generated\client\worldmonitor\giving\v1\service_client.ts
src\generated\client\worldmonitor\consumer_prices\v1\service_client.ts
src\generated\client\worldmonitor\conflict\v1\service_client.ts
src\generated\client\worldmonitor\forecast\v1\service_client.ts
src\generated\server\worldmonitor\conflict\v1\service_server.ts
src\generated\client\worldmonitor\climate\v1\service_client.ts
src\generated\server\worldmonitor\scenario\v1\service_server.ts
src\generated\client\worldmonitor\aviation\v1\service_client.ts
src\generated\server\worldmonitor\climate\v1\service_server.ts
src\generated\client\worldmonitor\economic\v1\service_client.ts
src\generated\client\worldmonitor\displacement\v1\service_client.ts
src\generated\server\worldmonitor\aviation\v1\service_server.ts
src\generated\server\worldmonitor\consumer_prices\v1\service_server.ts

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'docs/SignalMap/spec.md'; "'$start=159; $end=215; $lines=Get-Content $path; for($i=$start;$i -le $end;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'docs/SignalMap/spec.md'; "'$start=231; $end=244; $lines=Get-Content $path; for($i=$start;$i -le $end;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'docs/SignalMap/spec.md'; "'$start=421; $end=431; $lines=Get-Content $path; for($i=$start;$i -le $end;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'docs/SignalMap/spec.md'; "'$start=500; $end=507; $lines=Get-Content $path; for($i=$start;$i -le $end;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1196ms:
  159: ### Generated artifacts (Phase 3)
  160: - `public/openapi.yaml` â€” generated at build by `npm run build:openapi` from `server/api/schemas/`
  161: - `src/client/types.ts` â€” `openapi-typescript`-generated TS types from the spec
  162: - Both are committed; CI verifies they match the source schemas.
  163: 
  164: ## Config Schema (env vars)
  165: 
  166: ```bash
  167: # Required for collector + brief
  168: OPENROUTER_API_KEY=sk-or-...
  169: 
  170: # Required for global brief context (per-event brief degrades without it)
  171: PERPLEXITY_API_KEY=pplx-...
  172: 
  173: # Container & networking
  174: SIGNALMAP_PORT=3000                  # host port â†’ container 8080
  175: LOCAL_API_PORT=46123
  176: 
  177: # Redis
  178: REDIS_URL=redis://signalmap-redis:6379
  179: REDIS_PASSWORD=                      # optional
  180: 
  181: # Storage
  182: SIGNALMAP_DATA_DIR=/data/signalmap
  183: SIGNALMAP_LANCEDB_URI=/data/signalmap/lancedb
  184: TRANSFORMERS_CACHE=/data/signalmap/models
  185: HF_HOME=/data/signalmap/models
  186: 
  187: # Collector cadence
  188: SIGNALMAP_RSS_POLL_MINUTES=15
  189: SIGNALMAP_VECTOR_ENABLED=true
  190: CLOUDFLARE_API_TOKEN=
  191: 
  192: # LLM brief â€” single-pass Sonnet 4.6, server cron writes
  193: SIGNALMAP_BRIEF_MODEL=anthropic/claude-sonnet-4.6
  194: OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
  195: PERPLEXITY_MODEL=sonar-pro
  196: SIGNALMAP_BRIEF_REFRESH_MINUTES=30
  197: SIGNALMAP_DAILY_LLM_BUDGET_USD=2.00
  198: SIGNALMAP_BRIEF_PER_EVENT_LOCK_TIMEOUT_SECONDS=30
  199: SIGNALMAP_BRIEF_PER_EVENT_STAMPEDE_POLL_MS=200
  200: SIGNALMAP_BRIEF_PER_EVENT_RATE_LIMIT_PER_MIN=20
  201: SIGNALMAP_ADMIN_TOKEN=                    # required to use manual "Refresh now" button
  202: SIGNALMAP_DAILY_LLM_BUDGET_USD=5.00
  203: SIGNALMAP_BRIEF_RATE_LIMIT_PER_MIN=10
  204: SIGNALMAP_BRIEF_RATE_LIMIT_PER_DAY=100
  205: SIGNALMAP_BRIEF_REFRESH_MINUTES=30
  206: SIGNALMAP_BRIEF_LOCK_TIMEOUT_SECONDS=30
  207: SIGNALMAP_BRIEF_STAMPEDE_POLL_MS=200
  208: SIGNALMAP_NEWS_DOMAIN_ALLOWLIST=     # â‰¤20 domains; bundled default if unset
  209: 
  210: # SSE
  211: SSE_HEARTBEAT_SECONDS=20
  212: SSE_REPLAY_RING_SIZE=1000
  213: SSE_REPLAY_RING_TTL_SECONDS=600
  214: SSE_RECONNECT_RETRY_MIN_MS=5000
  215: SSE_RECONNECT_RETRY_MAX_MS=15000

 succeeded in 1254ms:
  500: ## Quality Gates Summary
  501: 
  502: | Phase | Gate Command | Pass Criteria |
  503: |-------|--------------|---------------|
  504: | 0 | `npm run typecheck:all && ls docs/SignalMap/_discovery/ docs/SignalMap/legacy-inventory.md docs/SignalMap/LegacyPanels.md` | Discovery artifacts exist; user signed kill list |
  505: | 1 | `npm run typecheck:all && npm run dev` (manual smoke) | Empty grid renders at localhost:3000 |
  506: | 2 | `docker compose -f docker-compose.signalmap.yml up -d --build --force-recreate && sleep 10 && curl --http2 -I http://localhost:3000/ && curl http://localhost:3000/api/health \| jq '.redis'` | HTTP/2 + Redis adapter operational |
  507: | 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` | All contract + SSE tests pass |

 succeeded in 1329ms:
  421: ### Phase 3 â€” API Contract + Client + SSE Replay
  422: 
  423: | Unit | Files | Directives | Test Command | DO NOT |
  424: |------|-------|------------|--------------|--------|
  425: | 3a zod-openapi route schemas | `server/api/schemas/signalmap.ts`, `server/api/schemas/common.ts`, `server/api/openapi.ts` | Define request/response zod schemas for the 6 endpoints; `openapi.ts` exports `generateSpec()` returning OpenAPI 3.1 doc | `npx tsx --test tests/openapi-spec-generation.test.mjs` | Hand-write any OpenAPI YAML |
  426: | 3b Generated types + client | `public/openapi.yaml` (generated), `src/client/types.ts` (generated), `src/client/openapi.ts`, `src/client/base-url.ts` | Add `npm run build:openapi` script (calls `openapi.ts.generateSpec()` â†’ write YAML); add `npm run build:types` (calls `openapi-typescript public/openapi.yaml -o src/client/types.ts`); `openapi.ts` exports `client = createClient<paths>({ baseUrl: getApiBaseUrl() })`; `base-url.ts` exports canonical `getApiBaseUrl()` with explicit normalization (collapses double slashes, strips trailing) | `npm run build:openapi && npm run build:types && npm run typecheck:all` | Hand-edit `types.ts` or `openapi.yaml` |
  427: | 3c API base URL contract test | `tests/api-base-url-contract.test.mjs` | Tests: every `paths` key lacks `/api/ws/api`; `getApiBaseUrl('/api/ws')` + every path = no `/api/ws/api`; normalization collapses `//`, strips trailing `/` | `npx tsx --test tests/api-base-url-contract.test.mjs` | Hard-code the doubled-prefix as a regex check (must verify behavior, not source) |
  428: | 3d SSE endpoint + replay ring | `server/api/routes/signalmap-stream.ts`, `src/server/lib/sse-replay-ring.ts` | Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay; subscribe to `signalmap:events` pubsub channel; heartbeat every `SSE_HEARTBEAT_SECONDS`; on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n` | `npx tsx --test tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs` | Use in-memory replay |
  429: | 3e SSE tests | `tests/sse-replay-ring.test.mjs`, `tests/sse-stream.test.mjs` | Tests: monotonic ID generation, ring eviction past size+TTL, replay from `Last-Event-ID`, `204 X-Replay-Lost` when ID evicted, jittered shutdown retry, heartbeat cadence | Same command as 3d | Mock Redis (use real container) |
  430: 
  431: **Phase 3 checkpoint:** `npm run build:openapi && npm run build:types && npm run typecheck:all` clean; all 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green.

 succeeded in 1372ms:
  231: ## Core Behavior
  232: 
  233: 1. Browser opens `http://localhost:3000` â†’ nginx serves `index.html` â†’ Preact renders `<App/>`.
  234: 2. `App` mounts `CommandBar`, `RadarStrip`, `ProviderStrip`, `BriefStrip`, `LeftRail`, `WorldMap`, `LiveFeed`, `Inspector`.
  235: 3. `state/sse.ts` opens `EventSource('/api/signalmap/stream')` (auto-reconnects with server-sent `retry:`).
  236: 4. Initial `bootstrap` HTTP call hydrates filter defaults, source health, last 24h signal count.
  237: 5. SSE pushes per-event updates; `signals.ts` accumulates into a Map keyed by event ID.
  238: 6. User toggles categories/regions/providers in `LeftRail` â†’ signals re-filter reactively â†’ `WorldMap` markers + `LiveFeed` cards re-render.
  239: 7. `WorldMap` renders SVG TopoJSON base + d3-geo equirectangular projection + d3-zoom transform group. Markers receive 44px invisible touch hit areas.
  240: 8. User clicks marker â†’ `selectedEventId` signal flips â†’ `Inspector` opens, fetches event detail via `openapi-fetch`.
  241: 9. User clicks "Why this matters" tab in `Inspector` â†’ calls `POST /api/signalmap/brief/event/:id` â†’ server checks cache â†’ on miss, runs synthesis with the event + LanceDB-related stories â†’ returns `{ whyItMatters, model, generatedAt }`.
  242: 10. Every 30 min (or on user "Refresh"), `BriefStrip` calls `POST /api/signalmap/brief/global` with current filter signature â†’ server runs cacheâ†’singleflightâ†’spend reservationâ†’Perplexityâ†’citation revalidationâ†’OpenRouter (with XML-wrapped context)â†’schema validationâ†’cache write.
  243: 11. Collector loop (background) polls RSS sources every 15 min, classifies via OpenRouter, geolocates, dedupes via LanceDB, writes events to Redis. SSE handler subscribes to a Redis pub/sub channel and pushes deltas to connected browsers.
  244: 

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'server/api/schemas/common.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'server/api/schemas/signalmap.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'server/api/openapi.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'scripts/build-openapi.mjs'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1197ms:
    1: /**
    2:  * SignalMap HTTP endpoint route definitions.
    3:  * Uses zod-openapi's ZodOpenApiPathsObject / requestParams pattern so that
    4:  * query/path parameters are automatically expanded into the OpenAPI parameters array.
    5:  */
    6: 
    7: import 'zod-openapi/extend';
    8: import { z } from 'zod';
    9: import type { ZodOpenApiPathsObject } from 'zod-openapi';
   10: import {
   11:   ErrorEnvelope,
   12:   SignalMapEvent,
   13:   SignalMapSourceHealth,
   14: } from './common.js';
   15: 
   16: // ---------------------------------------------------------------------------
   17: // Endpoint 1 â€” GET /api/signalmap/list
   18: // ---------------------------------------------------------------------------
   19: 
   20: const ListSignalsQuery = z.object({
   21:   start_ms: z.coerce.number().optional(),
   22:   end_ms: z.coerce.number().optional(),
   23:   categories: z.array(z.string()).optional(),
   24:   watch_regions: z.array(z.string()).optional(),
   25:   watch_providers: z.array(z.string()).optional(),
   26:   watchlist_only: z.coerce.boolean().optional(),
   27: });
   28: 
   29: const ListSignalsResponse = z.object({
   30:   events: z.array(SignalMapEvent),
   31:   sourceHealth: z.array(SignalMapSourceHealth),
   32:   fetchedAt: z.number(),
   33:   upstreamUnavailable: z.boolean(),
   34: });
   35: 
   36: // ---------------------------------------------------------------------------
   37: // Endpoint 3 â€” GET /api/signalmap/source-health
   38: // ---------------------------------------------------------------------------
   39: 
   40: const SourceHealthResponse = z.object({
   41:   sourceHealth: z.array(SignalMapSourceHealth),
   42:   fetchedAt: z.number(),
   43: });
   44: 
   45: // ---------------------------------------------------------------------------
   46: // Endpoint 5 â€” POST /api/signalmap/brief/global
   47: // ---------------------------------------------------------------------------
   48: 
   49: const BriefSource = z.object({
   50:   label: z.string(),
   51:   url: z.string(),
   52: });
   53: 
   54: const GlobalBriefResponse = z.object({
   55:   bullets: z.array(z.string()),
   56:   generatedAt: z.string(),
   57:   model: z.string(),
   58:   sources: z.array(BriefSource),
   59:   lastGeneratedAt: z.string().optional(),
   60: });
   61: 
   62: // ---------------------------------------------------------------------------
   63: // Endpoint 6 â€” POST /api/signalmap/brief/event/{id}
   64: // ---------------------------------------------------------------------------
   65: 
   66: const EventBriefResponse = z.object({
   67:   whyItMatters: z.string(),
   68:   model: z.string(),
   69:   generatedAt: z.string(),
   70: });
   71: 
   72: // ---------------------------------------------------------------------------
   73: // Path definitions
   74: // ---------------------------------------------------------------------------
   75: 
   76: export const signalmapPaths: ZodOpenApiPathsObject = {
   77:   '/api/signalmap/list': {
   78:     get: {
   79:       operationId: 'listSignalMapEvents',
   80:       summary: 'List SignalMap events with filters',
   81:       requestParams: { query: ListSignalsQuery },
   82:       responses: {
   83:         '200': {
   84:           description: 'Filtered SignalMap events with source health',
   85:           content: {
   86:             'application/json': { schema: ListSignalsResponse },
   87:           },
   88:         },
   89:         '5XX': {
   90:           description: 'Server error',
   91:           content: { 'application/json': { schema: ErrorEnvelope } },
   92:         },
   93:       },
   94:     },
   95:   },
   96: 
   97:   '/api/signalmap/event/{id}': {
   98:     get: {
   99:       operationId: 'getSignalMapEvent',
  100:       summary: 'Get a single SignalMap event by ID',
  101:       requestParams: {
  102:         path: z.object({ id: z.string() }),
  103:       },
  104:       responses: {
  105:         '200': {
  106:           description: 'SignalMap event',
  107:           content: {
  108:             'application/json': { schema: SignalMapEvent },
  109:           },
  110:         },
  111:         '5XX': {
  112:           description: 'Server error',
  113:           content: { 'application/json': { schema: ErrorEnvelope } },
  114:         },
  115:       },
  116:     },
  117:   },
  118: 
  119:   '/api/signalmap/source-health': {
  120:     get: {
  121:       operationId: 'getSignalMapSourceHealth',
  122:       summary: 'Get source health for all SignalMap data providers',
  123:       responses: {
  124:         '200': {
  125:           description: 'Source health summary',
  126:           content: {
  127:             'application/json': { schema: SourceHealthResponse },
  128:           },
  129:         },
  130:         '5XX': {
  131:           description: 'Server error',
  132:           content: { 'application/json': { schema: ErrorEnvelope } },
  133:         },
  134:       },
  135:     },
  136:   },
  137: 
  138:   '/api/signalmap/stream': {
  139:     get: {
  140:       operationId: 'streamSignalMapEvents',
  141:       summary: 'SSE stream of live SignalMap events',
  142:       parameters: [
  143:         {
  144:           in: 'header',
  145:           name: 'Last-Event-ID',
  146:           required: false,
  147:           schema: { type: 'string' },
  148:           description: 'Resume SSE stream from a previously received event ID',
  149:         },
  150:       ],
  151:       responses: {
  152:         '200': {
  153:           description: 'SSE event stream (text/event-stream)',
  154:           content: {
  155:             'text/event-stream': { schema: z.string() },
  156:           },
  157:         },
  158:         '204': {
  159:           description:
  160:             'Replay ID was evicted â€” client must re-fetch from scratch',
  161:           headers: z.object({
  162:             'X-Replay-Lost': z
  163:               .boolean()
  164:               .openapi({ description: 'Set to true when replay ID was evicted' }),
  165:           }),
  166:         },
  167:         '5XX': {
  168:           description: 'Server error',
  169:           content: { 'application/json': { schema: ErrorEnvelope } },
  170:         },
  171:       },
  172:     },
  173:   },
  174: 
  175:   '/api/signalmap/brief/global': {
  176:     post: {
  177:       operationId: 'getSignalMapGlobalBrief',
  178:       summary: 'Get AI-generated global SignalMap brief (cached)',
  179:       requestBody: {
  180:         content: {
  181:           'application/json': { schema: z.object({}) },
  182:         },
  183:       },
  184:       responses: {
  185:         '200': {
  186:           description: 'Global brief with bullet points and sources',
  187:           headers: z.object({
  188:             'X-Cache': z
  189:               .string()
  190:               .openapi({ description: 'Cache status: HIT or MISS' })
  191:               .optional(),
  192:           }),
  193:           content: {
  194:             'application/json': { schema: GlobalBriefResponse },
  195:           },
  196:         },
  197:         '5XX': {
  198:           description: 'Server error',
  199:           content: { 'application/json': { schema: ErrorEnvelope } },
  200:         },
  201:       },
  202:     },
  203:   },
  204: 
  205:   '/api/signalmap/brief/event/{id}': {
  206:     post: {
  207:       operationId: 'getSignalMapEventBrief',
  208:       summary: 'Get AI-generated why-it-matters brief for a specific event (cached)',
  209:       requestParams: {
  210:         path: z.object({ id: z.string() }),
  211:       },
  212:       requestBody: {
  213:         content: {
  214:           'application/json': { schema: z.object({}) },
  215:         },
  216:       },
  217:       responses: {
  218:         '200': {
  219:           description: 'Event brief with why-it-matters explanation',
  220:           headers: z.object({
  221:             'X-Cache': z
  222:               .string()
  223:               .openapi({ description: 'Cache status: HIT or MISS' })
  224:               .optional(),
  225:           }),
  226:           content: {
  227:             'application/json': { schema: EventBriefResponse },
  228:           },
  229:         },
  230:         '5XX': {
  231:           description: 'Server error',
  232:           content: { 'application/json': { schema: ErrorEnvelope } },
  233:         },
  234:       },
  235:     },
  236:   },
  237: };

 succeeded in 1287ms:
    1: /**
    2:  * Shared zod schemas for the SignalMap HTTP API.
    3:  * Each component schema calls .openapi({ ref: '<Name>' }) so it lands in
    4:  * components.schemas rather than being inlined everywhere.
    5:  */
    6: 
    7: import 'zod-openapi/extend';
    8: import { z } from 'zod';
    9: 
   10: export const SignalMapCategory = z
   11:   .enum([
   12:     'internet',
   13:     'provider',
   14:     'technology',
   15:     'finance',
   16:     'geopolitics',
   17:     'conflict',
   18:     'cyber',
   19:     'climate',
   20:     'health',
   21:     'energy',
   22:     'supply_chain',
   23:     'infrastructure',
   24:   ])
   25:   .openapi({ ref: 'SignalMapCategory' });
   26: 
   27: export const SignalMapSeverity = z
   28:   .enum(['critical', 'high', 'medium', 'low', 'info'])
   29:   .openapi({ ref: 'SignalMapSeverity' });
   30: 
   31: export const SignalMapLocationScope = z
   32:   .enum(['city', 'region', 'country', 'network', 'provider', 'unknown'])
   33:   .openapi({ ref: 'SignalMapLocationScope' });
   34: 
   35: export const SignalMapKind = z
   36:   .enum(['radar_outage', 'radar_anomaly', 'provider_status', 'story'])
   37:   .openapi({ ref: 'SignalMapKind' });
   38: 
   39: export const SignalMapLocation = z
   40:   .object({
   41:     name: z.string(),
   42:     countryIso2: z.string().optional(),
   43:     lat: z.number().optional(),
   44:     lon: z.number().optional(),
   45:     scope: SignalMapLocationScope,
   46:     confidence: z.number(),
   47:     evidence: z.string().optional(),
   48:   })
   49:   .openapi({ ref: 'SignalMapLocation' });
   50: 
   51: export const SignalMapSource = z
   52:   .object({
   53:     id: z.string(),
   54:     label: z.string(),
   55:     url: z.string().optional(),
   56:     tier: z.number().int().optional(),
   57:     verified: z.boolean().optional(),
   58:     fetchedAt: z.string().optional(),
   59:   })
   60:   .openapi({ ref: 'SignalMapSource' });
   61: 
   62: export const SignalMapEvent = z
   63:   .object({
   64:     id: z.string(),
   65:     category: SignalMapCategory,
   66:     severity: SignalMapSeverity,
   67:     title: z.string(),
   68:     summary: z.string(),
   69:     tags: z.array(z.string()),
   70:     startedAt: z.string().optional(),
   71:     endedAt: z.string().optional(),
   72:     lastObservedAt: z.string(),
   73:     locations: z.array(SignalMapLocation),
   74:     sources: z.array(SignalMapSource),
   75:     confidence: z.number(),
   76:     provider: z.string().optional(),
   77:     kind: SignalMapKind,
   78:     watchlistMatch: z.boolean(),
   79:     markerEligible: z.boolean(),
   80:   })
   81:   .openapi({ ref: 'SignalMapEvent' });
   82: 
   83: export const SignalMapSourceHealth = z
   84:   .object({
   85:     id: z.string(),
   86:     label: z.string(),
   87:     status: z.enum(['ok', 'degraded', 'unavailable']),
   88:     fetchedAt: z.number(),
   89:     eventCount: z.number().int(),
   90:     detail: z.string(),
   91:   })
   92:   .openapi({ ref: 'SignalMapSourceHealth' });
   93: 
   94: export const ErrorEnvelope = z
   95:   .object({
   96:     error: z.object({
   97:       code: z.string(),
   98:       message: z.string(),
   99:     }),
  100:   })
  101:   .openapi({ ref: 'ErrorEnvelope' });

 succeeded in 1294ms:
    1: /**
    2:  * generateSpec() â€” returns the SignalMap OpenAPI 3.1 document as a JS object.
    3:  *
    4:  * Pure function, no file I/O.  Phase 3b will wire a build script to call this
    5:  * and emit YAML; do not add file-system concerns here.
    6:  */
    7: 
    8: import 'zod-openapi/extend';
    9: import { createDocument, oas31 } from 'zod-openapi';
   10: import { signalmapPaths } from './schemas/signalmap.js';
   11: 
   12: export function generateSpec(): oas31.OpenAPIObject {
   13:   return createDocument({
   14:     openapi: '3.1.0',
   15:     info: {
   16:       title: 'SignalMap API',
   17:       version: '2.0.0',
   18:       description:
   19:         'Public SignalMap HTTP API for events, source health, SSE stream, and briefs.',
   20:     },
   21:     servers: [{ url: '/' }],
   22:     paths: signalmapPaths,
   23:   });
   24: }

 succeeded in 1351ms:
    1: /**
    2:  * build-openapi.mjs
    3:  *
    4:  * Calls generateSpec() from the server OpenAPI module and writes
    5:  * the result as YAML to public/openapi.yaml.
    6:  *
    7:  * Run via:  tsx scripts/build-openapi.mjs
    8:  */
    9: 
   10: import { mkdirSync, writeFileSync } from 'node:fs';
   11: import { dirname, resolve } from 'node:path';
   12: import { fileURLToPath } from 'node:url';
   13: import { stringify } from 'yaml';
   14: import { generateSpec } from '../server/api/openapi.ts';
   15: 
   16: const __dirname = dirname(fileURLToPath(import.meta.url));
   17: const repoRoot = resolve(__dirname, '..');
   18: const outPath = resolve(repoRoot, 'public', 'openapi.yaml');
   19: 
   20: // Ensure public/ exists
   21: mkdirSync(resolve(repoRoot, 'public'), { recursive: true });
   22: 
   23: const spec = generateSpec();
   24: 
   25: // Stringify with nullEncoding and forceQuotes for numeric-looking keys (e.g. "5XX")
   26: const yamlText = stringify(spec, {
   27:   defaultStringType: 'QUOTE_DOUBLE',
   28:   defaultKeyType: 'PLAIN',
   29:   nullStr: 'null',
   30: });
   31: 
   32: writeFileSync(outPath, yamlText, 'utf8');
   33: console.log(`Wrote ${Buffer.byteLength(yamlText, 'utf8')} bytes to public/openapi.yaml`);

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'src/client/base-url.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'src/client/openapi.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'src/server/lib/redis.types.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'src/server/lib/redis.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1484ms:
    1: /**
    2:  * Pure normalization helper. Public so contract tests can verify behavior
    3:  * without mocking import.meta.env.
    4:  *
    5:  *  - Preserves protocol scheme (`://` after http/https/ws/wss/etc) verbatim.
    6:  *  - Collapses runs of internal `//` to a single `/` in the rest of the URL.
    7:  *  - Strips exactly one trailing `/` if the result is longer than `/`.
    8:  *  - Empty/whitespace input returns `""`.
    9:  */
   10: export function normalizeApiBaseUrl(raw: string): string {
   11:   const trimmed = (raw ?? '').trim();
   12:   if (!trimmed) return '';
   13:   const protoMatch = trimmed.match(/^([a-z][a-z0-9+.-]*:\/\/)(.*)$/i);
   14:   const proto = protoMatch ? (protoMatch[1] ?? '') : '';
   15:   const rest = protoMatch ? (protoMatch[2] ?? '') : trimmed;
   16:   const collapsed = rest.replace(/\/{2,}/g, '/');
   17:   const stripped =
   18:     collapsed.length > 1 && collapsed.endsWith('/')
   19:       ? collapsed.slice(0, -1)
   20:       : collapsed;
   21:   return proto + stripped;
   22: }
   23: 
   24: /**
   25:  * Canonical API base URL for the openapi-fetch client.
   26:  *
   27:  * Reads VITE_SIGNALMAP_API_BASE_URL from the Vite client environment.
   28:  * Returns "" (browser-relative) when:
   29:  *   - the env value is unset/empty/whitespace, OR
   30:  *   - the env value is a path-only string (no `scheme://`).
   31:  *     Path-only inputs are misconfigurations: an API base URL that is itself
   32:  *     a `/api/...` path will compose with `/api/signalmap/...` to produce a
   33:  *     doubled `/api/...api/...` URL. We reject silently and fall back to
   34:  *     same-origin relative URLs.
   35:  *
   36:  * Absolute URLs (with scheme) are normalized via normalizeApiBaseUrl and returned.
   37:  */
   38: export function getApiBaseUrl(): string {
   39:   return resolveApiBaseUrl(import.meta.env?.VITE_SIGNALMAP_API_BASE_URL);
   40: }
   41: 
   42: /**
   43:  * @internal Test-only helper. Same logic as getApiBaseUrl(), but takes the
   44:  * env value as an explicit argument so contract tests can verify behavior
   45:  * without mocking import.meta.env (which is undefined under tsx --test).
   46:  */
   47: export function resolveApiBaseUrl(envValue: string | undefined | null): string {
   48:   const raw = (envValue ?? '').trim();
   49:   if (!raw) return '';
   50:   const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
   51:   if (!hasScheme) return '';
   52:   return normalizeApiBaseUrl(raw);
   53: }

 succeeded in 1538ms:
    1: import createClient from 'openapi-fetch';
    2: import type { paths } from './types.js';
    3: import { getApiBaseUrl } from './base-url.js';
    4: 
    5: export const client = createClient<paths>({ baseUrl: getApiBaseUrl() });

 succeeded in 1464ms:
    1: /**
    2:  * Redis adapter contract for SignalMap.
    3:  *
    4:  * This file defines the TypeScript interface that all Redis-dependent code in the
    5:  * SignalMap server layer types against. It is contract-only â€” no imports from
    6:  * `ioredis` or any other client library appear here.
    7:  *
    8:  * Implementation: Phase 2 unit 2a, `src/server/lib/redis.ts`.
    9:  * That file will export a concrete `RedisAdapter` backed by `ioredis`, constructed
   10:  * from the `REDIS_URL` environment variable with auto-reconnect and a 5-second
   11:  * command timeout.
   12:  *
   13:  * Phase 3 unit 3d extends this interface with sorted-set operations
   14:  * (`ZADD` / `ZRANGEBYSCORE` / `ZREMRANGEBYRANK` / `ZCARD`) for the SSE replay ring.
   15:  * Those methods are now landed in this file.
   16:  */
   17: 
   18: /**
   19:  * A disposer handle returned by `RedisAdapter.subscribe`.
   20:  *
   21:  * Callers must call `dispose()` when they no longer need the subscription
   22:  * (e.g. on SSE connection close) so the underlying pub/sub listener is
   23:  * released and the ioredis subscriber connection can be cleaned up.
   24:  *
   25:  * Open interface â€” Phase 3 may add cleanup metadata (e.g. `channel` or
   26:  * `subscribedAt`) without breaking existing callers.
   27:  */
   28: export interface Disposer {
   29:   /**
   30:    * Release the subscription acquired by `RedisAdapter.subscribe`.
   31:    * Idempotent â€” calling more than once must be safe.
   32:    */
   33:   dispose(): void;
   34: }
   35: 
   36: /**
   37:  * The Redis adapter contract for SignalMap.
   38:  *
   39:  * All methods throw on connection or protocol errors so callers can decide
   40:  * their own retry strategy. Methods that express logical absence (cache miss,
   41:  * lock not acquired) return `null` or `false` rather than throwing â€” see the
   42:  * "Error semantics" section in `docs/SignalMap/_discovery/redis-adapter.md`
   43:  * for the full contract.
   44:  *
   45:  * Extended in Phase 3 unit 3d with sorted-set ops (`zadd`, `zrangeByScore`,
   46:  * `zremRangeByRank`, `zcard`) for the SSE replay ring.
   47:  */
   48: export interface RedisAdapter {
   49:   /**
   50:    * Wraps Redis `GET` + `JSON.parse`.
   51:    *
   52:    * Returns the deserialized value on a cache hit, or `null` on a cache miss
   53:    * (key absent or value stored as JSON `null`). Throws on connection/protocol
   54:    * errors so the caller can decide whether to fall back to an upstream fetch
   55:    * or propagate the error.
   56:    *
   57:    * Example use site: brief cron reads `signalmap:brief:global` to check
   58:    * whether a fresh brief already exists before invoking the LLM pipeline.
   59:    * Source-health cache reads (`signalmap:source:health:*`) also go through
   60:    * `getJson`.
   61:    *
   62:    * @param key   Redis key (e.g. `"signalmap:brief:global"`).
   63:    * @returns     Deserialized `T` on hit; `null` on miss.
   64:    * @throws      On Redis connection or protocol error.
   65:    */
   66:   getJson<T>(key: string): Promise<T | null>;
   67: 
   68:   /**
   69:    * Wraps Redis `SET` (no expiry) + `JSON.stringify`.
   70:    *
   71:    * Overwrites the key in place with no TTL â€” the value persists until
   72:    * explicitly deleted or overwritten. Use `setJsonEx` when a TTL is needed.
   73:    *
   74:    * Example use site: brief cron writes the completed global brief to
   75:    * `signalmap:brief:global` after the LLM pipeline finishes. The key is
   76:    * intentionally persistent so SSE handlers can always read the latest brief
   77:    * without racing against expiry.
   78:    *
   79:    * @param key   Redis key.
   80:    * @param value Value to serialize and store.
   81:    * @throws      On Redis connection or protocol error.
   82:    */
   83:   setJson<T>(key: string, value: T): Promise<void>;
   84: 
   85:   /**
   86:    * Wraps Redis `SETEX` (SET with EXpiry) + `JSON.stringify`.
   87:    *
   88:    * Writes the serialized value and sets an expiry of `ttlSeconds`. Callers
   89:    * that need a persistent key should use `setJson` instead.
   90:    *
   91:    * Example use sites: short-lived source-health caches (e.g. 60-second TTL
   92:    * after an upstream probe), per-event brief caches that must expire once the
   93:    * event window closes, and rate-limit window state.
   94:    *
   95:    * @param key        Redis key.
   96:    * @param value      Value to serialize and store.
   97:    * @param ttlSeconds Time-to-live in seconds (must be > 0).
   98:    * @throws           On Redis connection or protocol error.
   99:    */
  100:   setJsonEx<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  101: 
  102:   /**
  103:    * Wraps Redis `SET key value NX PX <ms>` (SET if Not eXists with expiry).
  104:    *
  105:    * Returns `true` if the lock was acquired (key did not previously exist),
  106:    * or `false` if the key was already present (lock contended). The TTL
  107:    * ensures the lock auto-releases if the holder crashes before calling `del`.
  108:    *
  109:    * Example use site: per-event brief singleflight lock. Before spawning an
  110:    * LLM pipeline for a specific event ID, the handler calls `setNx` on
  111:    * `signalmap:brief:lock:<eventId>`. Only the first concurrent caller
  112:    * acquires the lock; others fall through to a cache read (council Â§4
  113:    * hardening).
  114:    *
  115:    * @param key        Redis key used as the lock name.
  116:    * @param value      Lock holder identifier (e.g. request ID or hostname).
  117:    * @param ttlSeconds Lock auto-release timeout in seconds.
  118:    * @returns          `true` if acquired, `false` if contended.
  119:    * @throws           On Redis connection or protocol error.
  120:    */
  121:   setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  122: 
  123:   /**
  124:    * Wraps Redis `INCR`.
  125:    *
  126:    * Atomically increments the integer stored at `key` by 1 and returns the
  127:    * new value. If the key does not exist, it is initialized to 0 before the
  128:    * increment (so the first call returns 1).
  129:    *
  130:    * Example use site: per-IP rate-limit counters on the per-event brief
  131:    * endpoint. Each request increments the counter for its IP window key; the
  132:    * returned value is compared against the rate-limit threshold. Pair with
  133:    * `expire` to set the window TTL on the first increment.
  134:    *
  135:    * @param key   Redis key (must store an integer string or not exist).
  136:    * @returns     New counter value after increment.
  137:    * @throws      On Redis connection or protocol error, or if the stored value
  138:    *              is not an integer.
  139:    */
  140:   incr(key: string): Promise<number>;
  141: 
  142:   /**
  143:    * Wraps Redis `INCRBYFLOAT`.
  144:    *
  145:    * Atomically increments (or decrements, when `delta` is negative) the
  146:    * floating-point number stored at `key` by `delta` and returns the new
  147:    * value. If the key does not exist it is initialized to 0.
  148:    *
  149:    * Example use site: atomic LLM spend reservation. Before each LLM call the
  150:    * handler adds the estimated token cost to `signalmap:spend:<userId>:<window>`.
  151:    * After the call completes, the actual cost is known and the difference is
  152:    * refunded via a negative delta (e.g. `incrByFloat(key, actualCost - estimate)`).
  153:    * This two-phase reserve/refund pattern prevents double-spending across
  154:    * concurrent requests without a distributed lock.
  155:    *
  156:    * @param key   Redis key (must store a float string or not exist).
  157:    * @param delta Amount to add (negative for refund/decrement).
  158:    * @returns     New float value after increment.
  159:    * @throws      On Redis connection or protocol error, or if the stored value
  160:    *              is not a float.
  161:    */
  162:   incrByFloat(key: string, delta: number): Promise<number>;
  163: 
  164:   /**
  165:    * Wraps Redis `EXPIRE`.
  166:    *
  167:    * Sets a TTL on an existing key. Has no effect if the key does not exist.
  168:    * Use after `incr` to set the rate-limit window duration on the first
  169:    * increment (where `setJsonEx` is not applicable because the value was
  170:    * written by `incr`, not `setJson`).
  171:    *
  172:    * Example use site: after `incr` creates a rate-limit counter key for the
  173:    * first time, `expire` arms the window so the counter auto-resets after
  174:    * (e.g.) 60 seconds.
  175:    *
  176:    * @param key        Redis key to expire.
  177:    * @param ttlSeconds Seconds until the key is deleted.
  178:    * @throws           On Redis connection or protocol error.
  179:    */
  180:   expire(key: string, ttlSeconds: number): Promise<void>;
  181: 
  182:   /**
  183:    * Wraps Redis `DEL`.
  184:    *
  185:    * Deletes the key. No-op if the key does not exist.
  186:    *
  187:    * Example use sites: lock cleanup after a singleflight holder finishes
  188:    * (releases the lock before the TTL expires so the next waiter can proceed
  189:    * immediately); test teardown; manual cache invalidation.
  190:    *
  191:    * @param key   Redis key to delete.
  192:    * @throws      On Redis connection or protocol error.
  193:    */
  194:   del(key: string): Promise<void>;
  195: 
  196:   /**
  197:    * Wraps Redis pipelining (`ioredis` `pipeline().exec()`).
  198:    *
  199:    * Sends multiple commands in a single network round-trip and returns their
  200:    * results in the same order as the input commands array. Each command is an
  201:    * array whose first element is the Redis command name (e.g. `"GET"`,
  202:    * `"SET"`, `"INCR"`) followed by its arguments.
  203:    *
  204:    * Results are returned as-is from the Redis server (strings, numbers, or
  205:    * `null` for absent keys). Callers are responsible for parsing the results
  206:    * (e.g. `JSON.parse` for `GET` results that were written via `setJson`).
  207:    *
  208:    * Example use site: brief cron batch-writes multiple signal keys in one
  209:    * round-trip to reduce latency. Source-health batch reads also use a
  210:    * pipeline to fetch many keys simultaneously.
  211:    *
  212:    * @param commands  Array of Redis commands, each as `[commandName, ...args]`.
  213:    * @returns         Array of raw Redis results in command order.
  214:    * @throws          On Redis connection or protocol error. Individual command
  215:    *                  errors are surfaced as error objects within the results
  216:    *                  array (ioredis pipeline semantics).
  217:    */
  218:   pipeline(commands: Array<[string, ...unknown[]]>): Promise<unknown[]>;
  219: 
  220:   /**
  221:    * Wraps Redis `PUBLISH`.
  222:    *
  223:    * Publishes `message` to `channel`. Returns when the message has been
  224:    * delivered to the Redis server (does not wait for subscribers to receive
  225:    * it). If no subscribers are listening the message is silently dropped â€”
  226:    * pub/sub in Redis is fire-and-forget.
  227:    *
  228:    * Example use site: brief cron publishes `"updated"` (or a JSON summary)
  229:    * to `signalmap:brief:updated` after writing the new brief to Redis so that
  230:    * SSE handlers subscribed via `subscribe` can push the update to connected
  231:    * clients without polling.
  232:    *
  233:    * @param channel   Redis pub/sub channel name.
  234:    * @param message   String message payload to publish.
  235:    * @throws          On Redis connection or protocol error.
  236:    */
  237:   publish(channel: string, message: string): Promise<void>;
  238: 
  239:   /**
  240:    * Wraps Redis `SUBSCRIBE` via a dedicated subscriber connection.
  241:    *
  242:    * Registers `handler` to be called with the message string whenever a
  243:    * message is published to `channel`. Returns a `Disposer` that the caller
  244:    * must invoke when done (e.g. on SSE connection close) to release the
  245:    * underlying listener and avoid memory/connection leaks.
  246:    *
  247:    * The implementation (Phase 2 unit 2a) will maintain a single shared
  248:    * ioredis subscriber connection and multiplex channels on it so that
  249:    * subscribing to many channels does not open many TCP connections.
  250:    *
  251:    * Example use site: the SSE handler subscribes to `signalmap:brief:updated`
  252:    * on connection open and pushes `data:` events to the client as messages
  253:    * arrive. It also subscribes to per-signal-event channels so clients receive
  254:    * live updates without polling. The disposer is called in the SSE
  255:    * `close`/`cancel` handler.
  256:    *
  257:    * Note: this method is intentionally synchronous-returning (not `async`)
  258:    * because the subscription is set up immediately and the disposer must be
  259:    * available before the first message arrives.
  260:    *
  261:    * @param channel   Redis pub/sub channel to subscribe to.
  262:    * @param handler   Callback invoked with the raw message string on each publish.
  263:    * @returns         A `Disposer` to release the subscription.
  264:    * @throws          Never â€” SUBSCRIBE failures are logged via console.warn and
  265:    *                  surface on the underlying ioredis connection's 'error'
  266:    *                  event. Callers needing strict failure semantics should
  267:    *                  attach their own listener via the connection accessor (TBD)
  268:    *                  or wait for a future PR that introduces an async
  269:    *                  subscribeAsync(channel, handler) variant.
  270:    */
  271:   subscribe(channel: string, handler: (message: string) => void): Disposer;
  272: 
  273:   /**
  274:    * Wraps Redis `ZADD`. Adds (or updates) a member's score in the sorted set.
  275:    *
  276:    * @param key     Sorted-set key.
  277:    * @param score   Numeric score for ordering.
  278:    * @param member  Member string to add/update.
  279:    * @returns       Number of new members added (0 if member already existed and only score changed).
  280:    * @throws        On connection/protocol error.
  281:    */
  282:   zadd(key: string, score: number, member: string): Promise<number>;
  283: 
  284:   /**
  285:    * Wraps Redis `ZRANGEBYSCORE`. Returns members whose score falls in [min, max].
  286:    *
  287:    * Min/max may use ioredis range syntax: a number, "-inf"/"+inf", or
  288:    * exclusive bounds prefixed with "(" (e.g. "(100" means score > 100).
  289:    *
  290:    * @param key   Sorted-set key.
  291:    * @param min   Lower bound (inclusive unless prefixed with "(").
  292:    * @param max   Upper bound (inclusive unless prefixed with "(").
  293:    * @returns     Members in ascending score order.
  294:    * @throws      On connection/protocol error.
  295:    */
  296:   zrangeByScore(key: string, min: number | string, max: number | string): Promise<string[]>;
  297: 
  298:   /**
  299:    * Wraps Redis `ZREMRANGEBYRANK`. Removes members in the given index range.
  300:    *
  301:    * Indices are 0-based; -1 is the last element. Use `(0, -<size>-1)` to keep
  302:    * only the last `size` elements (cap a ring).
  303:    *
  304:    * @param key   Sorted-set key.
  305:    * @param start Start index (inclusive).
  306:    * @param stop  Stop index (inclusive).
  307:    * @returns     Number of members removed.
  308:    * @throws      On connection/protocol error.
  309:    */
  310:   zremRangeByRank(key: string, start: number, stop: number): Promise<number>;
  311: 
  312:   /**
  313:    * Wraps Redis `ZCARD`. Returns the number of members in the sorted set.
  314:    *
  315:    * @param key   Sorted-set key.
  316:    * @returns     Cardinality (0 if key absent).
  317:    * @throws      On connection/protocol error.
  318:    */
  319:   zcard(key: string): Promise<number>;
  320: }

 succeeded in 1569ms:
    1: /**
    2:  * SignalMap Redis adapter â€” ioredis implementation.
    3:  *
    4:  * Implements the `RedisAdapter` interface declared in `./redis.types.ts`.
    5:  * Two ioredis connections are maintained per adapter instance:
    6:  *   - `client`     â€” used for all normal commands (GET, SET, INCR, PIPELINE, PUBLISH, â€¦)
    7:  *   - `subscriber` â€” a dedicated connection kept in subscriber mode for SUBSCRIBE/UNSUBSCRIBE
    8:  *
    9:  * Do NOT import this module at the top level of any code that must work without
   10:  * a Redis connection available.  Connection is established lazily by ioredis on
   11:  * first command (lazyConnect: false actually connects eagerly when the constructor
   12:  * is called â€” which only happens inside `createRedisAdapter()`).
   13:  */
   14: 
   15: import Redis, { type Redis as RedisClient } from 'ioredis';
   16: import type { RedisAdapter, Disposer } from './redis.types.ts';
   17: 
   18: // â”€â”€â”€ Public types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   19: 
   20: export interface CreateRedisAdapterOptions {
   21:   /** Defaults to `process.env.REDIS_URL`. */
   22:   url?: string;
   23: }
   24: 
   25: /**
   26:  * The concrete adapter returned by `createRedisAdapter`.
   27:  * Extends `RedisAdapter` with a `quit()` method to close both connections.
   28:  * `quit()` is intentionally NOT on the `RedisAdapter` interface â€” callers that
   29:  * own the adapter lifecycle call it; callers that merely use it do not.
   30:  */
   31: export interface ManagedRedisAdapter extends RedisAdapter {
   32:   /** Close both ioredis connections. Idempotent. */
   33:   quit(): Promise<void>;
   34: }
   35: 
   36: // â”€â”€â”€ Connection options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   37: 
   38: function makeConnectionOptions() {
   39:   return {
   40:     lazyConnect: false,
   41:     enableAutoPipelining: false,
   42:     commandTimeout: 5000,
   43:   } as const;
   44: }
   45: 
   46: // â”€â”€â”€ Factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   47: 
   48: export function createRedisAdapter(options: CreateRedisAdapterOptions = {}): ManagedRedisAdapter {
   49:   const url = options.url ?? process.env.REDIS_URL;
   50:   if (!url) throw new Error('REDIS_URL is not set');
   51: 
   52:   const client: RedisClient = new Redis(url, makeConnectionOptions());
   53:   const subscriber: RedisClient = new Redis(url, makeConnectionOptions());
   54: 
   55:   // 'error' listeners prevent 'Unhandled error event' Node warnings during
   56:   // transient connection issues. ioredis retries internally; we just log.
   57:   client.on('error', (err: unknown) => {
   58:     console.warn('[redis-adapter] client error:', err instanceof Error ? err.message : err);
   59:   });
   60:   subscriber.on('error', (err: unknown) => {
   61:     console.warn('[redis-adapter] subscriber error:', err instanceof Error ? err.message : err);
   62:   });
   63: 
   64:   // Internal pub/sub state: channel â†’ set of handlers
   65:   const handlers = new Map<string, Set<(msg: string) => void>>();
   66: 
   67:   // Single 'message' listener on the subscriber connection
   68:   subscriber.on('message', (chan: string, msg: string) => {
   69:     const set = handlers.get(chan);
   70:     if (set) {
   71:       for (const h of set) h(msg);
   72:     }
   73:   });
   74: 
   75:   let quitted = false;
   76: 
   77:   // â”€â”€â”€ Adapter methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   78: 
   79:   async function getJson<T>(key: string): Promise<T | null> {
   80:     const raw = await client.get(key);
   81:     if (raw === null) return null;
   82:     return JSON.parse(raw) as T;
   83:   }
   84: 
   85:   async function setJson<T>(key: string, value: T): Promise<void> {
   86:     await client.set(key, JSON.stringify(value));
   87:   }
   88: 
   89:   async function setJsonEx<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
   90:     await client.setex(key, ttlSeconds, JSON.stringify(value));
   91:   }
   92: 
   93:   async function setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
   94:     const result = await client.set(key, value, 'PX', ttlSeconds * 1000, 'NX');
   95:     return result === 'OK';
   96:   }
   97: 
   98:   async function incr(key: string): Promise<number> {
   99:     return client.incr(key);
  100:   }
  101: 
  102:   async function incrByFloat(key: string, delta: number): Promise<number> {
  103:     const raw = await client.incrbyfloat(key, delta);
  104:     return Number(raw);
  105:   }
  106: 
  107:   async function expire(key: string, ttlSeconds: number): Promise<void> {
  108:     await client.expire(key, ttlSeconds);
  109:   }
  110: 
  111:   async function del(key: string): Promise<void> {
  112:     await client.del(key);
  113:   }
  114: 
  115:   async function pipeline(commands: Array<[string, ...unknown[]]>): Promise<unknown[]> {
  116:     const p = client.pipeline();
  117:     for (const cmd of commands) {
  118:       const [name, ...args] = cmd;
  119:       // ioredis pipeline accepts dynamic method calls; use bracket notation
  120:       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  121:       (p as any)[name.toLowerCase()](...args);
  122:     }
  123:     const results = await p.exec();
  124:     if (results === null) return [];
  125:     return results.map(([err, val]) => err ?? val);
  126:   }
  127: 
  128:   async function publish(channel: string, message: string): Promise<void> {
  129:     await client.publish(channel, message);
  130:   }
  131: 
  132:   function subscribe(channel: string, handler: (message: string) => void): Disposer {
  133:     let disposed = false;
  134: 
  135:     // Get or create the handler set for this channel
  136:     let set = handlers.get(channel);
  137:     if (!set) {
  138:       set = new Set();
  139:       handlers.set(channel, set);
  140:     }
  141: 
  142:     const wasEmpty = set.size === 0;
  143:     set.add(handler);
  144: 
  145:     // Subscribe on the ioredis subscriber connection if this is the first handler
  146:     if (wasEmpty) {
  147:       subscriber.subscribe(channel).catch((err) => {
  148:         console.warn('[redis-adapter] subscribe failed for channel', channel, '-', err instanceof Error ? err.message : err);
  149:       });
  150:     }
  151: 
  152:     return {
  153:       dispose(): void {
  154:         if (disposed) return;
  155:         disposed = true;
  156: 
  157:         const s = handlers.get(channel);
  158:         if (!s) return;
  159:         s.delete(handler);
  160: 
  161:         if (s.size === 0) {
  162:           handlers.delete(channel);
  163:           subscriber.unsubscribe(channel).catch((err) => {
  164:             console.warn('[redis-adapter] unsubscribe failed for channel', channel, '-', err instanceof Error ? err.message : err);
  165:           });
  166:         }
  167:       },
  168:     };
  169:   }
  170: 
  171:   async function zadd(key: string, score: number, member: string): Promise<number> {
  172:     const result = await client.zadd(key, score, member);
  173:     return Number(result);
  174:   }
  175: 
  176:   async function zrangeByScore(key: string, min: number | string, max: number | string): Promise<string[]> {
  177:     return client.zrangebyscore(key, min, max);
  178:   }
  179: 
  180:   async function zremRangeByRank(key: string, start: number, stop: number): Promise<number> {
  181:     const result = await client.zremrangebyrank(key, start, stop);
  182:     return Number(result);
  183:   }
  184: 
  185:   async function zcard(key: string): Promise<number> {
  186:     const result = await client.zcard(key);
  187:     return Number(result);
  188:   }
  189: 
  190:   async function quit(): Promise<void> {
  191:     if (quitted) return;
  192:     quitted = true;
  193:     await Promise.all([client.quit(), subscriber.quit()]);
  194:   }
  195: 
  196:   return {
  197:     getJson,
  198:     setJson,
  199:     setJsonEx,
  200:     setNx,
  201:     incr,
  202:     incrByFloat,
  203:     expire,
  204:     del,
  205:     pipeline,
  206:     publish,
  207:     subscribe,
  208:     zadd,
  209:     zrangeByScore,
  210:     zremRangeByRank,
  211:     zcard,
  212:     quit,
  213:   };
  214: }
  215: 
  216: // â”€â”€â”€ Lazy singleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  217: 
  218: let _default: ManagedRedisAdapter | null = null;
  219: 
  220: /**
  221:  * Returns the process-singleton adapter, creating it on first call.
  222:  * Reads `process.env.REDIS_URL` at first-call time only.
  223:  *
  224:  * Use `createRedisAdapter({ url })` directly in tests so each suite gets its
  225:  * own adapter instance and can call `adapter.quit()` in its `after()` hook.
  226:  */
  227: export function getRedisAdapter(): ManagedRedisAdapter {
  228:   if (_default) return _default;
  229:   _default = createRedisAdapter();
  230:   return _default;
  231: }

codex
The OpenAPI side is in place structurally: six paths are defined, the client uses `openapi-fetch`, and the build script writes YAML from `generateSpec()`. I’m now tracing the SSE replay path, because that’s where spec compliance depends on runtime behavior and failure handling rather than only generated contracts.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'src/server/lib/sse-replay-ring.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'server/api/routes/signalmap-stream.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'tests/sse-replay-ring.test.mjs'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'tests/sse-stream.test.mjs'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1209ms:
    1: import type { RedisAdapter } from './redis.types.js';
    2: 
    3: const COUNTER_KEY = 'signalmap:sse:counter';
    4: const RING_KEY = 'signalmap:sse:ring';
    5: const EVENT_KEY_PREFIX = 'signalmap:sse:event:';
    6: 
    7: function getRingSize(): number {
    8:   return Number(process.env.SSE_REPLAY_RING_SIZE ?? 1000);
    9: }
   10: 
   11: function getRingTtlSeconds(): number {
   12:   return Number(process.env.SSE_REPLAY_RING_TTL_SECONDS ?? 600);
   13: }
   14: 
   15: export interface SSEEventPayload {
   16:   /** Event type (SSE `event:` field). Defaults to `'message'` if absent. */
   17:   event?: string;
   18:   /** JSON-stringified payload (the SSE `data:` line). */
   19:   data: string;
   20: }
   21: 
   22: export interface ReplayResult {
   23:   /** Events with score strictly > lastId, in ascending order. */
   24:   events: Array<{ id: number; payload: SSEEventPayload }>;
   25:   /** True iff lastId was below the oldest score still in the ring (replay lost). */
   26:   lost: boolean;
   27: }
   28: 
   29: /** Atomically allocates the next monotonic event ID via INCR signalmap:sse:counter. */
   30: export async function nextEventId(redis: RedisAdapter): Promise<number> {
   31:   return redis.incr(COUNTER_KEY);
   32: }
   33: 
   34: /**
   35:  * Adds an event to the ring:
   36:  *   - SETEX signalmap:sse:event:<id> <RING_TTL_SECONDS> <payload>
   37:  *   - ZADD signalmap:sse:ring <id> "<id>"
   38:  *   - ZREMRANGEBYRANK signalmap:sse:ring 0 -RING_SIZE-1   (cap at RING_SIZE)
   39:  */
   40: export async function addEventToRing(
   41:   redis: RedisAdapter,
   42:   id: number,
   43:   payload: SSEEventPayload,
   44: ): Promise<void> {
   45:   const ringSize = getRingSize();
   46:   const ringTtlSeconds = getRingTtlSeconds();
   47:   const eventKey = `${EVENT_KEY_PREFIX}${id}`;
   48:   await redis.setJsonEx(eventKey, payload, ringTtlSeconds);
   49:   await redis.zadd(RING_KEY, id, String(id));
   50:   // Keep only the last ringSize members: remove indices 0 through -(ringSize+1)
   51:   await redis.zremRangeByRank(RING_KEY, 0, -(ringSize + 1));
   52: }
   53: 
   54: /**
   55:  * Replays events with score > lastId.
   56:  *
   57:  * If lastId is null, returns {events: [], lost: false} (fresh subscriber, no replay).
   58:  * If the ring is empty, returns {events: [], lost: false}.
   59:  * If lastId < oldest-in-ring, returns {events: [], lost: true}.
   60:  * Otherwise returns the events strictly after lastId in ascending order.
   61:  */
   62: export async function replayFrom(
   63:   redis: RedisAdapter,
   64:   lastId: number | null,
   65: ): Promise<ReplayResult> {
   66:   // Fresh subscriber â€” no replay needed
   67:   if (lastId === null) {
   68:     return { events: [], lost: false };
   69:   }
   70: 
   71:   // Fetch all IDs strictly greater than lastId (exclusive lower bound)
   72:   const idStrings = await redis.zrangeByScore(RING_KEY, `(${lastId}`, '+inf');
   73: 
   74:   if (idStrings.length === 0) {
   75:     // Ring might be empty, or lastId is at/above newest.
   76:     // Check if ring has any entries and if lastId is below the oldest.
   77:     const size = await redis.zcard(RING_KEY);
   78:     if (size === 0) {
   79:       return { events: [], lost: false };
   80:     }
   81: 
   82:     // Ring is not empty but nothing after lastId â€” check if lastId is before oldest
   83:     const oldest = await redis.zrangeByScore(RING_KEY, '-inf', '+inf');
   84:     if (oldest.length > 0 && Number(oldest[0]) > lastId + 1) {
   85:       return { events: [], lost: true };
   86:     }
   87: 
   88:     return { events: [], lost: false };
   89:   }
   90: 
   91:   // Check for a gap between lastId and the first returned ID.
   92:   // If the oldest ring entry is > lastId+1, events in between were evicted.
   93:   if (Number(idStrings[0]) > lastId + 1) {
   94:     return { events: [], lost: true };
   95:   }
   96: 
   97:   // Fetch each event payload
   98:   const events: Array<{ id: number; payload: SSEEventPayload }> = [];
   99:   for (const idStr of idStrings) {
  100:     const id = Number(idStr);
  101:     const eventKey = `${EVENT_KEY_PREFIX}${id}`;
  102:     const payload = await redis.getJson<SSEEventPayload>(eventKey);
  103:     if (payload !== null) {
  104:       events.push({ id, payload });
  105:     }
  106:     // If null: event TTL expired â€” filter it out (per spec)
  107:   }
  108: 
  109:   return { events, lost: false };
  110: }
  111: 
  112: /** Returns ring stats for ops visibility / health endpoint integration. */
  113: export async function ringStats(redis: RedisAdapter): Promise<{
  114:   size: number;
  115:   oldestId: number | null;
  116:   newestId: number | null;
  117: }> {
  118:   const size = await redis.zcard(RING_KEY);
  119:   if (size === 0) {
  120:     return { size: 0, oldestId: null, newestId: null };
  121:   }
  122: 
  123:   // Fetch all members to get first and last (no LIMIT support in our contract)
  124:   const all = await redis.zrangeByScore(RING_KEY, '-inf', '+inf');
  125:   const oldestId = all.length > 0 ? Number(all[0]) : null;
  126:   const newestId = all.length > 0 ? Number(all[all.length - 1]) : null;
  127: 
  128:   return { size, oldestId, newestId };
  129: }

 succeeded in 1345ms:
    1: /**
    2:  * Smoke tests for the SSE replay ring (Redis sorted-set backed).
    3:  *
    4:  * Requires a Redis 7 server at REDIS_URL (default: redis://localhost:6380).
    5:  * Skips cleanly when Redis is unavailable.
    6:  *
    7:  * To run locally:
    8:  *   docker run -d --rm --name sigmap-test-redis -p 6380:6379 redis:7-alpine
    9:  *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/sse-replay-ring.test.mjs
   10:  */
   11: 
   12: import { before, after, describe, it } from 'node:test';
   13: import assert from 'node:assert/strict';
   14: import { createRedisAdapter } from '../src/server/lib/redis.ts';
   15: import {
   16:   nextEventId,
   17:   addEventToRing,
   18:   replayFrom,
   19:   ringStats,
   20: } from '../src/server/lib/sse-replay-ring.ts';
   21: 
   22: const REDIS_URL = process.env.REDIS_URL;
   23: let adapter;
   24: let probeFailed = false;
   25: 
   26: if (!REDIS_URL) {
   27:   probeFailed = true;
   28:   console.warn('[sse-replay-ring.test] REDIS_URL not set â€” skipping suite');
   29: }
   30: 
   31: // Test key constants (must match sse-replay-ring.ts internals)
   32: const COUNTER_KEY = 'signalmap:sse:counter';
   33: const RING_KEY = 'signalmap:sse:ring';
   34: const EVENT_KEY_PREFIX = 'signalmap:sse:event:';
   35: 
   36: async function cleanupRing(adapter, ids) {
   37:   await adapter.del(COUNTER_KEY);
   38:   await adapter.del(RING_KEY);
   39:   for (const id of ids) {
   40:     await adapter.del(`${EVENT_KEY_PREFIX}${id}`);
   41:   }
   42: }
   43: 
   44: /**
   45:  * Restores an env var to its previous value.
   46:  * When prev was undefined (var was not set), deletes the key rather than
   47:  * assigning the string "undefined" which would corrupt Number() parsing.
   48:  */
   49: function restoreEnv(key, prev) {
   50:   if (prev === undefined) {
   51:     delete process.env[key];
   52:   } else {
   53:     process.env[key] = prev;
   54:   }
   55: }
   56: 
   57: describe('SSE replay ring â€” live Redis smoke tests', { skip: probeFailed }, () => {
   58:   before(async () => {
   59:     adapter = createRedisAdapter({ url: REDIS_URL });
   60:     try {
   61:       await adapter.incr('signalmap:test:probe');
   62:       await adapter.del('signalmap:test:probe');
   63:     } catch (err) {
   64:       probeFailed = true;
   65:       console.warn('[sse-replay-ring.test] Redis unreachable, skipping:', err?.message);
   66:     }
   67:     // Pre-clean ring state
   68:     await cleanupRing(adapter, []);
   69:   });
   70: 
   71:   after(async () => {
   72:     if (adapter) await adapter.quit();
   73:   });
   74: 
   75:   // 1. nextEventId produces strictly increasing values
   76:   it('nextEventId produces strictly increasing values', { skip: probeFailed }, async () => {
   77:     // Reset counter
   78:     await adapter.del(COUNTER_KEY);
   79: 
   80:     const id1 = await nextEventId(adapter);
   81:     const id2 = await nextEventId(adapter);
   82:     const id3 = await nextEventId(adapter);
   83: 
   84:     assert.ok(id1 < id2, `id1 (${id1}) should be < id2 (${id2})`);
   85:     assert.ok(id2 < id3, `id2 (${id2}) should be < id3 (${id3})`);
   86:     assert.equal(id2, id1 + 1);
   87:     assert.equal(id3, id2 + 1);
   88: 
   89:     await cleanupRing(adapter, []);
   90:   });
   91: 
   92:   // 2. addEventToRing + replayFrom round-trip an event correctly
   93:   it('addEventToRing + replayFrom round-trips an event', { skip: probeFailed }, async () => {
   94:     await cleanupRing(adapter, []);
   95: 
   96:     const payload = { event: 'test-event', data: JSON.stringify({ hello: 'world' }) };
   97:     const id = await nextEventId(adapter);
   98:     await addEventToRing(adapter, id, payload);
   99: 
  100:     // Replay with lastId = id - 1 (want events strictly after that)
  101:     const result = await replayFrom(adapter, id - 1);
  102: 
  103:     assert.equal(result.lost, false);
  104:     assert.equal(result.events.length, 1);
  105:     assert.equal(result.events[0].id, id);
  106:     assert.deepEqual(result.events[0].payload, payload);
  107: 
  108:     await cleanupRing(adapter, [id]);
  109:   });
  110: 
  111:   // 3. replayFrom with lastId strictly greater than newest returns empty list
  112:   it('replayFrom with lastId >= newest returns empty events, lost: false', { skip: probeFailed }, async () => {
  113:     await cleanupRing(adapter, []);
  114: 
  115:     const payload = { data: '{"msg":"ping"}' };
  116:     const id = await nextEventId(adapter);
  117:     await addEventToRing(adapter, id, payload);
  118: 
  119:     // lastId is equal to the newest â€” nothing strictly after
  120:     const result = await replayFrom(adapter, id);
  121: 
  122:     assert.equal(result.lost, false);
  123:     assert.equal(result.events.length, 0);
  124: 
  125:     // lastId is greater than the newest â€” still nothing
  126:     const result2 = await replayFrom(adapter, id + 100);
  127:     assert.equal(result2.lost, false);
  128:     assert.equal(result2.events.length, 0);
  129: 
  130:     await cleanupRing(adapter, [id]);
  131:   });
  132: 
  133:   // 4. replayFrom with null lastId returns empty events, lost: false (fresh subscriber)
  134:   it('replayFrom with null lastId returns empty events and lost: false', { skip: probeFailed }, async () => {
  135:     await cleanupRing(adapter, []);
  136: 
  137:     // Add some events to the ring
  138:     const id1 = await nextEventId(adapter);
  139:     await addEventToRing(adapter, id1, { data: '{"a":1}' });
  140:     const id2 = await nextEventId(adapter);
  141:     await addEventToRing(adapter, id2, { data: '{"b":2}' });
  142: 
  143:     const result = await replayFrom(adapter, null);
  144: 
  145:     assert.equal(result.lost, false);
  146:     assert.equal(result.events.length, 0, 'Fresh subscriber should get no replayed events');
  147: 
  148:     await cleanupRing(adapter, [id1, id2]);
  149:   });
  150: 
  151:   // 5. Ring evicts oldest entries when size exceeds SSE_REPLAY_RING_SIZE
  152:   it('ring evicts oldest entries when size exceeds SSE_REPLAY_RING_SIZE', { skip: probeFailed }, async () => {
  153:     await cleanupRing(adapter, []);
  154:     const prev = process.env.SSE_REPLAY_RING_SIZE;
  155:     process.env.SSE_REPLAY_RING_SIZE = '5';
  156:     const ids = [];
  157:     try {
  158:       // Push 7 events
  159:       for (let i = 0; i < 7; i++) {
  160:         const id = await nextEventId(adapter);
  161:         ids.push(id);
  162:         await addEventToRing(adapter, id, { event: 'message', data: `payload-${i}` });
  163:       }
  164:       const stats = await ringStats(adapter);
  165:       assert.equal(stats.size, 5, 'ring should be capped at 5');
  166:       assert.equal(stats.oldestId, ids[2], 'oldest after eviction should be 3rd inserted');
  167:       assert.equal(stats.newestId, ids[6], 'newest should be 7th inserted');
  168:     } finally {
  169:       restoreEnv('SSE_REPLAY_RING_SIZE', prev);
  170:       await cleanupRing(adapter, ids);
  171:     }
  172:   });
  173: 
  174:   // 6. replayFrom returns events strictly after Last-Event-ID in monotonic order
  175:   it('replayFrom returns events strictly after Last-Event-ID in monotonic order', { skip: probeFailed }, async () => {
  176:     await cleanupRing(adapter, []);
  177:     const ids = [];
  178:     try {
  179:       for (let i = 0; i < 5; i++) {
  180:         const id = await nextEventId(adapter);
  181:         ids.push(id);
  182:         await addEventToRing(adapter, id, { event: 'message', data: `p${i}` });
  183:       }
  184:       const result = await replayFrom(adapter, ids[1]);  // request from ids[1] exclusive
  185:       assert.equal(result.lost, false);
  186:       assert.equal(result.events.length, 3, 'should return 3 events: ids[2..4]');
  187:       assert.deepEqual(result.events.map(e => e.id), [ids[2], ids[3], ids[4]]);
  188:       assert.equal(result.events[0].payload.data, 'p2');
  189:     } finally {
  190:       await cleanupRing(adapter, ids);
  191:     }
  192:   });
  193: 
  194:   // 7. replayFrom signals lost when Last-Event-ID is below evicted floor
  195:   it('replayFrom signals lost when Last-Event-ID is below evicted floor', { skip: probeFailed }, async () => {
  196:     await cleanupRing(adapter, []);
  197:     const prev = process.env.SSE_REPLAY_RING_SIZE;
  198:     process.env.SSE_REPLAY_RING_SIZE = '3';
  199:     const ids = [];
  200:     try {
  201:       for (let i = 0; i < 5; i++) {
  202:         const id = await nextEventId(adapter);
  203:         ids.push(id);
  204:         await addEventToRing(adapter, id, { event: 'message', data: `p${i}` });
  205:       }
  206:       // ids[0] and ids[1] should now be evicted (ring kept last 3: ids[2..4])
  207:       const result = await replayFrom(adapter, ids[0]);
  208:       assert.equal(result.lost, true, 'lost should be true when lastId is below the floor');
  209:       assert.equal(result.events.length, 0);
  210:     } finally {
  211:       restoreEnv('SSE_REPLAY_RING_SIZE', prev);
  212:       await cleanupRing(adapter, ids);
  213:     }
  214:   });
  215: 
  216:   // 8. Event payloads expire per SSE_REPLAY_RING_TTL_SECONDS while ring entries survive
  217:   it('event payloads expire per SSE_REPLAY_RING_TTL_SECONDS while ring entries survive', { skip: probeFailed }, async () => {
  218:     await cleanupRing(adapter, []);
  219:     const prev = process.env.SSE_REPLAY_RING_TTL_SECONDS;
  220:     process.env.SSE_REPLAY_RING_TTL_SECONDS = '1';  // 1 second
  221:     let id;
  222:     try {
  223:       id = await nextEventId(adapter);
  224:       await addEventToRing(adapter, id, { event: 'message', data: 'ephemeral' });
  225:       // Wait 1.5s for the event payload to expire (ring zset entry persists)
  226:       await new Promise(r => setTimeout(r, 1500));
  227:       const result = await replayFrom(adapter, id - 1);
  228:       // Per spec: TTL'd payloads are unrecoverable; replayFrom filters them out.
  229:       // The ring zset entry still exists but the payload is gone, so events:[].
  230:       // lost remains false because zrangeByScore did return the id (just no payload).
  231:       assert.equal(result.lost, false);
  232:       assert.equal(result.events.length, 0, 'TTL-expired payloads filter out cleanly');
  233:     } finally {
  234:       restoreEnv('SSE_REPLAY_RING_TTL_SECONDS', prev);
  235:       if (id != null) await cleanupRing(adapter, [id]);
  236:     }
  237:   });
  238: });

 succeeded in 1404ms:
    1: import type { IncomingMessage, ServerResponse } from 'node:http';
    2: import { randomInt } from 'node:crypto';
    3: import { getRedisAdapter } from '../../../src/server/lib/redis.js';
    4: import {
    5:   addEventToRing,
    6:   nextEventId,
    7:   replayFrom,
    8:   type SSEEventPayload,
    9: } from '../../../src/server/lib/sse-replay-ring.js';
   10: 
   11: const CHANNEL = 'signalmap:events';
   12: 
   13: function getHeartbeatSeconds(): number {
   14:   return Number(process.env.SSE_HEARTBEAT_SECONDS ?? 20);
   15: }
   16: 
   17: function getRetryMinMs(): number {
   18:   return Number(process.env.SSE_RECONNECT_RETRY_MIN_MS ?? 5000);
   19: }
   20: 
   21: function getRetryMaxMs(): number {
   22:   return Number(process.env.SSE_RECONNECT_RETRY_MAX_MS ?? 15000);
   23: }
   24: 
   25: interface Connection {
   26:   res: ServerResponse;
   27:   cleanup: () => void;
   28: }
   29: 
   30: const connections = new Set<Connection>();
   31: 
   32: function jitteredRetryMs(): number {
   33:   return randomInt(getRetryMinMs(), getRetryMaxMs() + 1);
   34: }
   35: 
   36: function writeSSEEvent(res: ServerResponse, id: number, payload: SSEEventPayload): void {
   37:   res.write(`id: ${id}\n`);
   38:   if (payload.event) res.write(`event: ${payload.event}\n`);
   39:   res.write(`data: ${payload.data}\n\n`);
   40: }
   41: 
   42: export async function handleSignalMapStream(
   43:   req: IncomingMessage,
   44:   res: ServerResponse,
   45: ): Promise<void> {
   46:   const redis = getRedisAdapter();
   47: 
   48:   // Parse Last-Event-ID (header or ?lastEventId query)
   49:   const headerId = req.headers['last-event-id'];
   50:   const url = new URL(req.url ?? '/', 'http://localhost');
   51:   const queryId = url.searchParams.get('lastEventId');
   52:   const rawLastId = (Array.isArray(headerId) ? headerId[0] : headerId) ?? queryId;
   53:   const lastId = rawLastId != null && rawLastId !== '' ? Number(rawLastId) : null;
   54:   const validLastId = lastId !== null && Number.isFinite(lastId) ? lastId : null;
   55: 
   56:   // Replay
   57:   const replay = await replayFrom(redis, validLastId);
   58:   if (replay.lost) {
   59:     res.statusCode = 204;
   60:     res.setHeader('X-Replay-Lost', 'true');
   61:     res.end();
   62:     return;
   63:   }
   64: 
   65:   // Open SSE
   66:   res.statusCode = 200;
   67:   res.setHeader('Content-Type', 'text/event-stream');
   68:   res.setHeader('Cache-Control', 'no-cache, no-transform');
   69:   res.setHeader('Connection', 'keep-alive');
   70:   res.setHeader('X-Accel-Buffering', 'no');
   71:   if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();
   72: 
   73:   // Send replayed events
   74:   for (const { id, payload } of replay.events) {
   75:     writeSSEEvent(res, id, payload);
   76:   }
   77: 
   78:   // Subscribe to live channel
   79:   const subscription = redis.subscribe(CHANNEL, async (raw) => {
   80:     try {
   81:       const payload: SSEEventPayload = JSON.parse(raw);
   82:       const id = await nextEventId(redis);
   83:       await addEventToRing(redis, id, payload);
   84:       writeSSEEvent(res, id, payload);
   85:     } catch (err) {
   86:       // Malformed message: log and continue, do not kill the connection
   87:       console.warn('[signalmap-stream] failed to handle pub/sub message', err);
   88:     }
   89:   });
   90: 
   91:   // Heartbeat
   92:   const heartbeat = setInterval(() => {
   93:     res.write(`: hb\n\n`);
   94:   }, getHeartbeatSeconds() * 1000);
   95:   if (typeof heartbeat.unref === 'function') heartbeat.unref();
   96: 
   97:   // Connection registry
   98:   let closed = false;
   99:   const cleanup = () => {
  100:     if (closed) return;
  101:     closed = true;
  102:     clearInterval(heartbeat);
  103:     try { subscription.dispose(); } catch { /* ignore */ }
  104:     connections.delete(connection);
  105:     try { res.end(); } catch { /* already ended */ }
  106:   };
  107:   const connection: Connection = { res, cleanup };
  108:   connections.add(connection);
  109:   req.on('close', cleanup);
  110:   req.on('error', cleanup);
  111: }
  112: 
  113: let shutdownInstalled = false;
  114: export function setupSignalMapStreamShutdown(): void {
  115:   if (shutdownInstalled) return;
  116:   shutdownInstalled = true;
  117:   const onShutdown = () => {
  118:     for (const conn of connections) {
  119:       try {
  120:         const retry = jitteredRetryMs();
  121:         conn.res.write(`event: shutdown\nretry: ${retry}\n\n`);
  122:       } catch { /* ignore */ }
  123:       conn.cleanup();
  124:     }
  125:   };
  126:   process.once('SIGTERM', onShutdown);
  127:   process.once('SIGINT', onShutdown);
  128: }
  129: 
  130: /** @internal Test-only accessor for connection count. */
  131: export function _connectionCount(): number {
  132:   return connections.size;
  133: }
  134: 
  135: /** @internal Test-only accessor for jittered retry value generator. */
  136: export function _jitteredRetryMs(): number {
  137:   return jitteredRetryMs();
  138: }

 succeeded in 1502ms:
    1: /**
    2:  * Smoke tests for the signalmap-stream SSE handler.
    3:  *
    4:  * Requires a Redis 7 server at REDIS_URL (default: redis://localhost:6380).
    5:  * Skips cleanly when Redis is unavailable.
    6:  *
    7:  * To run locally:
    8:  *   docker run -d --rm --name sigmap-test-redis -p 6380:6379 redis:7-alpine
    9:  *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/sse-stream.test.mjs
   10:  */
   11: 
   12: import { describe, it, before, after } from 'node:test';
   13: import assert from 'node:assert/strict';
   14: import { createServer } from 'node:http';
   15: import { request } from 'node:http';
   16: import { once } from 'node:events';
   17: 
   18: let handleSignalMapStream;
   19: let setupSignalMapStreamShutdown;
   20: let _connectionCount;
   21: let _jitteredRetryMs;
   22: let importError;
   23: 
   24: // Attempt to import the module â€” if REDIS_URL is not set the module-level
   25: // getRedisAdapter() singleton won't be called until handleSignalMapStream is
   26: // actually invoked, so the import itself should always succeed.
   27: try {
   28:   const mod = await import('../server/api/routes/signalmap-stream.ts');
   29:   handleSignalMapStream = mod.handleSignalMapStream;
   30:   setupSignalMapStreamShutdown = mod.setupSignalMapStreamShutdown;
   31:   _connectionCount = mod._connectionCount;
   32:   _jitteredRetryMs = mod._jitteredRetryMs;
   33: } catch (err) {
   34:   importError = err;
   35:   console.warn('[sse-stream.test] import failed:', err?.message);
   36: }
   37: 
   38: describe('signalmap-stream module â€” smoke tests', { skip: Boolean(importError) }, () => {
   39:   // 1. handleSignalMapStream is an async function
   40:   it('handleSignalMapStream is an async function', () => {
   41:     assert.equal(typeof handleSignalMapStream, 'function', 'handleSignalMapStream should be a function');
   42:     // Async functions return a Promise when called; check constructor name as a proxy
   43:     assert.ok(
   44:       handleSignalMapStream.constructor.name === 'AsyncFunction',
   45:       `Expected AsyncFunction, got ${handleSignalMapStream.constructor.name}`,
   46:     );
   47:   });
   48: 
   49:   // 2. setupSignalMapStreamShutdown is idempotent (calling twice doesn't add multiple listeners)
   50:   it('setupSignalMapStreamShutdown is idempotent â€” does not add multiple SIGTERM listeners', () => {
   51:     // Count listeners BEFORE any call (some may already be registered from import-time side effects)
   52:     const before = process.listenerCount('SIGTERM');
   53: 
   54:     // First call â€” installs one listener
   55:     setupSignalMapStreamShutdown();
   56:     const afterFirst = process.listenerCount('SIGTERM');
   57: 
   58:     // Second call â€” must be a no-op (shutdownInstalled flag)
   59:     setupSignalMapStreamShutdown();
   60:     const afterSecond = process.listenerCount('SIGTERM');
   61: 
   62:     // Second call must not have added another listener
   63:     assert.equal(
   64:       afterSecond,
   65:       afterFirst,
   66:       `Second call to setupSignalMapStreamShutdown added listeners (${afterFirst} â†’ ${afterSecond})`,
   67:     );
   68: 
   69:     // First call should have added exactly one listener (or zero if already installed
   70:     // from a prior test run in the same process â€” but it must not go up on second call)
   71:     assert.ok(
   72:       afterFirst - before <= 1,
   73:       `First call added more than 1 SIGTERM listener (before=${before}, after=${afterFirst})`,
   74:     );
   75:   });
   76: });
   77: 
   78: // â”€â”€â”€ Integration tests requiring live Redis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   79: 
   80: const REDIS_URL = process.env.REDIS_URL;
   81: let redisAdapter;
   82: let probeFailed = !REDIS_URL;
   83: 
   84: if (!REDIS_URL) {
   85:   console.warn('[sse-stream.test] REDIS_URL not set â€” skipping integration suite');
   86: }
   87: 
   88: const COUNTER_KEY = 'signalmap:sse:counter';
   89: const RING_KEY = 'signalmap:sse:ring';
   90: const EVENT_KEY_PREFIX = 'signalmap:sse:event:';
   91: 
   92: async function cleanupRing(ids) {
   93:   await redisAdapter.del(COUNTER_KEY);
   94:   await redisAdapter.del(RING_KEY);
   95:   for (const id of ids) {
   96:     await redisAdapter.del(`${EVENT_KEY_PREFIX}${id}`);
   97:   }
   98: }
   99: 
  100: /**
  101:  * Restores an env var to its previous value.
  102:  * When prev was undefined (var was not set), deletes the key rather than
  103:  * assigning the string "undefined" which would corrupt Number() parsing.
  104:  */
  105: function restoreEnv(key, prev) {
  106:   if (prev === undefined) {
  107:     delete process.env[key];
  108:   } else {
  109:     process.env[key] = prev;
  110:   }
  111: }
  112: 
  113: async function startTestServer() {
  114:   const server = createServer((req, res) => {
  115:     handleSignalMapStream(req, res).catch((err) => {
  116:       console.error('[test-server] handler error:', err);
  117:       try { res.statusCode = 500; res.end(); } catch { /* already ended */ }
  118:     });
  119:   });
  120:   await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  121:   const port = server.address().port;
  122:   return { server, port };
  123: }
  124: 
  125: // Import ring helpers for the integration tests
  126: let nextEventId;
  127: let addEventToRing;
  128: try {
  129:   const ringMod = await import('../src/server/lib/sse-replay-ring.ts');
  130:   nextEventId = ringMod.nextEventId;
  131:   addEventToRing = ringMod.addEventToRing;
  132: } catch (err) {
  133:   probeFailed = true;
  134:   console.warn('[sse-stream.test] ring import failed:', err?.message);
  135: }
  136: 
  137: describe('signalmap-stream integration â€” live Redis', { skip: Boolean(importError) || probeFailed }, () => {
  138:   before(async () => {
  139:     const { createRedisAdapter } = await import('../src/server/lib/redis.ts');
  140:     try {
  141:       redisAdapter = createRedisAdapter({ url: REDIS_URL });
  142:       await redisAdapter.incr('signalmap:test:probe');
  143:       await redisAdapter.del('signalmap:test:probe');
  144:     } catch (err) {
  145:       probeFailed = true;
  146:       console.warn('[sse-stream.test] Redis unreachable, skipping:', err?.message);
  147:     }
  148:   });
  149: 
  150:   after(async () => {
  151:     // Quit the test's private adapter
  152:     if (redisAdapter) await redisAdapter.quit();
  153:     // Also quit the singleton used internally by handleSignalMapStream â€”
  154:     // ioredis subscriber connections keep the event loop alive without this.
  155:     try {
  156:       const { getRedisAdapter } = await import('../src/server/lib/redis.ts');
  157:       await getRedisAdapter().quit();
  158:     } catch { /* ignore if singleton was never initialized */ }
  159:   });
  160: 
  161:   // 3. Jittered shutdown retry value stays in [MIN, MAX] and varies across calls
  162:   it('jittered shutdown retry value stays in [MIN, MAX] and varies across calls', { skip: probeFailed }, () => {
  163:     const prevMin = process.env.SSE_RECONNECT_RETRY_MIN_MS;
  164:     const prevMax = process.env.SSE_RECONNECT_RETRY_MAX_MS;
  165:     process.env.SSE_RECONNECT_RETRY_MIN_MS = '100';
  166:     process.env.SSE_RECONNECT_RETRY_MAX_MS = '200';
  167:     try {
  168:       const samples = new Set();
  169:       for (let i = 0; i < 50; i++) {
  170:         const v = _jitteredRetryMs();
  171:         assert.ok(v >= 100 && v <= 200, `value ${v} out of range`);
  172:         samples.add(v);
  173:       }
  174:       assert.ok(samples.size >= 5, `expected jittered variation, got ${samples.size} unique`);
  175:     } finally {
  176:       restoreEnv('SSE_RECONNECT_RETRY_MIN_MS', prevMin);
  177:       restoreEnv('SSE_RECONNECT_RETRY_MAX_MS', prevMax);
  178:     }
  179:   });
  180: 
  181:   // 4. handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor
  182:   it('handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor', { skip: probeFailed }, async () => {
  183:     await cleanupRing([]);
  184:     const prevSize = process.env.SSE_REPLAY_RING_SIZE;
  185:     process.env.SSE_REPLAY_RING_SIZE = '3';
  186:     const ids = [];
  187:     try {
  188:       for (let i = 0; i < 5; i++) {
  189:         const id = await nextEventId(redisAdapter);
  190:         ids.push(id);
  191:         await addEventToRing(redisAdapter, id, { event: 'message', data: `p${i}` });
  192:       }
  193:       // ids[0] and ids[1] are now evicted; ring holds only the last 3
  194:       const { server, port } = await startTestServer();
  195:       try {
  196:         // Request with Last-Event-ID = ids[0] (below the floor)
  197:         const req = request({
  198:           host: '127.0.0.1',
  199:           port,
  200:           path: '/api/signalmap/stream',
  201:           headers: { 'Last-Event-ID': String(ids[0]) },
  202:         });
  203:         req.end();
  204:         const [res] = await once(req, 'response');
  205:         assert.equal(res.statusCode, 204);
  206:         assert.equal(res.headers['x-replay-lost'], 'true');
  207:         res.resume();
  208:         await once(res, 'end');
  209:       } finally {
  210:         await new Promise((r) => server.close(r));
  211:       }
  212:     } finally {
  213:       restoreEnv('SSE_REPLAY_RING_SIZE', prevSize);
  214:       await cleanupRing(ids);
  215:     }
  216:   });
  217: 
  218:   // 5. handleSignalMapStream replays prior events as SSE frames and decrements registry on close
  219:   it('handleSignalMapStream replays prior events as SSE frames and decrements registry on close', { skip: probeFailed }, async () => {
  220:     await cleanupRing([]);
  221:     const ids = [];
  222:     try {
  223:       for (let i = 0; i < 3; i++) {
  224:         const id = await nextEventId(redisAdapter);
  225:         ids.push(id);
  226:         await addEventToRing(redisAdapter, id, { event: 'message', data: `p${i}` });
  227:       }
  228:       const { server, port } = await startTestServer();
  229:       try {
  230:         // Request from id=0 (before all inserted ids) to get full replay
  231:         const req = request({
  232:           host: '127.0.0.1',
  233:           port,
  234:           path: '/api/signalmap/stream',
  235:           headers: { 'Last-Event-ID': '0' },
  236:         });
  237:         req.end();
  238:         const [res] = await once(req, 'response');
  239:         assert.equal(res.statusCode, 200);
  240:         assert.equal(res.headers['content-type'], 'text/event-stream');
  241: 
  242:         // Read enough to receive all 3 replay frames
  243:         let buf = '';
  244:         res.on('data', (chunk) => { buf += chunk.toString('utf8'); });
  245:         // Wait briefly for replay frames to flush
  246:         await new Promise(r => setTimeout(r, 300));
  247: 
  248:         // Each frame: id: <n>\nevent: message\ndata: <data>\n\n
  249:         for (const id of ids) {
  250:           assert.ok(buf.includes(`id: ${id}\n`), `frame for ${id} missing in: ${buf}`);
  251:         }
  252:         assert.ok(buf.includes('data: p0\n\n'), 'p0 frame missing');
  253:         assert.ok(buf.includes('data: p1\n\n'), 'p1 frame missing');
  254:         assert.ok(buf.includes('data: p2\n\n'), 'p2 frame missing');
  255: 
  256:         // Connection registry should have 1 active connection
  257:         assert.equal(_connectionCount(), 1);
  258: 
  259:         // Close client; cleanup must remove from registry
  260:         req.destroy();
  261:         await new Promise(r => setTimeout(r, 150));
  262:         assert.equal(_connectionCount(), 0);
  263:       } finally {
  264:         await new Promise((r) => server.close(r));
  265:       }
  266:     } finally {
  267:       await cleanupRing(ids);
  268:     }
  269:   });
  270: 
  271:   // 6. handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence
  272:   it('handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence', { skip: probeFailed }, async () => {
  273:     await cleanupRing([]);
  274:     const prev = process.env.SSE_HEARTBEAT_SECONDS;
  275:     process.env.SSE_HEARTBEAT_SECONDS = '0.05';  // 50ms cadence
  276:     try {
  277:       const { server, port } = await startTestServer();
  278:       try {
  279:         const req = request({
  280:           host: '127.0.0.1',
  281:           port,
  282:           path: '/api/signalmap/stream',
  283:         });
  284:         req.end();
  285:         const [res] = await once(req, 'response');
  286:         assert.equal(res.statusCode, 200);
  287:         let buf = '';
  288:         res.on('data', (chunk) => { buf += chunk.toString('utf8'); });
  289:         // Wait ~180ms â€” should see at least 2 heartbeats at 50ms cadence
  290:         await new Promise(r => setTimeout(r, 200));
  291:         const hbCount = (buf.match(/^: hb$/gm) ?? []).length;
  292:         assert.ok(hbCount >= 2, `expected >=2 heartbeats, got ${hbCount} in: ${JSON.stringify(buf)}`);
  293:         req.destroy();
  294:         await new Promise(r => setTimeout(r, 100));
  295:       } finally {
  296:         await new Promise((r) => server.close(r));
  297:       }
  298:     } finally {
  299:       restoreEnv('SSE_HEARTBEAT_SECONDS', prev);
  300:     }
  301:   });
  302: });

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'tests/openapi-spec-generation.test.mjs'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'tests/api-base-url-contract.test.mjs'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'package.json'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ if($lines[$i-1] -match '"'build:openapi|build:types|typecheck:all|zod|openapi'){ '{0,5}: {1}' -f "'$i,$lines[$i-1] } }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'public/openapi.yaml'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ if($i -le 240){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] } }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1500ms:
    1: /**
    2:  * Tests that generateSpec() produces a well-formed OpenAPI 3.1 document
    3:  * covering all 6 SignalMap endpoints.
    4:  *
    5:  * Run with:  npx tsx --test tests/openapi-spec-generation.test.mjs
    6:  */
    7: 
    8: import { describe, it } from 'node:test';
    9: import assert from 'node:assert/strict';
   10: import { generateSpec } from '../server/api/openapi.ts';
   11: 
   12: describe('OpenAPI spec generation', () => {
   13:   const spec = generateSpec();
   14: 
   15:   it('emits OpenAPI 3.1 with required top-level fields', () => {
   16:     assert.equal(spec.openapi, '3.1.0');
   17:     assert.ok(spec.info?.title);
   18:     assert.ok(spec.info?.version);
   19:     assert.ok(spec.paths);
   20:     assert.ok(spec.components?.schemas);
   21:   });
   22: 
   23:   it('declares all 6 SignalMap endpoints', () => {
   24:     const paths = Object.keys(spec.paths);
   25:     assert.ok(paths.includes('/api/signalmap/list'));
   26:     assert.ok(paths.includes('/api/signalmap/event/{id}'));
   27:     assert.ok(paths.includes('/api/signalmap/source-health'));
   28:     assert.ok(paths.includes('/api/signalmap/stream'));
   29:     assert.ok(paths.includes('/api/signalmap/brief/global'));
   30:     assert.ok(paths.includes('/api/signalmap/brief/event/{id}'));
   31:   });
   32: 
   33:   it('list endpoint declares filter query params', () => {
   34:     const op = spec.paths['/api/signalmap/list'].get;
   35:     assert.ok(op.operationId);
   36:     const paramNames = (op.parameters ?? []).map(p => p.name);
   37:     for (const name of ['start_ms', 'end_ms', 'categories', 'watch_regions', 'watch_providers', 'watchlist_only']) {
   38:       assert.ok(paramNames.includes(name), `missing query param: ${name}`);
   39:     }
   40:   });
   41: 
   42:   it('event endpoint declares id path param', () => {
   43:     const op = spec.paths['/api/signalmap/event/{id}'].get;
   44:     const idParam = (op.parameters ?? []).find(p => p.name === 'id' && p.in === 'path');
   45:     assert.ok(idParam, 'missing path param: id');
   46:     assert.equal(idParam.required, true);
   47:   });
   48: 
   49:   it('stream endpoint advertises text/event-stream', () => {
   50:     const op = spec.paths['/api/signalmap/stream'].get;
   51:     const ok = op.responses['200'];
   52:     assert.ok(ok.content?.['text/event-stream'], 'stream 200 must declare text/event-stream content');
   53:   });
   54: 
   55:   it('every operation declares a 5XX error response', () => {
   56:     for (const [path, methods] of Object.entries(spec.paths)) {
   57:       for (const [method, op] of Object.entries(methods)) {
   58:         if (typeof op !== 'object' || !op.responses) continue;
   59:         const has5xx = ['5XX', '500', 'default'].some(k => k in op.responses);
   60:         assert.ok(has5xx, `${method.toUpperCase()} ${path} missing 5XX/default error response`);
   61:       }
   62:     }
   63:   });
   64: 
   65:   it('SignalMapEvent schema is registered as a component ref', () => {
   66:     const schemas = spec.components.schemas;
   67:     // zod-openapi v4 names from .openapi({ ref: 'SignalMapEvent' })
   68:     assert.ok(schemas.SignalMapEvent, 'SignalMapEvent schema not in components');
   69:     assert.ok(schemas.SignalMapSourceHealth, 'SignalMapSourceHealth schema not in components');
   70:   });
   71: });

 succeeded in 1593ms:
    1: import { describe, it } from 'node:test';
    2: import assert from 'node:assert/strict';
    3: import { normalizeApiBaseUrl, getApiBaseUrl, resolveApiBaseUrl } from '../src/client/base-url.ts';
    4: import { generateSpec } from '../server/api/openapi.ts';
    5: 
    6: describe('API base URL contract', () => {
    7:   const spec = generateSpec();
    8:   const pathKeys = Object.keys(spec.paths);
    9: 
   10:   it('every OpenAPI path key starts with /api/signalmap/ and contains no /api/ws/api substring', () => {
   11:     assert.ok(pathKeys.length >= 6, `expected at least 6 paths, got ${pathKeys.length}`);
   12:     for (const p of pathKeys) {
   13:       assert.ok(p.startsWith('/api/signalmap/'), `path ${p} should start with /api/signalmap/`);
   14:       assert.ok(!p.includes('/api/ws/api'), `path ${p} contains forbidden /api/ws/api substring`);
   15:     }
   16:   });
   17: 
   18:   it('default getApiBaseUrl() returns "" so default-composed URLs are clean', () => {
   19:     // With no env set, getApiBaseUrl() should return "" (browser-relative)
   20:     assert.equal(getApiBaseUrl(), '');
   21:     // Composing the default base with each spec path produces the path itself â€” no doubling.
   22:     for (const p of pathKeys) {
   23:       const composed = getApiBaseUrl() + p;
   24:       assert.ok(!composed.includes('/api/ws/api'), `default composition ${composed} contains /api/ws/api`);
   25:     }
   26:   });
   27: 
   28:   it('normalizeApiBaseUrl behavior â€” collapses internal //, strips trailing /, preserves scheme', () => {
   29:     // Empty / whitespace
   30:     assert.equal(normalizeApiBaseUrl(''), '');
   31:     assert.equal(normalizeApiBaseUrl('   '), '');
   32:     // Trailing slash strip
   33:     assert.equal(normalizeApiBaseUrl('https://example.com/'), 'https://example.com');
   34:     assert.equal(normalizeApiBaseUrl('/api/ws/'), '/api/ws');
   35:     // Internal // collapse
   36:     assert.equal(normalizeApiBaseUrl('https://example.com//api'), 'https://example.com/api');
   37:     assert.equal(normalizeApiBaseUrl('https://example.com//foo//bar/'), 'https://example.com/foo/bar');
   38:     // No-op for clean input
   39:     assert.equal(normalizeApiBaseUrl('https://example.com'), 'https://example.com');
   40:     assert.equal(normalizeApiBaseUrl('https://example.com/api'), 'https://example.com/api');
   41:     // Protocol scheme preserved verbatim
   42:     assert.equal(normalizeApiBaseUrl('ws://example.com/'), 'ws://example.com');
   43:     assert.equal(normalizeApiBaseUrl('wss://example.com//path'), 'wss://example.com/path');
   44:     // Bare slash should remain a slash (length 1, don't strip)
   45:     assert.equal(normalizeApiBaseUrl('/'), '/');
   46:   });
   47: 
   48:   it('misconfigured /api/ws base is rejected â€” composed URL never contains /api/ws/api', () => {
   49:     // Path-only input is a misconfiguration. resolveApiBaseUrl returns ''
   50:     // (browser-relative), so composing with each spec path produces the path itself.
   51:     // The /api/ws/api doubled prefix can never appear.
   52:     const base = resolveApiBaseUrl('/api/ws');
   53:     assert.equal(base, '', 'path-only base must be rejected and fall back to ""');
   54:     for (const p of pathKeys) {
   55:       const composed = base + p;
   56:       assert.ok(!composed.includes('/api/ws/api'), `composition ${composed} must not contain /api/ws/api`);
   57:     }
   58:   });
   59: 
   60:   it('absolute URLs are accepted by resolveApiBaseUrl and normalized', () => {
   61:     assert.equal(resolveApiBaseUrl('https://api.example.com'), 'https://api.example.com');
   62:     assert.equal(resolveApiBaseUrl('https://api.example.com/'), 'https://api.example.com');
   63:     assert.equal(resolveApiBaseUrl('https://api.example.com//base/'), 'https://api.example.com/base');
   64:     assert.equal(resolveApiBaseUrl(''), '');
   65:     assert.equal(resolveApiBaseUrl(null), '');
   66:     assert.equal(resolveApiBaseUrl(undefined), '');
   67:   });
   68: });

 succeeded in 1521ms:
    1: openapi: "3.1.0"
    2: info:
    3:   title: "SignalMap API"
    4:   version: "2.0.0"
    5:   description: "Public SignalMap HTTP API for events, source health, SSE stream,
    6:     and briefs."
    7: servers:
    8:   - url: "/"
    9: paths:
   10:   /api/signalmap/list:
   11:     get:
   12:       operationId: "listSignalMapEvents"
   13:       summary: "List SignalMap events with filters"
   14:       parameters:
   15:         - in: "query"
   16:           name: "start_ms"
   17:           schema:
   18:             type: "number"
   19:         - in: "query"
   20:           name: "end_ms"
   21:           schema:
   22:             type: "number"
   23:         - in: "query"
   24:           name: "categories"
   25:           schema:
   26:             type: "array"
   27:             items:
   28:               type: "string"
   29:         - in: "query"
   30:           name: "watch_regions"
   31:           schema:
   32:             type: "array"
   33:             items:
   34:               type: "string"
   35:         - in: "query"
   36:           name: "watch_providers"
   37:           schema:
   38:             type: "array"
   39:             items:
   40:               type: "string"
   41:         - in: "query"
   42:           name: "watchlist_only"
   43:           schema:
   44:             type: "boolean"
   45:       responses:
   46:         "200":
   47:           description: "Filtered SignalMap events with source health"
   48:           content:
   49:             application/json:
   50:               schema:
   51:                 type: "object"
   52:                 properties:
   53:                   events:
   54:                     type: "array"
   55:                     items:
   56:                       $ref: "#/components/schemas/SignalMapEvent"
   57:                   sourceHealth:
   58:                     type: "array"
   59:                     items:
   60:                       $ref: "#/components/schemas/SignalMapSourceHealth"
   61:                   fetchedAt:
   62:                     type: "number"
   63:                   upstreamUnavailable:
   64:                     type: "boolean"
   65:                 required:
   66:                   - "events"
   67:                   - "sourceHealth"
   68:                   - "fetchedAt"
   69:                   - "upstreamUnavailable"
   70:         5XX:
   71:           description: "Server error"
   72:           content:
   73:             application/json:
   74:               schema:
   75:                 $ref: "#/components/schemas/ErrorEnvelope"
   76:   /api/signalmap/event/{id}:
   77:     get:
   78:       operationId: "getSignalMapEvent"
   79:       summary: "Get a single SignalMap event by ID"
   80:       parameters:
   81:         - in: "path"
   82:           name: "id"
   83:           schema:
   84:             type: "string"
   85:           required: true
   86:       responses:
   87:         "200":
   88:           description: "SignalMap event"
   89:           content:
   90:             application/json:
   91:               schema:
   92:                 $ref: "#/components/schemas/SignalMapEvent"
   93:         5XX:
   94:           description: "Server error"
   95:           content:
   96:             application/json:
   97:               schema:
   98:                 $ref: "#/components/schemas/ErrorEnvelope"
   99:   /api/signalmap/source-health:
  100:     get:
  101:       operationId: "getSignalMapSourceHealth"
  102:       summary: "Get source health for all SignalMap data providers"
  103:       responses:
  104:         "200":
  105:           description: "Source health summary"
  106:           content:
  107:             application/json:
  108:               schema:
  109:                 type: "object"
  110:                 properties:
  111:                   sourceHealth:
  112:                     type: "array"
  113:                     items:
  114:                       $ref: "#/components/schemas/SignalMapSourceHealth"
  115:                   fetchedAt:
  116:                     type: "number"
  117:                 required:
  118:                   - "sourceHealth"
  119:                   - "fetchedAt"
  120:         5XX:
  121:           description: "Server error"
  122:           content:
  123:             application/json:
  124:               schema:
  125:                 $ref: "#/components/schemas/ErrorEnvelope"
  126:   /api/signalmap/stream:
  127:     get:
  128:       operationId: "streamSignalMapEvents"
  129:       summary: "SSE stream of live SignalMap events"
  130:       parameters:
  131:         - in: "header"
  132:           name: "Last-Event-ID"
  133:           required: false
  134:           schema:
  135:             type: "string"
  136:           description: "Resume SSE stream from a previously received event ID"
  137:       responses:
  138:         "200":
  139:           description: "SSE event stream (text/event-stream)"
  140:           content:
  141:             text/event-stream:
  142:               schema:
  143:                 type: "string"
  144:         "204":
  145:           description: "Replay ID was evicted â€” client must re-fetch from scratch"
  146:           headers:
  147:             X-Replay-Lost:
  148:               schema:
  149:                 type: "boolean"
  150:                 description: "Set to true when replay ID was evicted"
  151:               required: true
  152:         5XX:
  153:           description: "Server error"
  154:           content:
  155:             application/json:
  156:               schema:
  157:                 $ref: "#/components/schemas/ErrorEnvelope"
  158:   /api/signalmap/brief/global:
  159:     post:
  160:       operationId: "getSignalMapGlobalBrief"
  161:       summary: "Get AI-generated global SignalMap brief (cached)"
  162:       requestBody:
  163:         content:
  164:           application/json:
  165:             schema:
  166:               type: "object"
  167:       responses:
  168:         "200":
  169:           description: "Global brief with bullet points and sources"
  170:           headers:
  171:             X-Cache:
  172:               schema:
  173:                 type: "string"
  174:                 description: "Cache status: HIT or MISS"
  175:               required: true
  176:           content:
  177:             application/json:
  178:               schema:
  179:                 type: "object"
  180:                 properties:
  181:                   bullets:
  182:                     type: "array"
  183:                     items:
  184:                       type: "string"
  185:                   generatedAt:
  186:                     type: "string"
  187:                   model:
  188:                     type: "string"
  189:                   sources:
  190:                     type: "array"
  191:                     items:
  192:                       type: "object"
  193:                       properties:
  194:                         label:
  195:                           type: "string"
  196:                         url:
  197:                           type: "string"
  198:                       required:
  199:                         - "label"
  200:                         - "url"
  201:                   lastGeneratedAt:
  202:                     type: "string"
  203:                 required:
  204:                   - "bullets"
  205:                   - "generatedAt"
  206:                   - "model"
  207:                   - "sources"
  208:         5XX:
  209:           description: "Server error"
  210:           content:
  211:             application/json:
  212:               schema:
  213:                 $ref: "#/components/schemas/ErrorEnvelope"
  214:   /api/signalmap/brief/event/{id}:
  215:     post:
  216:       operationId: "getSignalMapEventBrief"
  217:       summary: "Get AI-generated why-it-matters brief for a specific event (cached)"
  218:       parameters:
  219:         - in: "path"
  220:           name: "id"
  221:           schema:
  222:             type: "string"
  223:           required: true
  224:       requestBody:
  225:         content:
  226:           application/json:
  227:             schema:
  228:               type: "object"
  229:       responses:
  230:         "200":
  231:           description: "Event brief with why-it-matters explanation"
  232:           headers:
  233:             X-Cache:
  234:               schema:
  235:                 type: "string"
  236:                 description: "Cache status: HIT or MISS"
  237:               required: true
  238:           content:
  239:             application/json:
  240:               schema:

 succeeded in 1585ms:
   27:     "build:openapi": "tsx scripts/build-openapi.mjs",
   28:     "build:types": "openapi-typescript public/openapi.yaml -o src/client/types.ts",
   30:     "prebuild": "npm run build:openapi && npm run build:agent-skills",
   34:     "build:full": "npm run build:openapi && npm run build:agent-skills && npm run build:blog && cross-env-shell VITE_VARIANT=full \"tsc && vite build\"",
   35:     "build:tech": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=tech \"tsc && vite build\"",
   36:     "build:finance": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=finance \"tsc && vite build\"",
   37:     "build:happy": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=happy \"tsc && vite build\"",
   38:     "build:commodity": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=commodity \"tsc && vite build\"",
   41:     "typecheck:all": "tsc --noEmit && tsc --noEmit -p tsconfig.api.json",
   97:     "openapi-typescript": "^7.0.0",
  139:     "openapi-fetch": "^0.14.0",
  151:     "zod": "^3.25.76",
  152:     "zod-openapi": "^4.2.4"

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'public/openapi.yaml'; "'$lines=Get-Content $path; for($i=241;$i -le [Math]::Min($lines.Length,420);$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1365ms:
  241:                 type: "object"
  242:                 properties:
  243:                   whyItMatters:
  244:                     type: "string"
  245:                   model:
  246:                     type: "string"
  247:                   generatedAt:
  248:                     type: "string"
  249:                 required:
  250:                   - "whyItMatters"
  251:                   - "model"
  252:                   - "generatedAt"
  253:         5XX:
  254:           description: "Server error"
  255:           content:
  256:             application/json:
  257:               schema:
  258:                 $ref: "#/components/schemas/ErrorEnvelope"
  259: components:
  260:   schemas:
  261:     SignalMapEvent:
  262:       type: "object"
  263:       properties:
  264:         id:
  265:           type: "string"
  266:         category:
  267:           $ref: "#/components/schemas/SignalMapCategory"
  268:         severity:
  269:           $ref: "#/components/schemas/SignalMapSeverity"
  270:         title:
  271:           type: "string"
  272:         summary:
  273:           type: "string"
  274:         tags:
  275:           type: "array"
  276:           items:
  277:             type: "string"
  278:         startedAt:
  279:           type: "string"
  280:         endedAt:
  281:           type: "string"
  282:         lastObservedAt:
  283:           type: "string"
  284:         locations:
  285:           type: "array"
  286:           items:
  287:             $ref: "#/components/schemas/SignalMapLocation"
  288:         sources:
  289:           type: "array"
  290:           items:
  291:             $ref: "#/components/schemas/SignalMapSource"
  292:         confidence:
  293:           type: "number"
  294:         provider:
  295:           type: "string"
  296:         kind:
  297:           $ref: "#/components/schemas/SignalMapKind"
  298:         watchlistMatch:
  299:           type: "boolean"
  300:         markerEligible:
  301:           type: "boolean"
  302:       required:
  303:         - "id"
  304:         - "category"
  305:         - "severity"
  306:         - "title"
  307:         - "summary"
  308:         - "tags"
  309:         - "lastObservedAt"
  310:         - "locations"
  311:         - "sources"
  312:         - "confidence"
  313:         - "kind"
  314:         - "watchlistMatch"
  315:         - "markerEligible"
  316:     SignalMapCategory:
  317:       type: "string"
  318:       enum:
  319:         - "internet"
  320:         - "provider"
  321:         - "technology"
  322:         - "finance"
  323:         - "geopolitics"
  324:         - "conflict"
  325:         - "cyber"
  326:         - "climate"
  327:         - "health"
  328:         - "energy"
  329:         - "supply_chain"
  330:         - "infrastructure"
  331:     SignalMapSeverity:
  332:       type: "string"
  333:       enum:
  334:         - "critical"
  335:         - "high"
  336:         - "medium"
  337:         - "low"
  338:         - "info"
  339:     SignalMapLocation:
  340:       type: "object"
  341:       properties:
  342:         name:
  343:           type: "string"
  344:         countryIso2:
  345:           type: "string"
  346:         lat:
  347:           type: "number"
  348:         lon:
  349:           type: "number"
  350:         scope:
  351:           $ref: "#/components/schemas/SignalMapLocationScope"
  352:         confidence:
  353:           type: "number"
  354:         evidence:
  355:           type: "string"
  356:       required:
  357:         - "name"
  358:         - "scope"
  359:         - "confidence"
  360:     SignalMapLocationScope:
  361:       type: "string"
  362:       enum:
  363:         - "city"
  364:         - "region"
  365:         - "country"
  366:         - "network"
  367:         - "provider"
  368:         - "unknown"
  369:     SignalMapSource:
  370:       type: "object"
  371:       properties:
  372:         id:
  373:           type: "string"
  374:         label:
  375:           type: "string"
  376:         url:
  377:           type: "string"
  378:         tier:
  379:           type: "integer"
  380:         verified:
  381:           type: "boolean"
  382:         fetchedAt:
  383:           type: "string"
  384:       required:
  385:         - "id"
  386:         - "label"
  387:     SignalMapKind:
  388:       type: "string"
  389:       enum:
  390:         - "radar_outage"
  391:         - "radar_anomaly"
  392:         - "provider_status"
  393:         - "story"
  394:     SignalMapSourceHealth:
  395:       type: "object"
  396:       properties:
  397:         id:
  398:           type: "string"
  399:         label:
  400:           type: "string"
  401:         status:
  402:           type: "string"
  403:           enum:
  404:             - "ok"
  405:             - "degraded"
  406:             - "unavailable"
  407:         fetchedAt:
  408:           type: "number"
  409:         eventCount:
  410:           type: "integer"
  411:         detail:
  412:           type: "string"
  413:       required:
  414:         - "id"
  415:         - "label"
  416:         - "status"
  417:         - "fetchedAt"
  418:         - "eventCount"
  419:         - "detail"
  420:     ErrorEnvelope:

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'public/openapi.yaml'; "'$lines=Get-Content $path; for($i=421;$i -le [Math]::Min($lines.Length,520);$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1109ms:
  421:       type: "object"
  422:       properties:
  423:         error:
  424:           type: "object"
  425:           properties:
  426:             code:
  427:               type: "string"
  428:             message:
  429:               type: "string"
  430:           required:
  431:             - "code"
  432:             - "message"
  433:       required:
  434:         - "error"

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'src/client/types.ts'; "'$lines=Get-Content $path; for($i=1;$i -le [Math]::Min($lines.Length,260);$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'src/client/types.ts'; "'$lines=Get-Content $path; for($i=261;$i -le [Math]::Min($lines.Length,520);$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1622ms:
    1: /**
    2:  * This file was auto-generated by openapi-typescript.
    3:  * Do not make direct changes to the file.
    4:  */
    5: 
    6: export interface paths {
    7:     "/api/signalmap/list": {
    8:         parameters: {
    9:             query?: never;
   10:             header?: never;
   11:             path?: never;
   12:             cookie?: never;
   13:         };
   14:         /** List SignalMap events with filters */
   15:         get: operations["listSignalMapEvents"];
   16:         put?: never;
   17:         post?: never;
   18:         delete?: never;
   19:         options?: never;
   20:         head?: never;
   21:         patch?: never;
   22:         trace?: never;
   23:     };
   24:     "/api/signalmap/event/{id}": {
   25:         parameters: {
   26:             query?: never;
   27:             header?: never;
   28:             path?: never;
   29:             cookie?: never;
   30:         };
   31:         /** Get a single SignalMap event by ID */
   32:         get: operations["getSignalMapEvent"];
   33:         put?: never;
   34:         post?: never;
   35:         delete?: never;
   36:         options?: never;
   37:         head?: never;
   38:         patch?: never;
   39:         trace?: never;
   40:     };
   41:     "/api/signalmap/source-health": {
   42:         parameters: {
   43:             query?: never;
   44:             header?: never;
   45:             path?: never;
   46:             cookie?: never;
   47:         };
   48:         /** Get source health for all SignalMap data providers */
   49:         get: operations["getSignalMapSourceHealth"];
   50:         put?: never;
   51:         post?: never;
   52:         delete?: never;
   53:         options?: never;
   54:         head?: never;
   55:         patch?: never;
   56:         trace?: never;
   57:     };
   58:     "/api/signalmap/stream": {
   59:         parameters: {
   60:             query?: never;
   61:             header?: never;
   62:             path?: never;
   63:             cookie?: never;
   64:         };
   65:         /** SSE stream of live SignalMap events */
   66:         get: operations["streamSignalMapEvents"];
   67:         put?: never;
   68:         post?: never;
   69:         delete?: never;
   70:         options?: never;
   71:         head?: never;
   72:         patch?: never;
   73:         trace?: never;
   74:     };
   75:     "/api/signalmap/brief/global": {
   76:         parameters: {
   77:             query?: never;
   78:             header?: never;
   79:             path?: never;
   80:             cookie?: never;
   81:         };
   82:         get?: never;
   83:         put?: never;
   84:         /** Get AI-generated global SignalMap brief (cached) */
   85:         post: operations["getSignalMapGlobalBrief"];
   86:         delete?: never;
   87:         options?: never;
   88:         head?: never;
   89:         patch?: never;
   90:         trace?: never;
   91:     };
   92:     "/api/signalmap/brief/event/{id}": {
   93:         parameters: {
   94:             query?: never;
   95:             header?: never;
   96:             path?: never;
   97:             cookie?: never;
   98:         };
   99:         get?: never;
  100:         put?: never;
  101:         /** Get AI-generated why-it-matters brief for a specific event (cached) */
  102:         post: operations["getSignalMapEventBrief"];
  103:         delete?: never;
  104:         options?: never;
  105:         head?: never;
  106:         patch?: never;
  107:         trace?: never;
  108:     };
  109: }
  110: export type webhooks = Record<string, never>;
  111: export interface components {
  112:     schemas: {
  113:         SignalMapEvent: {
  114:             id: string;
  115:             category: components["schemas"]["SignalMapCategory"];
  116:             severity: components["schemas"]["SignalMapSeverity"];
  117:             title: string;
  118:             summary: string;
  119:             tags: string[];
  120:             startedAt?: string;
  121:             endedAt?: string;
  122:             lastObservedAt: string;
  123:             locations: components["schemas"]["SignalMapLocation"][];
  124:             sources: components["schemas"]["SignalMapSource"][];
  125:             confidence: number;
  126:             provider?: string;
  127:             kind: components["schemas"]["SignalMapKind"];
  128:             watchlistMatch: boolean;
  129:             markerEligible: boolean;
  130:         };
  131:         /** @enum {string} */
  132:         SignalMapCategory: "internet" | "provider" | "technology" | "finance" | "geopolitics" | "conflict" | "cyber" | "climate" | "health" | "energy" | "supply_chain" | "infrastructure";
  133:         /** @enum {string} */
  134:         SignalMapSeverity: "critical" | "high" | "medium" | "low" | "info";
  135:         SignalMapLocation: {
  136:             name: string;
  137:             countryIso2?: string;
  138:             lat?: number;
  139:             lon?: number;
  140:             scope: components["schemas"]["SignalMapLocationScope"];
  141:             confidence: number;
  142:             evidence?: string;
  143:         };
  144:         /** @enum {string} */
  145:         SignalMapLocationScope: "city" | "region" | "country" | "network" | "provider" | "unknown";
  146:         SignalMapSource: {
  147:             id: string;
  148:             label: string;
  149:             url?: string;
  150:             tier?: number;
  151:             verified?: boolean;
  152:             fetchedAt?: string;
  153:         };
  154:         /** @enum {string} */
  155:         SignalMapKind: "radar_outage" | "radar_anomaly" | "provider_status" | "story";
  156:         SignalMapSourceHealth: {
  157:             id: string;
  158:             label: string;
  159:             /** @enum {string} */
  160:             status: "ok" | "degraded" | "unavailable";
  161:             fetchedAt: number;
  162:             eventCount: number;
  163:             detail: string;
  164:         };
  165:         ErrorEnvelope: {
  166:             error: {
  167:                 code: string;
  168:                 message: string;
  169:             };
  170:         };
  171:     };
  172:     responses: never;
  173:     parameters: never;
  174:     requestBodies: never;
  175:     headers: never;
  176:     pathItems: never;
  177: }
  178: export type $defs = Record<string, never>;
  179: export interface operations {
  180:     listSignalMapEvents: {
  181:         parameters: {
  182:             query?: {
  183:                 start_ms?: number;
  184:                 end_ms?: number;
  185:                 categories?: string[];
  186:                 watch_regions?: string[];
  187:                 watch_providers?: string[];
  188:                 watchlist_only?: boolean;
  189:             };
  190:             header?: never;
  191:             path?: never;
  192:             cookie?: never;
  193:         };
  194:         requestBody?: never;
  195:         responses: {
  196:             /** @description Filtered SignalMap events with source health */
  197:             200: {
  198:                 headers: {
  199:                     [name: string]: unknown;
  200:                 };
  201:                 content: {
  202:                     "application/json": {
  203:                         events: components["schemas"]["SignalMapEvent"][];
  204:                         sourceHealth: components["schemas"]["SignalMapSourceHealth"][];
  205:                         fetchedAt: number;
  206:                         upstreamUnavailable: boolean;
  207:                     };
  208:                 };
  209:             };
  210:             /** @description Server error */
  211:             "5XX": {
  212:                 headers: {
  213:                     [name: string]: unknown;
  214:                 };
  215:                 content: {
  216:                     "application/json": components["schemas"]["ErrorEnvelope"];
  217:                 };
  218:             };
  219:         };
  220:     };
  221:     getSignalMapEvent: {
  222:         parameters: {
  223:             query?: never;
  224:             header?: never;
  225:             path: {
  226:                 id: string;
  227:             };
  228:             cookie?: never;
  229:         };
  230:         requestBody?: never;
  231:         responses: {
  232:             /** @description SignalMap event */
  233:             200: {
  234:                 headers: {
  235:                     [name: string]: unknown;
  236:                 };
  237:                 content: {
  238:                     "application/json": components["schemas"]["SignalMapEvent"];
  239:                 };
  240:             };
  241:             /** @description Server error */
  242:             "5XX": {
  243:                 headers: {
  244:                     [name: string]: unknown;
  245:                 };
  246:                 content: {
  247:                     "application/json": components["schemas"]["ErrorEnvelope"];
  248:                 };
  249:             };
  250:         };
  251:     };
  252:     getSignalMapSourceHealth: {
  253:         parameters: {
  254:             query?: never;
  255:             header?: never;
  256:             path?: never;
  257:             cookie?: never;
  258:         };
  259:         requestBody?: never;
  260:         responses: {

 succeeded in 1683ms:
  261:             /** @description Source health summary */
  262:             200: {
  263:                 headers: {
  264:                     [name: string]: unknown;
  265:                 };
  266:                 content: {
  267:                     "application/json": {
  268:                         sourceHealth: components["schemas"]["SignalMapSourceHealth"][];
  269:                         fetchedAt: number;
  270:                     };
  271:                 };
  272:             };
  273:             /** @description Server error */
  274:             "5XX": {
  275:                 headers: {
  276:                     [name: string]: unknown;
  277:                 };
  278:                 content: {
  279:                     "application/json": components["schemas"]["ErrorEnvelope"];
  280:                 };
  281:             };
  282:         };
  283:     };
  284:     streamSignalMapEvents: {
  285:         parameters: {
  286:             query?: never;
  287:             header?: {
  288:                 /** @description Resume SSE stream from a previously received event ID */
  289:                 "Last-Event-ID"?: string;
  290:             };
  291:             path?: never;
  292:             cookie?: never;
  293:         };
  294:         requestBody?: never;
  295:         responses: {
  296:             /** @description SSE event stream (text/event-stream) */
  297:             200: {
  298:                 headers: {
  299:                     [name: string]: unknown;
  300:                 };
  301:                 content: {
  302:                     "text/event-stream": string;
  303:                 };
  304:             };
  305:             /** @description Replay ID was evicted â€” client must re-fetch from scratch */
  306:             204: {
  307:                 headers: {
  308:                     "X-Replay-Lost": boolean;
  309:                     [name: string]: unknown;
  310:                 };
  311:                 content?: never;
  312:             };
  313:             /** @description Server error */
  314:             "5XX": {
  315:                 headers: {
  316:                     [name: string]: unknown;
  317:                 };
  318:                 content: {
  319:                     "application/json": components["schemas"]["ErrorEnvelope"];
  320:                 };
  321:             };
  322:         };
  323:     };
  324:     getSignalMapGlobalBrief: {
  325:         parameters: {
  326:             query?: never;
  327:             header?: never;
  328:             path?: never;
  329:             cookie?: never;
  330:         };
  331:         requestBody?: {
  332:             content: {
  333:                 "application/json": Record<string, never>;
  334:             };
  335:         };
  336:         responses: {
  337:             /** @description Global brief with bullet points and sources */
  338:             200: {
  339:                 headers: {
  340:                     "X-Cache": string;
  341:                     [name: string]: unknown;
  342:                 };
  343:                 content: {
  344:                     "application/json": {
  345:                         bullets: string[];
  346:                         generatedAt: string;
  347:                         model: string;
  348:                         sources: {
  349:                             label: string;
  350:                             url: string;
  351:                         }[];
  352:                         lastGeneratedAt?: string;
  353:                     };
  354:                 };
  355:             };
  356:             /** @description Server error */
  357:             "5XX": {
  358:                 headers: {
  359:                     [name: string]: unknown;
  360:                 };
  361:                 content: {
  362:                     "application/json": components["schemas"]["ErrorEnvelope"];
  363:                 };
  364:             };
  365:         };
  366:     };
  367:     getSignalMapEventBrief: {
  368:         parameters: {
  369:             query?: never;
  370:             header?: never;
  371:             path: {
  372:                 id: string;
  373:             };
  374:             cookie?: never;
  375:         };
  376:         requestBody?: {
  377:             content: {
  378:                 "application/json": Record<string, never>;
  379:             };
  380:         };
  381:         responses: {
  382:             /** @description Event brief with why-it-matters explanation */
  383:             200: {
  384:                 headers: {
  385:                     "X-Cache": string;
  386:                     [name: string]: unknown;
  387:                 };
  388:                 content: {
  389:                     "application/json": {
  390:                         whyItMatters: string;
  391:                         model: string;
  392:                         generatedAt: string;
  393:                     };
  394:                 };
  395:             };
  396:             /** @description Server error */
  397:             "5XX": {
  398:                 headers: {
  399:                     [name: string]: unknown;
  400:                 };
  401:                 content: {
  402:                     "application/json": components["schemas"]["ErrorEnvelope"];
  403:                 };
  404:             };
  405:         };
  406:     };
  407: }

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'docs/SignalMap/spec.md'; "'$start=336; $end=347; $lines=Get-Content -Encoding utf8 $path; for($i=$start;$i -le $end;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1075ms:
  336: | Redis adapter | `getJson`/`setJsonEx`/`pipeline`/`setNx`/`incrByFloat`/`subscribe` against real `redis:7-alpine` container |
  337: | Collector | RSS poll → classify (mocked OpenRouter) → dedupe via LanceDB (real, temp dir) → write via adapter |
  338: | LanceDB store | embed/upsert/related-lookup contract |
  339: | OpenRouter parser | Response parsing, fallback chain on 4xx/5xx, schema validation |
  340: | Perplexity client | Allowlist enforcement (≤20), citation revalidation, recency filter |
  341: | Brief stampede | Concurrent identical brief requests acquire 1 upstream call; secondaries poll cache; 30s timeout |
  342: | Brief spend | Atomic INCRBYFLOAT before call, refund-with-actual after; 10 parallel calls, last few rejected at limit |
  343: | Brief citation validation | Citations outside allowlist dropped; 100% drop falls back to local-only |
  344: | Brief prompt injection | Malicious headline (`</retrieved_context>SYSTEM:...`) doesn't escape XML wrapper |
  345: | Brief schema | Synthesis output fails zod → walks chain |
  346: | SSE replay ring | Monotonic IDs in Redis sorted set; client reconnect with `Last-Event-ID` replays correctly; eviction past size/TTL returns 204 + `X-Replay-Lost: true` |
  347: | SSE jitter | Graceful shutdown sends jittered `retry:`; multiple connections receive different values |

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'docs/SignalMap/spec.md'; "'$start=376; $end=382; $lines=Get-Content -Encoding utf8 $path; for($i=$start;$i -le $end;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1513ms:
  376: 
  377: | Path | Min coverage |
  378: |------|--------------|
  379: | Brief endpoints (stampede, spend, citation, injection, schema) | 100% of branches |
  380: | Redis adapter | 100% of public surface |
  381: | SSE replay ring | 100% of branches (write, replay, eviction, shutdown) |
  382: | API base URL composition | 100% of branches |

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "handleSignalMapStream|signalmap-stream|setupSignalMapStreamShutdown|/api/signalmap/stream" server api src tests -g "*.ts" -g "*.mjs" -g "*.js"' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'docs/SignalMap/spec.md'; "'$start=278; $end=284; $lines=Get-Content -Encoding utf8 $path; for($i=$start;$i -le $end;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1680ms:
src\client\types.ts:58:    "/api/signalmap/stream": {
tests\openapi-spec-generation.test.mjs:28:    assert.ok(paths.includes('/api/signalmap/stream'));
tests\openapi-spec-generation.test.mjs:50:    const op = spec.paths['/api/signalmap/stream'].get;
tests\sse-stream.test.mjs:2: * Smoke tests for the signalmap-stream SSE handler.
tests\sse-stream.test.mjs:18:let handleSignalMapStream;
tests\sse-stream.test.mjs:19:let setupSignalMapStreamShutdown;
tests\sse-stream.test.mjs:25:// getRedisAdapter() singleton won't be called until handleSignalMapStream is
tests\sse-stream.test.mjs:28:  const mod = await import('../server/api/routes/signalmap-stream.ts');
tests\sse-stream.test.mjs:29:  handleSignalMapStream = mod.handleSignalMapStream;
tests\sse-stream.test.mjs:30:  setupSignalMapStreamShutdown = mod.setupSignalMapStreamShutdown;
tests\sse-stream.test.mjs:38:describe('signalmap-stream module — smoke tests', { skip: Boolean(importError) }, () => {
tests\sse-stream.test.mjs:39:  // 1. handleSignalMapStream is an async function
tests\sse-stream.test.mjs:40:  it('handleSignalMapStream is an async function', () => {
tests\sse-stream.test.mjs:41:    assert.equal(typeof handleSignalMapStream, 'function', 'handleSignalMapStream should be a function');
tests\sse-stream.test.mjs:44:      handleSignalMapStream.constructor.name === 'AsyncFunction',
tests\sse-stream.test.mjs:45:      `Expected AsyncFunction, got ${handleSignalMapStream.constructor.name}`,
tests\sse-stream.test.mjs:49:  // 2. setupSignalMapStreamShutdown is idempotent (calling twice doesn't add multiple listeners)
tests\sse-stream.test.mjs:50:  it('setupSignalMapStreamShutdown is idempotent — does not add multiple SIGTERM listeners', () => {
tests\sse-stream.test.mjs:55:    setupSignalMapStreamShutdown();
tests\sse-stream.test.mjs:59:    setupSignalMapStreamShutdown();
tests\sse-stream.test.mjs:66:      `Second call to setupSignalMapStreamShutdown added listeners (${afterFirst} → ${afterSecond})`,
tests\sse-stream.test.mjs:115:    handleSignalMapStream(req, res).catch((err) => {
tests\sse-stream.test.mjs:137:describe('signalmap-stream integration — live Redis', { skip: Boolean(importError) || probeFailed }, () => {
tests\sse-stream.test.mjs:153:    // Also quit the singleton used internally by handleSignalMapStream —
tests\sse-stream.test.mjs:181:  // 4. handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor
tests\sse-stream.test.mjs:182:  it('handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor', { skip: probeFailed }, async () => {
tests\sse-stream.test.mjs:200:          path: '/api/signalmap/stream',
tests\sse-stream.test.mjs:218:  // 5. handleSignalMapStream replays prior events as SSE frames and decrements registry on close
tests\sse-stream.test.mjs:219:  it('handleSignalMapStream replays prior events as SSE frames and decrements registry on close', { skip: probeFailed }, async () => {
tests\sse-stream.test.mjs:234:          path: '/api/signalmap/stream',
tests\sse-stream.test.mjs:271:  // 6. handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence
tests\sse-stream.test.mjs:272:  it('handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence', { skip: probeFailed }, async () => {
tests\sse-stream.test.mjs:282:          path: '/api/signalmap/stream',
server\api\schemas\signalmap.ts:138:  '/api/signalmap/stream': {
server\api\routes\signalmap-stream.ts:42:export async function handleSignalMapStream(
server\api\routes\signalmap-stream.ts:87:      console.warn('[signalmap-stream] failed to handle pub/sub message', err);
server\api\routes\signalmap-stream.ts:114:export function setupSignalMapStreamShutdown(): void {

 succeeded in 2238ms:
  278: | Daily budget exceeded (atomic) | `503 { disabled: true, reason: "budget_exhausted", resets_at }` | UI shows "Daily brief budget reached" |
  279: | Cache stampede (lock contention) | Secondary requests poll cache every `SIGNALMAP_BRIEF_STAMPEDE_POLL_MS` | Timeout 30s → `503 { reason: "stampede_timeout" }` |
  280: | Per-IP rate limit | `429 { retry_after_seconds }` | UI grey-out Refresh button + toast |
  281: | Redis connection lost | Collector buffers in-memory (5-min cap); API endpoints `503 { reason: "store_unavailable" }`; SSE clients reconnect | Auto-recovery on Redis return |
  282: | LanceDB unavailable | Skip related-story dedup (warn log); per-event brief omits "related stories" context | Synthesis still works |
  283: | SSE Last-Event-ID evicted from ring | `204 X-Replay-Lost: true` | UI shows "Reconnecting from latest" briefly |
  284: | SSE backend graceful shutdown | Send `event: shutdown\nretry: <jittered ms>\n\n` | Clients reconnect with stagger |

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "SignalMapEvent|event.*schema|kind|severity|lastObservedAt|watchlistMatch|sourceHealth|listSignalMap" docs/SignalMap/spec.md server src -g "*.md" -g "*.ts" -g "*.mjs"' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1330ms:
docs/SignalMap/spec.md:451:| 5c Markers + halos + overlays + click | `src/components/map/MapMarker.tsx`, `src/components/map/MapOverlays.tsx`, `src/state/signals.ts` (extend) | Marker styles per category (outage, anomaly, provider, event) + severity; watchlist halos (region bbox stroke); corner overlays (active counts top-left, projection info top-right, legend bottom-left, live indicator bottom-right); click sets `selectedEventId`; each marker has 44px invisible `<rect>` hit area | `npx playwright test e2e/map-interaction.spec.ts` (touch tap test on tablet viewport) | Use `<circle>` alone for hit area |
docs/SignalMap/spec.md:463:| 6d Brief endpoints + cron job + admin refresh | `server/api/routes/signalmap-brief-global.ts` (read-only cache lookup), `server/api/routes/signalmap-brief-event.ts` (on-demand with singleflight), `server/api/routes/signalmap-brief-health.ts` (operator visibility), `server/api/routes/signalmap-brief-refresh.ts` (admin-token-gated manual trigger), `scripts/brief-cron.mjs` (background job), `docker/supervisord.signalmap.conf` (add brief-cron program), `tests/brief-endpoints.test.mjs`, `tests/brief-cron.test.mjs` | **Global brief endpoint**: 3-line handler reading `signalmap:brief:global` from Redis, returning JSON. No LLM call ever from this path. **Per-event endpoint**: cache-check → singleflight → spend-reserve → OpenRouter (XML-wrapped synthesis with event + 3 LanceDB-related stories) → schema validation → cache write (forever per event ID). **Health endpoint**: returns `{ lastGeneratedAt, nextScheduledAt, dailySpendUsd, dailyBudgetUsd, modelInUse }`. **Manual refresh endpoint**: requires `X-SignalMap-Admin-Token` header matching `SIGNALMAP_ADMIN_TOKEN` env; triggers immediate brief regen, still respects budget. **Brief cron**: separate Node process (started by supervisord), loops every `SIGNALMAP_BRIEF_REFRESH_MINUTES`, calls Perplexity → citation revalidation → Sonnet 4.6 → spend reservation → write to `signalmap:brief:global` (no TTL, overwrite-in-place) → publish `signalmap:brief:updated` pubsub event for SSE. | `npx tsx --test tests/brief-endpoints.test.mjs tests/brief-cron.test.mjs` | Build a request-driven generation path on the global endpoint |
src\app\country-intel.ts:266:      const severityDelta = this.newsSeverityRank(b) - this.newsSeverityRank(a);
src\app\country-intel.ts:267:      if (severityDelta !== 0) return severityDelta;
src\app\country-intel.ts:868:            severity: e.severity === 'high' ? 'high' : e.severity === 'medium' ? 'medium' : 'low',
src\app\country-intel.ts:881:            severity: eq.magnitude >= 6 ? 'critical' : eq.magnitude >= 5 ? 'high' : eq.magnitude >= 4 ? 'medium' : 'low',
src\app\country-intel.ts:894:            severity: f.isInteresting ? 'high' : 'low',
src\app\country-intel.ts:904:            severity: v.isDark ? 'high' : 'low',
src\app\country-intel.ts:917:          severity: c.fatalities > 0 ? 'critical' : 'high',
src\app\country-intel.ts:929:        severity: (e.severity.toLowerCase() === 'high' || e.severity.toLowerCase() === 'critical') ? 'critical' : 'high',
src\app\country-intel.ts:1017:        (d.severity === 'major' || d.severity === 'severe' || d.delayType === 'closure') &&
src\app\country-intel.ts:1125:      const severity = this.normalizeSignalSeverity(signal.type, signal.severity);
src\app\country-intel.ts:1126:      if (severity === 'critical') details.critical += 1;
src\app\country-intel.ts:1127:      else if (severity === 'high') details.high += 1;
src\app\country-intel.ts:1128:      else if (severity === 'medium') details.medium += 1;
src\app\country-intel.ts:1135:        severity: this.normalizeSignalSeverity(signal.type, signal.severity),
src\app\country-intel.ts:1139:      .filter((signal) => signal.severity === 'critical' || signal.severity === 'high')
src\app\country-intel.ts:1279:    severity: 'low' | 'medium' | 'high',
src\app\country-intel.ts:1280:  ): CountryDeepDiveSignalDetails['recentHigh'][number]['severity'] {
src\app\country-intel.ts:1281:    if (type === 'active_strike' && severity === 'high') return 'critical';
src\app\country-intel.ts:1282:    if (type === 'radiation_anomaly' && severity === 'high') return 'critical';
src\app\country-intel.ts:1283:    if (severity === 'high') return 'high';
src\app\country-intel.ts:1284:    if (severity === 'medium') return 'medium';
src\client\types.ts:15:        get: operations["listSignalMapEvents"];
src\client\types.ts:32:        get: operations["getSignalMapEvent"];
src\client\types.ts:66:        get: operations["streamSignalMapEvents"];
src\client\types.ts:102:        post: operations["getSignalMapEventBrief"];
src\client\types.ts:113:        SignalMapEvent: {
src\client\types.ts:116:            severity: components["schemas"]["SignalMapSeverity"];
src\client\types.ts:122:            lastObservedAt: string;
src\client\types.ts:127:            kind: components["schemas"]["SignalMapKind"];
src\client\types.ts:128:            watchlistMatch: boolean;
src\client\types.ts:180:    listSignalMapEvents: {
src\client\types.ts:203:                        events: components["schemas"]["SignalMapEvent"][];
src\client\types.ts:204:                        sourceHealth: components["schemas"]["SignalMapSourceHealth"][];
src\client\types.ts:221:    getSignalMapEvent: {
src\client\types.ts:238:                    "application/json": components["schemas"]["SignalMapEvent"];
src\client\types.ts:268:                        sourceHealth: components["schemas"]["SignalMapSourceHealth"][];
src\client\types.ts:284:    streamSignalMapEvents: {
src\client\types.ts:367:    getSignalMapEventBrief: {
src\app\data-loader.ts:187:import { fetchKindnessData } from '@/services/kindness-data';
src\app\data-loader.ts:691:    this.ctx.map?.setSignalMapEvents(state.events);
src\app\data-loader.ts:695:      sourceHealth: state.sourceHealth,
src\app\data-loader.ts:759:        case 'kindness':
src\app\data-loader.ts:1282:        this.ctx.mapLayers.kindness ? Promise.resolve(this.loadKindnessData()) : Promise.resolve(),
src\app\data-loader.ts:2606:      const severe = delays.filter(d => d.severity === 'major' || d.severity === 'severe' || d.delayType === 'closure');
src\app\data-loader.ts:3177:        items.filter(item => item.happyCategory === 'humanity-kindness')
src\app\data-loader.ts:3226:      .filter(item => item.happyCategory === 'humanity-kindness')
src\app\data-loader.ts:3247:        category: (e.category || 'humanity-kindness') as HappyContentCategory,
src\app\data-loader.ts:3269:    const kindnessItems = fetchKindnessData(
src\app\data-loader.ts:3275:    this.ctx.map?.setKindnessData(kindnessItems);
src\app\data-loader.ts:3368:      const anomalies = result.observations.filter((observation) => observation.severity !== 'normal');
src\app\search-manager.ts:257:              data: { kind: 'adsb' as const, lat: p.lat, lon: p.lon, layer: 'flights' as const },
src\app\search-manager.ts:453:        const { lat, lon, layer } = result.data as { kind: string; lat: number; lon: number; layer: keyof MapLayers };
src\app\search-manager.ts:648:          data: { kind: 'adsb' as const, lat: p.lat, lon: p.lon, layer: 'flights' as const },
src\app\search-manager.ts:661:          data: { kind: 'military' as const, lat: f.lat, lon: f.lon, layer: 'military' as const },
src\components\AirlineIntelPanel.ts:387:        <div class="ops-severity" style="color:${SEVERITY_COLOR[s.severity] ?? '#aaa'}">${s.severity.toUpperCase()}</div>
src\app\panel-layout.ts:179:    const returnedFromCheckout = returnResult.kind === 'success' || returnedFromOverlay;
src\app\panel-layout.ts:197:    } else if (returnResult.kind === 'failed') {
src\app\panel-layout.ts:682:    this.criticalBannerEl.className = `critical-posture-banner ${isCritical ? 'severity-critical' : 'severity-elevated'}`;
src\app\panel-layout.ts:771:  // 0-100 event risk score: 0.40×severity + 0.30×geoConvergence + 0.30×CII
src\app\panel-layout.ts:776:    const severity = (levelScore[cluster.threat.level] ?? 10) * (cluster.threat.confidence ?? 1);
src\app\panel-layout.ts:783:    // Rebalanced (CII pending): 0.57×severity + 0.43×geoConvergence
src\app\panel-layout.ts:784:    return Math.round(0.57 * severity + 0.43 * geoScore);
src\e2e\mobile-map-integration-harness.ts:127:  kindness: false,
src\components\AviationCommandBar.ts:126:        <span style="color:${s.severity === 'normal' ? '#22c55e' : s.severity === 'minor' ? '#f59e0b' : '#ef4444'}">${s.severity.toUpperCase()}</span>
server\api\schemas\common.ts:62:export const SignalMapEvent = z
server\api\schemas\common.ts:66:    severity: SignalMapSeverity,
server\api\schemas\common.ts:72:    lastObservedAt: z.string(),
server\api\schemas\common.ts:77:    kind: SignalMapKind,
server\api\schemas\common.ts:78:    watchlistMatch: z.boolean(),
server\api\schemas\common.ts:81:  .openapi({ ref: 'SignalMapEvent' });
server\api\schemas\signalmap.ts:12:  SignalMapEvent,
server\api\schemas\signalmap.ts:30:  events: z.array(SignalMapEvent),
server\api\schemas\signalmap.ts:31:  sourceHealth: z.array(SignalMapSourceHealth),
server\api\schemas\signalmap.ts:41:  sourceHealth: z.array(SignalMapSourceHealth),
server\api\schemas\signalmap.ts:79:      operationId: 'listSignalMapEvents',
server\api\schemas\signalmap.ts:99:      operationId: 'getSignalMapEvent',
server\api\schemas\signalmap.ts:108:            'application/json': { schema: SignalMapEvent },
server\api\schemas\signalmap.ts:140:      operationId: 'streamSignalMapEvents',
server\api\schemas\signalmap.ts:155:            'text/event-stream': { schema: z.string() },
server\api\schemas\signalmap.ts:207:      operationId: 'getSignalMapEventBrief',
src\e2e\map-harness.ts:179:  kindness: true,
src\e2e\map-harness.ts:236:  kindness: false,
src\e2e\map-harness.ts:774:      severity: 'high',
src\e2e\map-harness.ts:805:      severity: isRiot ? 'high' : 'medium',
src\e2e\map-harness.ts:855:      severity: 'Severe',
src\e2e\map-harness.ts:876:      severity: 'major',
src\e2e\map-harness.ts:891:      severity: 'high',
src\e2e\map-harness.ts:906:      severity: 'high',
src\e2e\map-harness.ts:931:      severity: 'fault',
src\e2e\map-harness.ts:966:      severity: 'major',
src\e2e\map-harness.ts:1234:      severity: 'high',
src\components\BreakingNewsBanner.ts:196:    el.className = `breaking-alert severity-${alert.threatLevel}`;
src\shared\shortage-evidence.ts:3:// `severity` ('watch' | 'confirmed') is a curated field on the row,
src\shared\shortage-evidence.ts:10:// contradicting the classifier's severity label.
src\shared\shortage-evidence.ts:46: * the severity chip. Does NOT change the severity label — that's the
src\generated\server\worldmonitor\aviation\v1\service_server.ts:26:  severity: FlightDelaySeverity;
src\generated\server\worldmonitor\aviation\v1\service_server.ts:66:  severity: FlightDelaySeverity;
src\generated\server\worldmonitor\aviation\v1\service_server.ts:420:            minSeverity: (params.get("min_severity") ?? "FLIGHT_DELAY_SEVERITY_UNSPECIFIED") as FlightDelaySeverity,
src\generated\client\worldmonitor\climate\v1\service_client.ts:20:  severity: AnomalySeverity;
src\generated\client\worldmonitor\climate\v1\service_client.ts:53:  severity: string;
src\generated\client\worldmonitor\climate\v1\service_client.ts:207:    if (req.minSeverity != null && req.minSeverity !== "ANOMALY_SEVERITY_UNSPECIFIED") params.set("min_severity", String(req.minSeverity));
server\_shared\cache-keys.ts:3://       title, link, severity, lang, description
server\_shared\cache-keys.ts:21: *   story:track:v1:${titleHash}     Hash   firstSeen/lastSeen/title/link/severity/mentionCount/currentScore/lang/description (always-written)
server\_shared\cache-keys.ts:29: *   shadow:score-log:v5            ZSet   score=epoch_ms, member=JSON{ts,importanceScore,severity,eventType,title,source,publishedAt,corroborationCount,variant}
src\generated\client\worldmonitor\aviation\v1\service_client.ts:26:  severity: FlightDelaySeverity;
src\generated\client\worldmonitor\aviation\v1\service_client.ts:66:  severity: FlightDelaySeverity;
src\generated\client\worldmonitor\aviation\v1\service_client.ts:399:    if (req.minSeverity != null && req.minSeverity !== "FLIGHT_DELAY_SEVERITY_UNSPECIFIED") params.set("min_severity", String(req.minSeverity));
server\_shared\resilience-freshness.ts:7:// classifier function that maps a `lastObservedAt` timestamp and a
server\_shared\resilience-freshness.ts:12:// - No changes to the 19 dimension scorers. Propagating `lastObservedAt`
server\_shared\resilience-freshness.ts:18://   type). The schema field `freshness: { lastObservedAt, staleness }`
server\_shared\resilience-freshness.ts:23://   time given the already-exposed `lastObservedAt` field.
server\_shared\resilience-freshness.ts:59:  lastObservedAtMs: number | null | undefined;
server\_shared\resilience-freshness.ts:69:   * Age in milliseconds. `Number.POSITIVE_INFINITY` when `lastObservedAtMs`
server\_shared\resilience-freshness.ts:87: * Returns `'stale'` when `lastObservedAtMs` is null, undefined, NaN, or
server\_shared\resilience-freshness.ts:97:  const { lastObservedAtMs, cadence } = args;
server\_shared\resilience-freshness.ts:102:    lastObservedAtMs == null ||
server\_shared\resilience-freshness.ts:103:    !Number.isFinite(lastObservedAtMs) ||
server\_shared\resilience-freshness.ts:104:    lastObservedAtMs > nowMs
server\_shared\resilience-freshness.ts:110:  // and future timestamps, so `nowMs - lastObservedAtMs` is guaranteed
server\_shared\resilience-freshness.ts:113:  const ageMs = nowMs - lastObservedAtMs;
src\config\variants\tech.ts:259:  kindness: false,
src\config\variants\tech.ts:321:  kindness: false,
src\config\variants\happy.ts:67:  kindness: true,
src\config\variants\happy.ts:130:  kindness: true,
src\generated\client\worldmonitor\military\v1\service_client.ts:198:  kind: string;
src\generated\client\worldmonitor\military\v1\service_client.ts:214:  kind: string;
src\generated\client\worldmonitor\military\v1\service_client.ts:517:    if (req.kind != null && req.kind !== "") params.set("kind", String(req.kind));
src\config\variants\full.ts:101:  kindness: false,
src\config\variants\full.ts:163:  kindness: false,
src\generated\server\worldmonitor\cyber\v1\service_server.ts:27:  severity: CriticalityLevel;
src\generated\server\worldmonitor\cyber\v1\service_server.ts:120:            minSeverity: (params.get("min_severity") ?? "CRITICALITY_LEVEL_UNSPECIFIED") as CriticalityLevel,
src\config\variants\finance.ts:224:  kindness: false,
src\config\variants\finance.ts:286:  kindness: false,
src\types\signalmap.ts:71:export interface SignalMapEvent {
src\types\signalmap.ts:74:  severity: SignalMapSeverity;
src\types\signalmap.ts:80:  lastObservedAt: string;
src\types\signalmap.ts:85:  kind: SignalMapKind;
src\types\signalmap.ts:86:  watchlistMatch: boolean;
src\config\variants\energy.ts:96:  kindness: false,
src\config\variants\energy.ts:158:  kindness: false,
src\types\index.ts:44:  | 'humanity-kindness'
src\types\index.ts:283:  severity: 'low' | 'elevated' | 'high';
src\types\index.ts:332:  severity: CyberThreatSeverity;
src\types\index.ts:421:  kind?: string;
src\types\index.ts:463:  severity: CableAdvisorySeverity;
src\types\index.ts:653:  kindness: boolean;
src\types\index.ts:711:  severity: 'partial' | 'major' | 'total';
src\types\index.ts:783:  severity: ProtestSeverity;
src\types\index.ts:802:  severity: ProtestSeverity;
src\config\variants\commodity.ts:107:  kindness: false,
src\config\variants\commodity.ts:172:  kindness: false,
src\utils\export.ts:116:        lines.push(csvRow([e.title, e.country, e.eventType, e.severity, e.time.toISOString()]));
src\utils\export.ts:134:        lines.push(csvRow([o.title, o.country, o.severity, o.pubDate.toISOString(), o.link]));
src\utils\export.ts:143:        lines.push(csvRow([d.name, d.iata, d.city, d.country, d.delayType, d.severity, String(d.avgDelayMinutes), d.source]));
src\utils\export.ts:170:        lines.push(csvRow([e.title, e.category, e.locationName, e.severity, e.timestamp]));
src\utils\export.ts:244:      lines.push(csvRow([c.indicator, c.indicatorType, String(c.severity), c.country ?? '', c.source, c.firstSeen ?? '']));
src\generated\server\worldmonitor\conflict\v1\service_server.ts:103:  severity: string;
src\generated\client\worldmonitor\maritime\v1\service_client.ts:45:  severity: AisDisruptionSeverity;
src\config\panels.ts:165:  kindness: false,
src\config\panels.ts:230:  kindness: false,
src\config\panels.ts:337:  kindness: false,
src\config\panels.ts:399:  kindness: false,
src\config\panels.ts:535:  kindness: false,
src\config\panels.ts:597:  kindness: false,
src\config\panels.ts:675:  kindness: true,
src\config\panels.ts:737:  kindness: true,
src\config\panels.ts:842:  kindness: false,
src\config\panels.ts:904:  kindness: false,
src\config\panels.ts:1003:  kindness: false,
src\config\panels.ts:1061:  kindness: false,
src\config\map-layer-definitions.ts:88:  kindness:                 def('kindness',                 '&#128154;', 'kindness',                 'Acts of Kindness'),
src\config\map-layer-definitions.ts:132:    'positiveEvents', 'kindness', 'happiness', 'resilienceScore',
src\config\map-layer-definitions.ts:256:  happy: ['happiness', 'kindness', 'positiveEvents'],
src\config\map-layer-definitions.ts:257:  good: ['positiveEvents', 'kindness'],
src\services\checkout.ts:681:    if (outcome.kind === 'redirect-pro') {
src\services\data-freshness.ts:352:export function getIntelligenceGaps(): { source: DataSourceId; message: string; severity: 'warning' | 'critical' }[] {
src\services\data-freshness.ts:353:  const gaps: { source: DataSourceId; message: string; severity: 'warning' | 'critical' }[] = [];
src\services\data-freshness.ts:358:      const severity = source.requiredForRisk || source.status === 'error' ? 'critical' : 'warning';
src\services\data-freshness.ts:359:      gaps.push({ source: source.id, message, severity });
src\services\data-freshness.ts:365:    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
src\services\data-freshness.ts:376:    const icon = gap.severity === 'critical' ? '⚠️ CRITICAL' : '⚡';
src\services\data-freshness.ts:385:  return getIntelligenceGaps().some(gap => gap.severity === 'critical');
src\generated\client\worldmonitor\unrest\v1\service_client.ts:33:  severity: SeverityLevel;
src\generated\client\worldmonitor\unrest\v1\service_client.ts:53:  severity: SeverityLevel;
src\generated\client\worldmonitor\unrest\v1\service_client.ts:128:    if (req.minSeverity != null && req.minSeverity !== "SEVERITY_LEVEL_UNSPECIFIED") params.set("min_severity", String(req.minSeverity));
src\services\checkout-return.ts:27:  | { kind: 'none' }
src\services\checkout-return.ts:28:  | { kind: 'success' }
src\services\checkout-return.ts:29:  | { kind: 'failed'; rawStatus: string };
src\services\checkout-return.ts:41: *  - `kind: 'success'` → show success banner, trigger entitlement unlock
src\services\checkout-return.ts:42: *  - `kind: 'failed'`  → show failure banner with retry CTA
src\services\checkout-return.ts:43: *  - `kind: 'none'`    → no-op, this is a normal page load
src\services\checkout-return.ts:63:    return { kind: 'none' };
src\services\checkout-return.ts:97:    if (SUCCESS_STATUSES.has(status)) return { kind: 'success' };
src\services\checkout-return.ts:98:    if (FAILED_STATUSES.has(status)) return { kind: 'failed', rawStatus: status };
src\services\checkout-return.ts:100:  if (hasWmSuccess) return { kind: 'success' };
src\services\checkout-return.ts:101:  if (hasDodoParams && status) return { kind: 'failed', rawStatus: status };
src\services\checkout-return.ts:102:  return { kind: 'none' };
src\generated\server\worldmonitor\unrest\v1\service_server.ts:33:  severity: SeverityLevel;
src\generated\server\worldmonitor\unrest\v1\service_server.ts:53:  severity: SeverityLevel;
src\generated\server\worldmonitor\unrest\v1\service_server.ts:139:            minSeverity: (params.get("min_severity") ?? "SEVERITY_LEVEL_UNSPECIFIED") as SeverityLevel,
src\services\checkout-no-user-policy.ts:26:  | { kind: 'redirect-pro'; persist: false; redirectUrl: string }
src\services\checkout-no-user-policy.ts:27:  | { kind: 'inline-signin'; persist: true };
src\services\checkout-no-user-policy.ts:33:    return { kind: 'redirect-pro', persist: false, redirectUrl: PRO_URL };
src\services\checkout-no-user-policy.ts:35:  return { kind: 'inline-signin', persist: true };
src\generated\server\worldmonitor\climate\v1\service_server.ts:20:  severity: AnomalySeverity;
src\generated\server\worldmonitor\climate\v1\service_server.ts:53:  severity: string;
src\generated\server\worldmonitor\climate\v1\service_server.ts:223:            minSeverity: (params.get("min_severity") ?? "ANOMALY_SEVERITY_UNSPECIFIED") as AnomalySeverity,
src\services\checkout-errors.ts:124:  kind: 'unauthorized' | 'session_expired',
src\services\checkout-errors.ts:127:    code: kind,
src\services\checkout-errors.ts:128:    userMessage: pickUserMessage(kind),
src\services\checkout-errors.ts:129:    retryable: RETRYABLE[kind],
src\services\cyber\index.ts:66:    severity: SEVERITY_REVERSE[proto.severity] || 'low',
src\services\aviation\index.ts:37:  severity: FlightDelaySeverity;
src\services\aviation\index.ts:57:  severity: FlightDelaySeverity;
src\services\aviation\index.ts:233:    severity: SEVERITY_MAP[p.severity] ?? 'normal',
src\services\aviation\index.ts:249:    notamFlags: p.notamFlags ?? [], severity: SEVERITY_MAP[p.severity] ?? 'normal',
src\services\cross-module-integration.ts:73:  severity: 'elevated' | 'spike';
src\services\cross-module-integration.ts:164:  if (observation.severity === 'spike') score += 4;
src\services\cross-module-integration.ts:165:  else if (observation.severity === 'elevated') score += 2;
src\services\cross-module-integration.ts:315:  const severityRank = observation.severity === 'spike' ? 2 : observation.severity === 'elevated' ? 1 : 0;
src\services\cross-module-integration.ts:319:  return severityRank * 1000 + confidenceRank * 200 + corroborationBonus + observation.zScore * 100 + observation.delta - conflictPenalty;
src\services\cross-module-integration.ts:331:  const anomalies = watch.observations.filter(o => o.severity !== 'normal');
src\services\cross-module-integration.ts:347:    severity: strongest.severity === 'spike' ? 'spike' : 'elevated',
src\services\cross-module-integration.ts:369:  const title = strongest.severity === 'spike'
src\services\cross-module-integration.ts:680:  // Breaking news severity boost (pre-computed by panel)
src\services\cross-module-integration.ts:780:    .filter(observation => observation.severity !== 'normal')
src\services\cross-module-integration.ts:784:      ? strongestRadiation.severity === 'spike' ? 'Confirmed radiation spike' : 'Confirmed radiation anomaly'
src\services\cross-module-integration.ts:787:        : strongestRadiation.severity === 'spike'
src\services\country-instability.ts:44:  strikes: Array<{ severity: string; timestamp: number; lat: number; lon: number; title: string; id: string }>;
src\services\country-instability.ts:257:    trackHotspotActivity(e.lat, e.lon, e.severity === 'high' ? 2 : 1);
src\services\country-instability.ts:327:    if (a.severity === 'normal') continue;
src\services\country-instability.ts:331:      const stress = a.severity === 'extreme' ? 15 : 8;
src\services\country-instability.ts:494:  id: string; category: string; severity: string;
src\services\country-instability.ts:509:      severity: e.severity,
src\services\country-instability.ts:668:    if (e.severity === 'high') data.aisDisruptionHighCount++;
src\services\country-instability.ts:669:    else if (e.severity === 'elevated') data.aisDisruptionElevatedCount++;
src\services\country-instability.ts:712:    if (threat.severity === 'critical') data.cyberThreatCriticalCount++;
src\services\country-instability.ts:713:    else if (threat.severity === 'high') data.cyberThreatHighCount++;
src\services\country-instability.ts:714:    else if (threat.severity === 'medium') data.cyberThreatMediumCount++;
src\services\country-instability.ts:734:    if (anomaly.severity === 'critical') data.temporalAnomalyCriticalCount++;
src\services\country-instability.ts:798:  let severityBoost = 0;
src\services\country-instability.ts:802:    const highSeverity = data.protests.filter(p => p.severity === 'high').length;
src\services\country-instability.ts:812:    severityBoost = Math.min(20, highSeverity * 10 * multiplier);
src\services\country-instability.ts:817:    const totalOutages = data.outages.filter(o => o.severity === 'total').length;
src\services\country-instability.ts:818:    const majorOutages = data.outages.filter(o => o.severity === 'major').length;
src\services\country-instability.ts:819:    const partialOutages = data.outages.filter(o => o.severity === 'partial').length;
src\services\country-instability.ts:824:  return Math.min(100, baseScore + fatalityBoost + severityBoost + outageBoost);
src\services\country-instability.ts:889:      s.severity.toLowerCase() === 'high' || s.severity.toLowerCase() === 'critical'
src\services\country-instability.ts:921:    else if (a.severity === 'severe') aviationScore += 15;
src\services\country-instability.ts:922:    else if (a.severity === 'major') aviationScore += 10;
src\services\country-instability.ts:923:    else if (a.severity === 'moderate') aviationScore += 5;
src\generated\client\worldmonitor\intelligence\v1\service_client.ts:99:  severity: SeverityLevel;
src\generated\client\worldmonitor\intelligence\v1\service_client.ts:428:  severity: CrossSourceSignalSeverity;
src\generated\client\worldmonitor\intelligence\v1\service_client.ts:429:  severityScore: number;
src\generated\client\worldmonitor\intelligence\v1\service_client.ts:731:  severity: string;
src\services\cable-activity.ts:231:        severity: determineSeverity(warning.text),
src\services\breaking-news-alerts.ts:196:        severity: alert.threatLevel,
src\services\correlation-engine\types.ts:12:  severity: number;       // 0-100
src\generated\client\worldmonitor\infrastructure\v1\service_client.ts:26:  severity: OutageSeverity;
src\generated\client\worldmonitor\infrastructure\v1\service_client.ts:78:  severity: string;
src\generated\client\worldmonitor\infrastructure\v1\service_client.ts:171:  severity: string;
src\services\correlation-engine\engine.ts:246:      // Aggregate max severity per signal type
src\services\correlation-engine\engine.ts:250:        perType.set(s.type, Math.max(current, s.severity));
src\services\correlation-engine\engine.ts:255:      for (const [type, severity] of perType) {
src\services\correlation-engine\engine.ts:257:        weightedSum += severity * weight;
src\services\correlation-engine\engine.ts:400:        .map(s => `- [${s.type}] ${s.label} (severity: ${s.severity})`)
src\services\conflict\index.ts:420:function iranColorTier(ev: Pick<IranEvent, 'severity' | 'category'>): IranColorTier {
src\services\conflict\index.ts:421:  if (ev.severity === 'critical' || IRAN_RED_CATEGORIES.has(ev.category)) return 'red';
src\services\conflict\index.ts:433:export function getIranEventColor(ev: Pick<IranEvent, 'severity' | 'category'>): [number, number, number, number] {
src\services\conflict\index.ts:437:export function getIranEventCssColor(ev: Pick<IranEvent, 'severity' | 'category'>): string {
src\services\conflict\index.ts:441:export function getIranEventHexColor(ev: Pick<IranEvent, 'severity'>): string {
src\services\conflict\index.ts:442:  if (ev.severity === 'high' || ev.severity === 'critical') return '#ff3030';
src\services\conflict\index.ts:443:  if (ev.severity === 'elevated') return '#ff8800';
src\services\conflict\index.ts:447:export function getIranEventRadius(severity: string): number {
src\services\conflict\index.ts:448:  if (severity === 'high' || severity === 'critical') return 20000;
src\services\conflict\index.ts:449:  if (severity === 'elevated') return 15000;
src\services\conflict\index.ts:453:export function getIranEventSize(severity: string): number {
src\services\conflict\index.ts:454:  if (severity === 'high' || severity === 'critical') return 14;
src\services\conflict\index.ts:455:  if (severity === 'elevated') return 11;
src\generated\server\worldmonitor\military\v1\service_server.ts:198:  kind: string;
src\generated\server\worldmonitor\military\v1\service_server.ts:214:  kind: string;
src\generated\server\worldmonitor\military\v1\service_server.ts:657:            kind: params.get("kind") ?? "",
src\services\climate\index.ts:25:// lat/lon/severity/type fields they always used. The proto -> legacy
src\services\climate\index.ts:43:  severity: 'normal' | 'moderate' | 'extreme';
src\services\climate\index.ts:87:    const anomalies = hydrated.anomalies.map(toDisplayAnomaly).filter(a => a.severity !== 'normal');
src\services\climate\index.ts:96:    .filter(a => a.severity !== 'normal');
src\services\climate\index.ts:156:    severity: mapSeverity(proto.severity),
src\services\climate\index.ts:186:function mapSeverity(s: ProtoAnomalySeverity): ClimateAnomaly['severity'] {
src\main.ts:544:    tags: { kind: 'csp_violation' },
src\services\correlation-engine\adapters\economic.ts:38:      const severity = Math.min(100, absPct * 10);
src\services\correlation-engine\adapters\economic.ts:45:        severity,
src\services\correlation-engine\adapters\economic.ts:59:      const severity = c.threat?.level === 'critical' ? 85
src\services\correlation-engine\adapters\economic.ts:66:        severity,
src\services\correlation-engine\adapters\disaster.ts:34:      const severity = Math.min(100, Math.max(10, (q.magnitude - 1.5) * 17));
src\services\correlation-engine\adapters\disaster.ts:39:        severity,
src\services\correlation-engine\adapters\disaster.ts:68:      const severityMap: Record<string, number> = { total: 90, major: 70, partial: 40 };
src\services\correlation-engine\adapters\disaster.ts:73:        severity: severityMap[o.severity] ?? 30,
src\services\correlation-engine\adapters\military.ts:39:      const severity = isStrike ? 80 : isSupport ? 60 : 55;
src\services\correlation-engine\adapters\military.ts:44:        severity,
src\services\correlation-engine\adapters\military.ts:60:      // Dark vessels (AIS gap) are a separate, high-severity signal
src\services\correlation-engine\adapters\military.ts:68:          severity: gapSeverity,
src\services\correlation-engine\adapters\military.ts:78:      const severity = v.vesselType === 'carrier' ? 90
src\services\correlation-engine\adapters\military.ts:86:        severity,
src\services\correlation-engine\adapters\escalation.ts:10:  news_severity: 0.30,
src\services\correlation-engine\adapters\escalation.ts:57:      const severityMap: Record<string, number> = { high: 85, medium: 55, low: 30 };
src\services\correlation-engine\adapters\escalation.ts:58:      const severity = severityMap[p.severity] ?? 40;
src\services\correlation-engine\adapters\escalation.ts:63:        severity,
src\services\correlation-engine\adapters\escalation.ts:83:      const severityMap: Record<string, number> = { total: 90, major: 70, partial: 40 };
src\services\correlation-engine\adapters\escalation.ts:84:      const severity = severityMap[o.severity] ?? 30;
src\services\correlation-engine\adapters\escalation.ts:89:        severity,
src\services\correlation-engine\adapters\escalation.ts:94:        label: `${o.severity} outage: ${o.title}`,
src\services\correlation-engine\adapters\escalation.ts:99:    // High-severity news clusters — extract country from title
src\services\correlation-engine\adapters\escalation.ts:107:      const severity = c.threat.level === 'critical' ? 85
src\services\correlation-engine\adapters\escalation.ts:117:        type: 'news_severity',
src\services\correlation-engine\adapters\escalation.ts:119:        severity,
src\services\correlation-engine\adapters\escalation.ts:145:    if (types.has('news_severity')) parts.push('news escalation');
src\generated\server\worldmonitor\supply_chain\v1\service_server.ts:546:  severity: string;
src\generated\server\worldmonitor\supply_chain\v1\service_server.ts:560:  severity: string;
src\generated\server\worldmonitor\supply_chain\v1\service_server.ts:1496:            severity: params.get("severity") ?? "",
src\services\focal-point-detector.ts:260:    const severityBonus = nonStrike.filter(s => s.severity === 'high').length * 5;
src\services\focal-point-detector.ts:261:    return typeBonus + countBonus + severityBonus;
src\services\focal-point-detector.ts:276:    const severityBonus = Math.min(30, highSevCount * 3);
src\services\focal-point-detector.ts:277:    return base + severityBonus;
src\services\focal-point-detector.ts:355:      evidence.push(`${signals.highSeverityCount} high-severity signals detected`);
src\generated\client\worldmonitor\supply_chain\v1\service_client.ts:546:  severity: string;
src\generated\client\worldmonitor\supply_chain\v1\service_client.ts:560:  severity: string;
src\generated\client\worldmonitor\supply_chain\v1\service_client.ts:1124:    if (req.severity != null && req.severity !== "") params.set("severity", String(req.severity));
src\services\happy-share-renderer.ts:18:  'humanity-kindness': ['#FDE8EE', '#F5C5D5'],
src\services\happy-share-renderer.ts:28:  'humanity-kindness': '#C48B9F',
src\services\happy-share-renderer.ts:34:const DEFAULT_CATEGORY: HappyContentCategory = 'humanity-kindness';
src\generated\server\worldmonitor\maritime\v1\service_server.ts:45:  severity: AisDisruptionSeverity;
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:4:export interface ListSignalMapEventsRequest {
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:13:export interface ListSignalMapEventsResponse {
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:14:  events: SignalMapEvent[];
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:15:  sourceHealth: SignalMapSourceHealth[];
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:20:export interface SignalMapEvent {
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:23:  severity: string;
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:29:  lastObservedAt: string;
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:34:  kind: string;
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:35:  watchlistMatch: boolean;
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:112:  listSignalMapEvents(ctx: ServerContext, req: ListSignalMapEventsRequest): Promise<ListSignalMapEventsResponse>;
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:128:          const body: ListSignalMapEventsRequest = {
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:137:            const bodyViolations = options.validateRequest("listSignalMapEvents", body);
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:149:          const result = await handler.listSignalMapEvents(ctx, body);
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:150:          return new Response(JSON.stringify(result as ListSignalMapEventsResponse), {
server\worldmonitor\unrest\v1\_shared.ts:109:  const severityOrder: Record<string, number> = {
server\worldmonitor\unrest\v1\_shared.ts:118:      (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:4:export interface ListSignalMapEventsRequest {
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:13:export interface ListSignalMapEventsResponse {
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:14:  events: SignalMapEvent[];
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:15:  sourceHealth: SignalMapSourceHealth[];
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:20:export interface SignalMapEvent {
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:23:  severity: string;
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:29:  lastObservedAt: string;
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:34:  kind: string;
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:35:  watchlistMatch: boolean;
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:115:  async listSignalMapEvents(req: ListSignalMapEventsRequest, options?: SignalMapServiceCallOptions): Promise<ListSignalMapEventsResponse> {
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:142:    return await resp.json() as ListSignalMapEventsResponse;
src\services\kindness-data.ts:1:// Kindness data pipeline: real kindness events from curated news
src\services\kindness-data.ts:2:// Green labeled dots on the happy map from actual humanity-kindness articles
src\services\kindness-data.ts:17: * Extract real kindness events from curated news items.
src\services\kindness-data.ts:18: * Filters for humanity-kindness category and geocodes via title.
src\services\kindness-data.ts:23:  const kindnessItems = newsItems.filter(
src\services\kindness-data.ts:24:    item => item.happyCategory === 'humanity-kindness',
src\services\kindness-data.ts:28:  for (const item of kindnessItems) {
src\services\kindness-data.ts:48: * Fetch kindness data: real kindness events extracted from curated news.
server\worldmonitor\resilience\v1\_shared.ts:273:      freshness: { lastObservedAtMs: number; staleness: '' | 'fresh' | 'aging' | 'stale' };
server\worldmonitor\resilience\v1\_shared.ts:289:      lastObservedAtMs: String(scores[dimensionId].freshness.lastObservedAtMs),
server\worldmonitor\resilience\v1\_indicator-registry.ts:662:    description: 'Unrest event count (severity-weighted) + sqrt(fatalities)',
server\worldmonitor\resilience\v1\_dimension-scorers.ts:53:  // (`{ lastObservedAtMs: 0, staleness: '' }`); `scoreAllDimensions`
server\worldmonitor\resilience\v1\_dimension-scorers.ts:56:  freshness: { lastObservedAtMs: number; staleness: '' | 'fresh' | 'aging' | 'stale' };
server\worldmonitor\resilience\v1\_dimension-scorers.ts:212:  severity?: string;
server\worldmonitor\resilience\v1\_dimension-scorers.ts:219:  severity?: string;
server\worldmonitor\resilience\v1\_dimension-scorers.ts:231:  severity?: string;
server\worldmonitor\resilience\v1\_dimension-scorers.ts:568:    return { score: 0, coverage: 0, observedWeight: 0, imputedWeight: 0, imputationClass: null, freshness: { lastObservedAtMs: 0, staleness: '' } };
server\worldmonitor\resilience\v1\_dimension-scorers.ts:623:    freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:772:    const severity = String(item.severity || '').toUpperCase();
server\worldmonitor\resilience\v1\_dimension-scorers.ts:773:    if (severity.includes('TOTAL') || severity === 'NATIONWIDE') summary.total += 1;
server\worldmonitor\resilience\v1\_dimension-scorers.ts:774:    else if (severity.includes('MAJOR') || severity === 'REGIONAL') summary.major += 1;
server\worldmonitor\resilience\v1\_dimension-scorers.ts:810:      return sum + (SEVERITY_WEIGHT[String(threat.severity || '')] ?? 1);
server\worldmonitor\resilience\v1\_dimension-scorers.ts:821:    const severity = String(item.severity || '').toUpperCase();
server\worldmonitor\resilience\v1\_dimension-scorers.ts:822:    const severityWeight = severity.includes('HIGH') ? 2 : severity.includes('MEDIUM') ? 1.2 : 1;
server\worldmonitor\resilience\v1\_dimension-scorers.ts:823:    summary.unrestCount += severityWeight;
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1017:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1027:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1037:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1053:    freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1554:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1588:    freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1612:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1668:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1680:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1712:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1737:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1774:      freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1865:    freshness: { lastObservedAtMs: 0, staleness: '' },
server\worldmonitor\resilience\v1\_dimension-scorers.ts:1930:              freshness: { lastObservedAtMs: 0, staleness: '' },
src\generated\client\worldmonitor\forecast\v1\service_client.ts:110:  kind: string;
server\worldmonitor\resilience\v1\_dimension-freshness.ts:15://   - lastObservedAtMs: MIN (oldest) fetchedAt across the dimension's
server\worldmonitor\resilience\v1\_dimension-freshness.ts:30:  lastObservedAtMs: number;
server\worldmonitor\resilience\v1\_dimension-freshness.ts:140: * `stale` + `lastObservedAtMs: 0`.
server\worldmonitor\resilience\v1\_dimension-freshness.ts:157:    return { lastObservedAtMs: 0, staleness: '' };
server\worldmonitor\resilience\v1\_dimension-freshness.ts:164:    const lastObservedAtMs = freshnessMap.get(indicator.sourceKey) ?? null;
server\worldmonitor\resilience\v1\_dimension-freshness.ts:166:      lastObservedAtMs,
server\worldmonitor\resilience\v1\_dimension-freshness.ts:173:    if (lastObservedAtMs != null && Number.isFinite(lastObservedAtMs) && lastObservedAtMs < oldestMs) {
server\worldmonitor\resilience\v1\_dimension-freshness.ts:174:      oldestMs = lastObservedAtMs;
server\worldmonitor\resilience\v1\_dimension-freshness.ts:179:    lastObservedAtMs: Number.isFinite(oldestMs) ? oldestMs : 0,
src\services\infrastructure\index.ts:67:    severity: SEVERITY_REVERSE[proto.severity] || 'partial',
src\services\military-surge.ts:500:  severity: 'critical' | 'high' | 'medium' | 'low';
src\services\military-surge.ts:534:  const severity = isCritical ? 'critical' :
src\services\military-surge.ts:588:    severity,
src\services\military-surge.ts:614:  severity: 'critical' | 'high' | 'medium' | 'low';
src\services\military-surge.ts:634:  const severity = surge.surgeMultiple >= 4 ? 'critical' :
src\services\military-surge.ts:656:    severity,
src\generated\server\worldmonitor\intelligence\v1\service_server.ts:99:  severity: SeverityLevel;
src\generated\server\worldmonitor\intelligence\v1\service_server.ts:428:  severity: CrossSourceSignalSeverity;
src\generated\server\worldmonitor\intelligence\v1\service_server.ts:429:  severityScore: number;
src\generated\server\worldmonitor\intelligence\v1\service_server.ts:731:  severity: string;
src\services\military-bases.ts:43:    kind: e.kind,
src\services\military-bases.ts:61:  filters?: { type?: string; kind?: string; country?: string },
src\services\military-bases.ts:65:  const cacheKey = `${qBbox}:${floorZoom}:${filters?.type || ''}:${filters?.kind || ''}:${filters?.country || ''}`;
src\services\military-bases.ts:79:        kind: filters?.kind || '',
src\generated\server\worldmonitor\infrastructure\v1\service_server.ts:26:  severity: OutageSeverity;
src\generated\server\worldmonitor\infrastructure\v1\service_server.ts:78:  severity: string;
src\generated\server\worldmonitor\infrastructure\v1\service_server.ts:171:  severity: string;
src\services\positive-classifier.ts:10:  'humanity-kindness': 'Humanity & Kindness',
src\services\positive-classifier.ts:19:  'humanity-kindness',
src\services\positive-classifier.ts:31:  'GNN Heroes': 'humanity-kindness',
src\services\positive-classifier.ts:89:  ['volunteer', 'humanity-kindness'],
src\services\positive-classifier.ts:90:  ['donated', 'humanity-kindness'],
src\services\positive-classifier.ts:91:  ['charity', 'humanity-kindness'],
src\services\positive-classifier.ts:92:  ['rescued', 'humanity-kindness'],
src\services\positive-classifier.ts:93:  ['hero', 'humanity-kindness'],
src\services\positive-classifier.ts:94:  ['kindness', 'humanity-kindness'],
src\services\positive-classifier.ts:95:  ['helping', 'humanity-kindness'],
src\services\positive-classifier.ts:96:  ['community', 'humanity-kindness'],
src\services\positive-classifier.ts:111: * Returns the first matching category, or 'humanity-kindness' as default
src\services\positive-classifier.ts:120:  return 'humanity-kindness'; // default for curated positive sources
src\services\positive-events-geo.ts:43:      category: (event.category || 'humanity-kindness') as HappyContentCategory,
src\services\positive-events-geo.ts:67:        category: item.category || 'humanity-kindness',
src\services\radiation.ts:34:  severity: RadiationSeverity;
src\services\radiation.ts:97:    severity: mapSeverity(raw.severity),
src\services\radiation.ts:172:function mapSeverity(severity: ProtoRadiationSeverity): RadiationSeverity {
src\services\radiation.ts:173:  switch (severity) {
server\worldmonitor\maritime\v1\get-vessel-snapshot.ts:131:      severity: SEVERITY_MAP[d.severity] || 'AIS_DISRUPTION_SEVERITY_UNSPECIFIED',
src\services\premium-fetch.ts:27:      tags: { kind: 'api_5xx' },
src\generated\client\worldmonitor\cyber\v1\service_client.ts:27:  severity: CriticalityLevel;
src\generated\client\worldmonitor\cyber\v1\service_client.ts:109:    if (req.minSeverity != null && req.minSeverity !== "CRITICALITY_LEVEL_UNSPECIFIED") params.set("min_severity", String(req.minSeverity));
src\generated\client\worldmonitor\resilience\v1\service_client.ts:44:  lastObservedAtMs: string;
src\services\maritime\index.ts:39:  const severity = SEVERITY_REVERSE[proto.severity];
src\services\maritime\index.ts:40:  if (!type || !severity) return null;
src\services\maritime\index.ts:47:    severity,
src\generated\server\worldmonitor\resilience\v1\service_server.ts:44:  lastObservedAtMs: string;
src\generated\client\worldmonitor\conflict\v1\service_client.ts:103:  severity: string;
src\generated\client\worldmonitor\radiation\v1\service_client.ts:35:  severity: RadiationSeverity;
src\services\signal-aggregator.ts:36:  severity: 'low' | 'medium' | 'high';
src\services\signal-aggregator.ts:128:        severity: o.severity === 'total' ? 'high' : o.severity === 'major' ? 'medium' : 'low',
src\services\signal-aggregator.ts:152:        severity: count >= 10 ? 'high' : count >= 5 ? 'medium' : 'low',
src\services\signal-aggregator.ts:181:        severity: data.count >= 5 ? 'high' : data.count >= 2 ? 'medium' : 'low',
src\services\signal-aggregator.ts:210:        severity: data.count >= 10 ? 'high' : data.count >= 5 ? 'medium' : 'low',
src\services\signal-aggregator.ts:223:      const severity: 'low' | 'medium' | 'high' = e.severity === 'elevated' ? 'medium' : e.severity;
src\services\signal-aggregator.ts:230:        severity,
src\services\signal-aggregator.ts:256:      const severity = fire.brightness > 360 ? 'high' : fire.brightness > 320 ? 'medium' : 'low';
src\services\signal-aggregator.ts:264:        severity,
src\services\signal-aggregator.ts:276:      if (observation.severity === 'normal') continue;
src\services\signal-aggregator.ts:285:        severity: observation.severity === 'spike' ? 'high' : 'medium',
src\services\signal-aggregator.ts:286:        title: `${observation.severity === 'spike' ? 'Radiation spike' : 'Elevated radiation'} at ${observation.location} (${observation.delta >= 0 ? '+' : ''}${observation.delta.toFixed(1)} ${observation.unit} vs baseline)`,
src\services\signal-aggregator.ts:307:    severity: 'medium' | 'high' | 'critical';
src\services\signal-aggregator.ts:325:        severity: a.severity === 'critical' ? 'high' : a.severity === 'high' ? 'high' : 'medium',
src\services\signal-aggregator.ts:340:      const severity: 'low' | 'medium' | 'high' =
src\services\signal-aggregator.ts:354:        severity,
src\services\signal-aggregator.ts:368:    severity: string;
src\services\signal-aggregator.ts:395:        const sev = e.severity.toLowerCase();
src\services\signal-aggregator.ts:408:        severity: highCount >= 5 ? 'high' : highCount >= 2 ? 'medium' : 'low',
src\services\signal-aggregator.ts:409:        title: `${capped.length} strikes (${highCount} high severity)`,
src\services\signal-aggregator.ts:466:          severity: p.postureLevel === 'critical' ? 'high' : 'medium',
src\services\signal-aggregator.ts:481:          severity: p.totalVessels >= 5 ? 'high' : 'medium',
src\services\signal-aggregator.ts:520:      const highCount = signals.filter(s => s.severity === 'high').length;
src\services\signal-aggregator.ts:524:      const severityBonus = highCount * 10;
src\services\signal-aggregator.ts:525:      const convergenceScore = Math.min(100, typeBonus + countBonus + severityBonus);
src\components\SignalMapStatusStrips.ts:2:import type { SignalMapEvent } from '@/types/signalmap';
src\components\SignalMapStatusStrips.ts:6:  events: SignalMapEvent[];
src\components\SignalMapStatusStrips.ts:7:  sourceHealth: SignalMapSourceHealth[];
src\components\SignalMapStatusStrips.ts:13:function hasRenderableMarker(event: SignalMapEvent): boolean {
src\components\SignalMapStatusStrips.ts:58:    const radarEvents = payload.events.filter((event) => event.kind === 'radar_outage' || event.kind === 'radar_anomaly');
src\components\SignalMapStatusStrips.ts:59:    const providerEvents = payload.events.filter((event) => event.kind === 'provider_status');
src\components\SignalMapStatusStrips.ts:60:    const watchedEvents = payload.events.filter((event) => event.watchlistMatch);
src\components\SignalMapStatusStrips.ts:62:    const degradedSources = payload.sourceHealth.filter((source) => statusClass(source.status) !== 'ok');
src\components\SignalMapStatusStrips.ts:63:    const radarCritical = radarEvents.filter((event) => event.severity === 'critical' || event.severity === 'high').length;
src\components\SignalMapStatusStrips.ts:66:      : `${payload.sourceHealth.length} sources nominal`;
src\services\signalmap.ts:3:  type ListSignalMapEventsRequest,
src\services\signalmap.ts:4:  type ListSignalMapEventsResponse,
src\services\signalmap.ts:5:  type SignalMapEvent as GeneratedSignalMapEvent,
src\services\signalmap.ts:21:  SignalMapEvent,
src\services\signalmap.ts:41:  events: SignalMapEvent[];
src\services\signalmap.ts:42:  sourceHealth: SignalMapSourceHealth[];
src\services\signalmap.ts:50:type SignalMapClient = Pick<SignalMapServiceClient, 'listSignalMapEvents'>;
src\services\signalmap.ts:52:type SignalMapEventsRequestOptions = {
src\services\signalmap.ts:61:type FetchSignalMapStateOptions = SignalMapEventsRequestOptions & {
src\services\signalmap.ts:108:export function buildSignalMapEventsRequest(
src\services\signalmap.ts:109:  options: SignalMapEventsRequestOptions = {},
src\services\signalmap.ts:110:): ListSignalMapEventsRequest {
src\services\signalmap.ts:134:function normalizeEvent(event: GeneratedSignalMapEvent): SignalMapEvent | null {
src\services\signalmap.ts:137:    !isSignalMapSeverity(event.severity) ||
src\services\signalmap.ts:138:    !VALID_KINDS.has(event.kind as SignalMapKind)
src\services\signalmap.ts:158:    severity: event.severity,
src\services\signalmap.ts:164:    lastObservedAt: event.lastObservedAt,
src\services\signalmap.ts:176:    kind: event.kind as SignalMapKind,
src\services\signalmap.ts:177:    watchlistMatch: event.watchlistMatch,
src\services\signalmap.ts:182:function normalizeSourceHealth(response: ListSignalMapEventsResponse): SignalMapSourceHealth[] {
src\services\signalmap.ts:183:  return response.sourceHealth.map((source) => ({
src\services\signalmap.ts:196:    sourceHealth: [{
src\services\signalmap.ts:217:  const request = buildSignalMapEventsRequest({ ...options, now: requestedAt, watchlist });
src\services\signalmap.ts:224:    const response = await client.listSignalMapEvents(request, { signal: options.signal });
src\services\signalmap.ts:227:      .filter((event): event is SignalMapEvent => event !== null);
src\services\signalmap.ts:234:      sourceHealth: normalizeSourceHealth(response),
src\components\SignalMapShell.ts:25:import type { SignalMapCategory, SignalMapEvent, SignalMapSeverity } from '@/types/signalmap';
src\components\SignalMapShell.ts:28:  events: SignalMapEvent[];
src\components\SignalMapShell.ts:29:  sourceHealth: SignalMapSourceHealth[];
src\components\SignalMapShell.ts:36:const severityRank: Record<SignalMapSeverity, number> = {
src\components\SignalMapShell.ts:44:function toPanelSeverity(severity: SignalMapSeverity | null): PanelSeverity {
src\components\SignalMapShell.ts:45:  if (severity === 'critical') return 'critical';
src\components\SignalMapShell.ts:46:  if (severity === 'high') return 'high';
src\components\SignalMapShell.ts:47:  if (severity === 'medium') return 'medium';
src\components\SignalMapShell.ts:48:  if (severity === 'low' || severity === 'info') return 'low';
src\components\SignalMapShell.ts:83:function matchesSearch(event: SignalMapEvent, query: string): boolean {
src\components\SignalMapShell.ts:90:    event.severity,
src\components\SignalMapShell.ts:111:    sourceHealth: [],
src\components\SignalMapShell.ts:193:      sourceHealth: Array.isArray(payload.sourceHealth) ? payload.sourceHealth : [],
src\components\SignalMapShell.ts:271:  private getFilteredEvents(): SignalMapEvent[] {
src\components\SignalMapShell.ts:278:  private getHighestSeverity(events: readonly SignalMapEvent[]): SignalMapSeverity | null {
src\components\SignalMapShell.ts:281:      if (!highest || severityRank[event.severity] > severityRank[highest]) {
src\components\SignalMapShell.ts:282:        highest = event.severity;
src\services\signalmap-watchlist.ts:11:import type { SignalMapEvent } from '@/types/signalmap';
src\services\signalmap-watchlist.ts:125:function eventMatchesProvider(event: SignalMapEvent, state: SignalMapWatchlistState): boolean {
src\services\signalmap-watchlist.ts:131:function eventMatchesGlobalRegion(event: SignalMapEvent): boolean {
src\services\signalmap-watchlist.ts:141:function eventMatchesWatchedRegion(event: SignalMapEvent, state: SignalMapWatchlistState): boolean {
src\services\signalmap-watchlist.ts:166:  event: SignalMapEvent,
src\services\signalmap-watchlist.ts:173:  events: readonly SignalMapEvent[],
src\services\signalmap-watchlist.ts:175:): SignalMapEvent[] {
src\services\signalmap-watchlist.ts:178:    watchlistMatch: signalMapEventMatchesWatchlist(event, state),
src\services\signalmap-watchlist.ts:183:  events: readonly SignalMapEvent[],
src\services\signalmap-watchlist.ts:185:): SignalMapEvent[] {
src\services\signalmap-watchlist.ts:187:  const matchedEvents = annotatedEvents.filter((event) => event.watchlistMatch);
src\services\signalmap-watchlist.ts:188:  const unmatchedEvents = annotatedEvents.filter((event) => !event.watchlistMatch);
src\generated\server\worldmonitor\radiation\v1\service_server.ts:35:  severity: RadiationSeverity;
src\components\SignalMapInspector.ts:3:import type { SignalMapEvent } from '@/types/signalmap';
src\components\SignalMapInspector.ts:7:  sourceHealth: SignalMapSourceHealth[];
src\components\SignalMapInspector.ts:48:  setState(state: SignalMapInspectorState, selected: SignalMapEvent | null): void {
src\components\SignalMapInspector.ts:61:    const relatedHealth = state.sourceHealth.filter((source) => eventSourceIds.has(source.id));
src\components\SignalMapInspector.ts:62:    const healthRows = relatedHealth.length > 0 ? relatedHealth : state.sourceHealth.slice(0, 4);
src\components\SignalMapInspector.ts:66:        h('span', { className: `signalmap-inspector-severity severity-${selected.severity}` }, selected.severity),
src\components\SignalMapInspector.ts:67:        selected.watchlistMatch
src\components\SignalMapInspector.ts:90:          h('strong', {}, formatTime(selected.lastObservedAt)),
src\components\CountryBriefPanel.ts:35:  severity: ThreatLevel;
src\generated\server\worldmonitor\forecast\v1\service_server.ts:110:  kind: string;
src\components\SignalMapFeed.ts:2:import type { SignalMapEvent } from '@/types/signalmap';
src\components\SignalMapFeed.ts:15:function labelForKind(kind: SignalMapEvent['kind']): string {
src\components\SignalMapFeed.ts:16:  switch (kind) {
src\components\SignalMapFeed.ts:26:      return kind;
src\components\SignalMapFeed.ts:46:  setEvents(events: SignalMapEvent[], selectedId: string | null): void {
src\components\SignalMapFeed.ts:62:            `severity-${event.severity}`,
src\components\SignalMapFeed.ts:63:            event.watchlistMatch ? 'watchlist-match' : '',
src\components\SignalMapFeed.ts:71:            h('span', { className: 'signalmap-kind' }, labelForKind(event.kind)),
src\components\SignalMapFeed.ts:72:            h('span', { className: 'signalmap-time' }, formatObserved(event.lastObservedAt)),
src\components\SignalMapFeed.ts:77:            h('span', { className: 'signalmap-severity' }, event.severity),
src\components\SignalMapFeed.ts:80:            event.watchlistMatch ? h('span', { className: 'signalmap-watch-pill' }, 'Watchlist') : null,
src\components\ClimateAnomalyPanel.ts:38:      const severityOrder = { extreme: 0, moderate: 1, normal: 2 };
src\components\ClimateAnomalyPanel.ts:39:      return (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2);
src\components\ClimateAnomalyPanel.ts:46:      const sevClass = `severity-${a.severity}`;
src\components\ClimateAnomalyPanel.ts:47:      const rowClass = a.severity === 'extreme' ? ' climate-extreme-row' : '';
src\components\ClimateAnomalyPanel.ts:53:        <td><span class="climate-badge ${sevClass}">${t(`components.climate.severity.${a.severity}`)}</span></td>
src\components\ClimateAnomalyPanel.ts:65:              <th>${t('components.climate.severityLabel')}</th>
src\components\InternetDisruptionsPanel.ts:100:      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
src\components\InternetDisruptionsPanel.ts:108:    const severityColor = o.severity === 'total' ? '#ff2020' : o.severity === 'major' ? '#ff8800' : '#ffcc00';
src\components\InternetDisruptionsPanel.ts:109:    const badge = o.severity === 'total' ? 'NATIONWIDE' : o.severity === 'major' ? 'REGIONAL' : 'PARTIAL';
src\components\InternetDisruptionsPanel.ts:113:        h('span', { className: 'id-severity-dot', style: { color: severityColor } }, '●'),
src\components\InternetDisruptionsPanel.ts:115:        h('span', { className: `id-badge severity-${o.severity}` }, badge),
src\components\DeckGLMap.ts:131:import type { KindnessPoint } from '@/services/kindness-data';
src\components\DeckGLMap.ts:149:import type { SignalMapEvent } from '@/types/signalmap';
src\components\DeckGLMap.ts:458:  private signalMapEvents: SignalMapEvent[] = [];
src\components\DeckGLMap.ts:478:  private kindnessPoints: KindnessPoint[] = [];
src\components\DeckGLMap.ts:1121:        severity: p.severity,
src\components\DeckGLMap.ts:1135:        maxSeverityRank: props.severity === 'high' ? 2 : props.severity === 'medium' ? 1 : 0,
src\components\DeckGLMap.ts:1137:        highSeverityCount: props.severity === 'high' ? 1 : 0,
src\components\DeckGLMap.ts:1323:          maxSeverity: item.severity, hasRiot: item.eventType === 'riot',
src\components\DeckGLMap.ts:1330:          highSeverityCount: item.severity === 'high' ? 1 : 0,
src\components\DeckGLMap.ts:1484:    const filteredKindnessPoints = mapLayers.kindness ? this.filterByTimeCached(this.kindnessPoints, (p) => p.timestamp) : [];
src\components\DeckGLMap.ts:1537:    // centroid. Color by severity; click opens the FuelShortagePanel drawer
src\components\DeckGLMap.ts:1833:    // Kindness layer (happy variant -- green baseline pulses + real kindness events)
src\components\DeckGLMap.ts:1834:    if (mapLayers.kindness && filteredKindnessPoints.length > 0) {
src\components\DeckGLMap.ts:1888:      layers.push(...this.createSignalMapEventsLayer());
src\components\DeckGLMap.ts:2223:   * placed at the country centroid. Color by severity (confirmed = red,
src\components\DeckGLMap.ts:2234:      id?: string; country?: string; product?: string; severity?: string;
src\components\DeckGLMap.ts:2242:      severity: string;
src\components\DeckGLMap.ts:2252:    // severity counts and shows stale crisis data. Classifier writes
src\components\DeckGLMap.ts:2277:          severity: raw.severity || 'watch',
src\components\DeckGLMap.ts:2284:    const severityColor = (sev: string): [number, number, number, number] => {
src\components\DeckGLMap.ts:2296:      getFillColor: d => severityColor(d.severity),
src\components\DeckGLMap.ts:2298:      getRadius: d => d.severity === 'confirmed' ? 55000 : 38000,
src\components\DeckGLMap.ts:2527:        if (d.severity === 'severe') return 15000;
src\components\DeckGLMap.ts:2528:        if (d.severity === 'major') return 12000;
src\components\DeckGLMap.ts:2529:        if (d.severity === 'moderate') return 10000;
src\components\DeckGLMap.ts:2533:        if (d.severity === 'severe') return [255, 50, 50, 200] as [number, number, number, number];
src\components\DeckGLMap.ts:2534:        if (d.severity === 'major') return [255, 150, 0, 200] as [number, number, number, number];
src\components\DeckGLMap.ts:2535:        if (d.severity === 'moderate') return [255, 200, 100, 180] as [number, number, number, number];
src\components\DeckGLMap.ts:2784:      getRadius: (d: IranEvent) => getIranEventRadius(d.severity),
src\components\DeckGLMap.ts:2802:        if (d.severity === 'Extreme') return [255, 0, 0, 200] as [number, number, number, number];
src\components\DeckGLMap.ts:2803:        if (d.severity === 'Severe') return [255, 100, 0, 180] as [number, number, number, number];
src\components\DeckGLMap.ts:2804:        if (d.severity === 'Moderate') return [255, 170, 0, 160] as [number, number, number, number];
src\components\DeckGLMap.ts:2858:        switch (d.severity) {
src\components\DeckGLMap.ts:2866:        switch (d.severity) {
src\components\DeckGLMap.ts:2888:        const base = d.severity === 'spike' ? 26000 : 18000;
src\components\DeckGLMap.ts:2894:        d.severity === 'spike'
src\components\DeckGLMap.ts:2991:        // Color by severity/type
src\components\DeckGLMap.ts:2992:        if (d.severity === 'high' || d.type === 'spoofing') {
src\components\DeckGLMap.ts:2995:        if (d.severity === 'medium') {
src\components\DeckGLMap.ts:3017:        if (d.severity === 'fault') {
src\components\DeckGLMap.ts:3692:      || this.kindnessPoints.some(p => p.type === 'real');
src\components\DeckGLMap.ts:3806:  private createSignalMapEventsLayer(): ScatterplotLayer[] {
src\components\DeckGLMap.ts:3822:    const getPosition = (event: SignalMapEvent): [number, number] => {
src\components\DeckGLMap.ts:3832:    const watchlistEvents = markerEvents.filter((event) => event.watchlistMatch);
src\components\DeckGLMap.ts:3835:      layers.push(new ScatterplotLayer<SignalMapEvent>({
src\components\DeckGLMap.ts:3850:    layers.push(new ScatterplotLayer<SignalMapEvent>({
src\components\DeckGLMap.ts:3854:      getRadius: (event) => event.watchlistMatch ? 18000 : 14000,
src\components\DeckGLMap.ts:3856:        const rgb = SEVERITY_RGB[event.severity] ?? [59, 130, 246];
src\components\DeckGLMap.ts:3857:        return [...rgb, event.watchlistMatch ? 235 : 185] as [number, number, number, number];
src\components\DeckGLMap.ts:3859:      getLineColor: (event) => event.watchlistMatch ? [255, 255, 255, 230] : [15, 23, 42, 190],
src\components\DeckGLMap.ts:3876:        case 'humanity-kindness':
src\components\DeckGLMap.ts:3931:      id: 'kindness-layer',
src\components\DeckGLMap.ts:3944:      id: 'kindness-pulse',
src\components\DeckGLMap.ts:4197:        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.country)}${obj.kind ? ` · ${text(obj.kind)}` : ''}</div>` };
src\components\DeckGLMap.ts:4236:        const severity = String(obj.severity || 'watch').toUpperCase();
src\components\DeckGLMap.ts:4237:        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.country)} · ${text(obj.product)}</strong><br/>${text(obj.description)}<br/><strong>${text(severity)}</strong></div>` };
src\components\DeckGLMap.ts:4291:        const severityLabel = obj.severity === 'spike' ? t('components.deckgl.layers.radiationSpike') : t('components.deckgl.layers.radiationElevated');
src\components\DeckGLMap.ts:4295:        return { html: `<div class="deckgl-tooltip"><strong>${severityLabel}</strong><br/>${text(obj.location)}<br/>${Number(obj.value).toFixed(1)} ${text(obj.unit)} · ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs baseline<br/>${text(corroboration)}</div>` };
src\components\DeckGLMap.ts:4304:        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)} (${text(obj.iata)})</strong><br/>${text(obj.severity)}: ${text(obj.reason)}</div>` };
src\components\DeckGLMap.ts:4330:        return { html: `<div class="deckgl-tooltip"><strong>AIS ${text(obj.type || t('components.deckgl.tooltip.disruption'))}</strong><br/>${text(obj.severity)} ${t('popups.severity')}<br/>${text(obj.description)}</div>` };
src\components\DeckGLMap.ts:4335:        return { html: `<div class="deckgl-tooltip"><strong>${text(cableName)}</strong><br/>${text(obj.severity || t('components.deckgl.tooltip.advisory'))}<br/>${text(obj.description)}</div>` };
src\components\DeckGLMap.ts:4342:        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.event || t('components.deckgl.layers.weatherAlerts'))}</strong><br/>${text(obj.severity)}${area}</div>` };
src\components\DeckGLMap.ts:4351:        return { html: `<div class="deckgl-tooltip"><strong>${t('popups.cyberThreat.title')}</strong><br/>${text(obj.severity || t('components.deckgl.tooltip.medium'))} · ${text(obj.country || t('popups.unknown'))}</div>` };
src\components\DeckGLMap.ts:4357:        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.title)}</strong><br/>${text(obj.severity)} SignalMap event${obj.watchlistMatch ? '<br/><span style="opacity:.8">Watchlist match</span>' : ''}</div>` };
src\components\DeckGLMap.ts:4363:      case 'kindness-layer':
src\components\DeckGLMap.ts:5228:            { shape: shapes.circle('rgb(74, 222, 128)'), label: 'Act of Kindness', layerKey: 'kindness' },
src\components\DeckGLMap.ts:6169:  public setSignalMapEvents(events: SignalMapEvent[]): void {
src\components\DeckGLMap.ts:6181:    this.kindnessPoints = points;
src\components\IntelligenceGapBadge.ts:414:    // For alerts, provide actionable insight based on type and severity
server\worldmonitor\supply-chain\v1\_scoring.mjs:35: *   severity 3 (high)     → 15
server\worldmonitor\supply-chain\v1\_scoring.mjs:36: *   severity 2 (elevated)  → 10
server\worldmonitor\supply-chain\v1\_scoring.mjs:37: *   severity 1 (low)       → 5
server\worldmonitor\supply-chain\v1\_scoring.mjs:38: *   severity 0 (none)      → 0
src\components\CrossSourceSignalsPanel.ts:9:  severity: string;
src\components\CrossSourceSignalsPanel.ts:10:  severityScore: number;
src\components\CrossSourceSignalsPanel.ts:36:// Filled badge styles: bg + border + text per severity
src\components\CrossSourceSignalsPanel.ts:96:      infoTooltip: 'Aggregates 15+ real-time data streams every 15 minutes. Ranks cross-domain signals by severity and detects composite escalation when 3 or more signal categories co-fire in the same theater.',
src\components\CrossSourceSignalsPanel.ts:128:    const sevColor = SEVERITY_COLOR[sig.severity] ?? 'var(--text-dim)';
src\components\CrossSourceSignalsPanel.ts:129:    const sevBadgeStyle = SEVERITY_BADGE_STYLE[sig.severity] ?? SEVERITY_BADGE_STYLE.CROSS_SOURCE_SIGNAL_SEVERITY_LOW;
src\components\CrossSourceSignalsPanel.ts:154:              <span style="font-size:10px;padding:2px 6px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;${sevBadgeStyle}">${escapeHtml(SEVERITY_LABEL[sig.severity] ?? '')}</span>
src\components\CountryTimeline.ts:10:  severity?: 'low' | 'medium' | 'high' | 'critical';
src\components\CountryTimeline.ts:251:      .attr('r', (d) => SEVERITY_RADIUS[d.severity ?? 'medium'] ?? 5)
server\worldmonitor\news\v1\list-feed-digest.ts:47:/** Numeric severity values for importanceScore computation (0–100). */
server\worldmonitor\news\v1\list-feed-digest.ts:63:  severity: 0.55,
server\worldmonitor\news\v1\list-feed-digest.ts:111:    SEVERITY_SCORES[level] * SCORE_WEIGHTS.severity +
server\worldmonitor\news\v1\list-feed-digest.ts:534:    'severity', item.level,
src\services\temporal-baseline.ts:20:  severity: 'medium' | 'high' | 'critical';
src\services\temporal-baseline.ts:67:    severity: getSeverity(a.zScore),
src\services\temporal-baseline.ts:125:      severity: getSeverity(data.anomaly.zScore),
src\components\HeroSpotlightPanel.ts:8: * Displays a single featured story about an extraordinary person or act of kindness.
server\worldmonitor\cyber\v1\_shared.ts:219:  severity: string;
server\worldmonitor\cyber\v1\_shared.ts:242:    severity: threat.severity || 'medium',
server\worldmonitor\cyber\v1\_shared.ts:436:    severity: statusRaw === 'online' ? inferFeodoSeverity(record, malwareFamily) : 'medium',
server\worldmonitor\cyber\v1\_shared.ts:522:    severity: inferUrlhausSeverity(type, tags),
server\worldmonitor\cyber\v1\_shared.ts:582:  const severity = /cobaltstrike|cobalt.strike|brute.?ratel/i.test(description) ? 'high' : 'medium';
server\worldmonitor\cyber\v1\_shared.ts:593:    severity,
server\worldmonitor\cyber\v1\_shared.ts:650:      const severity = tags.some((t) => /ransomware|apt|c2|botnet/.test(t)) ? 'high' : 'medium';
server\worldmonitor\cyber\v1\_shared.ts:661:        severity,
server\worldmonitor\cyber\v1\_shared.ts:702:      const severity = score >= 95 ? 'critical' : (score >= 80 ? 'high' : 'medium');
server\worldmonitor\cyber\v1\_shared.ts:713:        severity,
server\worldmonitor\cyber\v1\_shared.ts:771:    severity: SEVERITY_MAP[raw.severity] || 'CRITICALITY_LEVEL_UNSPECIFIED',
src\components\CountryDeepDivePanel.ts:360:      tierBadge.setAttribute('title', `Source tier ${clampedTier}: reflects publication credibility (1 = top wire services, 4 = specialty/low-reach). Independent of article severity.`);
src\components\CountryDeepDivePanel.ts:363:      const severity = this.toThreatLevel(item.threat?.level);
src\components\CountryDeepDivePanel.ts:364:      const levelKey = severity === 'info' ? 'low' : severity === 'medium' ? 'moderate' : severity;
src\components\CountryDeepDivePanel.ts:365:      const severityLabel = t(`countryBrief.levels.${levelKey}`);
src\components\CountryDeepDivePanel.ts:366:      const sevBadge = this.badge(severityLabel.toUpperCase(), `cdp-severity-badge sev-${severity}`);
src\components\CountryDeepDivePanel.ts:367:      sevBadge.setAttribute('title', 'Article severity: how serious the event is. Independent of source tier.');
src\components\CountryDeepDivePanel.ts:1234:        registry: { shortages?: Record<string, { country?: string; product?: string; severity?: string; id?: string; shortDescription?: string; resolvedAt?: string | null }> } | undefined;
src\components\CountryDeepDivePanel.ts:1238:      // confirmed/watch severity line. Classifier writes resolvedAt on
src\components\CountryDeepDivePanel.ts:1243:        const confirmedCount = shortages.filter(s => s.severity === 'confirmed').length;
src\components\CountryDeepDivePanel.ts:1244:        const severityLine = confirmedCount > 0
src\components\CountryDeepDivePanel.ts:1249:          severityLine,
src\components\CountryDeepDivePanel.ts:2562:    this.signalRecentBody.append(this.makeLoading('Loading top high-severity signals…'));
src\components\CountryDeepDivePanel.ts:2631:        this.badge(item.severity.toUpperCase(), `cdp-severity-badge sev-${item.severity}`),
server\worldmonitor\cyber\v1\list-cyber-threats.ts:42:    results = results.filter((t) => (SEVERITY_RANK[t.severity || ''] || 0) >= minRank);
src\components\ForecastPanel.ts:788:    kind?: string;
src\components\ForecastPanel.ts:806:          <strong>${escapeHtml(branch.title || branch.kind || 'Branch')}</strong>
src\components\FuelShortagePanel.ts:46:function severityChip(severity: string): string {
src\components\FuelShortagePanel.ts:47:  const color = SEVERITY_COLOR[severity] ?? '#7f8c8d';
src\components\FuelShortagePanel.ts:48:  const label = severity.charAt(0).toUpperCase() + severity.slice(1);
src\components\FuelShortagePanel.ts:89:    severity: str(r.severity, 'watch'),
src\components\FuelShortagePanel.ts:164:        void client.listFuelShortages({ country: '', product: '', severity: '' }).then(live => {
src\components\FuelShortagePanel.ts:179:      const live = await client.listFuelShortages({ country: '', product: '', severity: '' });
src\components\FuelShortagePanel.ts:234:        const aConf = a.severity === 'confirmed' ? 0 : 1;
src\components\FuelShortagePanel.ts:235:        const bConf = b.severity === 'confirmed' ? 0 : 1;
src\components\FuelShortagePanel.ts:246:    const confirmed = this.data.shortages.filter(s => s.severity === 'confirmed').length;
src\components\FuelShortagePanel.ts:247:    const watch = this.data.shortages.filter(s => s.severity === 'watch').length;
src\components\FuelShortagePanel.ts:330:        <td>${severityChip(s.severity)}</td>
src\components\FuelShortagePanel.ts:363:        <h3>${escapeHtml(s.country)} · ${escapeHtml(s.product)} ${severityChip(s.severity)}</h3>
src\services\unrest\index.ts:70:    severity: mapSeverity(e.severity),
src\services\unrest\index.ts:116:    return { events, byCountry, highSeverityCount: events.filter(e => e.severity === 'high').length, sources: { acled: acledCount, gdelt: gdeltCount } };
src\services\unrest\index.ts:161:    highSeverityCount: events.filter(e => e.severity === 'high').length,
server\worldmonitor\supply-chain\v1\list-fuel-shortages.ts:66:    severity: coerceString(r.severity, 'watch'),
server\worldmonitor\supply-chain\v1\list-fuel-shortages.ts:81:  if (req.severity && entry.severity !== req.severity) return false;
src\components\GlobeMap.ts:13: *  - All markers via htmlElementsData (single merged array with _kind discriminator)
src\components\GlobeMap.ts:40:import type { SignalMapEvent } from '@/types/signalmap';
src\components\GlobeMap.ts:63:  _kind: string;
src\components\GlobeMap.ts:68:  _kind: 'conflict';
src\components\GlobeMap.ts:75:  _kind: 'hotspot';
src\components\GlobeMap.ts:81:  _kind: 'flight';
src\components\GlobeMap.ts:88:  _kind: 'vessel';
src\components\GlobeMap.ts:106:  _kind: 'cluster';
src\components\GlobeMap.ts:114:  _kind: 'weather';
src\components\GlobeMap.ts:116:  severity: string;
src\components\GlobeMap.ts:120:  _kind: 'natural';
src\components\GlobeMap.ts:126:  _kind: 'iran';
src\components\GlobeMap.ts:130:  severity: string;
src\components\GlobeMap.ts:134:  _kind: 'outage';
src\components\GlobeMap.ts:137:  severity: string;
src\components\GlobeMap.ts:141:  _kind: 'trafficAnomaly';
src\components\GlobeMap.ts:147:  _kind: 'ddosHit';
src\components\GlobeMap.ts:153:  _kind: 'cyber';
src\components\GlobeMap.ts:156:  severity: string;
src\components\GlobeMap.ts:160:  _kind: 'fire';
src\components\GlobeMap.ts:166:  _kind: 'protest';
src\components\GlobeMap.ts:173:  _kind: 'ucdp';
src\components\GlobeMap.ts:181:  _kind: 'displacement';
src\components\GlobeMap.ts:188:  _kind: 'climate';
src\components\GlobeMap.ts:192:  severity: string;
src\components\GlobeMap.ts:196:  _kind: 'gpsjam';
src\components\GlobeMap.ts:202:  _kind: 'tech';
src\components\GlobeMap.ts:209:  _kind: 'conflictZone';
src\components\GlobeMap.ts:217:  _kind: 'milbase';
src\components\GlobeMap.ts:224:  _kind: 'nuclearSite';
src\components\GlobeMap.ts:231:  _kind: 'irradiator';
src\components\GlobeMap.ts:237:  _kind: 'spaceport';
src\components\GlobeMap.ts:245:  _kind: 'earthquake';
src\components\GlobeMap.ts:251:  _kind: 'radiation';
src\components\GlobeMap.ts:264:  severity: 'normal' | 'elevated' | 'spike';
src\components\GlobeMap.ts:272:  _kind: 'economic';
src\components\GlobeMap.ts:280:  _kind: 'datacenter';
src\components\GlobeMap.ts:288:  _kind: 'waterway';
src\components\GlobeMap.ts:294:  _kind: 'mineral';
src\components\GlobeMap.ts:302:  _kind: 'flightDelay';
src\components\GlobeMap.ts:308:  severity: string;
src\components\GlobeMap.ts:314:  _kind: 'notamRing';
src\components\GlobeMap.ts:319:  _kind: 'newsLocation';
src\components\GlobeMap.ts:325:  _kind: 'signalMap';
src\components\GlobeMap.ts:328:  severity: SignalMapEvent['severity'];
src\components\GlobeMap.ts:329:  watchlistMatch: boolean;
src\components\GlobeMap.ts:332:  _kind: 'flash';
src\components\GlobeMap.ts:336:  _kind: 'cableAdvisory';
src\components\GlobeMap.ts:340:  severity: string;
src\components\GlobeMap.ts:345:  _kind: 'repairShip';
src\components\GlobeMap.ts:353:  _kind: 'aisDisruption';
src\components\GlobeMap.ts:357:  severity: AisDisruptionEvent['severity'];
src\components\GlobeMap.ts:361:  _kind: 'satellite';
src\components\GlobeMap.ts:371:  _kind: 'satFootprint';
src\components\GlobeMap.ts:376:  _kind: 'imageryScene';
src\components\GlobeMap.ts:384:  _kind: 'webcam';
src\components\GlobeMap.ts:391:  _kind: 'webcam-cluster';
src\components\GlobeMap.ts:407:  _kind: 'cii' | 'conflict' | 'imageryFootprint' | 'forecastCone' | 'scenario';
src\components\GlobeMap.ts:739:        if (m._kind === 'satFootprint') return 0;
src\components\GlobeMap.ts:740:        if (m._kind === 'satellite') return (m as SatelliteMarker).alt / 6371;
src\components\GlobeMap.ts:741:        if (m._kind === 'flight' || m._kind === 'vessel' || m._kind === 'cluster') return 0.012;
src\components\GlobeMap.ts:742:        if (m._kind === 'hotspot') return 0.005;
src\components\GlobeMap.ts:837:        if (d._kind === 'cii') return GlobeMap.CII_GLOBE_COLORS[d.level!] ?? 'rgba(0,0,0,0)';
src\components\GlobeMap.ts:838:        if (d._kind === 'conflict') return GlobeMap.CONFLICT_CAP[d.intensity!] ?? GlobeMap.CONFLICT_CAP.low;
src\components\GlobeMap.ts:839:        if (d._kind === 'imageryFootprint') return 'rgba(0,0,0,0)';
src\components\GlobeMap.ts:840:        if (d._kind === 'forecastCone') return 'rgba(255,140,60,0.2)';
src\components\GlobeMap.ts:841:        if (d._kind === 'scenario') return 'rgba(220,60,40,0.3)';
src\components\GlobeMap.ts:845:        if (d._kind === 'cii') return 'rgba(0,0,0,0)';
src\components\GlobeMap.ts:846:        if (d._kind === 'conflict') return GlobeMap.CONFLICT_SIDE[d.intensity!] ?? GlobeMap.CONFLICT_SIDE.low;
src\components\GlobeMap.ts:847:        if (d._kind === 'imageryFootprint') return 'rgba(0,0,0,0)';
src\components\GlobeMap.ts:848:        if (d._kind === 'forecastCone') return 'rgba(255,140,60,0.1)';
src\components\GlobeMap.ts:849:        if (d._kind === 'scenario') return 'rgba(0,0,0,0)';
src\components\GlobeMap.ts:853:        if (d._kind === 'cii') return 'rgba(80,80,80,0.3)';
src\components\GlobeMap.ts:854:        if (d._kind === 'conflict') return GlobeMap.CONFLICT_STROKE[d.intensity!] ?? GlobeMap.CONFLICT_STROKE.low;
src\components\GlobeMap.ts:855:        if (d._kind === 'imageryFootprint') return '#00b4ff';
src\components\GlobeMap.ts:856:        if (d._kind === 'forecastCone') return 'rgba(255,140,60,0.5)';
src\components\GlobeMap.ts:857:        if (d._kind === 'scenario') return 'transparent';
src\components\GlobeMap.ts:861:        if (d._kind === 'cii') return 0.002;
src\components\GlobeMap.ts:862:        if (d._kind === 'conflict') return GlobeMap.CONFLICT_ALT[d.intensity!] ?? GlobeMap.CONFLICT_ALT.low;
src\components\GlobeMap.ts:866:        if (d._kind === 'cii') return `<b>${escapeHtml(d.name)}</b><br/>CII: ${d.score}/100 (${escapeHtml(d.level ?? '')})`;
src\components\GlobeMap.ts:867:        if (d._kind === 'conflict') {
src\components\GlobeMap.ts:873:        if (d._kind === 'imageryFootprint') {
src\components\GlobeMap.ts:953:    if (d._kind === 'conflict') {
src\components\GlobeMap.ts:970:    } else if (d._kind === 'hotspot') {
src\components\GlobeMap.ts:982:    } else if (d._kind === 'flight') {
src\components\GlobeMap.ts:990:    } else if (d._kind === 'vessel') {
src\components\GlobeMap.ts:1010:    } else if (d._kind === 'cluster') {
src\components\GlobeMap.ts:1020:    } else if (d._kind === 'weather') {
src\components\GlobeMap.ts:1021:      const severityColors: Record<string, string> = {
src\components\GlobeMap.ts:1024:      const c = severityColors[d.severity] ?? '#88aaff';
src\components\GlobeMap.ts:1027:    } else if (d._kind === 'radiation') {
src\components\GlobeMap.ts:1028:      const c = d.severity === 'spike' ? '#ff3030' : '#ffaa00';
src\components\GlobeMap.ts:1029:      const ring = d.severity === 'spike'
src\components\GlobeMap.ts:1038:      el.title = `${d.location} · ${d.severity} · ${d.confidence}`;
src\components\GlobeMap.ts:1039:    } else if (d._kind === 'natural') {
src\components\GlobeMap.ts:1047:    } else if (d._kind === 'iran') {
src\components\GlobeMap.ts:1055:    } else if (d._kind === 'outage') {
src\components\GlobeMap.ts:1056:      const sc = d.severity === 'total' ? '#ff2020' : d.severity === 'major' ? '#ff8800' : '#ffcc00';
src\components\GlobeMap.ts:1059:    } else if (d._kind === 'trafficAnomaly') {
src\components\GlobeMap.ts:1062:    } else if (d._kind === 'ddosHit') {
src\components\GlobeMap.ts:1065:    } else if (d._kind === 'cyber') {
src\components\GlobeMap.ts:1066:      const sc = d.severity === 'critical' ? '#ff0044' : d.severity === 'high' ? '#ff4400' : d.severity === 'medium' ? '#ffaa00' : '#44aaff';
src\components\GlobeMap.ts:1069:    } else if (d._kind === 'fire') {
src\components\GlobeMap.ts:1073:    } else if (d._kind === 'protest') {
src\components\GlobeMap.ts:1081:    } else if (d._kind === 'ucdp') {
src\components\GlobeMap.ts:1088:    } else if (d._kind === 'displacement') {
src\components\GlobeMap.ts:1091:    } else if (d._kind === 'climate') {
src\components\GlobeMap.ts:1096:    } else if (d._kind === 'gpsjam') {
src\components\GlobeMap.ts:1100:    } else if (d._kind === 'tech') {
src\components\GlobeMap.ts:1103:    } else if (d._kind === 'conflictZone') {
src\components\GlobeMap.ts:1119:    } else if (d._kind === 'milbase') {
src\components\GlobeMap.ts:1135:    } else if (d._kind === 'nuclearSite') {
src\components\GlobeMap.ts:1138:    } else if (d._kind === 'irradiator') {
src\components\GlobeMap.ts:1141:    } else if (d._kind === 'spaceport') {
src\components\GlobeMap.ts:1144:    } else if (d._kind === 'earthquake') {
src\components\GlobeMap.ts:1149:    } else if (d._kind === 'economic') {
src\components\GlobeMap.ts:1153:    } else if (d._kind === 'datacenter') {
src\components\GlobeMap.ts:1156:    } else if (d._kind === 'waterway') {
src\components\GlobeMap.ts:1159:    } else if (d._kind === 'mineral') {
src\components\GlobeMap.ts:1162:    } else if (d._kind === 'flightDelay') {
src\components\GlobeMap.ts:1163:      const sc = d.severity === 'severe' ? '#ff2020' : d.severity === 'major' ? '#ff6600' : d.severity === 'moderate' ? '#ffaa00' : '#ffee44';
src\components\GlobeMap.ts:1165:      el.title = `${d.iata} — ${d.severity}`;
src\components\GlobeMap.ts:1166:    } else if (d._kind === 'notamRing') {
src\components\GlobeMap.ts:1169:    } else if (d._kind === 'cableAdvisory') {
src\components\GlobeMap.ts:1170:      const sc = d.severity === 'fault' ? '#ff2020' : '#ff8800';
src\components\GlobeMap.ts:1172:      el.title = `${d.title} (${d.severity})`;
src\components\GlobeMap.ts:1173:    } else if (d._kind === 'repairShip') {
src\components\GlobeMap.ts:1177:    } else if (d._kind === 'newsLocation') {
src\components\GlobeMap.ts:1188:    } else if (d._kind === 'signalMap') {
src\components\GlobeMap.ts:1189:      const sc = d.severity === 'critical' ? '#ef4444'
src\components\GlobeMap.ts:1190:        : d.severity === 'high' ? '#f97316'
src\components\GlobeMap.ts:1191:        : d.severity === 'medium' ? '#eab308'
src\components\GlobeMap.ts:1192:        : d.severity === 'low' ? '#22c55e'
src\components\GlobeMap.ts:1194:      const watchRing = d.watchlistMatch
src\components\GlobeMap.ts:1198:        <div style="position:relative;width:${d.watchlistMatch ? 14 : 11}px;height:${d.watchlistMatch ? 14 : 11}px;">
src\components\GlobeMap.ts:1202:      el.title = `${d.title} (${d.severity})${d.watchlistMatch ? ' - Watchlist match' : ''}`;
src\components\GlobeMap.ts:1203:    } else if (d._kind === 'aisDisruption') {
src\components\GlobeMap.ts:1204:      const sc = d.severity === 'high' ? '#ff2020' : d.severity === 'elevated' ? '#ff8800' : '#44aaff';
src\components\GlobeMap.ts:1207:    } else if (d._kind === 'satellite') {
src\components\GlobeMap.ts:1211:    } else if (d._kind === 'satFootprint') {
src\components\GlobeMap.ts:1216:    } else if (d._kind === 'imageryScene') {
src\components\GlobeMap.ts:1219:    } else if (d._kind === 'webcam') {
src\components\GlobeMap.ts:1224:    } else if (d._kind === 'webcam-cluster') {
src\components\GlobeMap.ts:1227:    } else if (d._kind === 'flash') {
src\components\GlobeMap.ts:1247:    if (d._kind === 'hotspot' && this.onHotspotClickCb) {
src\components\GlobeMap.ts:1258:    if (d._kind === 'flight' && this.popup) {
src\components\GlobeMap.ts:1272:    if (d._kind === 'vessel' && this.popup) {
src\components\GlobeMap.ts:1285:    if (d._kind === 'cluster' && this.popup) {
src\components\GlobeMap.ts:1298:    if (d._kind === 'webcam-cluster' && this.globe) {
src\components\GlobeMap.ts:1303:    if (d._kind === 'radiation' && this.popup) {
src\components\GlobeMap.ts:1326:          severity: d.severity,
src\components\GlobeMap.ts:1364:    if (d._kind === 'conflict') {
src\components\GlobeMap.ts:1368:    } else if (d._kind === 'hotspot') {
src\components\GlobeMap.ts:1372:    } else if (d._kind === 'flight') {
src\components\GlobeMap.ts:1378:    } else if (d._kind === 'vessel') {
src\components\GlobeMap.ts:1409:    } else if (d._kind === 'cluster') {
src\components\GlobeMap.ts:1417:    } else if (d._kind === 'weather') {
src\components\GlobeMap.ts:1418:      const wc = d.severity === 'Extreme' ? '#ff0044' : d.severity === 'Severe' ? '#ff6600' : '#88aaff';
src\components\GlobeMap.ts:1419:      html = `<span style="color:${wc};font-weight:bold;">⚡ ${esc(d.severity)}</span>` +
src\components\GlobeMap.ts:1421:    } else if (d._kind === 'radiation') {
src\components\GlobeMap.ts:1422:      const rc = d.severity === 'spike' ? '#ff3030' : '#ffaa00';
src\components\GlobeMap.ts:1423:      html = `<span style="color:${rc};font-weight:bold;">☢ ${esc(d.severity.toUpperCase())}</span>` +
src\components\GlobeMap.ts:1427:    } else if (d._kind === 'natural') {
src\components\GlobeMap.ts:1430:    } else if (d._kind === 'iran') {
src\components\GlobeMap.ts:1434:    } else if (d._kind === 'outage') {
src\components\GlobeMap.ts:1435:      const sc = d.severity === 'total' ? '#ff2020' : d.severity === 'major' ? '#ff8800' : '#ffcc00';
src\components\GlobeMap.ts:1436:      html = `<span style="color:${sc};font-weight:bold;">📡 ${d.severity.toUpperCase()} Outage</span>` +
src\components\GlobeMap.ts:1439:    } else if (d._kind === 'trafficAnomaly') {
src\components\GlobeMap.ts:1442:    } else if (d._kind === 'ddosHit') {
src\components\GlobeMap.ts:1445:    } else if (d._kind === 'cyber') {
src\components\GlobeMap.ts:1446:      const sc = d.severity === 'critical' ? '#ff0044' : d.severity === 'high' ? '#ff4400' : '#ffaa00';
src\components\GlobeMap.ts:1447:      html = `<span style="color:${sc};font-weight:bold;">🛡 ${d.severity.toUpperCase()}</span>` +
src\components\GlobeMap.ts:1450:    } else if (d._kind === 'fire') {
src\components\GlobeMap.ts:1454:    } else if (d._kind === 'protest') {
src\components\GlobeMap.ts:1460:    } else if (d._kind === 'ucdp') {
src\components\GlobeMap.ts:1464:    } else if (d._kind === 'displacement') {
src\components\GlobeMap.ts:1468:    } else if (d._kind === 'climate') {
src\components\GlobeMap.ts:1472:             `<br><span style="opacity:.5;">ΔT: ${d.tempDelta > 0 ? '+' : ''}${d.tempDelta.toFixed(1)}°C · ${esc(d.severity)}</span>`;
src\components\GlobeMap.ts:1473:    } else if (d._kind === 'gpsjam') {
src\components\GlobeMap.ts:1478:    } else if (d._kind === 'tech') {
src\components\GlobeMap.ts:1482:    } else if (d._kind === 'conflictZone') {
src\components\GlobeMap.ts:1487:    } else if (d._kind === 'milbase') {
src\components\GlobeMap.ts:1490:    } else if (d._kind === 'nuclearSite') {
src\components\GlobeMap.ts:1494:    } else if (d._kind === 'irradiator') {
src\components\GlobeMap.ts:1497:    } else if (d._kind === 'spaceport') {
src\components\GlobeMap.ts:1502:    } else if (d._kind === 'earthquake') {
src\components\GlobeMap.ts:1506:    } else if (d._kind === 'economic') {
src\components\GlobeMap.ts:1511:    } else if (d._kind === 'datacenter') {
src\components\GlobeMap.ts:1515:    } else if (d._kind === 'waterway') {
src\components\GlobeMap.ts:1518:    } else if (d._kind === 'mineral') {
src\components\GlobeMap.ts:1523:    } else if (d._kind === 'flightDelay') {
src\components\GlobeMap.ts:1524:      const sc = d.severity === 'severe' ? '#ff3030' : d.severity === 'major' ? '#ff6600' : d.severity === 'moderate' ? '#ffaa00' : '#ffee44';
src\components\GlobeMap.ts:1525:      html = `<span style="color:${sc};font-weight:bold;">✈ ${esc(d.iata)} — ${esc(d.severity.toUpperCase())}</span>` +
src\components\GlobeMap.ts:1530:    } else if (d._kind === 'notamRing') {
src\components\GlobeMap.ts:1534:    } else if (d._kind === 'cableAdvisory') {
src\components\GlobeMap.ts:1535:      const sc = d.severity === 'fault' ? '#ff2020' : '#ff8800';
src\components\GlobeMap.ts:1536:      html = `<span style="color:${sc};font-weight:bold;">🔌 ${esc(d.severity.toUpperCase())} — ${esc(d.title.slice(0, 50))}</span>` +
src\components\GlobeMap.ts:1539:    } else if (d._kind === 'repairShip') {
src\components\GlobeMap.ts:1544:    } else if (d._kind === 'aisDisruption') {
src\components\GlobeMap.ts:1545:      const sc = d.severity === 'high' ? '#ff2020' : d.severity === 'elevated' ? '#ff8800' : '#44aaff';
src\components\GlobeMap.ts:1549:             `<br><span style="opacity:.5;">${esc(d.severity)} · ${esc(d.description.slice(0, 60))}</span>`;
src\components\GlobeMap.ts:1550:    } else if (d._kind === 'newsLocation') {
src\components\GlobeMap.ts:1554:    } else if (d._kind === 'satellite') {
src\components\GlobeMap.ts:1571:    } else if (d._kind === 'imageryScene') {
src\components\GlobeMap.ts:1584:    } else if (d._kind === 'webcam') {
src\components\GlobeMap.ts:1586:    } else if (d._kind === 'webcam-cluster') {
src\components\GlobeMap.ts:1591:    if (wideKinds.has(d._kind)) el.style.maxWidth = '300px';
src\components\GlobeMap.ts:1594:    if (d._kind === 'webcam') {
src\components\GlobeMap.ts:1671:    } else if (d._kind === 'webcam-cluster') {
src\components\GlobeMap.ts:1708:    const hideDelay = d._kind === 'webcam' ? 8000 : d._kind === 'webcam-cluster' ? 12000 : richKinds.has(d._kind) ? 6000 : 3500;
src\components\GlobeMap.ts:1711:    if (d._kind === 'webcam-cluster') {
src\components\GlobeMap.ts:1767:                _kind: 'webcam', _lat: webcam.lat, _lng: webcam.lng,
src\components\GlobeMap.ts:2082:                _kind: 'conflict',
src\components\GlobeMap.ts:2103:          polys.push({ coords: ring, name, _kind: 'cii', level: entry.level, score: entry.score });
src\components\GlobeMap.ts:2136:          this.scenarioPolygons.push({ coords: ring as number[][][], name: code, _kind: 'scenario' });
src\components\GlobeMap.ts:2150:      _kind: 'hotspot' as const,
src\components\GlobeMap.ts:2162:      _kind: 'conflictZone' as const,
src\components\GlobeMap.ts:2185:            _kind: 'milbase' as const,
src\components\GlobeMap.ts:2200:              _kind: 'nuclearSite' as const,
src\components\GlobeMap.ts:2213:            _kind: 'irradiator' as const,
src\components\GlobeMap.ts:2227:              _kind: 'spaceport' as const,
src\components\GlobeMap.ts:2241:            _kind: 'economic' as const,
src\components\GlobeMap.ts:2257:              _kind: 'datacenter' as const,
src\components\GlobeMap.ts:2271:            _kind: 'waterway' as const,
src\components\GlobeMap.ts:2285:              _kind: 'mineral' as const,
src\components\GlobeMap.ts:2329:      _kind: 'flight' as const,
src\components\GlobeMap.ts:2397:      _kind: 'vessel' as const,
src\components\GlobeMap.ts:2417:      _kind: 'cluster' as const,
src\components\GlobeMap.ts:2433:        _kind: 'weather' as const,
src\components\GlobeMap.ts:2437:        severity: a.severity ?? 'Minor',
src\components\GlobeMap.ts:2445:      _kind: 'natural' as const,
src\components\GlobeMap.ts:2489:            _kind: 'forecastCone',
src\components\GlobeMap.ts:2766:    this.flashMarkers.push({ _kind: 'flash', id, _lat: lat, _lng: lon });
src\components\GlobeMap.ts:2799:        _kind: 'earthquake' as const,
src\components\GlobeMap.ts:2811:      _kind: 'radiation' as const,
src\components\GlobeMap.ts:2826:      severity: observation.severity,
src\components\GlobeMap.ts:2851:        _kind: 'imageryScene' as const,
src\components\GlobeMap.ts:2866:        _kind: 'imageryFootprint' as const,
src\components\GlobeMap.ts:2907:      _kind: 'outage' as const,
src\components\GlobeMap.ts:2912:      severity: o.severity ?? 'partial',
src\components\GlobeMap.ts:2922:        _kind: 'trafficAnomaly' as const,
src\components\GlobeMap.ts:2936:        _kind: 'ddosHit' as const,
src\components\GlobeMap.ts:2951:        _kind: 'aisDisruption' as const,
src\components\GlobeMap.ts:2957:        severity: d.severity,
src\components\GlobeMap.ts:2966:        _kind: 'cableAdvisory' as const,
src\components\GlobeMap.ts:2972:        severity: a.severity,
src\components\GlobeMap.ts:2979:        _kind: 'repairShip' as const,
src\components\GlobeMap.ts:2988:    this.cableFaultIds    = new Set((advisories ?? []).filter(a => a.severity === 'fault').map(a => a.cableId));
src\components\GlobeMap.ts:2989:    this.cableDegradedIds = new Set((advisories ?? []).filter(a => a.severity === 'degraded').map(a => a.cableId));
src\components\GlobeMap.ts:2996:      _kind: 'protest' as const,
src\components\GlobeMap.ts:3008:      .filter(d => d.lat != null && d.lon != null && d.severity !== 'normal')
src\components\GlobeMap.ts:3010:        _kind: 'flightDelay' as const,
src\components\GlobeMap.ts:3018:        severity: d.severity,
src\components\GlobeMap.ts:3026:        _kind: 'notamRing' as const,
src\components\GlobeMap.ts:3038:        _kind: 'newsLocation' as const,
src\components\GlobeMap.ts:3047:  public setSignalMapEvents(events: SignalMapEvent[]): void {
src\components\GlobeMap.ts:3059:          _kind: 'signalMap' as const,
src\components\GlobeMap.ts:3064:          severity: event.severity,
src\components\GlobeMap.ts:3065:          watchlistMatch: event.watchlistMatch,
src\components\GlobeMap.ts:3082:      _kind: 'cyber' as const,
src\components\GlobeMap.ts:3087:      severity: t.severity ?? 'low',
src\components\GlobeMap.ts:3094:      _kind: 'iran' as const,
src\components\GlobeMap.ts:3100:      severity: e.severity ?? 'moderate',
src\components\GlobeMap.ts:3107:      _kind: 'fire' as const,
src\components\GlobeMap.ts:3119:        return { _kind: 'webcam-cluster' as const, _lat: m.lat, _lng: m.lng, count: m.count, categories: m.categories || [] };
src\components\GlobeMap.ts:3121:      return { _kind: 'webcam' as const, _lat: m.lat, _lng: m.lng, webcamId: m.webcamId, title: m.title, category: m.category || 'other', country: m.country || '' };
src\components\GlobeMap.ts:3127:      _kind: 'ucdp' as const,
src\components\GlobeMap.ts:3142:        _kind: 'displacement' as const,
src\components\GlobeMap.ts:3154:      _kind: 'climate' as const,
src\components\GlobeMap.ts:3160:      severity: a.severity ?? 'normal',
src\components\GlobeMap.ts:3167:      _kind: 'gpsjam' as const,
src\components\GlobeMap.ts:3291:      _kind: 'satellite' as const,
src\components\GlobeMap.ts:3304:      _kind: 'satFootprint' as const,
src\components\GlobeMap.ts:3328:      _kind: 'tech' as const,
src\services\weather.ts:8:  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
src\services\weather.ts:21:  severity: string;
src\services\weather.ts:37:    severity: a.severity as WeatherAlert['severity'],
src\services\weather.ts:69:export function getSeverityColor(severity: WeatherAlert['severity']): string {
src\services\weather.ts:70:  switch (severity) {
src\components\Panel.ts:201:  private severityDotEl: HTMLElement | null = null;
src\components\Panel.ts:256:    this.severityDotEl = document.createElement('span');
src\components\Panel.ts:257:    this.severityDotEl.className = 'panel-severity-dot';
src\components\Panel.ts:258:    this.severityDotEl.setAttribute('aria-hidden', 'true');
src\components\Panel.ts:259:    headerLeft.appendChild(this.severityDotEl);
src\components\Panel.ts:1023:   * Set the panel's severity level, controlling the header pulse dot speed.
src\components\Panel.ts:1029:    if (!this.severityDotEl) return;
src\components\Panel.ts:1030:    this.severityDotEl.className = 'panel-severity-dot';
src\components\Panel.ts:1032:      this.severityDotEl.classList.add(`severity-${level}`);
src\components\MapContainer.ts:37:import type { KindnessPoint } from '@/services/kindness-data';
src\components\MapContainer.ts:52:import type { SignalMapEvent } from '@/types/signalmap';
src\components\MapContainer.ts:142:  private cachedSignalMapEvents: SignalMapEvent[] | null = null;
src\components\MapContainer.ts:314:    if (this.cachedSignalMapEvents) this.setSignalMapEvents(this.cachedSignalMapEvents);
src\components\MapContainer.ts:653:  public setSignalMapEvents(events: SignalMapEvent[]): void {
src\components\MapContainer.ts:654:    this.cachedSignalMapEvents = events;
src\components\MapContainer.ts:665:    if (this.useGlobe) { this.globeMap?.setSignalMapEvents(events); return; }
src\components\MapContainer.ts:667:      this.deckGLMap?.setSignalMapEvents(events);
src\components\MapContainer.ts:669:      this.svgMap?.setSignalMapEvents(events);
src\components\MapContainer.ts:688:    // SVG map does not support kindness layer
server\worldmonitor\infrastructure\v1\list-temporal-anomalies.ts:146:              severity: getSeverity(zScore),
server\worldmonitor\infrastructure\v1\list-service-statuses.ts:145:      const hasHigh = active.some((i: any) => i.severity === 'high');
server\worldmonitor\intelligence\v1\list-cross-source-signals.ts:19:  severity?: string;
server\worldmonitor\intelligence\v1\list-cross-source-signals.ts:20:  severityScore?: number;
server\worldmonitor\intelligence\v1\list-cross-source-signals.ts:81:    severity: toSeverity(s.severity),
server\worldmonitor\intelligence\v1\list-cross-source-signals.ts:82:    severityScore: typeof s.severityScore === 'number' && Number.isFinite(s.severityScore) ? s.severityScore : 0,
src\components\Map.ts:63:import type { SignalMapEvent } from '@/types/signalmap';
src\components\Map.ts:154:  private signalMapEvents: SignalMapEvent[] = [];
src\components\Map.ts:413:      'positiveEvents', 'kindness', 'happiness', 'speciesRecovery', 'renewableInstallations',
src\components\Map.ts:986:    // (severity colors, emoji icons, magnitude sizing, animations)
src\components\Map.ts:1237:      const advisoryClass = cableAdvisory ? `cable-${cableAdvisory.severity}` : '';
src\components\Map.ts:1526:    // Iran events (severity-colored circles matching DeckGL layer)
src\components\Map.ts:1532:        const size = getIranEventSize(ev.severity);
src\components\Map.ts:1582:        const size = event.watchlistMatch ? 14 : 11;
src\components\Map.ts:1583:        div.className = `signalmap-svg-marker severity-${event.severity}${event.watchlistMatch ? ' watchlist-match' : ''}`;
src\components\Map.ts:1592:        div.style.background = colors[event.severity] ?? '#3b82f6';
src\components\Map.ts:1593:        div.style.border = event.watchlistMatch ? '2px solid #fef3c7' : '1px solid rgba(15, 23, 42, 0.85)';
src\components\Map.ts:1594:        div.style.boxShadow = event.watchlistMatch
src\components\Map.ts:1598:        div.title = `${event.title} (${event.severity})`;
src\components\Map.ts:1747:    // Weather Alerts (severity icons)
src\components\Map.ts:1755:        div.className = `weather-marker ${alert.severity.toLowerCase()}`;
src\components\Map.ts:1758:        div.style.borderColor = getSeverityColor(alert.severity);
src\components\Map.ts:1786:        const color = observation.severity === 'spike' ? '#ff3030' : '#ffaa00';
src\components\Map.ts:1787:        div.className = `radiation-watch-marker radiation-watch-marker-${observation.severity}`;
src\components\Map.ts:1813:    // Internet Outages (severity colors)
src\components\Map.ts:1820:        div.className = `outage-marker ${outage.severity}`;
src\components\Map.ts:1856:        div.className = `cable-advisory-marker ${advisory.severity}`;
src\components\Map.ts:1862:        icon.textContent = advisory.severity === 'fault' ? '⚡' : '⚠';
src\components\Map.ts:2494:    // Protests / Social Unrest Events (severity colors + icons) - with clustering
src\components\Map.ts:2498:        // Only show riots and high severity (red markers)
src\components\Map.ts:2500:        return event.eventType === 'riot' || event.severity === 'high';
src\components\Map.ts:2512:        const hasHighSeverity = cluster.items.some(e => e.severity === 'high');
src\components\Map.ts:2514:        div.className = `protest-marker ${hasHighSeverity ? 'high' : primaryEvent.severity} ${hasRiot ? 'riot' : primaryEvent.eventType} ${isCluster ? 'cluster' : ''}`;
src\components\Map.ts:2530:          div.title = `${primaryEvent.city || primaryEvent.country} - ${primaryEvent.eventType} (${primaryEvent.severity})`;
src\components\Map.ts:2560:    // Flight Delays (delay severity colors + ✈️ icons)
src\components\Map.ts:2567:        div.className = `flight-delay-marker ${delay.severity}`;
src\components\Map.ts:2573:        icon.textContent = delay.delayType === 'ground_stop' ? '🛑' : delay.severity === 'severe' ? '✈️' : '🛫';
src\components\Map.ts:3154:      div.className = `ais-disruption-marker ${event.severity} ${event.type}`;
src\components\Map.ts:4069:  public setSignalMapEvents(events: SignalMapEvent[]): void {
src\components\MapPopup.ts:140:  severity: string;
src\components\MapPopup.ts:726:    const severityClass = observation.severity === 'spike' ? 'high' : 'medium';
src\components\MapPopup.ts:738:        <span class="popup-badge ${severityClass}">${escapeHtml(observation.severity.toUpperCase())}</span>
src\components\MapPopup.ts:775:    const severityClass = conflict.intensity === 'high' ? 'high' : conflict.intensity === 'medium' ? 'medium' : 'low';
src\components\MapPopup.ts:776:    const severityLabel = escapeHtml(conflict.intensity?.toUpperCase() || t('popups.unknown').toUpperCase());
src\components\MapPopup.ts:781:        <span class="popup-badge ${severityClass}">${severityLabel}</span>
src\components\MapPopup.ts:843:    const severityClass = hotspot.level || 'low';
src\components\MapPopup.ts:844:    const severityLabel = escapeHtml((hotspot.level || 'low').toUpperCase());
src\components\MapPopup.ts:988:        <span class="popup-badge ${severityClass}">${severityLabel}</span>
src\components\MapPopup.ts:1208:    const severity = earthquake.magnitude >= 6 ? 'high' : earthquake.magnitude >= 5 ? 'medium' : 'low';
src\components\MapPopup.ts:1209:    const severityLabel = earthquake.magnitude >= 6 ? t('popups.earthquake.levels.major') : earthquake.magnitude >= 5 ? t('popups.earthquake.levels.moderate') : t('popups.earthquake.levels.minor');
src\components\MapPopup.ts:1216:        <span class="popup-badge ${severity}">${severityLabel}</span>
src\components\MapPopup.ts:1252:    const severityClass = escapeHtml(alert.severity.toLowerCase());
src\components\MapPopup.ts:1256:      <div class="popup-header weather ${severityClass}">
src\components\MapPopup.ts:1258:        <span class="popup-badge ${severityClass}">${escapeHtml(alert.severity.toUpperCase())}</span>
src\components\MapPopup.ts:1301:    const enriched = base as MilitaryBase & { kind?: string; catAirforce?: boolean; catNaval?: boolean; catNuclear?: boolean; catSpace?: boolean; catTraining?: boolean };
src\components\MapPopup.ts:1317:        ${enriched.kind ? `<p class="popup-description" style="opacity:0.7;margin-top:2px">${escapeHtml(enriched.kind.replace(/_/g, ' '))}</p>` : ''}
src\components\MapPopup.ts:1411:    const severityClass = escapeHtml(event.severity);
src\components\MapPopup.ts:1412:    const severityLabel = escapeHtml(event.severity.toUpperCase());
src\components\MapPopup.ts:1423:        <span class="popup-badge ${severityClass}">${severityLabel}</span>
src\components\MapPopup.ts:1452:    const severityClass = escapeHtml(event.severity);
src\components\MapPopup.ts:1453:    const severityLabel = escapeHtml(event.severity.toUpperCase());
src\components\MapPopup.ts:1472:      <div class="popup-header protest ${severityClass}">
src\components\MapPopup.ts:1475:        <span class="popup-badge ${severityClass}">${severityLabel}</span>
src\components\MapPopup.ts:1503:    const highSeverity = data.highSeverityCount ?? data.items.filter(e => e.severity === 'high').length;
src\components\MapPopup.ts:1508:      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
src\components\MapPopup.ts:1510:      const sevDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
src\components\MapPopup.ts:1517:      const sevClass = event.severity;
src\components\MapPopup.ts:1549:    const severityClass = escapeHtml(delay.severity);
src\components\MapPopup.ts:1550:    const severityLabel = escapeHtml(delay.severity.toUpperCase());
src\components\MapPopup.ts:1560:    const icon = delay.delayType === 'closure' ? '🚫' : delay.delayType === 'ground_stop' ? '🛑' : delay.severity === 'severe' ? '✈️' : '🛫';
src\components\MapPopup.ts:1589:      <div class="popup-header flight ${severityClass}">
src\components\MapPopup.ts:1592:        <span class="popup-badge ${severityClass}">${severityLabel}</span>
src\components\MapPopup.ts:1703:    const severityClass = escapeHtml(threat.severity);
src\components\MapPopup.ts:1716:      <div class="popup-header apt ${severityClass}">
src\components\MapPopup.ts:1718:        <span class="popup-badge ${severityClass}">${escapeHtml(threat.severity.toUpperCase())}</span>
src\components\MapPopup.ts:1953:      statusLabel = advisory.severity === 'fault' ? t('popups.cable.fault') : t('popups.cable.degraded');
src\components\MapPopup.ts:1954:      statusBadge = advisory.severity === 'fault' ? 'high' : 'elevated';
src\components\MapPopup.ts:2033:    const statusLabel = advisory.severity === 'fault' ? t('popups.cable.fault') : t('popups.cable.degraded');
src\components\MapPopup.ts:2043:        <span class="popup-badge ${advisory.severity === 'fault' ? 'high' : 'elevated'}">${statusLabel}</span>
src\components\MapPopup.ts:2122:    const severityColors: Record<string, string> = {
src\components\MapPopup.ts:2127:    const severityLabels: Record<string, string> = {
src\components\MapPopup.ts:2133:    const severityClass = escapeHtml(outage.severity);
src\components\MapPopup.ts:2136:      <div class="popup-header outage ${severityClass}">
src\components\MapPopup.ts:2138:        <span class="popup-badge ${severityColors[outage.severity] || 'low'}">${severityLabels[outage.severity] || t('popups.outage.levels.disruption')}</span>
src\components\MapPopup.ts:2145:            <span class="stat-label">${t('popups.severity')}</span>
src\components\MapPopup.ts:2146:            <span class="stat-value">${escapeHtml(outage.severity.toUpperCase())}</span>
src\components\MapPopup.ts:3014:    const severityClass = categoryColors[event.category] || 'low';
src\components\MapPopup.ts:3022:        <span class="popup-badge ${severityClass}">${event.closed ? t('popups.naturalEvent.closed') : t('popups.naturalEvent.active')}</span>
src\components\MapPopup.ts:3344:    const severity = this.normalizeSeverity(event.severity);
src\components\MapPopup.ts:3353:      const rSev = this.normalizeSeverity(r.severity);
src\components\MapPopup.ts:3362:      <div class="popup-header iranEvent ${severity}">
src\components\MapPopup.ts:3364:        <span class="popup-badge ${severity}">${escapeHtml(severity.toUpperCase())}</span>
src\components\RadiationWatchPanel.ts:79:          <td><span class="radiation-severity radiation-severity-${obs.severity}">${escapeHtml(obs.severity)}</span></td>
src\components\regional-intelligence-board-utils.ts:286:function severityColor(severity: string): string {
src\components\regional-intelligence-board-utils.ts:287:  switch ((severity ?? '').toLowerCase()) {
src\components\regional-intelligence-board-utils.ts:304:    const color = severityColor(p.severity);
src\components\regional-intelligence-board-utils.ts:314:        <div style="font-size:10px;font-variant-numeric:tabular-nums;color:${color};text-transform:uppercase">${escapeHtml(p.severity || 'unspec')} · ${conf}%</div>
server\worldmonitor\infrastructure\v1\get-temporal-baseline.ts:57:    const severity = getBaselineSeverity(zScore);
server\worldmonitor\infrastructure\v1\get-temporal-baseline.ts:65:        severity,
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:290:      const score = (SEVERITY_SCORE as Record<string, number>)[d.severity] ?? 0;
server\worldmonitor\intelligence\v1\get-risk-scores.ts:375:  // --- Outages (string enum severity) ---
server\worldmonitor\intelligence\v1\get-risk-scores.ts:379:    const sev = String(o.severity || '').toUpperCase();
server\worldmonitor\intelligence\v1\get-risk-scores.ts:389:    const severity = safeNum(a.severity ?? a.score);
server\worldmonitor\intelligence\v1\get-risk-scores.ts:391:      if (data[code]) data[code].climateSeverity = Math.max(data[code].climateSeverity, severity);
server\worldmonitor\intelligence\v1\get-risk-scores.ts:409:  // --- GPS hex severity split ---
server\worldmonitor\intelligence\v1\get-risk-scores.ts:419:  // --- Iran strikes with severity ---
server\worldmonitor\intelligence\v1\get-risk-scores.ts:426:    const sev = String(s.severity || '').toLowerCase();
src\components\resilience-widget-utils.ts:38:// in snapshot tests or re-render with a different lastObservedAtMs on
src\components\resilience-widget-utils.ts:59:        { id: 'macroFiscal', score: 85, coverage: 0.95, observedWeight: 0.95, imputedWeight: 0.05, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:60:        { id: 'currencyExternal', score: 80, coverage: 0.88, observedWeight: 0.88, imputedWeight: 0.12, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:61:        { id: 'tradeSanctions', score: 78, coverage: 0.9, observedWeight: 0.9, imputedWeight: 0.1, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:69:        { id: 'cyberDigital', score: 72, coverage: 0.85, observedWeight: 0.85, imputedWeight: 0.15, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:70:        { id: 'logisticsSupply', score: 70, coverage: 0.8, observedWeight: 0.8, imputedWeight: 0.2, imputationClass: 'stable-absence', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:71:        { id: 'infrastructure', score: 65, coverage: 0.9, observedWeight: 0.9, imputedWeight: 0.1, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:79:        { id: 'energy', score: 88, coverage: 0.82, observedWeight: 0.82, imputedWeight: 0.18, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:87:        { id: 'governanceInstitutional', score: 78, coverage: 0.95, observedWeight: 0.95, imputedWeight: 0.05, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:88:        { id: 'socialCohesion', score: 72, coverage: 0.9, observedWeight: 0.9, imputedWeight: 0.1, imputationClass: 'stable-absence', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:89:        { id: 'borderSecurity', score: 68, coverage: 0.75, observedWeight: 0.75, imputedWeight: 0.25, imputationClass: 'unmonitored', freshness: { lastObservedAtMs: LOCKED_PREVIEW_AGING_AT_MS, staleness: 'aging' } },
src\components\resilience-widget-utils.ts:90:        { id: 'informationCognitive', score: 66, coverage: 0.82, observedWeight: 0.82, imputedWeight: 0.18, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:98:        { id: 'healthPublicService', score: 58, coverage: 0.88, observedWeight: 0.88, imputedWeight: 0.12, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:99:        { id: 'foodWater', score: 50, coverage: 0.85, observedWeight: 0.85, imputedWeight: 0.15, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_STALE_AT_MS, staleness: 'stale' } },
src\components\resilience-widget-utils.ts:107:        { id: 'fiscalSpace', score: 72, coverage: 0.9, observedWeight: 0.9, imputedWeight: 0.1, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:108:        { id: 'reserveAdequacy', score: 55, coverage: 0.85, observedWeight: 0.85, imputedWeight: 0.15, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:109:        { id: 'externalDebtCoverage', score: 60, coverage: 0.8, observedWeight: 0.8, imputedWeight: 0.2, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:110:        { id: 'importConcentration', score: 70, coverage: 0.75, observedWeight: 0.75, imputedWeight: 0.25, imputationClass: 'unmonitored', freshness: { lastObservedAtMs: LOCKED_PREVIEW_AGING_AT_MS, staleness: 'aging' } },
src\components\resilience-widget-utils.ts:111:        { id: 'stateContinuity', score: 80, coverage: 0.92, observedWeight: 0.92, imputedWeight: 0.08, imputationClass: '', freshness: { lastObservedAtMs: LOCKED_PREVIEW_FRESH_AT_MS, staleness: 'fresh' } },
src\components\resilience-widget-utils.ts:112:        { id: 'fuelStockDays', score: 50, coverage: 0.3, observedWeight: 0, imputedWeight: 1, imputationClass: 'unmonitored', freshness: { lastObservedAtMs: LOCKED_PREVIEW_STALE_AT_MS, staleness: 'stale' } },
src\components\resilience-widget-utils.ts:292:  // `lastObservedAtMs` field is a proto int64 so the wire shape is a
src\components\resilience-widget-utils.ts:295:    lastObservedAtMs?: string | number;
src\components\resilience-widget-utils.ts:323:  lastObservedAtMs: number | null;
src\components\resilience-widget-utils.ts:413:  const lastObservedAtMs = normalizeLastObservedAtMs(input.freshness?.lastObservedAtMs);
src\components\resilience-widget-utils.ts:424:      lastObservedAtMs,
src\components\resilience-widget-utils.ts:446:    lastObservedAtMs,
server\worldmonitor\intelligence\v1\get-regional-snapshot.ts:142:  severity?: string;
server\worldmonitor\intelligence\v1\get-regional-snapshot.ts:312:    severity: raw.severity ?? '',
server\worldmonitor\infrastructure\v1\get-cable-health.ts:160:  severity: number;
server\worldmonitor\infrastructure\v1\get-cable-health.ts:163:  kind: string;
server\worldmonitor\infrastructure\v1\get-cable-health.ts:306:        severity: 1.0,
server\worldmonitor\infrastructure\v1\get-cable-health.ts:309:        kind: 'operator_fault',
server\worldmonitor\infrastructure\v1\get-cable-health.ts:316:        severity: 0.6,
server\worldmonitor\infrastructure\v1\get-cable-health.ts:319:        kind: 'cable_advisory',
server\worldmonitor\infrastructure\v1\get-cable-health.ts:328:        severity: isOnStation ? 0.8 : 0.5,
server\worldmonitor\infrastructure\v1\get-cable-health.ts:331:        kind: 'repair_activity',
server\worldmonitor\infrastructure\v1\get-cable-health.ts:371:      const effective = sig.severity * sig.confidence * recencyWeight;
server\worldmonitor\infrastructure\v1\get-cable-health.ts:383:      (s) => s.kind === 'operator_fault' && s.effective >= 0.50,
server\worldmonitor\infrastructure\v1\get-cable-health.ts:386:      (s) => s.kind === 'repair_activity' && s.effective >= 0.40,
server\worldmonitor\military\v1\list-military-bases.ts:132:    const kindFilter = normalizeOptionalFilter(req.kind, v => v.toLowerCase());
server\worldmonitor\military\v1\list-military-bases.ts:136:    if (kindFilter && !VALID_KINDS.has(kindFilter)) return empty;
server\worldmonitor\military\v1\list-military-bases.ts:161:    const cacheKey = `military:bases:v1:${qBB}:${zoom}:${typeFilter}:${kindFilter}:${countryFilter}:${v}`;
server\worldmonitor\military\v1\list-military-bases.ts:205:          if (kindFilter && meta.kind !== kindFilter) continue;
server\worldmonitor\military\v1\list-military-bases.ts:213:            kind: String(meta.kind || ''),
server\worldmonitor\intelligence\v1\classify-event.ts:71:Classify by real-world event severity, not headline sentiment.
server\worldmonitor\intelligence\v1\classify-event.ts:128:      severity: mapLevelToSeverity(cached.level),
server\worldmonitor\climate\v1\list-climate-disasters.ts:51:    severity: String(record.severity || ''),
server\worldmonitor\signalmap\v1\_radar.ts:2:  SignalMapEvent,
server\worldmonitor\signalmap\v1\_radar.ts:38:  events: SignalMapEvent[];
server\worldmonitor\signalmap\v1\_radar.ts:39:  sourceHealth: SignalMapSourceHealth[];
server\worldmonitor\signalmap\v1\_radar.ts:55:  severity?: string;
server\worldmonitor\signalmap\v1\_radar.ts:101:    sourceHealth: [
server\worldmonitor\signalmap\v1\_radar.ts:114:export function normalizeRadarOutages(payload: unknown, fetchedAt?: number): SignalMapEvent[] {
server\worldmonitor\signalmap\v1\_radar.ts:118:export function normalizeRadarTrafficAnomalies(payload: unknown, fetchedAt?: number): SignalMapEvent[] {
server\worldmonitor\signalmap\v1\_radar.ts:122:function outageToEvent(entry: OutageEntry, fetchedAt?: number): SignalMapEvent {
server\worldmonitor\signalmap\v1\_radar.ts:138:    severity: outageSeverity(entry.severity, outageType),
server\worldmonitor\signalmap\v1\_radar.ts:144:    lastObservedAt: isoFromMs(fetchedAt ?? endMs ?? startMs) ?? '1970-01-01T00:00:00.000Z',
server\worldmonitor\signalmap\v1\_radar.ts:149:    kind: 'radar_outage',
server\worldmonitor\signalmap\v1\_radar.ts:150:    watchlistMatch: false,
server\worldmonitor\signalmap\v1\_radar.ts:155:function anomalyToEvent(entry: AnomalyEntry, fetchedAt?: number): SignalMapEvent {
server\worldmonitor\signalmap\v1\_radar.ts:169:    severity: active && type === 'TRAFFIC_DROP' ? 'high' : active ? 'medium' : 'info',
server\worldmonitor\signalmap\v1\_radar.ts:177:    lastObservedAt: isoFromMs(fetchedAt ?? endMs ?? startMs) ?? '1970-01-01T00:00:00.000Z',
server\worldmonitor\signalmap\v1\_radar.ts:182:    kind: 'radar_anomaly',
server\worldmonitor\signalmap\v1\_radar.ts:183:    watchlistMatch: false,
server\worldmonitor\signalmap\v1\_radar.ts:261:function outageSeverity(severity: string | undefined, outageType: string | undefined): string {
server\worldmonitor\signalmap\v1\_radar.ts:262:  const severityKey = normalizeUpper(severity);
server\worldmonitor\signalmap\v1\_radar.ts:264:  if (severityKey === 'OUTAGE_SEVERITY_TOTAL' || typeKey === 'NATIONWIDE') return 'critical';
server\worldmonitor\signalmap\v1\_radar.ts:265:  if (severityKey === 'OUTAGE_SEVERITY_MAJOR' || typeKey === 'REGIONAL') return 'high';
server\worldmonitor\signalmap\v1\_radar.ts:266:  if (severityKey === 'OUTAGE_SEVERITY_PARTIAL') return 'medium';
server\worldmonitor\signalmap\v1\_radar.ts:270:function fallbackFetchedAt(events: SignalMapEvent[]): number {
server\worldmonitor\signalmap\v1\_radar.ts:272:    const candidate = Date.parse(event.lastObservedAt || event.startedAt || event.endedAt || '');
server\worldmonitor\signalmap\v1\_provider-status.ts:3:  SignalMapEvent,
server\worldmonitor\signalmap\v1\_provider-status.ts:27:  events: SignalMapEvent[];
server\worldmonitor\signalmap\v1\_provider-status.ts:28:  sourceHealth: SignalMapSourceHealth[];
server\worldmonitor\signalmap\v1\_provider-status.ts:88:  const byProvider: Record<Provider, SignalMapEvent[]> = {
server\worldmonitor\signalmap\v1\_provider-status.ts:99:    sourceHealth: PROVIDERS.map((provider) =>
server\worldmonitor\signalmap\v1\_provider-status.ts:105:export function normalizeCloudflareStatus(payload: unknown, fetchedAt?: number): SignalMapEvent[] {
server\worldmonitor\signalmap\v1\_provider-status.ts:125:): SignalMapEvent[] {
server\worldmonitor\signalmap\v1\_provider-status.ts:134:function cloudflareIncidentToEvent(incident: StatuspageIncident, fetchedAt?: number): SignalMapEvent {
server\worldmonitor\signalmap\v1\_provider-status.ts:139:  const severity = impactSeverity(incident.impact);
server\worldmonitor\signalmap\v1\_provider-status.ts:145:    severity,
server\worldmonitor\signalmap\v1\_provider-status.ts:150:    lastObservedAt: isoFromMs(fetchedAt ?? observedMs ?? startMs) ?? DEFAULT_ISO,
server\worldmonitor\signalmap\v1\_provider-status.ts:158:function cloudflareMaintenanceToEvent(maintenance: StatuspageMaintenance, fetchedAt?: number): SignalMapEvent {
server\worldmonitor\signalmap\v1\_provider-status.ts:168:    severity: 'medium',
server\worldmonitor\signalmap\v1\_provider-status.ts:174:    lastObservedAt: isoFromMs(fetchedAt ?? startMs) ?? DEFAULT_ISO,
server\worldmonitor\signalmap\v1\_provider-status.ts:182:function rssItemToEvent(provider: 'okta' | 'm365' | 'azure' | 'wasabi', item: RssItem, fetchedAt?: number): SignalMapEvent {
server\worldmonitor\signalmap\v1\_provider-status.ts:194:    severity: maintenance ? 'medium' : provider === 'm365' ? 'high' : 'medium',
server\worldmonitor\signalmap\v1\_provider-status.ts:199:    lastObservedAt: isoFromMs(fetchedAt ?? startMs) ?? DEFAULT_ISO,
server\worldmonitor\signalmap\v1\_provider-status.ts:211:  severity: string;
server\worldmonitor\signalmap\v1\_provider-status.ts:217:  lastObservedAt: string;
server\worldmonitor\signalmap\v1\_provider-status.ts:222:}): SignalMapEvent {
server\worldmonitor\signalmap\v1\_provider-status.ts:228:    severity: input.severity,
server\worldmonitor\signalmap\v1\_provider-status.ts:234:    lastObservedAt: input.lastObservedAt,
server\worldmonitor\signalmap\v1\_provider-status.ts:239:    kind: 'provider_status',
server\worldmonitor\signalmap\v1\_provider-status.ts:240:    watchlistMatch: false,
server\worldmonitor\signalmap\v1\_provider-status.ts:259:  events: SignalMapEvent[],
server\worldmonitor\signalmap\v1\_provider-status.ts:373:function fallbackFetchedAt(events: SignalMapEvent[]): number {
server\worldmonitor\signalmap\v1\_provider-status.ts:375:    const parsed = Date.parse(event.lastObservedAt || event.startedAt || event.endedAt || '');
server\worldmonitor\signalmap\v1\list-signals.ts:2:  ListSignalMapEventsRequest,
server\worldmonitor\signalmap\v1\list-signals.ts:3:  ListSignalMapEventsResponse,
server\worldmonitor\signalmap\v1\list-signals.ts:19:export function buildSignalMapEventsCacheKey(req: ListSignalMapEventsRequest): string {
server\worldmonitor\signalmap\v1\list-signals.ts:61:function degradedResponse(now = Date.now()): ListSignalMapEventsResponse {
server\worldmonitor\signalmap\v1\list-signals.ts:64:    sourceHealth: degradedSourceHealth(now),
server\worldmonitor\signalmap\v1\list-signals.ts:71:  value: ListSignalMapEventsResponse,
server\worldmonitor\signalmap\v1\list-signals.ts:73:): ListSignalMapEventsResponse {
server\worldmonitor\signalmap\v1\list-signals.ts:76:    sourceHealth: Array.isArray(value.sourceHealth) && value.sourceHealth.length > 0
server\worldmonitor\signalmap\v1\list-signals.ts:77:      ? value.sourceHealth
server\worldmonitor\signalmap\v1\list-signals.ts:84:export async function listSignalMapEvents(
server\worldmonitor\signalmap\v1\list-signals.ts:86:  req: ListSignalMapEventsRequest,
server\worldmonitor\signalmap\v1\list-signals.ts:87:): Promise<ListSignalMapEventsResponse> {
server\worldmonitor\signalmap\v1\list-signals.ts:88:  const cacheKey = buildSignalMapEventsCacheKey(req);
server\worldmonitor\signalmap\v1\list-signals.ts:90:    const result = await getCachedJson(cacheKey, true) as ListSignalMapEventsResponse | null;
server\worldmonitor\aviation\v1\_shared.ts:186:export function severityFromCancelRate(cancelRate: number): string {
server\worldmonitor\aviation\v1\_shared.ts:312:  let severity: string, delayType: string, reason: string;
server\worldmonitor\aviation\v1\_shared.ts:314:    severity = 'severe'; delayType = 'closure';
server\worldmonitor\aviation\v1\_shared.ts:317:    severity = 'major'; delayType = 'ground_stop';
server\worldmonitor\aviation\v1\_shared.ts:320:    severity = 'moderate'; delayType = 'ground_delay';
server\worldmonitor\aviation\v1\_shared.ts:323:    severity = 'minor'; delayType = 'general';
server\worldmonitor\aviation\v1\_shared.ts:326:    severity = determineSeverity(avgDelay, delayedPct);
server\worldmonitor\aviation\v1\_shared.ts:332:  if (severity === 'normal') return null;
server\worldmonitor\aviation\v1\_shared.ts:341:    severity: toProtoSeverity(severity),
server\worldmonitor\aviation\v1\_shared.ts:464:  severity: 'severe' | 'major' = 'severe',
server\worldmonitor\aviation\v1\_shared.ts:477:    severity: toProtoSeverity(severity),
server\worldmonitor\aviation\v1\_shared.ts:544:  severity: 'severe' | 'major' = 'severe',
server\worldmonitor\aviation\v1\_shared.ts:548:    return buildNotamAlert(airport, notamReason, severity, delayType);
server\worldmonitor\aviation\v1\_shared.ts:552:  const notamCancelSev = severityFromCancelRate(cancelRate);
server\worldmonitor\aviation\v1\_shared.ts:555:  const existingSevName = (existing.severity ?? '')
server\worldmonitor\aviation\v1\_shared.ts:569:    severity: toProtoSeverity(effectiveSev),
server\worldmonitor\aviation\v1\get-airport-ops-summary.ts:13:    severityFromCancelRate,
server\worldmonitor\aviation\v1\get-airport-ops-summary.ts:72:            const cancelSev = severityFromCancelRate(cancelRate);
server\worldmonitor\aviation\v1\get-airport-ops-summary.ts:83:            const severity = `FLIGHT_DELAY_SEVERITY_${sevStr.toUpperCase()}` as FlightDelaySeverity;
server\worldmonitor\aviation\v1\get-airport-ops-summary.ts:105:                severity,
server\worldmonitor\aviation\v1\get-airport-ops-summary.ts:126:                    severity: 'FLIGHT_DELAY_SEVERITY_NORMAL',
server\worldmonitor\signalmap\v1\handler.ts:3:import { listSignalMapEvents } from './list-signals';
server\worldmonitor\signalmap\v1\handler.ts:6:  listSignalMapEvents,
server\worldmonitor\aviation\v1\list-airport-delays.ts:62:    const applyNotam = (icao: string, severity: 'severe' | 'major', delayType: 'closure' | 'general', fallback: string) => {
server\worldmonitor\aviation\v1\list-airport-delays.ts:69:          allAlerts[idx] = mergeNotamWithExistingAlert(airport, reason, allAlerts[idx] ?? null, severity, delayType);
server\worldmonitor\aviation\v1\list-airport-delays.ts:72:        allAlerts.push(buildNotamAlert(airport, reason, severity, delayType));
server\worldmonitor\aviation\v1\list-airport-delays.ts:102:        severity: toProtoSeverity('normal'),

codex
Two concrete SSE concerns are emerging: the live pub/sub path writes replay-ring entries from each client connection, and the tests don’t exercise that live path. I’m going to run the listed Phase 3 tests once to see whether the current gate actually proves the Redis/SSE behavior or silently skips it in this workspace.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs' in C:\Coding_Workspace\Github_P\worldmonitor
2026-04-27T19:28:51.909847Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 2.6 seconds
Output:
TAP version 13
# Subtest: tests\\api-base-url-contract.test.mjs
not ok 1 - tests\\api-base-url-contract.test.mjs
  ---
  duration_ms: 5.4234
  type: 'test'
  location: 'C:\\Coding_Workspace\\Github_P\\worldmonitor\\tests\\api-base-url-contract.test.mjs:1:1'
  failureType: 'testCodeFailure'
  error: 'spawn EPERM'
  code: 'EPERM'
  stack: |-
    ChildProcess.spawn (node:internal/child_process:420:11)
    spawn (node:child_process:753:9)
    TestContext.<anonymous> (node:internal/test_runner/runner:376:19)
    FileTest.runInAsyncScope (node:async_hooks:214:14)
    FileTest.run (node:internal/test_runner/test:1047:25)
    FileTest.start (node:internal/test_runner/test:944:17)
    runTestFile (node:internal/test_runner/runner:455:32)
    node:internal/test_runner/runner:726:25
    node:internal/per_context/primordials:578:37
    new Promise (<anonymous>)
  ...
# Subtest: tests\\openapi-spec-generation.test.mjs
not ok 2 - tests\\openapi-spec-generation.test.mjs
  ---
  duration_ms: 3.1028
  type: 'test'
  location: 'C:\\Coding_Workspace\\Github_P\\worldmonitor\\tests\\openapi-spec-generation.test.mjs:1:1'
  failureType: 'testCodeFailure'
  error: 'spawn EPERM'
  code: 'EPERM'
  stack: |-
    ChildProcess.spawn (node:internal/child_process:420:11)
    spawn (node:child_process:753:9)
    TestContext.<anonymous> (node:internal/test_runner/runner:376:19)
    FileTest.runInAsyncScope (node:async_hooks:214:14)
    FileTest.run (node:internal/test_runner/test:1047:25)
    FileTest.start (node:internal/test_runner/test:944:17)
    runTestFile (node:internal/test_runner/runner:455:32)
    node:internal/test_runner/runner:726:25
    node:internal/per_context/primordials:578:37
    new Promise (<anonymous>)
  ...
# Subtest: tests\\sse-replay-ring.test.mjs
not ok 3 - tests\\sse-replay-ring.test.mjs
  ---
  duration_ms: 2.3441
  type: 'test'
  location: 'C:\\Coding_Workspace\\Github_P\\worldmonitor\\tests\\sse-replay-ring.test.mjs:1:1'
  failureType: 'testCodeFailure'
  error: 'spawn EPERM'
  code: 'EPERM'
  stack: |-
    ChildProcess.spawn (node:internal/child_process:420:11)
    spawn (node:child_process:753:9)
    TestContext.<anonymous> (node:internal/test_runner/runner:376:19)
    FileTest.runInAsyncScope (node:async_hooks:214:14)
    FileTest.run (node:internal/test_runner/test:1047:25)
    FileTest.start (node:internal/test_runner/test:944:17)
    runTestFile (node:internal/test_runner/runner:455:32)
    node:internal/test_runner/runner:726:25
    node:internal/per_context/primordials:578:37
    new Promise (<anonymous>)
  ...
# Subtest: tests\\sse-stream.test.mjs
not ok 4 - tests\\sse-stream.test.mjs
  ---
  duration_ms: 1.6297
  type: 'test'
  location: 'C:\\Coding_Workspace\\Github_P\\worldmonitor\\tests\\sse-stream.test.mjs:1:1'
  failureType: 'testCodeFailure'
  error: 'spawn EPERM'
  code: 'EPERM'
  stack: |-
    ChildProcess.spawn (node:internal/child_process:420:11)
    spawn (node:child_process:753:9)
    TestContext.<anonymous> (node:internal/test_runner/runner:376:19)
    FileTest.runInAsyncScope (node:async_hooks:214:14)
    FileTest.run (node:internal/test_runner/test:1047:25)
    FileTest.start (node:internal/test_runner/test:944:17)
    runTestFile (node:internal/test_runner/runner:455:32)
    node:internal/test_runner/runner:726:25
    node:internal/per_context/primordials:578:37
    new Promise (<anonymous>)
  ...
1..4
# tests 4
# suites 0
# pass 0
# fail 4
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.5479

 exited 1 in 2570ms:
TAP version 13
# Subtest: tests\\api-base-url-contract.test.mjs
not ok 1 - tests\\api-base-url-contract.test.mjs
  ---
  duration_ms: 5.4234
  type: 'test'
  location: 'C:\\Coding_Workspace\\Github_P\\worldmonitor\\tests\\api-base-url-contract.test.mjs:1:1'
  failureType: 'testCodeFailure'
  error: 'spawn EPERM'
  code: 'EPERM'
  stack: |-
    ChildProcess.spawn (node:internal/child_process:420:11)
    spawn (node:child_process:753:9)
    TestContext.<anonymous> (node:internal/test_runner/runner:376:19)
    FileTest.runInAsyncScope (node:async_hooks:214:14)
    FileTest.run (node:internal/test_runner/test:1047:25)
    FileTest.start (node:internal/test_runner/test:944:17)
    runTestFile (node:internal/test_runner/runner:455:32)
    node:internal/test_runner/runner:726:25
    node:internal/per_context/primordials:578:37
    new Promise (<anonymous>)
  ...
# Subtest: tests\\openapi-spec-generation.test.mjs
not ok 2 - tests\\openapi-spec-generation.test.mjs
  ---
  duration_ms: 3.1028
  type: 'test'
  location: 'C:\\Coding_Workspace\\Github_P\\worldmonitor\\tests\\openapi-spec-generation.test.mjs:1:1'
  failureType: 'testCodeFailure'
  error: 'spawn EPERM'
  code: 'EPERM'
  stack: |-
    ChildProcess.spawn (node:internal/child_process:420:11)
    spawn (node:child_process:753:9)
    TestContext.<anonymous> (node:internal/test_runner/runner:376:19)
    FileTest.runInAsyncScope (node:async_hooks:214:14)
    FileTest.run (node:internal/test_runner/test:1047:25)
    FileTest.start (node:internal/test_runner/test:944:17)
    runTestFile (node:internal/test_runner/runner:455:32)
    node:internal/test_runner/runner:726:25
    node:internal/per_context/primordials:578:37
    new Promise (<anonymous>)
  ...
# Subtest: tests\\sse-replay-ring.test.mjs
not ok 3 - tests\\sse-replay-ring.test.mjs
  ---
  duration_ms: 2.3441
  type: 'test'
  location: 'C:\\Coding_Workspace\\Github_P\\worldmonitor\\tests\\sse-replay-ring.test.mjs:1:1'
  failureType: 'testCodeFailure'
  error: 'spawn EPERM'
  code: 'EPERM'
  stack: |-
    ChildProcess.spawn (node:internal/child_process:420:11)
    spawn (node:child_process:753:9)
    TestContext.<anonymous> (node:internal/test_runner/runner:376:19)
    FileTest.runInAsyncScope (node:async_hooks:214:14)
    FileTest.run (node:internal/test_runner/test:1047:25)
    FileTest.start (node:internal/test_runner/test:944:17)
    runTestFile (node:internal/test_runner/runner:455:32)
    node:internal/test_runner/runner:726:25
    node:internal/per_context/primordials:578:37
    new Promise (<anonymous>)
  ...
# Subtest: tests\\sse-stream.test.mjs
not ok 4 - tests\\sse-stream.test.mjs
  ---
  duration_ms: 1.6297
  type: 'test'
  location: 'C:\\Coding_Workspace\\Github_P\\worldmonitor\\tests\\sse-stream.test.mjs:1:1'
  failureType: 'testCodeFailure'
  error: 'spawn EPERM'
  code: 'EPERM'
  stack: |-
    ChildProcess.spawn (node:internal/child_process:420:11)
    spawn (node:child_process:753:9)
    TestContext.<anonymous> (node:internal/test_runner/runner:376:19)
    FileTest.runInAsyncScope (node:async_hooks:214:14)
    FileTest.run (node:internal/test_runner/test:1047:25)
    FileTest.start (node:internal/test_runner/test:944:17)
    runTestFile (node:internal/test_runner/runner:455:32)
    node:internal/test_runner/runner:726:25
    node:internal/per_context/primordials:578:37
    new Promise (<anonymous>)
  ...
1..4
# tests 4
# suites 0
# pass 0
# fail 4
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.5479

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "node --import tsx -e \"import { stringify } from 'yaml'; import { readFileSync } from 'node:fs'; import { generateSpec } from './server/api/openapi.ts'; const expected = stringify(generateSpec(), { defaultStringType:'QUOTE_DOUBLE', defaultKeyType:'PLAIN', nullStr:'null' }); const actual = readFileSync('public/openapi.yaml','utf8'); console.log(expected === actual ? 'openapi.yaml matches generateSpec output' : 'openapi.yaml differs from generateSpec output');\"" in C:\Coding_Workspace\Github_P\worldmonitor
2026-04-27T19:29:03.253420Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.8 seconds
Output:

node:internal/modules/run_main:123
    triggerUncaughtException(
    ^
Error [TransformError]: spawn EPERM
    at ChildProcess.spawn (node:internal/child_process:420:11)
    at Object.spawn (node:child_process:753:9)
    at ensureServiceIsRunning (C:\Coding_Workspace\Github_P\worldmonitor\node_modules\esbuild\lib\main.js:2268:29)
    at transform (C:\Coding_Workspace\Github_P\worldmonitor\node_modules\esbuild\lib\main.js:2168:37)
    at file:///C:/Coding_Workspace/Github_P/worldmonitor/node_modules/tsx/dist/index-7AaEi15b.mjs:14:2865
    at applyTransformers (file:///C:/Coding_Workspace/Github_P/worldmonitor/node_modules/tsx/dist/index-7AaEi15b.mjs:14:1266)
    at transform (file:///C:/Coding_Workspace/Github_P/worldmonitor/node_modules/tsx/dist/index-7AaEi15b.mjs:14:2812)
    at load (file:///C:/Coding_Workspace/Github_P/worldmonitor/node_modules/tsx/dist/esm/index.mjs?1777318143026:2:2348)
    at async nextLoad (node:internal/modules/esm/hooks:748:22)
    at async Hooks.load (node:internal/modules/esm/hooks:385:20) {
  errno: -4048,
  code: 'EPERM',
  syscall: 'spawn'
}

Node.js v22.16.0

 exited 1 in 1763ms:

node:internal/modules/run_main:123
    triggerUncaughtException(
    ^
Error [TransformError]: spawn EPERM
    at ChildProcess.spawn (node:internal/child_process:420:11)
    at Object.spawn (node:child_process:753:9)
    at ensureServiceIsRunning (C:\Coding_Workspace\Github_P\worldmonitor\node_modules\esbuild\lib\main.js:2268:29)
    at transform (C:\Coding_Workspace\Github_P\worldmonitor\node_modules\esbuild\lib\main.js:2168:37)
    at file:///C:/Coding_Workspace/Github_P/worldmonitor/node_modules/tsx/dist/index-7AaEi15b.mjs:14:2865
    at applyTransformers (file:///C:/Coding_Workspace/Github_P/worldmonitor/node_modules/tsx/dist/index-7AaEi15b.mjs:14:1266)
    at transform (file:///C:/Coding_Workspace/Github_P/worldmonitor/node_modules/tsx/dist/index-7AaEi15b.mjs:14:2812)
    at load (file:///C:/Coding_Workspace/Github_P/worldmonitor/node_modules/tsx/dist/esm/index.mjs?1777318143026:2:2348)
    at async nextLoad (node:internal/modules/esm/hooks:748:22)
    at async Hooks.load (node:internal/modules/esm/hooks:385:20) {
  errno: -4048,
  code: 'EPERM',
  syscall: 'spawn'
}

Node.js v22.16.0

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "build:openapi|build:types|openapi.yaml|src/client/types.ts|git diff|diff --exit|SignalMap" .github package.json tests scripts -g "*.yml" -g "*.yaml" -g "*.json" -g "*.mjs"' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1362ms:
package.json:27:    "build:openapi": "tsx scripts/build-openapi.mjs",
package.json:28:    "build:types": "openapi-typescript public/openapi.yaml -o src/client/types.ts",
package.json:30:    "prebuild": "npm run build:openapi && npm run build:agent-skills",
package.json:34:    "build:full": "npm run build:openapi && npm run build:agent-skills && npm run build:blog && cross-env-shell VITE_VARIANT=full \"tsc && vite build\"",
package.json:35:    "build:tech": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=tech \"tsc && vite build\"",
package.json:36:    "build:finance": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=finance \"tsc && vite build\"",
package.json:37:    "build:happy": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=happy \"tsc && vite build\"",
package.json:38:    "build:commodity": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=commodity \"tsc && vite build\"",
scripts\build-openapi.mjs:5: * the result as YAML to public/openapi.yaml.
scripts\build-openapi.mjs:18:const outPath = resolve(repoRoot, 'public', 'openapi.yaml');
scripts\build-openapi.mjs:33:console.log(`Wrote ${Buffer.byteLength(yamlText, 'utf8')} bytes to public/openapi.yaml`);
scripts\compare-draft-models.mjs:2:// Compare two SignalMap brief pipelines:
scripts\compare-draft-models.mjs:11:// Writes report to docs/SignalMap/_discovery/draft-model-comparison-result.md.
scripts\compare-draft-models.mjs:29:// Realistic SignalMap brief context. Hand-built since real Perplexity probe
scripts\compare-draft-models.mjs:47:const DRAFT_PROMPT = `You are a SignalMap intelligence brief writer. Produce a 3-5 bullet brief summarizing the current signal landscape for the user's filters and watchlist.
scripts\compare-draft-models.mjs:72:const moderatorPrompt = (draft) => `You are a senior SignalMap brief moderator. A junior model produced a draft brief. Review it against the source data, fix factual errors or hallucinations, tighten the language, and output the polished final version.
scripts\compare-draft-models.mjs:106:      'X-Title': 'SignalMap Draft Comparison',
scripts\compare-draft-models.mjs:127:  writeFileSync(`docs/SignalMap/_discovery/draft-cmp-raw-${slug}-${Date.now()}.json`, JSON.stringify(data, null, 2));
scripts\compare-draft-models.mjs:140:console.log('SignalMap brief pipeline comparison\n');
scripts\compare-draft-models.mjs:175:Input: realistic SignalMap brief context — Cloudflare 502 routing change, ransomware Eastern Europe, Microsoft 365 EU auth delays, plus 5 local signals (CF Radar PK anomaly, Okta global, Azure EU, ransomware HN, Citrix NetScaler 0day).
scripts\compare-draft-models.mjs:267:writeFileSync('docs/SignalMap/_discovery/draft-model-comparison-result.md', report);
scripts\compare-draft-models.mjs:273:console.log('Report: docs/SignalMap/_discovery/draft-model-comparison-result.md');
.github\workflows\pro-bundle-freshness.yml:40:          if ! git diff --exit-code public/pro/; then
.github\workflows\proto-check.yml:44:          if ! git diff --exit-code src/generated/ docs/api/; then
scripts\enforce-rate-limit-policies.mjs:45:  const files = readdirSync(OPENAPI_DIR).filter((f) => f.endsWith('.openapi.yaml'));
scripts\enforce-rate-limit-policies.mjs:68:    console.error('  1. The key matches the path in docs/api/<Service>.openapi.yaml exactly.');
tests\deploy-config.test.mjs:289://   (2) variant build scripts dropping the `npm run build:openapi`
tests\deploy-config.test.mjs:315:  it('service-desc points at /openapi.yaml with the OpenAPI media type', () => {
tests\deploy-config.test.mjs:318:      serviceDesc.href.endsWith('/openapi.yaml'),
tests\deploy-config.test.mjs:319:      `service-desc href must end with /openapi.yaml, got: ${serviceDesc.href}`
tests\deploy-config.test.mjs:335:  it('exposes a build:openapi script that copies docs/api → public/openapi.yaml', () => {
tests\deploy-config.test.mjs:336:    const buildOpenapi = pkg.scripts['build:openapi'];
tests\deploy-config.test.mjs:337:    assert.ok(buildOpenapi, 'package.json must define scripts["build:openapi"]');
tests\deploy-config.test.mjs:339:      buildOpenapi.includes('docs/api/worldmonitor.openapi.yaml'),
tests\deploy-config.test.mjs:340:      `build:openapi must reference docs/api/worldmonitor.openapi.yaml, got: ${buildOpenapi}`
tests\deploy-config.test.mjs:343:      buildOpenapi.includes('public/openapi.yaml'),
tests\deploy-config.test.mjs:344:      `build:openapi must write to public/openapi.yaml, got: ${buildOpenapi}`
tests\deploy-config.test.mjs:348:  it('every web-variant build chains npm run build:openapi', () => {
tests\deploy-config.test.mjs:357:        script.includes('npm run build:openapi'),
tests\deploy-config.test.mjs:358:        `scripts["${variant}"] must chain "npm run build:openapi" so the web bundle ships the spec; got: ${script}`
tests\deploy-config.test.mjs:367:  it('openapi source exists at docs/api/worldmonitor.openapi.yaml', () => {
tests\deploy-config.test.mjs:371:    const openapiPath = resolve(__dirname, '../docs/api/worldmonitor.openapi.yaml');
tests\deploy-config.test.mjs:374:      `docs/api/worldmonitor.openapi.yaml must exist — without it, build:openapi fails at deploy time`
tests\openapi-spec-generation.test.mjs:3: * covering all 6 SignalMap endpoints.
tests\openapi-spec-generation.test.mjs:23:  it('declares all 6 SignalMap endpoints', () => {
tests\openapi-spec-generation.test.mjs:65:  it('SignalMapEvent schema is registered as a component ref', () => {
tests\openapi-spec-generation.test.mjs:67:    // zod-openapi v4 names from .openapi({ ref: 'SignalMapEvent' })
tests\openapi-spec-generation.test.mjs:68:    assert.ok(schemas.SignalMapEvent, 'SignalMapEvent schema not in components');
tests\openapi-spec-generation.test.mjs:69:    assert.ok(schemas.SignalMapSourceHealth, 'SignalMapSourceHealth schema not in components');
scripts\seed-internet-outages.mjs:229:async function writeSignalMapRadarHealth({
scripts\seed-internet-outages.mjs:284:  await writeSignalMapRadarHealth({
scripts\signalmap-distill-bridge.mjs:27:export function resolveSignalMapDistillTimeoutMs(options = {}) {
scripts\signalmap-distill-bridge.mjs:68:export function resolveSignalMapDistillBridgeConfig(options = {}) {
scripts\signalmap-distill-bridge.mjs:156:      error.name = 'SignalMapDistillTimeoutError';
scripts\signalmap-distill-bridge.mjs:166:export async function extractSignalMapArticleWithDistill(input, options = {}) {
scripts\signalmap-distill-bridge.mjs:171:  const config = resolveSignalMapDistillBridgeConfig(options);
scripts\signalmap-distill-bridge.mjs:195:    const timeoutMs = resolveSignalMapDistillTimeoutMs(options);
scripts\signalmap-distill-bridge.mjs:208:    if (error?.name === 'SignalMapDistillTimeoutError') {
scripts\signalmap-news-collector.mjs:10:import { extractSignalMapArticleWithDistill } from './signalmap-distill-bridge.mjs';
scripts\signalmap-news-collector.mjs:11:import { embedSignalMapStory } from './signalmap-embedding-model.mjs';
scripts\signalmap-news-collector.mjs:14:  resolveSignalMapLocations,
scripts\signalmap-news-collector.mjs:21:  resolveSignalMapVectorStoreConfig,
scripts\signalmap-news-collector.mjs:24:import { parseSignalMapArticleWithOpenRouter } from './signalmap-openrouter-parser.mjs';
scripts\signalmap-news-collector.mjs:290:    if (related.title && hashSignalMapNewsTitle(related.title) === event.contentHash) return true;
scripts\signalmap-news-collector.mjs:348:function buildSignalMapHealthDomainMeta(domain, payload, fetchedAt) {
scripts\signalmap-news-collector.mjs:359:function buildSignalMapHealthDomains({
scripts\signalmap-news-collector.mjs:432:function buildSignalMapHealthDomainWrites(domains, fetchedAt) {
scripts\signalmap-news-collector.mjs:441:      meta: buildSignalMapHealthDomainMeta(domain, data, fetchedAt),
scripts\signalmap-news-collector.mjs:447:export function resolveSignalMapNewsCollectorConfig(options = {}) {
scripts\signalmap-news-collector.mjs:452:  const vectorConfig = resolveSignalMapVectorStoreConfig(env);
scripts\signalmap-news-collector.mjs:479:export function loadSignalMapNewsSources(options = {}) {
scripts\signalmap-news-collector.mjs:495:export function shouldFullExtractSignalMapUrl(url, options = {}) {
scripts\signalmap-news-collector.mjs:506:export function canonicalizeSignalMapNewsUrl(url) {
scripts\signalmap-news-collector.mjs:525:export function hashSignalMapNewsTitle(title) {
scripts\signalmap-news-collector.mjs:529:export function makeSignalMapStoryEventId(canonicalUrl, canonicalTitle) {
scripts\signalmap-news-collector.mjs:550:function makeSignalMapSourceId({ label, feedUrl, url }) {
scripts\signalmap-news-collector.mjs:555:export function parseSignalMapRssItems(xmlText, source) {
scripts\signalmap-news-collector.mjs:588:        canonicalUrl: canonicalizeSignalMapNewsUrl(url),
scripts\signalmap-news-collector.mjs:603:export function createSignalMapStoryEvent({
scripts\signalmap-news-collector.mjs:612:  const canonicalUrl = canonicalizeSignalMapNewsUrl(article?.canonicalUrl ?? article?.url);
scripts\signalmap-news-collector.mjs:635:  const id = makeSignalMapStoryEventId(canonicalUrl, canonicalTitle);
scripts\signalmap-news-collector.mjs:652:  const contentHash = hashSignalMapNewsTitle(canonicalTitle);
scripts\signalmap-news-collector.mjs:668:        id: makeSignalMapSourceId({ label: sourceName, feedUrl: sourceFeedUrl, url: canonicalUrl }),
scripts\signalmap-news-collector.mjs:691:export async function collectSignalMapNews(options = {}) {
scripts\signalmap-news-collector.mjs:694:  const config = resolveSignalMapNewsCollectorConfig(options);
scripts\signalmap-news-collector.mjs:695:  const loadSourcesImpl = options.loadSourcesImpl ?? loadSignalMapNewsSources;
scripts\signalmap-news-collector.mjs:697:  const extractArticleImpl = options.extractArticleImpl ?? extractSignalMapArticleWithDistill;
scripts\signalmap-news-collector.mjs:698:  const parseArticleImpl = options.parseArticleImpl ?? parseSignalMapArticleWithOpenRouter;
scripts\signalmap-news-collector.mjs:699:  const resolveLocationsImpl = options.resolveLocationsImpl ?? resolveSignalMapLocations;
scripts\signalmap-news-collector.mjs:700:  const embedStoryImpl = options.embedStoryImpl ?? embedSignalMapStory;
scripts\signalmap-news-collector.mjs:753:        errorClass: error?.name ?? 'SignalMapVectorOpenError',
scripts\signalmap-news-collector.mjs:754:        lastVectorErrorClass: error?.name ?? 'SignalMapVectorOpenError',
scripts\signalmap-news-collector.mjs:778:      const parsedItems = parseSignalMapRssItems(xmlText, source);
scripts\signalmap-news-collector.mjs:790:        errorClass: error?.name ?? 'SignalMapRssFetchError',
scripts\signalmap-news-collector.mjs:801:    const canonicalUrl = canonicalizeSignalMapNewsUrl(item.canonicalUrl ?? item.url);
scripts\signalmap-news-collector.mjs:802:    const titleHash = hashSignalMapNewsTitle(item.title);
scripts\signalmap-news-collector.mjs:817:    const shouldExtract = shouldFullExtractSignalMapUrl(canonicalUrl, config);
scripts\signalmap-news-collector.mjs:825:        canonicalUrl: canonicalizeSignalMapNewsUrl(extracted?.article?.canonicalUrl ?? canonicalUrl),
scripts\signalmap-news-collector.mjs:891:    const event = createSignalMapStoryEvent({
scripts\signalmap-news-collector.mjs:944:          errorClass: error?.name ?? 'SignalMapVectorLookupError',
scripts\signalmap-news-collector.mjs:977:          errorClass: error?.name ?? 'SignalMapVectorUpsertError',
scripts\signalmap-news-collector.mjs:992:        errorClass: error?.name ?? 'SignalMapVectorPruneError',
scripts\signalmap-news-collector.mjs:1011:  const signalMapHealthDomains = buildSignalMapHealthDomains({
scripts\signalmap-news-collector.mjs:1043:  const healthDomainWrites = buildSignalMapHealthDomainWrites(signalMapHealthDomains, fetchedAt);
scripts\signalmap-news-collector.mjs:1069:      errorClass: error?.name ?? 'SignalMapPublishError',
scripts\signalmap-news-collector.mjs:1084:  collectSignalMapNews()
scripts\signalmap-lancedb-store.mjs:7:  resolveSignalMapEmbeddingConfig,
scripts\signalmap-lancedb-store.mjs:298:export function resolveSignalMapVectorStoreConfig(env = process.env) {
scripts\signalmap-lancedb-store.mjs:299:  const embedding = resolveSignalMapEmbeddingConfig(env);
scripts\signalmap-lancedb-store.mjs:319:export function createSignalMapVectorRecord(event, vector, options = {}) {
scripts\signalmap-lancedb-store.mjs:321:    ...resolveSignalMapVectorStoreConfig(options.env ?? process.env),
scripts\signalmap-lancedb-store.mjs:332:    'Untitled SignalMap event';
scripts\signalmap-lancedb-store.mjs:393:    ...resolveSignalMapVectorStoreConfig(options.env ?? process.env),
scripts\signalmap-lancedb-store.mjs:494:      errorClass: error?.name ?? 'SignalMapVectorStoreOpenError',
scripts\signalmap-lancedb-store.mjs:495:      lastVectorErrorClass: error?.name ?? 'SignalMapVectorStoreOpenError',
scripts\signalmap-lancedb-store.mjs:530:    : createSignalMapVectorRecord(recordOrEvent, vectorCheck.vector, {
scripts\signalmap-lancedb-store.mjs:547:    store.lastVectorErrorClass = error?.name ?? 'SignalMapVectorUpsertError';
scripts\signalmap-lancedb-store.mjs:561:    ...resolveSignalMapVectorStoreConfig(options.env ?? process.env),
scripts\signalmap-lancedb-store.mjs:585:    store.lastVectorErrorClass = error?.name ?? 'SignalMapVectorSearchError';
scripts\signalmap-lancedb-store.mjs:611:    store.lastVectorErrorClass = error?.name ?? 'SignalMapVectorPruneError';
scripts\signalmap-lancedb-store.mjs:641:    countErrorClass = error?.name ?? 'SignalMapVectorCountError';
scripts\signalmap-openrouter-parser.mjs:112:export function parseSignalMapLlmModels(env = process.env) {
scripts\signalmap-openrouter-parser.mjs:128:export function selectSignalMapLlmModel(requestedModel, env = process.env) {
scripts\signalmap-openrouter-parser.mjs:129:  const allowedModels = parseSignalMapLlmModels(env);
scripts\signalmap-openrouter-parser.mjs:188:export function sanitizeSignalMapArticleText(article, options = {}) {
scripts\signalmap-openrouter-parser.mjs:209:export function parseSignalMapLlmJson(content) {
scripts\signalmap-openrouter-parser.mjs:314:export function validateSignalMapLlmEvent(value) {
scripts\signalmap-openrouter-parser.mjs:352:    'Extract one SignalMap story event from the article content.',
scripts\signalmap-openrouter-parser.mjs:390:export async function parseSignalMapArticleWithOpenRouter(article, options = {}) {
scripts\signalmap-openrouter-parser.mjs:398:  const modelSelection = selectSignalMapLlmModel(requestedModel, env);
scripts\signalmap-openrouter-parser.mjs:410:  const sourceText = sanitizeSignalMapArticleText(article, options);
scripts\signalmap-openrouter-parser.mjs:431:      error.name = 'SignalMapOpenRouterTimeoutError';
scripts\signalmap-openrouter-parser.mjs:460:    const parsedJson = parseSignalMapLlmJson(contentResult.content);
scripts\signalmap-openrouter-parser.mjs:461:    const event = validateSignalMapLlmEvent(parsedJson);
scripts\signalmap-openrouter-parser.mjs:469:    if (error?.name === 'SignalMapOpenRouterTimeoutError' || error?.name === 'AbortError') {
scripts\signalmap-embedding-model.mjs:35:export function resolveSignalMapEmbeddingConfig(env = process.env) {
scripts\signalmap-embedding-model.mjs:42:export function normalizeSignalMapEmbeddingInput(eventOrText) {
scripts\signalmap-embedding-model.mjs:102:export async function embedSignalMapStory(eventOrText, options = {}) {
scripts\signalmap-embedding-model.mjs:104:    ...resolveSignalMapEmbeddingConfig(options.env ?? process.env),
scripts\signalmap-embedding-model.mjs:108:  const input = normalizeSignalMapEmbeddingInput(eventOrText);
scripts\signalmap-embedding-model.mjs:118:          errorClass: 'SignalMapInvalidEmbeddingVectorError',
scripts\signalmap-embedding-model.mjs:144:      errorClass: 'SignalMapEmbeddingUnavailableError',
scripts\signalmap-embedding-model.mjs:152:      errorClass: error?.name ?? 'SignalMapEmbeddingError',
scripts\signalmap-geocoder.mjs:152:export function resolveSignalMapCountryIso2(location, options = {}) {
scripts\signalmap-geocoder.mjs:264:export function resolveSignalMapLocation(location, options = {}) {
scripts\signalmap-geocoder.mjs:274:  const countryIso2 = countryEvidenceIso2 || resolveSignalMapCountryIso2(location, options);
scripts\signalmap-geocoder.mjs:314:export function resolveSignalMapLocations(locations, options = {}) {
scripts\signalmap-geocoder.mjs:316:  return locations.map((location) => resolveSignalMapLocation(location, options));
scripts\test-real-workflow-brief.mjs:4:// way SignalMap will in production, then run THREE candidate models in parallel:
scripts\test-real-workflow-brief.mjs:14:// Writes report to docs/SignalMap/_discovery/real-workflow-brief-result.md
scripts\test-real-workflow-brief.mjs:100:        'User-Agent': 'Mozilla/5.0 (SignalMap test)',
scripts\test-real-workflow-brief.mjs:236:        'X-Title': 'SignalMap Real Workflow Test',
scripts\test-real-workflow-brief.mjs:273:console.log('SignalMap real-workflow brief test\n');
scripts\test-real-workflow-brief.mjs:343:const BRIEF_PROMPT = `You are a SignalMap intelligence brief writer. Produce a 3-5 bullet brief summarizing the current signal landscape for the user's filters and watchlist.
scripts\test-real-workflow-brief.mjs:384:  '# Real-Workflow Brief Test — 3 Models on Live SignalMap Inputs',
scripts\test-real-workflow-brief.mjs:453:writeFileSync('docs/SignalMap/_discovery/real-workflow-brief-result.md', reportLines.join('\n'));
scripts\test-real-workflow-brief.mjs:461:console.log('\nReport: docs/SignalMap/_discovery/real-workflow-brief-result.md');
scripts\verify-perplexity-shape.mjs:3:// docs/SignalMap/spec.md §Brief Backend.
tests\signalmap-lancedb-store.test.mjs:10:  resolveSignalMapEmbeddingConfig,
tests\signalmap-lancedb-store.test.mjs:19:  createSignalMapVectorRecord,
tests\signalmap-lancedb-store.test.mjs:24:  resolveSignalMapVectorStoreConfig,
tests\signalmap-lancedb-store.test.mjs:115:  return Object.keys(createSignalMapVectorRecord(sampleEvent(), [0.1, 0.2, 0.3, 0.4], {
tests\signalmap-lancedb-store.test.mjs:122:  const defaults = resolveSignalMapVectorStoreConfig({});
tests\signalmap-lancedb-store.test.mjs:143:  assert.deepEqual(resolveSignalMapEmbeddingConfig(env), { model: 'custom-model', dim: 4 });
tests\signalmap-lancedb-store.test.mjs:144:  assert.deepEqual(resolveSignalMapVectorStoreConfig(env), {
tests\signalmap-lancedb-store.test.mjs:169:  const record = createSignalMapVectorRecord(sampleEvent(), [0.1, 0.2, 0.3, 0.4], {
tests\signalmap-lancedb-store.test.mjs:213:  const record = createSignalMapVectorRecord(sampleEvent({
tests\signalmap-lancedb-store.test.mjs:279:test('existing LanceDB table with complete SignalMap schema opens ready', async () => {
tests\signalmap-lancedb-store.test.mjs:368:  store.lastVectorErrorClass = 'SignalMapVectorSearchError';
tests\signalmap-lancedb-store.test.mjs:377:  assert.equal(health.lastVectorErrorClass, 'SignalMapVectorSearchError');
tests\signalmap-lancedb-store.test.mjs:384:    { ...createSignalMapVectorRecord(sampleEvent({ id: 'a', title: 'A' }), [0.1, 0.2, 0.3, 0.4], { embeddingDim: 4 }), score: 0.8 },
tests\signalmap-lancedb-store.test.mjs:386:      ...createSignalMapVectorRecord(sampleEvent({ id: 'b', title: 'B' }), [0.2, 0.2, 0.3, 0.4], { embeddingDim: 4 }),
tests\signalmap-lancedb-store.test.mjs:390:    { ...createSignalMapVectorRecord(sampleEvent({ id: 'c', title: 'C' }), [0.3, 0.2, 0.3, 0.4], { embeddingDim: 4 }), score: 0.6 },
tests\signalmap-docker-runtime.test.mjs:15:describe('SignalMap Docker runtime inventory', () => {
tests\signalmap-docker-runtime.test.mjs:25:  const signalMapSpec = readProjectFile('docs', 'SignalMap', 'spec.md');
tests\signalmap-docker-runtime.test.mjs:48:    assert.ok(!dockerfile.includes('SIGNALMAP_'), 'Current runtime should not include SignalMap env setup yet');
tests\signalmap-docker-runtime.test.mjs:75:  it('documents expected SignalMap runtime env keys for future implementation', () => {
tests\signalmap-docker-runtime.test.mjs:76:    assert.ok(signalMapSpec.includes('SIGNALMAP_DATA_DIR'), 'SignalMap spec should document SIGNALMAP_DATA_DIR');
tests\signalmap-docker-runtime.test.mjs:77:    assert.ok(signalMapSpec.includes('SIGNALMAP_LANCEDB_URI'), 'SignalMap spec should document SIGNALMAP_LANCEDB_URI');
tests\signalmap-docker-runtime.test.mjs:78:    assert.ok(signalMapSpec.includes('TRANSFORMERS_CACHE'), 'SignalMap spec should document TRANSFORMERS_CACHE');
tests\signalmap-docker-runtime.test.mjs:79:    assert.ok(signalMapSpec.includes('OPENROUTER_API_KEY'), 'SignalMap spec should document OPENROUTER_API_KEY');
tests\signalmap-docker-runtime.test.mjs:81:    assert.ok(signalMapSpec.includes('/data/signalmap'), 'SignalMap spec should document the data directory default');
tests\signalmap-docker-runtime.test.mjs:82:    assert.ok(signalMapSpec.includes('/data/signalmap/lancedb'), 'SignalMap spec should document the LanceDB default');
tests\signalmap-docker-runtime.test.mjs:83:    assert.ok(signalMapSpec.includes('/data/signalmap/models'), 'SignalMap spec should document the model cache default');
tests\signalmap-docker-runtime.test.mjs:91:  it('adds a SignalMap runtime image without changing the frontend-only image', () => {
tests\signalmap-docker-runtime.test.mjs:92:    assert.match(signalMapDockerfile, /FROM node:22-alpine AS builder/, 'SignalMap image should use a Node builder');
tests\signalmap-docker-runtime.test.mjs:93:    assert.match(signalMapDockerfile, /FROM node:22-alpine AS prod-deps/, 'SignalMap image should install production deps separately');
tests\signalmap-docker-runtime.test.mjs:94:    assert.match(signalMapDockerfile, /FROM node:22-alpine AS runtime/, 'SignalMap image should keep Node available at runtime');
tests\signalmap-docker-runtime.test.mjs:95:    assert.ok(signalMapDockerfile.includes('RUN node docker/build-handlers.mjs'), 'SignalMap image should bundle local API handlers');
tests\signalmap-docker-runtime.test.mjs:96:    assert.ok(signalMapDockerfile.includes('VITE_VARIANT=signalmap'), 'SignalMap image should build the SignalMap Vite variant');
tests\signalmap-docker-runtime.test.mjs:97:    assert.ok(signalMapDockerfile.includes('npx tsc && npx vite build'), 'SignalMap image should run the Vite frontend build');
tests\signalmap-docker-runtime.test.mjs:98:    assert.ok(signalMapDockerfile.includes('COPY --from=builder /app/src-tauri/sidecar/local-api-server.mjs ./local-api-server.mjs'), 'SignalMap runtime should include the local Node API server');
tests\signalmap-docker-runtime.test.mjs:99:    assert.ok(signalMapDockerfile.includes('COPY --from=builder /app/api ./api'), 'SignalMap runtime should include bundled API handlers');
tests\signalmap-docker-runtime.test.mjs:100:    assert.ok(signalMapDockerfile.includes('COPY --from=builder /app/scripts ./scripts'), 'SignalMap runtime should include collector scripts');
tests\signalmap-docker-runtime.test.mjs:101:    assert.ok(signalMapDockerfile.includes('COPY --from=builder /app/shared ./shared'), 'SignalMap runtime should include shared configs used by collector geocoding and sources');
tests\signalmap-docker-runtime.test.mjs:102:    assert.ok(signalMapDockerfile.includes('COPY --from=builder /app/data ./data'), 'SignalMap runtime should include local data files');
tests\signalmap-docker-runtime.test.mjs:103:    assert.ok(signalMapDockerfile.includes('COPY --from=builder /app/dist /usr/share/nginx/html'), 'SignalMap runtime should serve built frontend assets');
tests\signalmap-docker-runtime.test.mjs:104:    assert.ok(signalMapDockerfile.includes('COPY docker/nginx.conf /etc/nginx/nginx.conf.template'), 'SignalMap runtime should reuse local API nginx template');
tests\signalmap-docker-runtime.test.mjs:105:    assert.ok(signalMapDockerfile.includes('COPY docker/supervisord.signalmap.conf /etc/supervisor/conf.d/signalmap.conf'), 'SignalMap runtime should install SignalMap supervisor config');
tests\signalmap-docker-runtime.test.mjs:106:    assert.ok(signalMapDockerfile.includes('COPY docker/signalmap-entrypoint.sh /app/signalmap-entrypoint.sh'), 'SignalMap runtime should install SignalMap entrypoint');
tests\signalmap-docker-runtime.test.mjs:107:    assert.ok(signalMapDockerfile.includes('EXPOSE 8080'), 'SignalMap runtime should expose nginx on 8080');
tests\signalmap-docker-runtime.test.mjs:108:    assert.ok(signalMapDockerfile.includes('VOLUME ["/data/signalmap/lancedb", "/data/signalmap/models"]'), 'SignalMap runtime should declare persistent LanceDB and model volumes');
tests\signalmap-docker-runtime.test.mjs:109:    assert.ok(signalMapDockerfile.includes('CMD ["/app/signalmap-entrypoint.sh"]'), 'SignalMap runtime should start the SignalMap entrypoint');
tests\signalmap-docker-runtime.test.mjs:113:  it('runs nginx, local API, and the SignalMap collector under supervisor', () => {
tests\signalmap-docker-runtime.test.mjs:114:    assert.ok(signalMapSupervisord.includes('[program:nginx]'), 'SignalMap supervisor should define nginx');
tests\signalmap-docker-runtime.test.mjs:115:    assert.ok(signalMapSupervisord.includes('/usr/sbin/nginx -c /tmp/nginx.conf -g "daemon off;"'), 'SignalMap nginx should use generated config');
tests\signalmap-docker-runtime.test.mjs:116:    assert.ok(signalMapSupervisord.includes('[program:worldmonitor-api]'), 'SignalMap supervisor should define local API process');
tests\signalmap-docker-runtime.test.mjs:117:    assert.ok(signalMapSupervisord.includes('command=node /app/local-api-server.mjs'), 'SignalMap local API should run the sidecar server');
tests\signalmap-docker-runtime.test.mjs:118:    assert.ok(signalMapSupervisord.includes('[program:signalmap-news-collector]'), 'SignalMap supervisor should define collector process');
tests\signalmap-docker-runtime.test.mjs:119:    assert.ok(signalMapSupervisord.includes('/app/scripts/signalmap-news-collector.mjs'), 'collector should run the existing SignalMap news collector script');
tests\signalmap-docker-runtime.test.mjs:121:    assert.ok(signalMapSupervisord.includes('autorestart=true'), 'SignalMap supervisor processes should autorestart');
tests\signalmap-docker-runtime.test.mjs:122:    assert.ok(signalMapSupervisord.includes('stdout_logfile=/dev/stdout'), 'SignalMap supervisor should stream stdout');
tests\signalmap-docker-runtime.test.mjs:123:    assert.ok(signalMapSupervisord.includes('stderr_logfile=/dev/stderr'), 'SignalMap supervisor should stream stderr');
tests\signalmap-docker-runtime.test.mjs:126:  it('bridges secrets and defaults SignalMap runtime env in entrypoint', () => {
tests\signalmap-docker-runtime.test.mjs:127:    assert.ok(signalMapEntrypoint.includes('/run/secrets'), 'SignalMap entrypoint should bridge Docker secrets');
tests\signalmap-docker-runtime.test.mjs:128:    assert.ok(signalMapEntrypoint.includes('export "$key"="$value"'), 'SignalMap entrypoint should export secret file names as env vars');
tests\signalmap-docker-runtime.test.mjs:129:    assert.ok(signalMapEntrypoint.includes('LOCAL_API_PORT="${LOCAL_API_PORT:-46123}"'), 'SignalMap entrypoint should default LOCAL_API_PORT');
tests\signalmap-docker-runtime.test.mjs:130:    assert.ok(signalMapEntrypoint.includes('SIGNALMAP_DATA_DIR="${SIGNALMAP_DATA_DIR:-/data/signalmap}"'), 'SignalMap entrypoint should default SIGNALMAP_DATA_DIR');
tests\signalmap-docker-runtime.test.mjs:131:    assert.ok(signalMapEntrypoint.includes('SIGNALMAP_LANCEDB_URI="${SIGNALMAP_LANCEDB_URI:-${SIGNALMAP_DATA_DIR}/lancedb}"'), 'SignalMap entrypoint should default SIGNALMAP_LANCEDB_URI');
tests\signalmap-docker-runtime.test.mjs:132:    assert.ok(signalMapEntrypoint.includes('TRANSFORMERS_CACHE="${TRANSFORMERS_CACHE:-${SIGNALMAP_DATA_DIR}/models}"'), 'SignalMap entrypoint should default TRANSFORMERS_CACHE');
tests\signalmap-docker-runtime.test.mjs:133:    assert.ok(signalMapEntrypoint.includes('HF_HOME="${HF_HOME:-${SIGNALMAP_DATA_DIR}/models}"'), 'SignalMap entrypoint should default HF_HOME');
tests\signalmap-docker-runtime.test.mjs:134:    assert.ok(signalMapEntrypoint.includes('SIGNALMAP_DISTILL_ROOT="${SIGNALMAP_DISTILL_ROOT:-/opt/distill}"'), 'SignalMap entrypoint should default distill root to the mount point');
tests\signalmap-docker-runtime.test.mjs:135:    assert.ok(signalMapEntrypoint.includes('SIGNALMAP_RSS_POLL_MINUTES="${SIGNALMAP_RSS_POLL_MINUTES:-15}"'), 'SignalMap entrypoint should default collector cadence');
tests\signalmap-docker-runtime.test.mjs:136:    assert.ok(signalMapEntrypoint.includes('mkdir -p "$SIGNALMAP_DATA_DIR" "$TRANSFORMERS_CACHE" "$HF_HOME"'), 'SignalMap entrypoint should create data and model dirs');
tests\signalmap-docker-runtime.test.mjs:137:    assert.ok(signalMapEntrypoint.includes('mkdir -p "$SIGNALMAP_LANCEDB_URI"'), 'SignalMap entrypoint should create local LanceDB dir');
tests\signalmap-docker-runtime.test.mjs:138:    assert.ok(signalMapEntrypoint.includes("envsubst '$LOCAL_API_PORT'"), 'SignalMap entrypoint should template nginx with local API port');
tests\signalmap-docker-runtime.test.mjs:139:    assert.ok(signalMapEntrypoint.includes('/usr/bin/supervisord -c /etc/supervisor/conf.d/signalmap.conf'), 'SignalMap entrypoint should exec SignalMap supervisor');
tests\signalmap-docker-runtime.test.mjs:143:  it('defines a SignalMap compose stack with Redis, volumes, and env-only secrets', () => {
tests\signalmap-docker-runtime.test.mjs:146:    assert.equal(service.build?.dockerfile, 'docker/Dockerfile.signalmap', 'SignalMap compose should build the SignalMap Dockerfile');
tests\signalmap-docker-runtime.test.mjs:147:    assert.equal(service.build?.args?.VITE_VARIANT, 'signalmap', 'SignalMap compose should build the signalmap variant');
tests\signalmap-docker-runtime.test.mjs:148:    assert.deepEqual(service.ports, ['${SIGNALMAP_PORT:-3000}:8080'], 'SignalMap compose should publish nginx 8080');
tests\signalmap-docker-runtime.test.mjs:151:    assert.equal(env.REDIS_URL, 'redis://signalmap-redis:6379', 'SignalMap should reach the redis container over TCP via ioredis (Phase 2c dropped the redis-rest proxy)');
tests\signalmap-docker-runtime.test.mjs:155:    assert.equal(env.SIGNALMAP_DATA_DIR, '/data/signalmap', 'SignalMap data dir should be container local');
tests\signalmap-docker-runtime.test.mjs:156:    assert.equal(env.SIGNALMAP_LANCEDB_URI, '/data/signalmap/lancedb', 'SignalMap LanceDB URI should use persistent mount path');
tests\signalmap-docker-runtime.test.mjs:157:    assert.equal(env.TRANSFORMERS_CACHE, '/data/signalmap/models', 'SignalMap model cache should use persistent mount path');
tests\signalmap-docker-runtime.test.mjs:158:    assert.equal(env.HF_HOME, '/data/signalmap/models', 'SignalMap HF_HOME should use persistent mount path');
tests\signalmap-docker-runtime.test.mjs:159:    assert.equal(env.SIGNALMAP_DISTILL_ROOT, '/opt/distill', 'SignalMap distill root should use mount path');
tests\signalmap-docker-runtime.test.mjs:163:    assert.ok(volumeText.includes('signalmap-lancedb'), 'SignalMap compose should mount LanceDB named volume');
tests\signalmap-docker-runtime.test.mjs:164:    assert.ok(volumeText.includes('/data/signalmap/lancedb'), 'SignalMap compose should mount LanceDB at required path');
tests\signalmap-docker-runtime.test.mjs:165:    assert.ok(volumeText.includes('signalmap-models'), 'SignalMap compose should mount model named volume');
tests\signalmap-docker-runtime.test.mjs:166:    assert.ok(volumeText.includes('/data/signalmap/models'), 'SignalMap compose should mount models at required path');
tests\signalmap-docker-runtime.test.mjs:167:    assert.ok(volumeText.includes('/opt/distill'), 'SignalMap compose should mount local distill root at /opt/distill');
tests\signalmap-docker-runtime.test.mjs:170:    assert.ok(signalMapCompose.services?.redis, 'SignalMap compose should define redis');
tests\signalmap-docker-runtime.test.mjs:173:    assert.ok(Object.hasOwn(signalMapCompose.volumes ?? {}, 'signalmap-lancedb'), 'SignalMap compose should define signalmap-lancedb volume');
tests\signalmap-docker-runtime.test.mjs:174:    assert.ok(Object.hasOwn(signalMapCompose.volumes ?? {}, 'signalmap-models'), 'SignalMap compose should define signalmap-models volume');
tests\signalmap-llm-schema.test.mjs:9:  parseSignalMapArticleWithOpenRouter,
tests\signalmap-llm-schema.test.mjs:10:  parseSignalMapLlmJson,
tests\signalmap-llm-schema.test.mjs:11:  parseSignalMapLlmModels,
tests\signalmap-llm-schema.test.mjs:12:  selectSignalMapLlmModel,
tests\signalmap-llm-schema.test.mjs:13:  validateSignalMapLlmEvent,
tests\signalmap-llm-schema.test.mjs:17:  resolveSignalMapLocation,
tests\signalmap-llm-schema.test.mjs:18:  resolveSignalMapLocations,
tests\signalmap-llm-schema.test.mjs:51:    parseSignalMapLlmModels({
tests\signalmap-llm-schema.test.mjs:60:    selectSignalMapLlmModel('not/allowed', {
tests\signalmap-llm-schema.test.mjs:74:    selectSignalMapLlmModel(undefined, {
tests\signalmap-llm-schema.test.mjs:88:    selectSignalMapLlmModel(undefined, {
tests\signalmap-llm-schema.test.mjs:100:  const result = await parseSignalMapArticleWithOpenRouter(
tests\signalmap-llm-schema.test.mjs:117:  const result = await parseSignalMapArticleWithOpenRouter(
tests\signalmap-llm-schema.test.mjs:149:  const result = await parseSignalMapArticleWithOpenRouter(
tests\signalmap-llm-schema.test.mjs:247:  assert.deepEqual(parseSignalMapLlmJson('{"category":"technology"}'), {
tests\signalmap-llm-schema.test.mjs:250:  assert.throws(() => parseSignalMapLlmJson('```json\n{"category":"technology"}\n```'), {
tests\signalmap-llm-schema.test.mjs:253:  assert.throws(() => parseSignalMapLlmJson('[{"category":"technology"}]'), {
tests\signalmap-llm-schema.test.mjs:256:  assert.throws(() => parseSignalMapLlmJson('{"category":"technology",}'), {
tests\signalmap-llm-schema.test.mjs:259:  assert.throws(() => parseSignalMapLlmJson('prefix {"category":"technology"}'), {
tests\signalmap-llm-schema.test.mjs:266:    () => validateSignalMapLlmEvent({ ...validLlmEvent, category: 'weather' }),
tests\signalmap-llm-schema.test.mjs:270:    () => validateSignalMapLlmEvent({ ...validLlmEvent, severity: 'urgent' }),
tests\signalmap-llm-schema.test.mjs:278:      validateSignalMapLlmEvent({
tests\signalmap-llm-schema.test.mjs:287:  const result = await parseSignalMapArticleWithOpenRouter(
tests\signalmap-llm-schema.test.mjs:302:  const result = await parseSignalMapArticleWithOpenRouter(
tests\signalmap-llm-schema.test.mjs:321:test('SignalMap geocoder resolves country-only Germany to country centroid', () => {
tests\signalmap-llm-schema.test.mjs:323:  const result = resolveSignalMapLocation(
tests\signalmap-llm-schema.test.mjs:345:test('SignalMap geocoder resolves static Kyiv with country evidence to marker', () => {
tests\signalmap-llm-schema.test.mjs:346:  const result = resolveSignalMapLocation({
tests\signalmap-llm-schema.test.mjs:362:test('SignalMap geocoder keeps ambiguous bare Georgia feed-only without country evidence', () => {
tests\signalmap-llm-schema.test.mjs:363:  const result = resolveSignalMapLocation({
tests\signalmap-llm-schema.test.mjs:377:test('SignalMap geocoder resolves ambiguous Georgia to US region with country evidence', () => {
tests\signalmap-llm-schema.test.mjs:378:  const result = resolveSignalMapLocation({
tests\signalmap-llm-schema.test.mjs:394:test('SignalMap geocoder keeps low-confidence resolved locations feed-only', () => {
tests\signalmap-llm-schema.test.mjs:395:  const result = resolveSignalMapLocation({
tests\signalmap-llm-schema.test.mjs:411:test('SignalMap geocoder resolves location arrays deterministically in input order', () => {
tests\signalmap-llm-schema.test.mjs:418:  const results = resolveSignalMapLocations(locations);
tests\signalmap-news-collector.test.mjs:10:  extractSignalMapArticleWithDistill,
tests\signalmap-news-collector.test.mjs:11:  resolveSignalMapDistillBridgeConfig,
tests\signalmap-news-collector.test.mjs:12:  resolveSignalMapDistillTimeoutMs,
tests\signalmap-news-collector.test.mjs:21:  canonicalizeSignalMapNewsUrl,
tests\signalmap-news-collector.test.mjs:22:  collectSignalMapNews,
tests\signalmap-news-collector.test.mjs:23:  hashSignalMapNewsTitle,
tests\signalmap-news-collector.test.mjs:24:  loadSignalMapNewsSources,
tests\signalmap-news-collector.test.mjs:25:  parseSignalMapRssItems,
tests\signalmap-news-collector.test.mjs:26:  resolveSignalMapNewsCollectorConfig,
tests\signalmap-news-collector.test.mjs:27:  shouldFullExtractSignalMapUrl,
tests\signalmap-news-collector.test.mjs:49:  assert.equal(resolveSignalMapDistillTimeoutMs({ env: {} }), 15000);
tests\signalmap-news-collector.test.mjs:51:    resolveSignalMapDistillTimeoutMs({ env: { SIGNALMAP_DISTILL_TIMEOUT_MS: '0' } }),
tests\signalmap-news-collector.test.mjs:55:    resolveSignalMapDistillTimeoutMs({ env: { SIGNALMAP_DISTILL_TIMEOUT_MS: '-1' } }),
tests\signalmap-news-collector.test.mjs:59:    resolveSignalMapDistillTimeoutMs({ env: { SIGNALMAP_DISTILL_TIMEOUT_MS: 'not-a-number' } }),
tests\signalmap-news-collector.test.mjs:63:    resolveSignalMapDistillTimeoutMs({
tests\signalmap-news-collector.test.mjs:94:  const config = resolveSignalMapDistillBridgeConfig({
tests\signalmap-news-collector.test.mjs:108:  const result = await extractSignalMapArticleWithDistill(baseInput, {
tests\signalmap-news-collector.test.mjs:129:  const result = await extractSignalMapArticleWithDistill(baseInput, {
tests\signalmap-news-collector.test.mjs:147:  const result = await extractSignalMapArticleWithDistill(baseInput, {
tests\signalmap-news-collector.test.mjs:182:  const result = await extractSignalMapArticleWithDistill(baseInput, {
tests\signalmap-news-collector.test.mjs:224:  const result = await extractSignalMapArticleWithDistill(baseInput, {
tests\signalmap-news-collector.test.mjs:253:  const result = await extractSignalMapArticleWithDistill(
tests\signalmap-news-collector.test.mjs:293:  const result = await extractSignalMapArticleWithDistill(baseInput, {
tests\signalmap-news-collector.test.mjs:320:  const result = await extractSignalMapArticleWithDistill(baseInput, {
tests\signalmap-news-collector.test.mjs:350:  const result = await extractSignalMapArticleWithDistill(baseInput, {
tests\signalmap-news-collector.test.mjs:387:  const result = await extractSignalMapArticleWithDistill(baseInput, {
tests\signalmap-news-collector.test.mjs:494:  const config = resolveSignalMapNewsCollectorConfig({ env: {} });
tests\signalmap-news-collector.test.mjs:505:      resolveSignalMapNewsCollectorConfig({ env: { SIGNALMAP_VECTOR_ENABLED: disabled } }).vectorEnabled,
tests\signalmap-news-collector.test.mjs:511:test('SignalMap health domains are registered for api health and collector publishing', async () => {
tests\signalmap-news-collector.test.mjs:519:  // The Phase 2e api/health.js exposes a SignalMap-specific shape over three
tests\signalmap-news-collector.test.mjs:575:  assert.equal(shouldFullExtractSignalMapUrl('https://risky.biz/news/story'), true);
tests\signalmap-news-collector.test.mjs:576:  assert.equal(shouldFullExtractSignalMapUrl('https://www.thehackernews.com/2026/04/story.html'), true);
tests\signalmap-news-collector.test.mjs:577:  assert.equal(shouldFullExtractSignalMapUrl('https://example.com/security/story'), false);
tests\signalmap-news-collector.test.mjs:581:  const source = loadSignalMapNewsSources({
tests\signalmap-news-collector.test.mjs:584:  const [item] = parseSignalMapRssItems(
tests\signalmap-news-collector.test.mjs:609:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:649:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:705:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:763:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:788:  assert.equal(canonicalizeSignalMapNewsUrl('https://example.com/a?utm_source=rss'), 'https://example.com/a');
tests\signalmap-news-collector.test.mjs:789:  assert.equal(hashSignalMapNewsTitle('First story'), hashSignalMapNewsTitle('First   Story'));
tests\signalmap-news-collector.test.mjs:796:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:839:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:889:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:914:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:945:      lastVectorErrorClass: 'SignalMapVectorTimeout',
tests\signalmap-news-collector.test.mjs:975:  assert.equal(domains.lancedb.lastVectorErrorClass, 'SignalMapVectorTimeout');
tests\signalmap-news-collector.test.mjs:996:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:1040:  const result = await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:1090:  await collectSignalMapNews({
tests\signalmap-news-collector.test.mjs:1138:  await collectSignalMapNews({
tests\signalmap-provider-status.test.mjs:27:describe('provider status SignalMap normalization', () => {
tests\signalmap-provider-status.test.mjs:33:  it('infrastructure service status handler writes raw SignalMap provider health keys', () => {
tests\signalmap-provider-status.test.mjs:41:    assert.ok(source.includes('buildSignalMapProviderHealth'));
tests\signalmap-public-access.test.mjs:95:describe('SignalMap public access behavior', () => {
tests\signalmap-public-access.test.mjs:183:describe('SignalMap public access guardrails', () => {
tests\signalmap-rpc-shell.test.mjs:7:  buildSignalMapEventsCacheKey,
tests\signalmap-rpc-shell.test.mjs:8:  listSignalMapEvents,
tests\signalmap-rpc-shell.test.mjs:13:describe('SignalMap proto RPC shell', () => {
tests\signalmap-rpc-shell.test.mjs:19:  it('declares ListSignalMapEvents response with events and source health', () => {
tests\signalmap-rpc-shell.test.mjs:20:    assert.ok(proto.includes('rpc ListSignalMapEvents'));
tests\signalmap-rpc-shell.test.mjs:21:    assert.ok(proto.includes('message ListSignalMapEventsResponse'));
tests\signalmap-rpc-shell.test.mjs:22:    assert.ok(proto.includes('repeated SignalMapEvent events'));
tests\signalmap-rpc-shell.test.mjs:23:    assert.ok(proto.includes('repeated SignalMapSourceHealth source_health'));
tests\signalmap-rpc-shell.test.mjs:42:describe('SignalMap server shell', () => {
tests\signalmap-rpc-shell.test.mjs:55:    const first = buildSignalMapEventsCacheKey({
tests\signalmap-rpc-shell.test.mjs:63:    const second = buildSignalMapEventsCacheKey({
tests\signalmap-rpc-shell.test.mjs:88:      const response = await listSignalMapEvents({}, {});
tests\signalmap-rpc-shell.test.mjs:102:describe('SignalMap gateway cache tier', () => {
tests\signalmap-rpc-shell.test.mjs:103:  it('has an explicit fast tier for the list SignalMap events RPC', () => {
tests\signalmap-radar-normalization.test.mjs:23:describe('Cloudflare Radar SignalMap normalization', () => {
tests\signalmap-radar-normalization.test.mjs:30:  it('internet outages seeder writes SignalMap radar health without token exposure', () => {
tests\signalmap-radar-normalization.test.mjs:35:    assert.ok(source.includes('writeSignalMapRadarHealth'));
tests\signalmap-watchlist.test.mjs:16:  isSignalMapCategory,
tests\signalmap-watchlist.test.mjs:17:  isSignalMapProviderId,
tests\signalmap-watchlist.test.mjs:18:  isSignalMapRegionGroupId,
tests\signalmap-watchlist.test.mjs:19:  isSignalMapSeverity,
tests\signalmap-watchlist.test.mjs:22:  annotateSignalMapWatchlistMatches,
tests\signalmap-watchlist.test.mjs:23:  loadSignalMapWatchlist,
tests\signalmap-watchlist.test.mjs:24:  normalizeSignalMapWatchlistState,
tests\signalmap-watchlist.test.mjs:25:  prioritizeSignalMapWatchlistMatches,
tests\signalmap-watchlist.test.mjs:26:  saveSignalMapWatchlist,
tests\signalmap-watchlist.test.mjs:52:function createSignalMapEvent(overrides = {}) {
tests\signalmap-watchlist.test.mjs:58:    summary: 'SignalMap event',
tests\signalmap-watchlist.test.mjs:71:describe('SignalMap watchlist config', () => {
tests\signalmap-watchlist.test.mjs:115:      assert.ok(isSignalMapCategory(category), `invalid default category: ${category}`);
tests\signalmap-watchlist.test.mjs:119:      assert.ok(isSignalMapProviderId(provider), `invalid default provider: ${provider}`);
tests\signalmap-watchlist.test.mjs:123:      assert.ok(isSignalMapRegionGroupId(region), `invalid default region: ${region}`);
tests\signalmap-watchlist.test.mjs:128:    assert.equal(isSignalMapCategory('internet'), true);
tests\signalmap-watchlist.test.mjs:129:    assert.equal(isSignalMapCategory('custom'), false);
tests\signalmap-watchlist.test.mjs:130:    assert.equal(isSignalMapProviderId('aws'), false);
tests\signalmap-watchlist.test.mjs:131:    assert.equal(isSignalMapRegionGroupId('mars'), false);
tests\signalmap-watchlist.test.mjs:132:    assert.equal(isSignalMapSeverity('critical'), true);
tests\signalmap-watchlist.test.mjs:133:    assert.equal(isSignalMapSeverity('urgent'), false);
tests\signalmap-watchlist.test.mjs:137:    assert.match(signalMapTypesSource, /export type SignalMapRegionGroup\s*=/);
tests\signalmap-watchlist.test.mjs:138:    assert.match(signalMapTypesSource, /export interface SignalMapProviderConfig\s*{/);
tests\signalmap-watchlist.test.mjs:139:    assert.match(signalMapTypesSource, /export interface SignalMapRegionGroupConfig\s*{/);
tests\signalmap-watchlist.test.mjs:140:    assert.match(signalMapTypesSource, /export interface SignalMapEvent\s*{[\s\S]*category:\s*SignalMapCategory;/);
tests\signalmap-watchlist.test.mjs:141:    assert.match(signalMapTypesSource, /export interface SignalMapEvent\s*{[\s\S]*severity:\s*SignalMapSeverity;/);
tests\signalmap-watchlist.test.mjs:142:    assert.match(signalMapTypesSource, /export interface SignalMapSource\s*{[\s\S]*tier\?:\s*number;/);
tests\signalmap-watchlist.test.mjs:143:    assert.match(signalMapTypesSource, /export interface SignalMapEvent\s*{[\s\S]*kind:\s*SignalMapKind;/);
tests\signalmap-watchlist.test.mjs:155:describe('SignalMap watchlist service', () => {
tests\signalmap-watchlist.test.mjs:159:    assert.deepEqual(loadSignalMapWatchlist(storage), {
tests\signalmap-watchlist.test.mjs:171:    assert.doesNotThrow(() => loadSignalMapWatchlist(storage));
tests\signalmap-watchlist.test.mjs:172:    assert.deepEqual(loadSignalMapWatchlist(storage), {
tests\signalmap-watchlist.test.mjs:180:      normalizeSignalMapWatchlistState({
tests\signalmap-watchlist.test.mjs:194:    assert.deepEqual(saveSignalMapWatchlist({ regions: [], providers: [] }, storage), {
tests\signalmap-watchlist.test.mjs:198:    assert.deepEqual(loadSignalMapWatchlist(storage), {
tests\signalmap-watchlist.test.mjs:207:    loadSignalMapWatchlist(storage);
tests\signalmap-watchlist.test.mjs:208:    saveSignalMapWatchlist({ regions: ['apac'], providers: ['wasabi'] }, storage);
tests\signalmap-watchlist.test.mjs:220:      createSignalMapEvent({ id: 'provider-match', provider: 'okta' }),
tests\signalmap-watchlist.test.mjs:221:      createSignalMapEvent({
tests\signalmap-watchlist.test.mjs:226:      createSignalMapEvent({
tests\signalmap-watchlist.test.mjs:233:    const annotated = annotateSignalMapWatchlistMatches(events, {
tests\signalmap-watchlist.test.mjs:250:      createSignalMapEvent({ id: 'no-locations', locations: [] }),
tests\signalmap-watchlist.test.mjs:251:      createSignalMapEvent({
tests\signalmap-watchlist.test.mjs:255:      createSignalMapEvent({
tests\signalmap-watchlist.test.mjs:259:      createSignalMapEvent({
tests\signalmap-watchlist.test.mjs:265:    const annotated = annotateSignalMapWatchlistMatches(events, {
tests\signalmap-watchlist.test.mjs:280:      createSignalMapEvent({
tests\signalmap-watchlist.test.mjs:284:      createSignalMapEvent({ id: 'first-match', provider: 'wasabi' }),
tests\signalmap-watchlist.test.mjs:285:      createSignalMapEvent({
tests\signalmap-watchlist.test.mjs:289:      createSignalMapEvent({ id: 'second-match', provider: 'okta' }),
tests\signalmap-watchlist.test.mjs:292:    const prioritized = prioritizeSignalMapWatchlistMatches(events, {
tests\sse-stream.test.mjs:18:let handleSignalMapStream;
tests\sse-stream.test.mjs:19:let setupSignalMapStreamShutdown;
tests\sse-stream.test.mjs:25:// getRedisAdapter() singleton won't be called until handleSignalMapStream is
tests\sse-stream.test.mjs:29:  handleSignalMapStream = mod.handleSignalMapStream;
tests\sse-stream.test.mjs:30:  setupSignalMapStreamShutdown = mod.setupSignalMapStreamShutdown;
tests\sse-stream.test.mjs:39:  // 1. handleSignalMapStream is an async function
tests\sse-stream.test.mjs:40:  it('handleSignalMapStream is an async function', () => {
tests\sse-stream.test.mjs:41:    assert.equal(typeof handleSignalMapStream, 'function', 'handleSignalMapStream should be a function');
tests\sse-stream.test.mjs:44:      handleSignalMapStream.constructor.name === 'AsyncFunction',
tests\sse-stream.test.mjs:45:      `Expected AsyncFunction, got ${handleSignalMapStream.constructor.name}`,
tests\sse-stream.test.mjs:49:  // 2. setupSignalMapStreamShutdown is idempotent (calling twice doesn't add multiple listeners)
tests\sse-stream.test.mjs:50:  it('setupSignalMapStreamShutdown is idempotent — does not add multiple SIGTERM listeners', () => {
tests\sse-stream.test.mjs:55:    setupSignalMapStreamShutdown();
tests\sse-stream.test.mjs:59:    setupSignalMapStreamShutdown();
tests\sse-stream.test.mjs:66:      `Second call to setupSignalMapStreamShutdown added listeners (${afterFirst} → ${afterSecond})`,
tests\sse-stream.test.mjs:115:    handleSignalMapStream(req, res).catch((err) => {
tests\sse-stream.test.mjs:153:    // Also quit the singleton used internally by handleSignalMapStream —
tests\sse-stream.test.mjs:181:  // 4. handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor
tests\sse-stream.test.mjs:182:  it('handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor', { skip: probeFailed }, async () => {
tests\sse-stream.test.mjs:218:  // 5. handleSignalMapStream replays prior events as SSE frames and decrements registry on close
tests\sse-stream.test.mjs:219:  it('handleSignalMapStream replays prior events as SSE frames and decrements registry on close', { skip: probeFailed }, async () => {
tests\sse-stream.test.mjs:271:  // 6. handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence
tests\sse-stream.test.mjs:272:  it('handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence', { skip: probeFailed }, async () => {
tests\supply-chain-v2.test.mjs:133:  const yamlSpec = readSrc('docs/api/SupplyChainService.openapi.yaml');

codex
## [CRITICAL] [(b) implementation contradicts spec] Live events get one replay ID per connected client

**File**: server/api/routes/signalmap-stream.ts:82  
**Spec**: "Monotonic IDs in Redis sorted set; client reconnect with `Last-Event-ID` replays correctly; eviction past size/TTL returns 204 + `X-Replay-Lost: true`"  
**Issue**: The per-connection Redis subscription callback allocates `nextEventId()` and writes to the replay ring. With N connected clients, one published event is written N times with N different IDs; with zero connected clients, it is not written at all. That breaks `Last-Event-ID` semantics and makes replay depend on current browser connections rather than the event stream.  
**Recommendation**: Move ID allocation and ring writes to a single producer path: either the collector writes the ring before publishing, or one process-level subscriber writes once and fans out the same `{ id, payload }` to all connections.

## [HIGH] [(b) implementation contradicts spec] Replay ring stores IDs, not event JSON

**File**: src/server/lib/sse-replay-ring.ts:49  
**Spec**: "Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay"  
**Issue**: `addEventToRing()` stores the payload in `signalmap:sse:event:<id>` via `SETEX`, then stores only `String(id)` as the sorted-set member. `ZRANGEBYSCORE` therefore cannot replay event JSON from the ring itself, contrary to the contract. This split storage also creates inconsistent TTL behavior.  
**Recommendation**: Store the serialized SSE event payload as the sorted-set member, or formally revise the spec and make the two-key design atomic and gap-aware.

## [HIGH] [(b) implementation contradicts spec] TTL expiry is silently filtered instead of reported as replay loss

**File**: src/server/lib/sse-replay-ring.ts:106  
**Spec**: "eviction past size/TTL returns 204 + `X-Replay-Lost: true`"  
**Issue**: When the sidecar event payload expires, `replayFrom()` just skips the missing payload and returns `lost: false`. The test at `tests/sse-replay-ring.test.mjs:231` explicitly asserts this wrong behavior. A reconnecting client can miss retained IDs without receiving the required `204 X-Replay-Lost: true`.  
**Recommendation**: Treat any missing payload inside the requested replay range as `lost: true`, or remove individual payload TTLs and evict through the sorted-set ring only.

## [HIGH] [(a) spec directive not implemented] Graceful shutdown handler is exported but not installed

**File**: server/api/routes/signalmap-stream.ts:114  
**Spec**: "on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n`"  
**Issue**: `setupSignalMapStreamShutdown()` installs the signal listeners, but production code never calls it. A repository search finds callers only in tests, so normal SIGTERM/SIGINT shutdown will not notify connected SSE clients.  
**Recommendation**: Call `setupSignalMapStreamShutdown()` from the server startup/route registration path, with an idempotency test kept in place.

## [HIGH] [(c) missing error handling] Redis failures do not return 503 or force SSE reconnect

**File**: server/api/routes/signalmap-stream.ts:57  
**Spec**: "Redis connection lost | Collector buffers in-memory (5-min cap); API endpoints `503 { reason: \"store_unavailable\" }`; SSE clients reconnect"  
**Issue**: `replayFrom(redis, validLastId)` is unguarded, so Redis setup/replay failures reject the handler instead of producing the required `503`. After the SSE stream is open, Redis failures inside the pub/sub callback are only logged and the client stays connected while missing events.  
**Recommendation**: Wrap initial Redis/replay setup and return `503 { reason: "store_unavailable" }` before opening SSE; after headers are sent, close the stream or send shutdown/retry so EventSource reconnects.

## [MEDIUM] [(d) test gap] Redis-backed SSE tests can skip all Redis coverage

**File**: tests/sse-replay-ring.test.mjs:26  
**Spec**: "Tests: monotonic ID generation, ring eviction past size+TTL, replay from `Last-Event-ID`, `204 X-Replay-Lost` when ID evicted, jittered shutdown retry, heartbeat cadence"  
**Issue**: The SSE replay suite marks itself skipped when `REDIS_URL` is unset, and `tests/sse-stream.test.mjs:80` follows the same pattern. That allows the Phase 3 gate to pass without proving the required real-Redis behavior.  
**Recommendation**: Make CI provision Redis and fail if unavailable, or gate local skips behind an explicit opt-in such as `ALLOW_REDIS_TEST_SKIP=1`.

## [MEDIUM] [(d) test gap] Live pub/sub fan-out branch is not tested

**File**: server/api/routes/signalmap-stream.ts:79  
**Spec**: "SSE handler subscribes to a Redis pub/sub channel and pushes deltas to connected browsers."  
**Issue**: `tests/sse-stream.test.mjs` covers replay, heartbeat, and `204`, but never publishes to `signalmap:events`. The critical branch that parses live pub/sub messages, writes the replay ring, and emits SSE frames is untested, which is why the per-client duplicate-ID bug is not caught.  
**Recommendation**: Add a test with two connected clients, publish one Redis message, assert both clients receive the same event ID, and assert the ring contains exactly one replay entry.

## [MEDIUM] [(a) spec directive not implemented] Generated artifact freshness is not verified

**File**: package.json:27  
**Spec**: "Both are committed; CI verifies they match the source schemas."  
**Issue**: `build:openapi` and `build:types` regenerate files, but there is no check that committed `public/openapi.yaml` and `src/client/types.ts` match the schemas. A CI run can rewrite files and still pass unless a separate dirty-worktree check exists.  
**Recommendation**: Add a freshness test or CI step that regenerates both artifacts and runs `git diff --exit-code public/openapi.yaml src/client/types.ts`.

I attempted the listed Phase 3 test command, but this sandbox blocks `tsx`/esbuild child process startup with `spawn EPERM`, so the findings above are from source inspection rather than local test execution.
2026-04-27T19:31:12.740430Z ERROR codex_core::session: failed to record rollout items: thread 019dd066-a8f8-77f0-8ea1-e5f96f1a8400 not found
tokens used
130,159
## [CRITICAL] [(b) implementation contradicts spec] Live events get one replay ID per connected client

**File**: server/api/routes/signalmap-stream.ts:82  
**Spec**: "Monotonic IDs in Redis sorted set; client reconnect with `Last-Event-ID` replays correctly; eviction past size/TTL returns 204 + `X-Replay-Lost: true`"  
**Issue**: The per-connection Redis subscription callback allocates `nextEventId()` and writes to the replay ring. With N connected clients, one published event is written N times with N different IDs; with zero connected clients, it is not written at all. That breaks `Last-Event-ID` semantics and makes replay depend on current browser connections rather than the event stream.  
**Recommendation**: Move ID allocation and ring writes to a single producer path: either the collector writes the ring before publishing, or one process-level subscriber writes once and fans out the same `{ id, payload }` to all connections.

## [HIGH] [(b) implementation contradicts spec] Replay ring stores IDs, not event JSON

**File**: src/server/lib/sse-replay-ring.ts:49  
**Spec**: "Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay"  
**Issue**: `addEventToRing()` stores the payload in `signalmap:sse:event:<id>` via `SETEX`, then stores only `String(id)` as the sorted-set member. `ZRANGEBYSCORE` therefore cannot replay event JSON from the ring itself, contrary to the contract. This split storage also creates inconsistent TTL behavior.  
**Recommendation**: Store the serialized SSE event payload as the sorted-set member, or formally revise the spec and make the two-key design atomic and gap-aware.

## [HIGH] [(b) implementation contradicts spec] TTL expiry is silently filtered instead of reported as replay loss

**File**: src/server/lib/sse-replay-ring.ts:106  
**Spec**: "eviction past size/TTL returns 204 + `X-Replay-Lost: true`"  
**Issue**: When the sidecar event payload expires, `replayFrom()` just skips the missing payload and returns `lost: false`. The test at `tests/sse-replay-ring.test.mjs:231` explicitly asserts this wrong behavior. A reconnecting client can miss retained IDs without receiving the required `204 X-Replay-Lost: true`.  
**Recommendation**: Treat any missing payload inside the requested replay range as `lost: true`, or remove individual payload TTLs and evict through the sorted-set ring only.

## [HIGH] [(a) spec directive not implemented] Graceful shutdown handler is exported but not installed

**File**: server/api/routes/signalmap-stream.ts:114  
**Spec**: "on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n`"  
**Issue**: `setupSignalMapStreamShutdown()` installs the signal listeners, but production code never calls it. A repository search finds callers only in tests, so normal SIGTERM/SIGINT shutdown will not notify connected SSE clients.  
**Recommendation**: Call `setupSignalMapStreamShutdown()` from the server startup/route registration path, with an idempotency test kept in place.

## [HIGH] [(c) missing error handling] Redis failures do not return 503 or force SSE reconnect

**File**: server/api/routes/signalmap-stream.ts:57  
**Spec**: "Redis connection lost | Collector buffers in-memory (5-min cap); API endpoints `503 { reason: \"store_unavailable\" }`; SSE clients reconnect"  
**Issue**: `replayFrom(redis, validLastId)` is unguarded, so Redis setup/replay failures reject the handler instead of producing the required `503`. After the SSE stream is open, Redis failures inside the pub/sub callback are only logged and the client stays connected while missing events.  
**Recommendation**: Wrap initial Redis/replay setup and return `503 { reason: "store_unavailable" }` before opening SSE; after headers are sent, close the stream or send shutdown/retry so EventSource reconnects.

## [MEDIUM] [(d) test gap] Redis-backed SSE tests can skip all Redis coverage

**File**: tests/sse-replay-ring.test.mjs:26  
**Spec**: "Tests: monotonic ID generation, ring eviction past size+TTL, replay from `Last-Event-ID`, `204 X-Replay-Lost` when ID evicted, jittered shutdown retry, heartbeat cadence"  
**Issue**: The SSE replay suite marks itself skipped when `REDIS_URL` is unset, and `tests/sse-stream.test.mjs:80` follows the same pattern. That allows the Phase 3 gate to pass without proving the required real-Redis behavior.  
**Recommendation**: Make CI provision Redis and fail if unavailable, or gate local skips behind an explicit opt-in such as `ALLOW_REDIS_TEST_SKIP=1`.

## [MEDIUM] [(d) test gap] Live pub/sub fan-out branch is not tested

**File**: server/api/routes/signalmap-stream.ts:79  
**Spec**: "SSE handler subscribes to a Redis pub/sub channel and pushes deltas to connected browsers."  
**Issue**: `tests/sse-stream.test.mjs` covers replay, heartbeat, and `204`, but never publishes to `signalmap:events`. The critical branch that parses live pub/sub messages, writes the replay ring, and emits SSE frames is untested, which is why the per-client duplicate-ID bug is not caught.  
**Recommendation**: Add a test with two connected clients, publish one Redis message, assert both clients receive the same event ID, and assert the ring contains exactly one replay entry.

## [MEDIUM] [(a) spec directive not implemented] Generated artifact freshness is not verified

**File**: package.json:27  
**Spec**: "Both are committed; CI verifies they match the source schemas."  
**Issue**: `build:openapi` and `build:types` regenerate files, but there is no check that committed `public/openapi.yaml` and `src/client/types.ts` match the schemas. A CI run can rewrite files and still pass unless a separate dirty-worktree check exists.  
**Recommendation**: Add a freshness test or CI step that regenerates both artifacts and runs `git diff --exit-code public/openapi.yaml src/client/types.ts`.

I attempted the listed Phase 3 test command, but this sandbox blocks `tsx`/esbuild child process startup with `spawn EPERM`, so the findings above are from source inspection rather than local test execution.
