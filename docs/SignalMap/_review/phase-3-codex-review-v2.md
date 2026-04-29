OpenAI Codex v0.125.0 (research preview)
--------
workdir: C:\Coding_Workspace\Github_P\worldmonitor
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR, C:\Users\MalindaRathnayake\.codex\memories]
reasoning effort: xhigh
reasoning summaries: none
session id: 019dd067-8e57-7fd0-a197-917ccfa52abc
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
I’ll use the `review` skill for this turn because the request is explicitly a code review with evidence requirements. I’m going to read the review workflow first, then inspect the spec and Phase 3 files against it.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Raw C:/Users/MalindaRathnayake/.codex/skills/review/SKILL.md' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 914ms:
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


codex
I’m locating the exact Phase 3 spec clauses first, because every reported issue needs to anchor to a sentence in the spec rather than an implementation preference.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "Phase 3|Config Schema|Generated artifacts|Core Behavior|SSE_|Quality Gates Summary|event detail|brief|stream" docs/SignalMap/spec.md' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "signalmap|SSE|openapi|base-url|replay|Redis|brief|event" server/api/schemas/common.ts server/api/schemas/signalmap.ts server/api/openapi.ts scripts/build-openapi.mjs src/client/base-url.ts src/client/openapi.ts src/client/types.ts src/server/lib/redis.types.ts src/server/lib/redis.ts src/server/lib/sse-replay-ring.ts server/api/routes/signalmap-stream.ts tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs package.json' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 908ms:
14:Replace the multi-variant worldmonitor SignalMap shell with a clean-slate single-product Preact + JSX dashboard that matches `docs/SignalMap/Claude_Design/`. Keep the existing collector pipeline (RSS, Cloudflare Radar, provider status, LanceDB dedup, watchlist) and rewire the data-layer onto a leaner stack: ioredis adapter (drop the `redis-rest` HTTP shim and `@upstash/redis`), code-first OpenAPI + `openapi-fetch` typed client, SSE with Redis-backed replay ring, Perplexity Sonar Pro + OpenRouter Nemotron brief feature with stampede/spend/citation/injection hardening, and a 2-service Docker stack served behind HTTP/2 nginx. Non-SignalMap legacy code is archived to a `archive/v1-legacy` git branch and removed from main.
25:| Brief synth | Single-pass `anthropic/claude-sonnet-4.6`. Background cron writes one global brief to Redis every `SIGNALMAP_BRIEF_REFRESH_MINUTES` (30 default). Frontend reads cached value; SSE pushes update. | User decision 2026-04-26 after real-workflow 3-way test (Sonnet vs Gemini 3 Flash vs GPT-5.4-mini). Sonnet was the only model that noticed and ignored Perplexity's hallucinated context. 2-pass architecture rejected — reasoning-tier draft models leak CoT. | design-summary §Key Decisions, real-workflow-brief-result.md |
26:| Brief generation pattern | **Server-side cron** is the SOLE writer of the global brief. Frontend is read-only. No filter signature in cache key (single global brief shared by all users; watchlist personalization is client-side visual emphasis only). Per-event briefs remain on-demand via user click (SETNX singleflight + per-IP rate limit on this endpoint only). | User decision 2026-04-26: internal coworker portal behind CF ZTNA; news content is identical for everyone. Per-user fragmentation was over-engineering. | user 2026-04-26 |
48:│  │ Buffering │    │   map/stream │    │                      │   │
50:│  │ /stream   │    │ /api/signal- │    │                      │   │
51:│  │           │    │  map/brief/* │    │                      │   │
58:│                   │  brief cache + singleflight lock │           │
106:    brief.ts                         # global + per-event brief state
124:      signalmap-stream.ts            # SSE
125:      signalmap-brief-global.ts
126:      signalmap-brief-event.ts
159:### Generated artifacts (Phase 3)
164:## Config Schema (env vars)
167:# Required for collector + brief
170:# Required for global brief context (per-event brief degrades without it)
192:# LLM brief — single-pass Sonnet 4.6, server cron writes
211:SSE_HEARTBEAT_SECONDS=20
212:SSE_REPLAY_RING_SIZE=1000
213:SSE_REPLAY_RING_TTL_SECONDS=600
214:SSE_RECONNECT_RETRY_MIN_MS=5000
215:SSE_RECONNECT_RETRY_MAX_MS=15000
231:## Core Behavior
235:3. `state/sse.ts` opens `EventSource('/api/signalmap/stream')` (auto-reconnects with server-sent `retry:`).
240:8. User clicks marker → `selectedEventId` signal flips → `Inspector` opens, fetches event detail via `openapi-fetch`.
241:9. User clicks "Why this matters" tab in `Inspector` → calls `POST /api/signalmap/brief/event/:id` → server checks cache → on miss, runs synthesis with the event + LanceDB-related stories → returns `{ whyItMatters, model, generatedAt }`.
242:10. Every 30 min (or on user "Refresh"), `BriefStrip` calls `POST /api/signalmap/brief/global` with current filter signature → server runs cache→singleflight→spend reservation→Perplexity→citation revalidation→OpenRouter (with XML-wrapped context)→schema validation→cache write.
252:| `signalmap.brief.calls` | counter | brief endpoint | tagged by flavor (global / per-event) |
253:| `signalmap.brief.cache_hits` | counter | brief endpoint | |
254:| `signalmap.brief.lock_contention` | counter | brief endpoint | stampede polling triggered |
255:| `signalmap.brief.budget_refusals` | counter | brief endpoint | spend reservation rejected |
256:| `signalmap.brief.citations_dropped` | counter | brief endpoint | citations outside allowlist |
257:| `signalmap.brief.tokens_input` | gauge | brief endpoint | per call (estimated + actual) |
258:| `signalmap.brief.tokens_output` | gauge | brief endpoint | |
259:| `signalmap.brief.cost_usd` | gauge | brief endpoint | per call (estimated + actual) |
273:| OpenRouter draft model (Nemotron) 429/5xx | No fallback chain in v1 — return `503 { disabled: true, reason: "draft_model_unavailable", model: "nvidia/nemotron-3-super-120b-a12b" }` → UI hides brief | If recurring: add a fallback model to `SIGNALMAP_BRIEF_DRAFT_MODEL` (Phase-2 candidate) |
274:| OpenRouter moderator model (Gemini 3.1 Pro) 429/5xx | Return Nemotron's draft directly with `moderationSkipped: true` warning in brief metadata; UI shows a small "polish unavailable" indicator but the brief still renders | Auto-recovery on next refresh cycle |
275:| Perplexity 429/5xx | Brief retrieval falls back to local-signals-only synthesis | Note in brief output: "External context unavailable" |
278:| Daily budget exceeded (atomic) | `503 { disabled: true, reason: "budget_exhausted", resets_at }` | UI shows "Daily brief budget reached" |
282:| LanceDB unavailable | Skip related-story dedup (warn log); per-event brief omits "related stories" context | Synthesis still works |
283:| SSE Last-Event-ID evicted from ring | `204 X-Replay-Lost: true` | UI shows "Reconnecting from latest" briefly |
307:| `zod` | UNKNOWN — install latest in Phase 3 | Route schema validation |
308:| `zod-openapi` | UNKNOWN — install latest in Phase 3 | Code-first OpenAPI generation from zod schemas |
309:| `openapi-typescript` | UNKNOWN — install latest in Phase 3 (devDep) | TS types from generated spec |
310:| `openapi-fetch` | UNKNOWN — install latest in Phase 3 | Typed fetch client |
325:- All non-SignalMap API endpoints (briefs SaaS, scenarios, leads, MCP, OAuth, payments, telegram, youtube, etc.) — archived to `archive/v1-legacy` branch
341:| Brief stampede | Concurrent identical brief requests acquire 1 upstream call; secondaries poll cache; 30s timeout |
350:| Frontend shell E2E | Standalone Preact shell renders, signal markers visible, watchlist toggle works, inspector opens, brief auto-refreshes (mocked LLM) |
351:| Brief flow E2E | Global brief generates → renders → expires → re-generates with stampede protection |
357:- Internals of `ioredis` (already battle-tested upstream)
366:| OpenRouter HTTP | yes (fixture responses) | only in `e2e/brief-live.spec.ts` (gated by `RUN_LIVE_LLM=1`) |
416:| 2d nginx HTTP/2 + SSE config | `docker/nginx.conf` template | Add `listen 8080 http2;`; add `location /api/signalmap/stream { proxy_buffering off; proxy_cache off; proxy_set_header X-Accel-Buffering no; add_header Cache-Control "no-cache, no-transform"; proxy_read_timeout 1d; }`; verify other locations preserved | `docker compose up -d --build --force-recreate signalmap && curl --http2 -I http://localhost:3000/` shows `HTTP/2 200` | Touch CSP header (gone with the SaaS chrome) |
421:### Phase 3 — API Contract + Client + SSE Replay
428:| 3d SSE endpoint + replay ring | `server/api/routes/signalmap-stream.ts`, `src/server/lib/sse-replay-ring.ts` | Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay; subscribe to `signalmap:events` pubsub channel; heartbeat every `SSE_HEARTBEAT_SECONDS`; on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n` | `npx tsx --test tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs` | Use in-memory replay |
429:| 3e SSE tests | `tests/sse-replay-ring.test.mjs`, `tests/sse-stream.test.mjs` | Tests: monotonic ID generation, ring eviction past size+TTL, replay from `Last-Event-ID`, `204 X-Replay-Lost` when ID evicted, jittered shutdown retry, heartbeat cadence | Same command as 3d | Mock Redis (use real container) |
431:**Phase 3 checkpoint:** `npm run build:openapi && npm run build:types && npm run typecheck:all` clean; all 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green.
440:| 4d LiveFeed + Inspector + BriefStrip placeholders | `src/components/feed/LiveFeed.tsx`, `src/components/feed/FeedCard.tsx`, `src/components/inspector/Inspector.tsx`, `src/components/inspector/WhyItMattersTab.tsx`, `src/components/chrome/BriefStrip.tsx` | LiveFeed shows mocked event titles; Inspector opens on `selectedEventId` change with mocked event detail; WhyItMattersTab shows "Generate" button (no-op until Phase 6); BriefStrip shows "Loading..." placeholder | `npx playwright test e2e/feed.spec.ts e2e/inspector.spec.ts` | Implement brief generation logic |
443:**Phase 4 checkpoint:** `npm run dev` opens `localhost:3000` with the standalone shell fully populated from fixtures; signals flow end-to-end; SSE updates animate in (with mocked stream).
460:| 6a Perplexity client + allowlist + revalidation + prompt | `src/server/lib/perplexity.ts`, `src/server/lib/citation-validator.ts`, `tests/perplexity-brief.test.mjs`, `tests/brief-citation-validation.test.mjs` | `perplexity.ts` POSTs to Sonar Pro with `search_domain_filter` (≤20), `search_recency_filter`, the strong system prompt; `citation-validator.ts` parses returned `citations[]`, drops URLs not in allowlist; if 100% dropped, return `{ degraded: true }` | `npx tsx --test tests/perplexity-brief.test.mjs tests/brief-citation-validation.test.mjs` | Send >20 domains in a single call |
461:| 6b OpenRouter 2-pass + XML wrap + schema | `src/server/lib/openrouter.ts`, `src/server/lib/brief-pipeline.ts`, `tests/brief-prompt-injection.test.mjs`, `tests/brief-pipeline.test.mjs` | `openrouter.ts` exposes a generic `chat(model, messages)` call. `brief-pipeline.ts` orchestrates the 2-pass: (1) call `SIGNALMAP_BRIEF_DRAFT_MODEL` (Nemotron) with synth prompt wrapping Perplexity output in `<retrieved_context>...</retrieved_context>`; (2) call `SIGNALMAP_BRIEF_MODERATOR_MODEL` (Gemini 3.1 Pro) with moderation prompt wrapping Nemotron's draft in `<draft>...</draft>` and the original `<retrieved_context>` (so moderator can verify draft against sources). Both outputs validated against zod schema. Final brief object: `{ bullets: string[], generatedAt, draftModel, moderatorModel, draftRaw, moderationSkipped: false, warnings: string[] }`. Injection test feeds malicious headline at BOTH boundaries (Perplexity → draft, draft → moderator) and asserts schema rejects or wrap remains intact at each stage. If moderator fails, return draft directly with `moderationSkipped: true`. | `npx tsx --test tests/brief-prompt-injection.test.mjs tests/brief-pipeline.test.mjs` | Pass raw text without XML wrap; skip schema validation on draft (validate at every stage) |
462:| 6c Spend reservation + per-event singleflight + per-event rate limit | `src/server/lib/spend-reservation.ts`, `src/server/lib/singleflight.ts`, `src/server/lib/rate-limit.ts`, `tests/brief-spend-reservation.test.mjs`, `tests/brief-per-event-stampede.test.mjs` | `spend-reservation.ts`: atomic `INCRBYFLOAT signalmap:llm:spend:YYYY-MM-DD <est_cost>`; if total > budget, decrement back and return `false`; on success refund usage-based delta. **Used by both the cron (global brief) AND per-event endpoint** — both must respect daily budget. `singleflight.ts`: `setNx(lock_key, pid, ttl)`; **only used by per-event brief endpoint** (multi-user click stampede possible on a fresh event). Global brief has no singleflight — cron is sole writer. `rate-limit.ts`: per-IP `INCR signalmap:rl:event:<ip>:<minute>` with `EXPIRE 60`; **only on per-event brief endpoint** (global brief reads are cache hits, no need). | `npx tsx --test tests/brief-spend-reservation.test.mjs tests/brief-per-event-stampede.test.mjs` | Apply singleflight or rate-limit to global brief (it's a cache read) |
463:| 6d Brief endpoints + cron job + admin refresh | `server/api/routes/signalmap-brief-global.ts` (read-only cache lookup), `server/api/routes/signalmap-brief-event.ts` (on-demand with singleflight), `server/api/routes/signalmap-brief-health.ts` (operator visibility), `server/api/routes/signalmap-brief-refresh.ts` (admin-token-gated manual trigger), `scripts/brief-cron.mjs` (background job), `docker/supervisord.signalmap.conf` (add brief-cron program), `tests/brief-endpoints.test.mjs`, `tests/brief-cron.test.mjs` | **Global brief endpoint**: 3-line handler reading `signalmap:brief:global` from Redis, returning JSON. No LLM call ever from this path. **Per-event endpoint**: cache-check → singleflight → spend-reserve → OpenRouter (XML-wrapped synthesis with event + 3 LanceDB-related stories) → schema validation → cache write (forever per event ID). **Health endpoint**: returns `{ lastGeneratedAt, nextScheduledAt, dailySpendUsd, dailyBudgetUsd, modelInUse }`. **Manual refresh endpoint**: requires `X-SignalMap-Admin-Token` header matching `SIGNALMAP_ADMIN_TOKEN` env; triggers immediate brief regen, still respects budget. **Brief cron**: separate Node process (started by supervisord), loops every `SIGNALMAP_BRIEF_REFRESH_MINUTES`, calls Perplexity → citation revalidation → Sonnet 4.6 → spend reservation → write to `signalmap:brief:global` (no TTL, overwrite-in-place) → publish `signalmap:brief:updated` pubsub event for SSE. | `npx tsx --test tests/brief-endpoints.test.mjs tests/brief-cron.test.mjs` | Build a request-driven generation path on the global endpoint |
464:| 6e UI BriefStrip + WhyItMatters tab + brief E2E | `src/components/chrome/BriefStrip.tsx` (read-only cached brief renderer), `src/components/inspector/WhyItMattersTab.tsx` (on-demand generation), `src/state/brief.ts`, `e2e/brief-flow.spec.ts` | BriefStrip is a thin reader: fetches `/api/signalmap/brief/global` once on mount, then subscribes to SSE `brief-updated` events to swap in fresh content (no client-side timer). Renders: bullets + "Updated 4m ago" indicator + "Sources: Reuters, FT, …" + watchlist-match emphasis (client-side: bold any bullet text whose entity matches user's localStorage watchlist). Manual "Refresh now" button visible only if `localStorage.signalmap_admin_token` is set; calls `/api/signalmap/brief/refresh` with that token in `X-SignalMap-Admin-Token` header. WhyItMattersTab fires on user click → POST `/api/signalmap/brief/event/:id`. Brief E2E asserts: cron runs and SSE pushes update; manual refresh works with token, fails without; per-event 10 parallel clicks → 1 upstream call. | `npx playwright test e2e/brief-flow.spec.ts` | Add a client-side polling timer (SSE-only) |
466:**Phase 6 checkpoint:** Brief generates against real Perplexity + OpenRouter (or mocked in CI); concurrent stampede produces 1 upstream call; budget refusal works; injection attempt fails schema; citations validated.
494:| 9d Final acceptance + Phase-2 backlog | `docs/SignalMap/phase-2-candidates.md` (NEW), `docs/SignalMap/PROGRESS.md` (mark complete) | Acceptance: `docker compose up -d --build --force-recreate` from clean state produces working stack; full E2E + visual regression green; manual smoke at `localhost:3000` confirms all panels working with live (or mocked) data. Phase-2 backlog documents: TimelineStrip, Tweaks overlay, mobile, brief history, embeddable widget mode | `npm run test:data && npx playwright test && docker compose up -d --build --force-recreate && curl http://localhost:3000/api/health \| jq` | Ship without final smoke at `localhost:3000` |
500:## Quality Gates Summary
510:| 6 | `npx tsx --test tests/perplexity-brief.test.mjs tests/brief-stampede.test.mjs tests/brief-spend-reservation.test.mjs tests/brief-citation-validation.test.mjs tests/brief-prompt-injection.test.mjs tests/brief-endpoints.test.mjs && npx playwright test e2e/brief-flow.spec.ts` | All brief hardening tests pass |

 succeeded in 994ms:
scripts/build-openapi.mjs:2: * build-openapi.mjs
scripts/build-openapi.mjs:5: * the result as YAML to public/openapi.yaml.
scripts/build-openapi.mjs:7: * Run via:  tsx scripts/build-openapi.mjs
scripts/build-openapi.mjs:14:import { generateSpec } from '../server/api/openapi.ts';
scripts/build-openapi.mjs:18:const outPath = resolve(repoRoot, 'public', 'openapi.yaml');
scripts/build-openapi.mjs:33:console.log(`Wrote ${Buffer.byteLength(yamlText, 'utf8')} bytes to public/openapi.yaml`);
server/api/openapi.ts:8:import 'zod-openapi/extend';
server/api/openapi.ts:9:import { createDocument, oas31 } from 'zod-openapi';
server/api/openapi.ts:10:import { signalmapPaths } from './schemas/signalmap.js';
server/api/openapi.ts:14:    openapi: '3.1.0',
server/api/openapi.ts:19:        'Public SignalMap HTTP API for events, source health, SSE stream, and briefs.',
server/api/openapi.ts:22:    paths: signalmapPaths,
server/api/schemas/common.ts:3: * Each component schema calls .openapi({ ref: '<Name>' }) so it lands in
server/api/schemas/common.ts:7:import 'zod-openapi/extend';
server/api/schemas/common.ts:25:  .openapi({ ref: 'SignalMapCategory' });
server/api/schemas/common.ts:29:  .openapi({ ref: 'SignalMapSeverity' });
server/api/schemas/common.ts:33:  .openapi({ ref: 'SignalMapLocationScope' });
server/api/schemas/common.ts:37:  .openapi({ ref: 'SignalMapKind' });
server/api/schemas/common.ts:49:  .openapi({ ref: 'SignalMapLocation' });
server/api/schemas/common.ts:60:  .openapi({ ref: 'SignalMapSource' });
server/api/schemas/common.ts:81:  .openapi({ ref: 'SignalMapEvent' });
server/api/schemas/common.ts:89:    eventCount: z.number().int(),
server/api/schemas/common.ts:92:  .openapi({ ref: 'SignalMapSourceHealth' });
server/api/schemas/common.ts:101:  .openapi({ ref: 'ErrorEnvelope' });
tests/openapi-spec-generation.test.mjs:5: * Run with:  npx tsx --test tests/openapi-spec-generation.test.mjs
tests/openapi-spec-generation.test.mjs:10:import { generateSpec } from '../server/api/openapi.ts';
tests/openapi-spec-generation.test.mjs:16:    assert.equal(spec.openapi, '3.1.0');
tests/openapi-spec-generation.test.mjs:25:    assert.ok(paths.includes('/api/signalmap/list'));
tests/openapi-spec-generation.test.mjs:26:    assert.ok(paths.includes('/api/signalmap/event/{id}'));
tests/openapi-spec-generation.test.mjs:27:    assert.ok(paths.includes('/api/signalmap/source-health'));
tests/openapi-spec-generation.test.mjs:28:    assert.ok(paths.includes('/api/signalmap/stream'));
tests/openapi-spec-generation.test.mjs:29:    assert.ok(paths.includes('/api/signalmap/brief/global'));
tests/openapi-spec-generation.test.mjs:30:    assert.ok(paths.includes('/api/signalmap/brief/event/{id}'));
tests/openapi-spec-generation.test.mjs:34:    const op = spec.paths['/api/signalmap/list'].get;
tests/openapi-spec-generation.test.mjs:42:  it('event endpoint declares id path param', () => {
tests/openapi-spec-generation.test.mjs:43:    const op = spec.paths['/api/signalmap/event/{id}'].get;
tests/openapi-spec-generation.test.mjs:49:  it('stream endpoint advertises text/event-stream', () => {
tests/openapi-spec-generation.test.mjs:50:    const op = spec.paths['/api/signalmap/stream'].get;
tests/openapi-spec-generation.test.mjs:52:    assert.ok(ok.content?.['text/event-stream'], 'stream 200 must declare text/event-stream content');
tests/openapi-spec-generation.test.mjs:67:    // zod-openapi v4 names from .openapi({ ref: 'SignalMapEvent' })
server/api/schemas/signalmap.ts:3: * Uses zod-openapi's ZodOpenApiPathsObject / requestParams pattern so that
server/api/schemas/signalmap.ts:7:import 'zod-openapi/extend';
server/api/schemas/signalmap.ts:9:import type { ZodOpenApiPathsObject } from 'zod-openapi';
server/api/schemas/signalmap.ts:17:// Endpoint 1 — GET /api/signalmap/list
server/api/schemas/signalmap.ts:30:  events: z.array(SignalMapEvent),
server/api/schemas/signalmap.ts:37:// Endpoint 3 — GET /api/signalmap/source-health
server/api/schemas/signalmap.ts:46:// Endpoint 5 — POST /api/signalmap/brief/global
server/api/schemas/signalmap.ts:63:// Endpoint 6 — POST /api/signalmap/brief/event/{id}
server/api/schemas/signalmap.ts:76:export const signalmapPaths: ZodOpenApiPathsObject = {
server/api/schemas/signalmap.ts:77:  '/api/signalmap/list': {
server/api/schemas/signalmap.ts:80:      summary: 'List SignalMap events with filters',
server/api/schemas/signalmap.ts:84:          description: 'Filtered SignalMap events with source health',
server/api/schemas/signalmap.ts:97:  '/api/signalmap/event/{id}': {
server/api/schemas/signalmap.ts:100:      summary: 'Get a single SignalMap event by ID',
server/api/schemas/signalmap.ts:106:          description: 'SignalMap event',
server/api/schemas/signalmap.ts:119:  '/api/signalmap/source-health': {
server/api/schemas/signalmap.ts:138:  '/api/signalmap/stream': {
server/api/schemas/signalmap.ts:141:      summary: 'SSE stream of live SignalMap events',
server/api/schemas/signalmap.ts:148:          description: 'Resume SSE stream from a previously received event ID',
server/api/schemas/signalmap.ts:153:          description: 'SSE event stream (text/event-stream)',
server/api/schemas/signalmap.ts:155:            'text/event-stream': { schema: z.string() },
server/api/schemas/signalmap.ts:164:              .openapi({ description: 'Set to true when replay ID was evicted' }),
server/api/schemas/signalmap.ts:175:  '/api/signalmap/brief/global': {
server/api/schemas/signalmap.ts:178:      summary: 'Get AI-generated global SignalMap brief (cached)',
server/api/schemas/signalmap.ts:186:          description: 'Global brief with bullet points and sources',
server/api/schemas/signalmap.ts:190:              .openapi({ description: 'Cache status: HIT or MISS' })
server/api/schemas/signalmap.ts:205:  '/api/signalmap/brief/event/{id}': {
server/api/schemas/signalmap.ts:208:      summary: 'Get AI-generated why-it-matters brief for a specific event (cached)',
server/api/schemas/signalmap.ts:219:          description: 'Event brief with why-it-matters explanation',
server/api/schemas/signalmap.ts:223:              .openapi({ description: 'Cache status: HIT or MISS' })
package.json:27:    "build:openapi": "tsx scripts/build-openapi.mjs",
package.json:28:    "build:types": "openapi-typescript public/openapi.yaml -o src/client/types.ts",
package.json:30:    "prebuild": "npm run build:openapi && npm run build:agent-skills",
package.json:34:    "build:full": "npm run build:openapi && npm run build:agent-skills && npm run build:blog && cross-env-shell VITE_VARIANT=full \"tsc && vite build\"",
package.json:35:    "build:tech": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=tech \"tsc && vite build\"",
package.json:36:    "build:finance": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=finance \"tsc && vite build\"",
package.json:37:    "build:happy": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=happy \"tsc && vite build\"",
package.json:38:    "build:commodity": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=commodity \"tsc && vite build\"",
package.json:97:    "openapi-typescript": "^7.0.0",
package.json:139:    "openapi-fetch": "^0.14.0",
package.json:152:    "zod-openapi": "^4.2.4"
server/api/routes/signalmap-stream.ts:3:import { getRedisAdapter } from '../../../src/server/lib/redis.js';
server/api/routes/signalmap-stream.ts:7:  replayFrom,
server/api/routes/signalmap-stream.ts:8:  type SSEEventPayload,
server/api/routes/signalmap-stream.ts:9:} from '../../../src/server/lib/sse-replay-ring.js';
server/api/routes/signalmap-stream.ts:11:const CHANNEL = 'signalmap:events';
server/api/routes/signalmap-stream.ts:14:  return Number(process.env.SSE_HEARTBEAT_SECONDS ?? 20);
server/api/routes/signalmap-stream.ts:18:  return Number(process.env.SSE_RECONNECT_RETRY_MIN_MS ?? 5000);
server/api/routes/signalmap-stream.ts:22:  return Number(process.env.SSE_RECONNECT_RETRY_MAX_MS ?? 15000);
server/api/routes/signalmap-stream.ts:36:function writeSSEEvent(res: ServerResponse, id: number, payload: SSEEventPayload): void {
server/api/routes/signalmap-stream.ts:38:  if (payload.event) res.write(`event: ${payload.event}\n`);
server/api/routes/signalmap-stream.ts:46:  const redis = getRedisAdapter();
server/api/routes/signalmap-stream.ts:49:  const headerId = req.headers['last-event-id'];
server/api/routes/signalmap-stream.ts:57:  const replay = await replayFrom(redis, validLastId);
server/api/routes/signalmap-stream.ts:58:  if (replay.lost) {
server/api/routes/signalmap-stream.ts:65:  // Open SSE
server/api/routes/signalmap-stream.ts:67:  res.setHeader('Content-Type', 'text/event-stream');
server/api/routes/signalmap-stream.ts:73:  // Send replayed events
server/api/routes/signalmap-stream.ts:74:  for (const { id, payload } of replay.events) {
server/api/routes/signalmap-stream.ts:75:    writeSSEEvent(res, id, payload);
server/api/routes/signalmap-stream.ts:81:      const payload: SSEEventPayload = JSON.parse(raw);
server/api/routes/signalmap-stream.ts:84:      writeSSEEvent(res, id, payload);
server/api/routes/signalmap-stream.ts:87:      console.warn('[signalmap-stream] failed to handle pub/sub message', err);
server/api/routes/signalmap-stream.ts:121:        conn.res.write(`event: shutdown\nretry: ${retry}\n\n`);
tests/sse-stream.test.mjs:2: * Smoke tests for the signalmap-stream SSE handler.
tests/sse-stream.test.mjs:4: * Requires a Redis 7 server at REDIS_URL (default: redis://localhost:6380).
tests/sse-stream.test.mjs:5: * Skips cleanly when Redis is unavailable.
tests/sse-stream.test.mjs:16:import { once } from 'node:events';
tests/sse-stream.test.mjs:25:// getRedisAdapter() singleton won't be called until handleSignalMapStream is
tests/sse-stream.test.mjs:28:  const mod = await import('../server/api/routes/signalmap-stream.ts');
tests/sse-stream.test.mjs:38:describe('signalmap-stream module — smoke tests', { skip: Boolean(importError) }, () => {
tests/sse-stream.test.mjs:78:// ─── Integration tests requiring live Redis ───────────────────────────────────
tests/sse-stream.test.mjs:88:const COUNTER_KEY = 'signalmap:sse:counter';
tests/sse-stream.test.mjs:89:const RING_KEY = 'signalmap:sse:ring';
tests/sse-stream.test.mjs:90:const EVENT_KEY_PREFIX = 'signalmap:sse:event:';
tests/sse-stream.test.mjs:129:  const ringMod = await import('../src/server/lib/sse-replay-ring.ts');
tests/sse-stream.test.mjs:137:describe('signalmap-stream integration — live Redis', { skip: Boolean(importError) || probeFailed }, () => {
tests/sse-stream.test.mjs:139:    const { createRedisAdapter } = await import('../src/server/lib/redis.ts');
tests/sse-stream.test.mjs:141:      redisAdapter = createRedisAdapter({ url: REDIS_URL });
tests/sse-stream.test.mjs:142:      await redisAdapter.incr('signalmap:test:probe');
tests/sse-stream.test.mjs:143:      await redisAdapter.del('signalmap:test:probe');
tests/sse-stream.test.mjs:146:      console.warn('[sse-stream.test] Redis unreachable, skipping:', err?.message);
tests/sse-stream.test.mjs:154:    // ioredis subscriber connections keep the event loop alive without this.
tests/sse-stream.test.mjs:156:      const { getRedisAdapter } = await import('../src/server/lib/redis.ts');
tests/sse-stream.test.mjs:157:      await getRedisAdapter().quit();
tests/sse-stream.test.mjs:163:    const prevMin = process.env.SSE_RECONNECT_RETRY_MIN_MS;
tests/sse-stream.test.mjs:164:    const prevMax = process.env.SSE_RECONNECT_RETRY_MAX_MS;
tests/sse-stream.test.mjs:165:    process.env.SSE_RECONNECT_RETRY_MIN_MS = '100';
tests/sse-stream.test.mjs:166:    process.env.SSE_RECONNECT_RETRY_MAX_MS = '200';
tests/sse-stream.test.mjs:176:      restoreEnv('SSE_RECONNECT_RETRY_MIN_MS', prevMin);
tests/sse-stream.test.mjs:177:      restoreEnv('SSE_RECONNECT_RETRY_MAX_MS', prevMax);
tests/sse-stream.test.mjs:184:    const prevSize = process.env.SSE_REPLAY_RING_SIZE;
tests/sse-stream.test.mjs:185:    process.env.SSE_REPLAY_RING_SIZE = '3';
tests/sse-stream.test.mjs:191:        await addEventToRing(redisAdapter, id, { event: 'message', data: `p${i}` });
tests/sse-stream.test.mjs:200:          path: '/api/signalmap/stream',
tests/sse-stream.test.mjs:206:        assert.equal(res.headers['x-replay-lost'], 'true');
tests/sse-stream.test.mjs:213:      restoreEnv('SSE_REPLAY_RING_SIZE', prevSize);
tests/sse-stream.test.mjs:218:  // 5. handleSignalMapStream replays prior events as SSE frames and decrements registry on close
tests/sse-stream.test.mjs:219:  it('handleSignalMapStream replays prior events as SSE frames and decrements registry on close', { skip: probeFailed }, async () => {
tests/sse-stream.test.mjs:226:        await addEventToRing(redisAdapter, id, { event: 'message', data: `p${i}` });
tests/sse-stream.test.mjs:230:        // Request from id=0 (before all inserted ids) to get full replay
tests/sse-stream.test.mjs:234:          path: '/api/signalmap/stream',
tests/sse-stream.test.mjs:240:        assert.equal(res.headers['content-type'], 'text/event-stream');
tests/sse-stream.test.mjs:242:        // Read enough to receive all 3 replay frames
tests/sse-stream.test.mjs:245:        // Wait briefly for replay frames to flush
tests/sse-stream.test.mjs:248:        // Each frame: id: <n>\nevent: message\ndata: <data>\n\n
tests/sse-stream.test.mjs:271:  // 6. handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence
tests/sse-stream.test.mjs:272:  it('handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence', { skip: probeFailed }, async () => {
tests/sse-stream.test.mjs:274:    const prev = process.env.SSE_HEARTBEAT_SECONDS;
tests/sse-stream.test.mjs:275:    process.env.SSE_HEARTBEAT_SECONDS = '0.05';  // 50ms cadence
tests/sse-stream.test.mjs:282:          path: '/api/signalmap/stream',
tests/sse-stream.test.mjs:299:      restoreEnv('SSE_HEARTBEAT_SECONDS', prev);
tests/api-base-url-contract.test.mjs:3:import { normalizeApiBaseUrl, getApiBaseUrl, resolveApiBaseUrl } from '../src/client/base-url.ts';
tests/api-base-url-contract.test.mjs:4:import { generateSpec } from '../server/api/openapi.ts';
tests/api-base-url-contract.test.mjs:10:  it('every OpenAPI path key starts with /api/signalmap/ and contains no /api/ws/api substring', () => {
tests/api-base-url-contract.test.mjs:13:      assert.ok(p.startsWith('/api/signalmap/'), `path ${p} should start with /api/signalmap/`);
src/server/lib/redis.ts:2: * SignalMap Redis adapter — ioredis implementation.
src/server/lib/redis.ts:4: * Implements the `RedisAdapter` interface declared in `./redis.types.ts`.
src/server/lib/redis.ts:10: * a Redis connection available.  Connection is established lazily by ioredis on
src/server/lib/redis.ts:12: * is called — which only happens inside `createRedisAdapter()`).
src/server/lib/redis.ts:15:import Redis, { type Redis as RedisClient } from 'ioredis';
src/server/lib/redis.ts:16:import type { RedisAdapter, Disposer } from './redis.types.ts';
src/server/lib/redis.ts:20:export interface CreateRedisAdapterOptions {
src/server/lib/redis.ts:26: * The concrete adapter returned by `createRedisAdapter`.
src/server/lib/redis.ts:27: * Extends `RedisAdapter` with a `quit()` method to close both connections.
src/server/lib/redis.ts:28: * `quit()` is intentionally NOT on the `RedisAdapter` interface — callers that
src/server/lib/redis.ts:31:export interface ManagedRedisAdapter extends RedisAdapter {
src/server/lib/redis.ts:48:export function createRedisAdapter(options: CreateRedisAdapterOptions = {}): ManagedRedisAdapter {
src/server/lib/redis.ts:52:  const client: RedisClient = new Redis(url, makeConnectionOptions());
src/server/lib/redis.ts:53:  const subscriber: RedisClient = new Redis(url, makeConnectionOptions());
src/server/lib/redis.ts:55:  // 'error' listeners prevent 'Unhandled error event' Node warnings during
src/server/lib/redis.ts:218:let _default: ManagedRedisAdapter | null = null;
src/server/lib/redis.ts:224: * Use `createRedisAdapter({ url })` directly in tests so each suite gets its
src/server/lib/redis.ts:227:export function getRedisAdapter(): ManagedRedisAdapter {
src/server/lib/redis.ts:229:  _default = createRedisAdapter();
src/server/lib/redis.types.ts:2: * Redis adapter contract for SignalMap.
src/server/lib/redis.types.ts:4: * This file defines the TypeScript interface that all Redis-dependent code in the
src/server/lib/redis.types.ts:9: * That file will export a concrete `RedisAdapter` backed by `ioredis`, constructed
src/server/lib/redis.types.ts:14: * (`ZADD` / `ZRANGEBYSCORE` / `ZREMRANGEBYRANK` / `ZCARD`) for the SSE replay ring.
src/server/lib/redis.types.ts:19: * A disposer handle returned by `RedisAdapter.subscribe`.
src/server/lib/redis.types.ts:22: * (e.g. on SSE connection close) so the underlying pub/sub listener is
src/server/lib/redis.types.ts:30:   * Release the subscription acquired by `RedisAdapter.subscribe`.
src/server/lib/redis.types.ts:37: * The Redis adapter contract for SignalMap.
src/server/lib/redis.types.ts:46: * `zremRangeByRank`, `zcard`) for the SSE replay ring.
src/server/lib/redis.types.ts:48:export interface RedisAdapter {
src/server/lib/redis.types.ts:50:   * Wraps Redis `GET` + `JSON.parse`.
src/server/lib/redis.types.ts:57:   * Example use site: brief cron reads `signalmap:brief:global` to check
src/server/lib/redis.types.ts:58:   * whether a fresh brief already exists before invoking the LLM pipeline.
src/server/lib/redis.types.ts:59:   * Source-health cache reads (`signalmap:source:health:*`) also go through
src/server/lib/redis.types.ts:62:   * @param key   Redis key (e.g. `"signalmap:brief:global"`).
src/server/lib/redis.types.ts:64:   * @throws      On Redis connection or protocol error.
src/server/lib/redis.types.ts:69:   * Wraps Redis `SET` (no expiry) + `JSON.stringify`.
src/server/lib/redis.types.ts:74:   * Example use site: brief cron writes the completed global brief to
src/server/lib/redis.types.ts:75:   * `signalmap:brief:global` after the LLM pipeline finishes. The key is
src/server/lib/redis.types.ts:76:   * intentionally persistent so SSE handlers can always read the latest brief
src/server/lib/redis.types.ts:79:   * @param key   Redis key.
src/server/lib/redis.types.ts:81:   * @throws      On Redis connection or protocol error.
src/server/lib/redis.types.ts:86:   * Wraps Redis `SETEX` (SET with EXpiry) + `JSON.stringify`.
src/server/lib/redis.types.ts:92:   * after an upstream probe), per-event brief caches that must expire once the
src/server/lib/redis.types.ts:93:   * event window closes, and rate-limit window state.
src/server/lib/redis.types.ts:95:   * @param key        Redis key.
src/server/lib/redis.types.ts:98:   * @throws           On Redis connection or protocol error.
src/server/lib/redis.types.ts:103:   * Wraps Redis `SET key value NX PX <ms>` (SET if Not eXists with expiry).
src/server/lib/redis.types.ts:109:   * Example use site: per-event brief singleflight lock. Before spawning an
src/server/lib/redis.types.ts:110:   * LLM pipeline for a specific event ID, the handler calls `setNx` on
src/server/lib/redis.types.ts:111:   * `signalmap:brief:lock:<eventId>`. Only the first concurrent caller
src/server/lib/redis.types.ts:115:   * @param key        Redis key used as the lock name.
src/server/lib/redis.types.ts:119:   * @throws           On Redis connection or protocol error.
src/server/lib/redis.types.ts:124:   * Wraps Redis `INCR`.
src/server/lib/redis.types.ts:130:   * Example use site: per-IP rate-limit counters on the per-event brief
src/server/lib/redis.types.ts:135:   * @param key   Redis key (must store an integer string or not exist).
src/server/lib/redis.types.ts:137:   * @throws      On Redis connection or protocol error, or if the stored value
src/server/lib/redis.types.ts:143:   * Wraps Redis `INCRBYFLOAT`.
src/server/lib/redis.types.ts:150:   * handler adds the estimated token cost to `signalmap:spend:<userId>:<window>`.
src/server/lib/redis.types.ts:153:   * This two-phase reserve/refund pattern prevents double-spending across
src/server/lib/redis.types.ts:156:   * @param key   Redis key (must store a float string or not exist).
src/server/lib/redis.types.ts:159:   * @throws      On Redis connection or protocol error, or if the stored value
src/server/lib/redis.types.ts:165:   * Wraps Redis `EXPIRE`.
src/server/lib/redis.types.ts:176:   * @param key        Redis key to expire.
src/server/lib/redis.types.ts:178:   * @throws           On Redis connection or protocol error.
src/server/lib/redis.types.ts:183:   * Wraps Redis `DEL`.
src/server/lib/redis.types.ts:191:   * @param key   Redis key to delete.
src/server/lib/redis.types.ts:192:   * @throws      On Redis connection or protocol error.
src/server/lib/redis.types.ts:197:   * Wraps Redis pipelining (`ioredis` `pipeline().exec()`).
src/server/lib/redis.types.ts:201:   * array whose first element is the Redis command name (e.g. `"GET"`,
src/server/lib/redis.types.ts:204:   * Results are returned as-is from the Redis server (strings, numbers, or
src/server/lib/redis.types.ts:208:   * Example use site: brief cron batch-writes multiple signal keys in one
src/server/lib/redis.types.ts:212:   * @param commands  Array of Redis commands, each as `[commandName, ...args]`.
src/server/lib/redis.types.ts:213:   * @returns         Array of raw Redis results in command order.
src/server/lib/redis.types.ts:214:   * @throws          On Redis connection or protocol error. Individual command
src/server/lib/redis.types.ts:221:   * Wraps Redis `PUBLISH`.
src/server/lib/redis.types.ts:224:   * delivered to the Redis server (does not wait for subscribers to receive
src/server/lib/redis.types.ts:226:   * pub/sub in Redis is fire-and-forget.
src/server/lib/redis.types.ts:228:   * Example use site: brief cron publishes `"updated"` (or a JSON summary)
src/server/lib/redis.types.ts:229:   * to `signalmap:brief:updated` after writing the new brief to Redis so that
src/server/lib/redis.types.ts:230:   * SSE handlers subscribed via `subscribe` can push the update to connected
src/server/lib/redis.types.ts:233:   * @param channel   Redis pub/sub channel name.
src/server/lib/redis.types.ts:235:   * @throws          On Redis connection or protocol error.
src/server/lib/redis.types.ts:240:   * Wraps Redis `SUBSCRIBE` via a dedicated subscriber connection.
src/server/lib/redis.types.ts:244:   * must invoke when done (e.g. on SSE connection close) to release the
src/server/lib/redis.types.ts:251:   * Example use site: the SSE handler subscribes to `signalmap:brief:updated`
src/server/lib/redis.types.ts:252:   * on connection open and pushes `data:` events to the client as messages
src/server/lib/redis.types.ts:253:   * arrive. It also subscribes to per-signal-event channels so clients receive
src/server/lib/redis.types.ts:254:   * live updates without polling. The disposer is called in the SSE
src/server/lib/redis.types.ts:261:   * @param channel   Redis pub/sub channel to subscribe to.
src/server/lib/redis.types.ts:266:   *                  event. Callers needing strict failure semantics should
src/server/lib/redis.types.ts:274:   * Wraps Redis `ZADD`. Adds (or updates) a member's score in the sorted set.
src/server/lib/redis.types.ts:285:   * Wraps Redis `ZRANGEBYSCORE`. Returns members whose score falls in [min, max].
src/server/lib/redis.types.ts:299:   * Wraps Redis `ZREMRANGEBYRANK`. Removes members in the given index range.
src/server/lib/redis.types.ts:313:   * Wraps Redis `ZCARD`. Returns the number of members in the sorted set.
src/server/lib/sse-replay-ring.ts:1:import type { RedisAdapter } from './redis.types.js';
src/server/lib/sse-replay-ring.ts:3:const COUNTER_KEY = 'signalmap:sse:counter';
src/server/lib/sse-replay-ring.ts:4:const RING_KEY = 'signalmap:sse:ring';
src/server/lib/sse-replay-ring.ts:5:const EVENT_KEY_PREFIX = 'signalmap:sse:event:';
src/server/lib/sse-replay-ring.ts:8:  return Number(process.env.SSE_REPLAY_RING_SIZE ?? 1000);
src/server/lib/sse-replay-ring.ts:12:  return Number(process.env.SSE_REPLAY_RING_TTL_SECONDS ?? 600);
src/server/lib/sse-replay-ring.ts:15:export interface SSEEventPayload {
src/server/lib/sse-replay-ring.ts:16:  /** Event type (SSE `event:` field). Defaults to `'message'` if absent. */
src/server/lib/sse-replay-ring.ts:17:  event?: string;
src/server/lib/sse-replay-ring.ts:18:  /** JSON-stringified payload (the SSE `data:` line). */
src/server/lib/sse-replay-ring.ts:24:  events: Array<{ id: number; payload: SSEEventPayload }>;
src/server/lib/sse-replay-ring.ts:25:  /** True iff lastId was below the oldest score still in the ring (replay lost). */
src/server/lib/sse-replay-ring.ts:29:/** Atomically allocates the next monotonic event ID via INCR signalmap:sse:counter. */
src/server/lib/sse-replay-ring.ts:30:export async function nextEventId(redis: RedisAdapter): Promise<number> {
src/server/lib/sse-replay-ring.ts:35: * Adds an event to the ring:
src/server/lib/sse-replay-ring.ts:36: *   - SETEX signalmap:sse:event:<id> <RING_TTL_SECONDS> <payload>
src/server/lib/sse-replay-ring.ts:37: *   - ZADD signalmap:sse:ring <id> "<id>"
src/server/lib/sse-replay-ring.ts:38: *   - ZREMRANGEBYRANK signalmap:sse:ring 0 -RING_SIZE-1   (cap at RING_SIZE)
src/server/lib/sse-replay-ring.ts:41:  redis: RedisAdapter,
src/server/lib/sse-replay-ring.ts:43:  payload: SSEEventPayload,
src/server/lib/sse-replay-ring.ts:47:  const eventKey = `${EVENT_KEY_PREFIX}${id}`;
src/server/lib/sse-replay-ring.ts:48:  await redis.setJsonEx(eventKey, payload, ringTtlSeconds);
src/server/lib/sse-replay-ring.ts:55: * Replays events with score > lastId.
src/server/lib/sse-replay-ring.ts:57: * If lastId is null, returns {events: [], lost: false} (fresh subscriber, no replay).
src/server/lib/sse-replay-ring.ts:58: * If the ring is empty, returns {events: [], lost: false}.
src/server/lib/sse-replay-ring.ts:59: * If lastId < oldest-in-ring, returns {events: [], lost: true}.
src/server/lib/sse-replay-ring.ts:60: * Otherwise returns the events strictly after lastId in ascending order.
src/server/lib/sse-replay-ring.ts:62:export async function replayFrom(
src/server/lib/sse-replay-ring.ts:63:  redis: RedisAdapter,
src/server/lib/sse-replay-ring.ts:66:  // Fresh subscriber — no replay needed
src/server/lib/sse-replay-ring.ts:68:    return { events: [], lost: false };
src/server/lib/sse-replay-ring.ts:79:      return { events: [], lost: false };
src/server/lib/sse-replay-ring.ts:85:      return { events: [], lost: true };
src/server/lib/sse-replay-ring.ts:88:    return { events: [], lost: false };
src/server/lib/sse-replay-ring.ts:92:  // If the oldest ring entry is > lastId+1, events in between were evicted.
src/server/lib/sse-replay-ring.ts:94:    return { events: [], lost: true };
src/server/lib/sse-replay-ring.ts:97:  // Fetch each event payload
src/server/lib/sse-replay-ring.ts:98:  const events: Array<{ id: number; payload: SSEEventPayload }> = [];
src/server/lib/sse-replay-ring.ts:101:    const eventKey = `${EVENT_KEY_PREFIX}${id}`;
src/server/lib/sse-replay-ring.ts:102:    const payload = await redis.getJson<SSEEventPayload>(eventKey);
src/server/lib/sse-replay-ring.ts:104:      events.push({ id, payload });
src/server/lib/sse-replay-ring.ts:106:    // If null: event TTL expired — filter it out (per spec)
src/server/lib/sse-replay-ring.ts:109:  return { events, lost: false };
src/server/lib/sse-replay-ring.ts:113:export async function ringStats(redis: RedisAdapter): Promise<{
src/client/types.ts:2: * This file was auto-generated by openapi-typescript.
src/client/types.ts:7:    "/api/signalmap/list": {
src/client/types.ts:14:        /** List SignalMap events with filters */
src/client/types.ts:24:    "/api/signalmap/event/{id}": {
src/client/types.ts:31:        /** Get a single SignalMap event by ID */
src/client/types.ts:41:    "/api/signalmap/source-health": {
src/client/types.ts:58:    "/api/signalmap/stream": {
src/client/types.ts:65:        /** SSE stream of live SignalMap events */
src/client/types.ts:75:    "/api/signalmap/brief/global": {
src/client/types.ts:84:        /** Get AI-generated global SignalMap brief (cached) */
src/client/types.ts:92:    "/api/signalmap/brief/event/{id}": {
src/client/types.ts:101:        /** Get AI-generated why-it-matters brief for a specific event (cached) */
src/client/types.ts:162:            eventCount: number;
src/client/types.ts:196:            /** @description Filtered SignalMap events with source health */
src/client/types.ts:203:                        events: components["schemas"]["SignalMapEvent"][];
src/client/types.ts:232:            /** @description SignalMap event */
src/client/types.ts:288:                /** @description Resume SSE stream from a previously received event ID */
src/client/types.ts:296:            /** @description SSE event stream (text/event-stream) */
src/client/types.ts:302:                    "text/event-stream": string;
src/client/types.ts:337:            /** @description Global brief with bullet points and sources */
src/client/types.ts:382:            /** @description Event brief with why-it-matters explanation */
tests/sse-replay-ring.test.mjs:2: * Smoke tests for the SSE replay ring (Redis sorted-set backed).
tests/sse-replay-ring.test.mjs:4: * Requires a Redis 7 server at REDIS_URL (default: redis://localhost:6380).
tests/sse-replay-ring.test.mjs:5: * Skips cleanly when Redis is unavailable.
tests/sse-replay-ring.test.mjs:9: *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/sse-replay-ring.test.mjs
tests/sse-replay-ring.test.mjs:14:import { createRedisAdapter } from '../src/server/lib/redis.ts';
tests/sse-replay-ring.test.mjs:18:  replayFrom,
tests/sse-replay-ring.test.mjs:20:} from '../src/server/lib/sse-replay-ring.ts';
tests/sse-replay-ring.test.mjs:28:  console.warn('[sse-replay-ring.test] REDIS_URL not set — skipping suite');
tests/sse-replay-ring.test.mjs:31:// Test key constants (must match sse-replay-ring.ts internals)
tests/sse-replay-ring.test.mjs:32:const COUNTER_KEY = 'signalmap:sse:counter';
tests/sse-replay-ring.test.mjs:33:const RING_KEY = 'signalmap:sse:ring';
tests/sse-replay-ring.test.mjs:34:const EVENT_KEY_PREFIX = 'signalmap:sse:event:';
tests/sse-replay-ring.test.mjs:57:describe('SSE replay ring — live Redis smoke tests', { skip: probeFailed }, () => {
tests/sse-replay-ring.test.mjs:59:    adapter = createRedisAdapter({ url: REDIS_URL });
tests/sse-replay-ring.test.mjs:61:      await adapter.incr('signalmap:test:probe');
tests/sse-replay-ring.test.mjs:62:      await adapter.del('signalmap:test:probe');
tests/sse-replay-ring.test.mjs:65:      console.warn('[sse-replay-ring.test] Redis unreachable, skipping:', err?.message);
tests/sse-replay-ring.test.mjs:92:  // 2. addEventToRing + replayFrom round-trip an event correctly
tests/sse-replay-ring.test.mjs:93:  it('addEventToRing + replayFrom round-trips an event', { skip: probeFailed }, async () => {
tests/sse-replay-ring.test.mjs:96:    const payload = { event: 'test-event', data: JSON.stringify({ hello: 'world' }) };
tests/sse-replay-ring.test.mjs:100:    // Replay with lastId = id - 1 (want events strictly after that)
tests/sse-replay-ring.test.mjs:101:    const result = await replayFrom(adapter, id - 1);
tests/sse-replay-ring.test.mjs:104:    assert.equal(result.events.length, 1);
tests/sse-replay-ring.test.mjs:105:    assert.equal(result.events[0].id, id);
tests/sse-replay-ring.test.mjs:106:    assert.deepEqual(result.events[0].payload, payload);
tests/sse-replay-ring.test.mjs:111:  // 3. replayFrom with lastId strictly greater than newest returns empty list
tests/sse-replay-ring.test.mjs:112:  it('replayFrom with lastId >= newest returns empty events, lost: false', { skip: probeFailed }, async () => {
tests/sse-replay-ring.test.mjs:120:    const result = await replayFrom(adapter, id);
tests/sse-replay-ring.test.mjs:123:    assert.equal(result.events.length, 0);
tests/sse-replay-ring.test.mjs:126:    const result2 = await replayFrom(adapter, id + 100);
tests/sse-replay-ring.test.mjs:128:    assert.equal(result2.events.length, 0);
tests/sse-replay-ring.test.mjs:133:  // 4. replayFrom with null lastId returns empty events, lost: false (fresh subscriber)
tests/sse-replay-ring.test.mjs:134:  it('replayFrom with null lastId returns empty events and lost: false', { skip: probeFailed }, async () => {
tests/sse-replay-ring.test.mjs:137:    // Add some events to the ring
tests/sse-replay-ring.test.mjs:143:    const result = await replayFrom(adapter, null);
tests/sse-replay-ring.test.mjs:146:    assert.equal(result.events.length, 0, 'Fresh subscriber should get no replayed events');
tests/sse-replay-ring.test.mjs:151:  // 5. Ring evicts oldest entries when size exceeds SSE_REPLAY_RING_SIZE
tests/sse-replay-ring.test.mjs:152:  it('ring evicts oldest entries when size exceeds SSE_REPLAY_RING_SIZE', { skip: probeFailed }, async () => {
tests/sse-replay-ring.test.mjs:154:    const prev = process.env.SSE_REPLAY_RING_SIZE;
tests/sse-replay-ring.test.mjs:155:    process.env.SSE_REPLAY_RING_SIZE = '5';
tests/sse-replay-ring.test.mjs:158:      // Push 7 events
tests/sse-replay-ring.test.mjs:162:        await addEventToRing(adapter, id, { event: 'message', data: `payload-${i}` });
tests/sse-replay-ring.test.mjs:169:      restoreEnv('SSE_REPLAY_RING_SIZE', prev);
tests/sse-replay-ring.test.mjs:174:  // 6. replayFrom returns events strictly after Last-Event-ID in monotonic order
tests/sse-replay-ring.test.mjs:175:  it('replayFrom returns events strictly after Last-Event-ID in monotonic order', { skip: probeFailed }, async () => {
tests/sse-replay-ring.test.mjs:182:        await addEventToRing(adapter, id, { event: 'message', data: `p${i}` });
tests/sse-replay-ring.test.mjs:184:      const result = await replayFrom(adapter, ids[1]);  // request from ids[1] exclusive
tests/sse-replay-ring.test.mjs:186:      assert.equal(result.events.length, 3, 'should return 3 events: ids[2..4]');
tests/sse-replay-ring.test.mjs:187:      assert.deepEqual(result.events.map(e => e.id), [ids[2], ids[3], ids[4]]);
tests/sse-replay-ring.test.mjs:188:      assert.equal(result.events[0].payload.data, 'p2');
tests/sse-replay-ring.test.mjs:194:  // 7. replayFrom signals lost when Last-Event-ID is below evicted floor
tests/sse-replay-ring.test.mjs:195:  it('replayFrom signals lost when Last-Event-ID is below evicted floor', { skip: probeFailed }, async () => {
tests/sse-replay-ring.test.mjs:197:    const prev = process.env.SSE_REPLAY_RING_SIZE;
tests/sse-replay-ring.test.mjs:198:    process.env.SSE_REPLAY_RING_SIZE = '3';
tests/sse-replay-ring.test.mjs:204:        await addEventToRing(adapter, id, { event: 'message', data: `p${i}` });
tests/sse-replay-ring.test.mjs:207:      const result = await replayFrom(adapter, ids[0]);
tests/sse-replay-ring.test.mjs:209:      assert.equal(result.events.length, 0);
tests/sse-replay-ring.test.mjs:211:      restoreEnv('SSE_REPLAY_RING_SIZE', prev);
tests/sse-replay-ring.test.mjs:216:  // 8. Event payloads expire per SSE_REPLAY_RING_TTL_SECONDS while ring entries survive
tests/sse-replay-ring.test.mjs:217:  it('event payloads expire per SSE_REPLAY_RING_TTL_SECONDS while ring entries survive', { skip: probeFailed }, async () => {
tests/sse-replay-ring.test.mjs:219:    const prev = process.env.SSE_REPLAY_RING_TTL_SECONDS;
tests/sse-replay-ring.test.mjs:220:    process.env.SSE_REPLAY_RING_TTL_SECONDS = '1';  // 1 second
tests/sse-replay-ring.test.mjs:224:      await addEventToRing(adapter, id, { event: 'message', data: 'ephemeral' });
tests/sse-replay-ring.test.mjs:225:      // Wait 1.5s for the event payload to expire (ring zset entry persists)
tests/sse-replay-ring.test.mjs:227:      const result = await replayFrom(adapter, id - 1);
tests/sse-replay-ring.test.mjs:228:      // Per spec: TTL'd payloads are unrecoverable; replayFrom filters them out.
tests/sse-replay-ring.test.mjs:229:      // The ring zset entry still exists but the payload is gone, so events:[].
tests/sse-replay-ring.test.mjs:232:      assert.equal(result.events.length, 0, 'TTL-expired payloads filter out cleanly');
tests/sse-replay-ring.test.mjs:234:      restoreEnv('SSE_REPLAY_RING_TTL_SECONDS', prev);
src/client/base-url.ts:25: * Canonical API base URL for the openapi-fetch client.
src/client/base-url.ts:32: *     a `/api/...` path will compose with `/api/signalmap/...` to produce a
src/client/openapi.ts:1:import createClient from 'openapi-fetch';
src/client/openapi.ts:3:import { getApiBaseUrl } from './base-url.js';

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content docs/SignalMap/spec.md | ForEach-Object { $i++; if ($i -ge 159 -and $i -le 215) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content docs/SignalMap/spec.md | ForEach-Object { $i++; if ($i -ge 231 -and $i -le 243) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content docs/SignalMap/spec.md | ForEach-Object { $i++; if ($i -ge 421 -and $i -le 431) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content docs/SignalMap/spec.md | ForEach-Object { $i++; if ($i -ge 500 -and $i -le 510) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1461ms:
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

 succeeded in 1542ms:
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

 succeeded in 1582ms:
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

 succeeded in 1594ms:
 500: ## Quality Gates Summary
 501: 
 502: | Phase | Gate Command | Pass Criteria |
 503: |-------|--------------|---------------|
 504: | 0 | `npm run typecheck:all && ls docs/SignalMap/_discovery/ docs/SignalMap/legacy-inventory.md docs/SignalMap/LegacyPanels.md` | Discovery artifacts exist; user signed kill list |
 505: | 1 | `npm run typecheck:all && npm run dev` (manual smoke) | Empty grid renders at localhost:3000 |
 506: | 2 | `docker compose -f docker-compose.signalmap.yml up -d --build --force-recreate && sleep 10 && curl --http2 -I http://localhost:3000/ && curl http://localhost:3000/api/health \| jq '.redis'` | HTTP/2 + Redis adapter operational |
 507: | 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` | All contract + SSE tests pass |
 508: | 4 | `npx playwright test e2e/signalmap.spec.ts` | Standalone shell renders fully from fixtures |
 509: | 5 | `npx playwright test e2e/visual.spec.ts e2e/map-interaction.spec.ts` | Visual regression + touch interaction pass |
 510: | 6 | `npx tsx --test tests/perplexity-brief.test.mjs tests/brief-stampede.test.mjs tests/brief-spend-reservation.test.mjs tests/brief-citation-validation.test.mjs tests/brief-prompt-injection.test.mjs tests/brief-endpoints.test.mjs && npx playwright test e2e/brief-flow.spec.ts` | All brief hardening tests pass |

codex
The spec confirms Phase 3 is narrow: generated contract/client, canonical base URL handling, and Redis-backed SSE replay. I’m now checking the actual implementation paths and tests for mismatches, especially places where tests can silently skip.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content server/api/schemas/common.ts | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content server/api/schemas/signalmap.ts | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content server/api/openapi.ts | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content scripts/build-openapi.mjs | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1478ms:
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

 succeeded in 1539ms:
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

 succeeded in 1565ms:
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

 succeeded in 1649ms:
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

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content src/client/base-url.ts | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content src/client/openapi.ts | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content package.json | ForEach-Object { $i++; if ($i -ge 20 -and $i -le 155) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content tests/api-base-url-contract.test.mjs | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1593ms:
   1: import createClient from 'openapi-fetch';
   2: import type { paths } from './types.js';
   3: import { getApiBaseUrl } from './base-url.js';
   4: 
   5: export const client = createClient<paths>({ baseUrl: getApiBaseUrl() });

 succeeded in 1660ms:
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

 succeeded in 1745ms:
  20:     "dev:tech": "cross-env VITE_VARIANT=tech vite",
  21:     "dev:finance": "cross-env VITE_VARIANT=finance vite",
  22:     "dev:happy": "cross-env VITE_VARIANT=happy vite",
  23:     "dev:commodity": "cross-env VITE_VARIANT=commodity vite",
  24:     "postinstall": "cd blog-site && npm ci --prefer-offline",
  25:     "build:blog": "cd blog-site && npm run build && rm -rf ../public/blog && mkdir -p ../public/blog && cp -r dist/* ../public/blog/",
  26:     "build:pro": "cd pro-test && npm install && npm run build",
  27:     "build:openapi": "tsx scripts/build-openapi.mjs",
  28:     "build:types": "openapi-typescript public/openapi.yaml -o src/client/types.ts",
  29:     "build:agent-skills": "node scripts/build-agent-skills-index.mjs",
  30:     "prebuild": "npm run build:openapi && npm run build:agent-skills",
  31:     "build": "npm run build:blog && tsc && vite build",
  32:     "build:sidecar-sebuf": "node scripts/build-sidecar-sebuf.mjs",
  33:     "build:desktop": "node scripts/build-sidecar-sebuf.mjs && node scripts/build-sidecar-handlers.mjs && tsc && vite build",
  34:     "build:full": "npm run build:openapi && npm run build:agent-skills && npm run build:blog && cross-env-shell VITE_VARIANT=full \"tsc && vite build\"",
  35:     "build:tech": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=tech \"tsc && vite build\"",
  36:     "build:finance": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=finance \"tsc && vite build\"",
  37:     "build:happy": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=happy \"tsc && vite build\"",
  38:     "build:commodity": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=commodity \"tsc && vite build\"",
  39:     "typecheck": "tsc --noEmit",
  40:     "typecheck:api": "tsc --noEmit -p tsconfig.api.json",
  41:     "typecheck:all": "tsc --noEmit && tsc --noEmit -p tsconfig.api.json",
  42:     "tauri": "tauri",
  43:     "preview": "vite preview",
  44:     "test:e2e:full": "cross-env VITE_VARIANT=full playwright test",
  45:     "test:e2e:tech": "cross-env VITE_VARIANT=tech playwright test",
  46:     "test:e2e:finance": "cross-env VITE_VARIANT=finance playwright test",
  47:     "test:e2e:runtime": "cross-env VITE_VARIANT=full playwright test e2e/runtime-fetch.spec.ts",
  48:     "test:e2e": "npm run test:e2e:runtime && npm run test:e2e:full && npm run test:e2e:tech && npm run test:e2e:finance",
  49:     "test:data": "tsx --test tests/*.test.mjs tests/*.test.mts",
  50:     "test:feeds": "node scripts/validate-rss-feeds.mjs",
  51:     "test:sidecar": "node --test src-tauri/sidecar/local-api-server.test.mjs api/_cors.test.mjs api/youtube/embed.test.mjs api/cyber-threats.test.mjs api/usni-fleet.test.mjs scripts/ais-relay-rss.test.cjs api/loaders-xml-wms-regression.test.mjs",
  52:     "test:e2e:visual:full": "cross-env VITE_VARIANT=full playwright test -g \"matches golden screenshots per layer and zoom\"",
  53:     "test:e2e:visual:tech": "cross-env VITE_VARIANT=tech playwright test -g \"matches golden screenshots per layer and zoom\"",
  54:     "test:e2e:visual": "npm run test:e2e:visual:full && npm run test:e2e:visual:tech",
  55:     "test:e2e:visual:update:full": "cross-env VITE_VARIANT=full playwright test -g \"matches golden screenshots per layer and zoom\" --update-snapshots",
  56:     "test:e2e:visual:update:tech": "cross-env VITE_VARIANT=tech playwright test -g \"matches golden screenshots per layer and zoom\" --update-snapshots",
  57:     "test:e2e:visual:update": "npm run test:e2e:visual:update:full && npm run test:e2e:visual:update:tech",
  58:     "desktop:dev": "npm run version:sync && cross-env VITE_DESKTOP_RUNTIME=1 tauri dev -f devtools",
  59:     "desktop:build:full": "npm run version:sync && cross-env VITE_VARIANT=full VITE_DESKTOP_RUNTIME=1 tauri build",
  60:     "desktop:build:tech": "npm run version:sync && cross-env VITE_VARIANT=tech VITE_DESKTOP_RUNTIME=1 tauri build --config src-tauri/tauri.tech.conf.json",
  61:     "desktop:build:finance": "npm run version:sync && cross-env VITE_VARIANT=finance VITE_DESKTOP_RUNTIME=1 tauri build --config src-tauri/tauri.finance.conf.json",
  62:     "desktop:package:macos:full": "node scripts/desktop-package.mjs --os macos --variant full",
  63:     "desktop:package:macos:tech": "node scripts/desktop-package.mjs --os macos --variant tech",
  64:     "desktop:package:windows:full": "node scripts/desktop-package.mjs --os windows --variant full",
  65:     "desktop:package:windows:tech": "node scripts/desktop-package.mjs --os windows --variant tech",
  66:     "desktop:package:macos:full:sign": "node scripts/desktop-package.mjs --os macos --variant full --sign",
  67:     "desktop:package:macos:tech:sign": "node scripts/desktop-package.mjs --os macos --variant tech --sign",
  68:     "desktop:package:windows:full:sign": "node scripts/desktop-package.mjs --os windows --variant full --sign",
  69:     "desktop:package:windows:tech:sign": "node scripts/desktop-package.mjs --os windows --variant tech --sign",
  70:     "desktop:package": "node scripts/desktop-package.mjs",
  71:     "test:convex": "vitest run --config vitest.config.mts",
  72:     "test:convex:watch": "vitest --config vitest.config.mts"
  73:   },
  74:   "devDependencies": {
  75:     "@biomejs/biome": "^2.4.7",
  76:     "@bufbuild/buf": "^1.66.0",
  77:     "@edge-runtime/vm": "^5.0.0",
  78:     "@playwright/test": "^1.52.0",
  79:     "@tauri-apps/cli": "^2.10.0",
  80:     "@types/canvas-confetti": "^1.9.0",
  81:     "@types/d3": "^7.4.3",
  82:     "@types/dompurify": "^3.0.5",
  83:     "@types/geojson": "^7946.0.14",
  84:     "@types/maplibre-gl": "^1.13.2",
  85:     "@types/marked": "^5.0.2",
  86:     "@types/papaparse": "^5.5.2",
  87:     "@types/supercluster": "^7.1.3",
  88:     "@types/three": "^0.183.1",
  89:     "@types/topojson-client": "^3.1.5",
  90:     "@types/topojson-specification": "^1.0.5",
  91:     "convex-test": "^0.0.43",
  92:     "cross-env": "^10.1.0",
  93:     "esbuild": "^0.27.3",
  94:     "exceljs": "^4.4.0",
  95:     "h3-js": "^4.4.0",
  96:     "markdownlint-cli2": "^0.21.0",
  97:     "openapi-typescript": "^7.0.0",
  98:     "tsx": "^4.21.0",
  99:     "typescript": "^5.7.2",
 100:     "vite": "^6.0.7",
 101:     "vite-plugin-pwa": "^1.2.0",
 102:     "vitest": "^4.1.0"
 103:   },
 104:   "dependencies": {
 105:     "@anthropic-ai/sdk": "^0.82.0",
 106:     "@aws-sdk/client-s3": "^3.1009.0",
 107:     "@clerk/clerk-js": "^5.56.0",
 108:     "@deck.gl/aggregation-layers": "^9.2.11",
 109:     "@deck.gl/core": "^9.2.11",
 110:     "@deck.gl/geo-layers": "^9.2.11",
 111:     "@deck.gl/layers": "^9.2.11",
 112:     "@deck.gl/mapbox": "^9.2.11",
 113:     "@dodopayments/convex": "^0.2.8",
 114:     "@lancedb/lancedb": "^0.27.2",
 115:     "@preact/signals": "^2.9.0",
 116:     "@protomaps/basemaps": "^5.7.1",
 117:     "@sentry/browser": "^10.39.0",
 118:     "@upstash/ratelimit": "^2.0.8",
 119:     "@upstash/redis": "^1.36.1",
 120:     "@vercel/analytics": "^2.0.0",
 121:     "@vercel/og": "^0.11.1",
 122:     "@xenova/transformers": "^2.17.2",
 123:     "canvas-confetti": "^1.9.4",
 124:     "convex": "^1.32.0",
 125:     "d3": "^7.9.0",
 126:     "deck.gl": "^9.2.11",
 127:     "dodopayments-checkout": "^1.8.0",
 128:     "dompurify": "^3.1.7",
 129:     "fast-xml-parser": "^5.3.7",
 130:     "globe.gl": "^2.45.0",
 131:     "hls.js": "^1.6.15",
 132:     "i18next": "^25.8.10",
 133:     "i18next-browser-languagedetector": "^8.2.1",
 134:     "ioredis": "^5.10.1",
 135:     "jose": "^6.2.2",
 136:     "maplibre-gl": "^5.16.0",
 137:     "marked": "^17.0.3",
 138:     "onnxruntime-web": "^1.23.2",
 139:     "openapi-fetch": "^0.14.0",
 140:     "papaparse": "^5.5.3",
 141:     "pmtiles": "^4.4.0",
 142:     "preact": "^10.25.4",
 143:     "satellite.js": "^6.0.2",
 144:     "supercluster": "^8.0.1",
 145:     "telegram": "^2.26.22",
 146:     "topojson-client": "^3.1.0",
 147:     "uqr": "^0.1.2",
 148:     "ws": "^8.19.0",
 149:     "yaml": "^2.8.3",
 150:     "youtubei.js": "^16.0.1",
 151:     "zod": "^3.25.76",
 152:     "zod-openapi": "^4.2.4"
 153:   },
 154:   "overrides": {
 155:     "fast-xml-parser": "^5.3.7",

 succeeded in 1810ms:
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

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content src/server/lib/sse-replay-ring.ts | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content server/api/routes/signalmap-stream.ts | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content src/server/lib/redis.ts | ForEach-Object { $i++; if ($i -le 260) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content src/server/lib/redis.types.ts | ForEach-Object { $i++; if ($i -le 340) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1514ms:
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

 succeeded in 1575ms:
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

 succeeded in 1585ms:
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

 succeeded in 1728ms:
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

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content tests/openapi-spec-generation.test.mjs | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content tests/sse-replay-ring.test.mjs | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content tests/sse-stream.test.mjs | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1449ms:
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

 succeeded in 1526ms:
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

 succeeded in 1626ms:
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

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "setupSignalMapStreamShutdown|handleSignalMapStream|signalmap-stream" .' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1355ms:
.\docs\SignalMap\_review\phase-3-review-prompt.md:26:- `server/api/routes/signalmap-stream.ts`
.\docs\SignalMap\_review\phase-3-gemini-review.md:5:**File**: `server/api/routes/signalmap-stream.ts:1` (whole file)
.\docs\SignalMap\_review\phase-3-gemini-review.md:7:**Issue**: The current implementation of `signalmap-stream.ts` does not have any logic to handle failures during brief generation. The SSE stream setup focuses solely on replaying events from the Redis ring buffer. If an upstream service responsible for providing data to generate a brief were to fail, the stream would not notify the client with an `error` event as required by the spec; it would likely hang or close without a specific error message.
.\docs\SignalMap\_review\phase-3-codex-review.md:39:- `server/api/routes/signalmap-stream.ts`
.\docs\SignalMap\_review\phase-3-codex-review.md:251:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files | rg "''^(server/api/schemas/common'"\\.ts|server/api/schemas/signalmap\\.ts|server/api/openapi\\.ts|scripts/build-openapi\\.mjs|src/client/base-url\\.ts|src/client/openapi\\.ts|public/openapi\\.yaml|src/client/types\\.ts|src/server/lib/redis\\.types\\.ts|src/server/lib/redis\\.ts|src/server/lib/sse-replay-ring\\.ts|server/api/routes/signalmap-stream\\.ts|tests/openapi-spec-generation\\.test\\.mjs|tests/api-base-url-contract\\.test\\.mjs|tests/sse-replay-ring\\.test\\.mjs|tests/sse-stream\\.test\\.mjs|package\\.json)"'$"' in C:\Coding_Workspace\Github_P\worldmonitor
.\docs\SignalMap\_review\phase-3-codex-review.md:262:124:      signalmap-stream.ts            # SSE
.\docs\SignalMap\_review\phase-3-codex-review.md:316:428:| 3d SSE endpoint + replay ring | `server/api/routes/signalmap-stream.ts`, `src/server/lib/sse-replay-ring.ts` | Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay; subscribe to `signalmap:events` pubsub channel; heartbeat every `SSE_HEARTBEAT_SECONDS`; on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n` | `npx tsx --test tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs` | Use in-memory replay |
.\docs\SignalMap\_review\phase-3-codex-review.md:2398:server\api\routes\signalmap-stream.ts
.\docs\SignalMap\_review\phase-3-codex-review.md:3470:  428: | 3d SSE endpoint + replay ring | `server/api/routes/signalmap-stream.ts`, `src/server/lib/sse-replay-ring.ts` | Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay; subscribe to `signalmap:events` pubsub channel; heartbeat every `SSE_HEARTBEAT_SECONDS`; on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n` | `npx tsx --test tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs` | Use in-memory replay |
.\docs\SignalMap\_review\phase-3-codex-review.md:4532:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'server/api/routes/signalmap-stream.ts'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
.\docs\SignalMap\_review\phase-3-codex-review.md:4950:   42: export async function handleSignalMapStream(
.\docs\SignalMap\_review\phase-3-codex-review.md:4995:   87:       console.warn('[signalmap-stream] failed to handle pub/sub message', err);
.\docs\SignalMap\_review\phase-3-codex-review.md:5022:  114: export function setupSignalMapStreamShutdown(): void {
.\docs\SignalMap\_review\phase-3-codex-review.md:5050:    2:  * Smoke tests for the signalmap-stream SSE handler.
.\docs\SignalMap\_review\phase-3-codex-review.md:5066:   18: let handleSignalMapStream;
.\docs\SignalMap\_review\phase-3-codex-review.md:5067:   19: let setupSignalMapStreamShutdown;
.\docs\SignalMap\_review\phase-3-codex-review.md:5073:   25: // getRedisAdapter() singleton won't be called until handleSignalMapStream is
.\docs\SignalMap\_review\phase-3-codex-review.md:5076:   28:   const mod = await import('../server/api/routes/signalmap-stream.ts');
.\docs\SignalMap\_review\phase-3-codex-review.md:5077:   29:   handleSignalMapStream = mod.handleSignalMapStream;
.\docs\SignalMap\_review\phase-3-codex-review.md:5078:   30:   setupSignalMapStreamShutdown = mod.setupSignalMapStreamShutdown;
.\docs\SignalMap\_review\phase-3-codex-review.md:5086:   38: describe('signalmap-stream module â€” smoke tests', { skip: Boolean(importError) }, () => {
.\docs\SignalMap\_review\phase-3-codex-review.md:5087:   39:   // 1. handleSignalMapStream is an async function
.\docs\SignalMap\_review\phase-3-codex-review.md:5088:   40:   it('handleSignalMapStream is an async function', () => {
.\docs\SignalMap\_review\phase-3-codex-review.md:5089:   41:     assert.equal(typeof handleSignalMapStream, 'function', 'handleSignalMapStream should be a function');
.\docs\SignalMap\_review\phase-3-codex-review.md:5092:   44:       handleSignalMapStream.constructor.name === 'AsyncFunction',
.\docs\SignalMap\_review\phase-3-codex-review.md:5093:   45:       `Expected AsyncFunction, got ${handleSignalMapStream.constructor.name}`,
.\docs\SignalMap\_review\phase-3-codex-review.md:5097:   49:   // 2. setupSignalMapStreamShutdown is idempotent (calling twice doesn't add multiple listeners)
.\docs\SignalMap\_review\phase-3-codex-review.md:5098:   50:   it('setupSignalMapStreamShutdown is idempotent â€” does not add multiple SIGTERM listeners', () => {
.\docs\SignalMap\_review\phase-3-codex-review.md:5103:   55:     setupSignalMapStreamShutdown();
.\docs\SignalMap\_review\phase-3-codex-review.md:5107:   59:     setupSignalMapStreamShutdown();
.\docs\SignalMap\_review\phase-3-codex-review.md:5114:   66:       `Second call to setupSignalMapStreamShutdown added listeners (${afterFirst} â†’ ${afterSecond})`,
.\docs\SignalMap\_review\phase-3-codex-review.md:5163:  115:     handleSignalMapStream(req, res).catch((err) => {
.\docs\SignalMap\_review\phase-3-codex-review.md:5185:  137: describe('signalmap-stream integration â€” live Redis', { skip: Boolean(importError) || probeFailed }, () => {
.\docs\SignalMap\_review\phase-3-codex-review.md:5201:  153:     // Also quit the singleton used internally by handleSignalMapStream â€”
.\docs\SignalMap\_review\phase-3-codex-review.md:5229:  181:   // 4. handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor
.\docs\SignalMap\_review\phase-3-codex-review.md:5230:  182:   it('handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor', { skip: probeFailed }, async () => {
.\docs\SignalMap\_review\phase-3-codex-review.md:5266:  218:   // 5. handleSignalMapStream replays prior events as SSE frames and decrements registry on close
.\docs\SignalMap\_review\phase-3-codex-review.md:5267:  219:   it('handleSignalMapStream replays prior events as SSE frames and decrements registry on close', { skip: probeFailed }, async () => {
.\docs\SignalMap\_review\phase-3-codex-review.md:5319:  271:   // 6. handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence
.\docs\SignalMap\_review\phase-3-codex-review.md:5320:  272:   it('handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence', { skip: probeFailed }, async () => {
.\docs\SignalMap\_review\phase-3-codex-review.md:6405:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "handleSignalMapStream|signalmap-stream|setupSignalMapStreamShutdown|/api/signalmap/stream" server api src tests -g "*.ts" -g "*.mjs" -g "*.js"' in C:\Coding_Workspace\Github_P\worldmonitor
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:38:- `server/api/routes/signalmap-stream.ts`
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:254:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "signalmap|SSE|openapi|base-url|replay|Redis|brief|event" server/api/schemas/common.ts server/api/schemas/signalmap.ts server/api/openapi.ts scripts/build-openapi.mjs src/client/base-url.ts src/client/openapi.ts src/client/types.ts src/server/lib/redis.types.ts src/server/lib/redis.ts src/server/lib/sse-replay-ring.ts server/api/routes/signalmap-stream.ts tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs package.json' in C:\Coding_Workspace\Github_P\worldmonitor
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:264:124:      signalmap-stream.ts            # SSE
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:308:428:| 3d SSE endpoint + replay ring | `server/api/routes/signalmap-stream.ts`, `src/server/lib/sse-replay-ring.ts` | Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay; subscribe to `signalmap:events` pubsub channel; heartbeat every `SSE_HEARTBEAT_SECONDS`; on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n` | `npx tsx --test tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs` | Use in-memory replay |
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:405:server/api/routes/signalmap-stream.ts:3:import { getRedisAdapter } from '../../../src/server/lib/redis.js';
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:406:server/api/routes/signalmap-stream.ts:7:  replayFrom,
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:407:server/api/routes/signalmap-stream.ts:8:  type SSEEventPayload,
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:408:server/api/routes/signalmap-stream.ts:9:} from '../../../src/server/lib/sse-replay-ring.js';
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:409:server/api/routes/signalmap-stream.ts:11:const CHANNEL = 'signalmap:events';
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:410:server/api/routes/signalmap-stream.ts:14:  return Number(process.env.SSE_HEARTBEAT_SECONDS ?? 20);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:411:server/api/routes/signalmap-stream.ts:18:  return Number(process.env.SSE_RECONNECT_RETRY_MIN_MS ?? 5000);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:412:server/api/routes/signalmap-stream.ts:22:  return Number(process.env.SSE_RECONNECT_RETRY_MAX_MS ?? 15000);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:413:server/api/routes/signalmap-stream.ts:36:function writeSSEEvent(res: ServerResponse, id: number, payload: SSEEventPayload): void {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:414:server/api/routes/signalmap-stream.ts:38:  if (payload.event) res.write(`event: ${payload.event}\n`);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:415:server/api/routes/signalmap-stream.ts:46:  const redis = getRedisAdapter();
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:416:server/api/routes/signalmap-stream.ts:49:  const headerId = req.headers['last-event-id'];
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:417:server/api/routes/signalmap-stream.ts:57:  const replay = await replayFrom(redis, validLastId);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:418:server/api/routes/signalmap-stream.ts:58:  if (replay.lost) {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:419:server/api/routes/signalmap-stream.ts:65:  // Open SSE
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:420:server/api/routes/signalmap-stream.ts:67:  res.setHeader('Content-Type', 'text/event-stream');
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:421:server/api/routes/signalmap-stream.ts:73:  // Send replayed events
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:422:server/api/routes/signalmap-stream.ts:74:  for (const { id, payload } of replay.events) {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:423:server/api/routes/signalmap-stream.ts:75:    writeSSEEvent(res, id, payload);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:424:server/api/routes/signalmap-stream.ts:81:      const payload: SSEEventPayload = JSON.parse(raw);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:425:server/api/routes/signalmap-stream.ts:84:      writeSSEEvent(res, id, payload);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:426:server/api/routes/signalmap-stream.ts:87:      console.warn('[signalmap-stream] failed to handle pub/sub message', err);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:427:server/api/routes/signalmap-stream.ts:121:        conn.res.write(`event: shutdown\nretry: ${retry}\n\n`);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:428:tests/sse-stream.test.mjs:2: * Smoke tests for the signalmap-stream SSE handler.
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:432:tests/sse-stream.test.mjs:25:// getRedisAdapter() singleton won't be called until handleSignalMapStream is
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:433:tests/sse-stream.test.mjs:28:  const mod = await import('../server/api/routes/signalmap-stream.ts');
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:434:tests/sse-stream.test.mjs:38:describe('signalmap-stream module — smoke tests', { skip: Boolean(importError) }, () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:440:tests/sse-stream.test.mjs:137:describe('signalmap-stream integration — live Redis', { skip: Boolean(importError) || probeFailed }, () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:461:tests/sse-stream.test.mjs:218:  // 5. handleSignalMapStream replays prior events as SSE frames and decrements registry on close
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:462:tests/sse-stream.test.mjs:219:  it('handleSignalMapStream replays prior events as SSE frames and decrements registry on close', { skip: probeFailed }, async () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:470:tests/sse-stream.test.mjs:271:  // 6. handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:471:tests/sse-stream.test.mjs:272:  it('handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence', { skip: probeFailed }, async () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:803: 428: | 3d SSE endpoint + replay ring | `server/api/routes/signalmap-stream.ts`, `src/server/lib/sse-replay-ring.ts` | Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay; subscribe to `signalmap:events` pubsub channel; heartbeat every `SSE_HEARTBEAT_SECONDS`; on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n` | `npx tsx --test tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs` | Use in-memory replay |
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:1515:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content server/api/routes/signalmap-stream.ts | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Coding_Workspace\Github_P\worldmonitor
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:1693:  42: export async function handleSignalMapStream(
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:1738:  87:       console.warn('[signalmap-stream] failed to handle pub/sub message', err);
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:1765: 114: export function setupSignalMapStreamShutdown(): void {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2354:   2:  * Smoke tests for the signalmap-stream SSE handler.
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2370:  18: let handleSignalMapStream;
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2371:  19: let setupSignalMapStreamShutdown;
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2377:  25: // getRedisAdapter() singleton won't be called until handleSignalMapStream is
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2380:  28:   const mod = await import('../server/api/routes/signalmap-stream.ts');
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2381:  29:   handleSignalMapStream = mod.handleSignalMapStream;
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2382:  30:   setupSignalMapStreamShutdown = mod.setupSignalMapStreamShutdown;
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2390:  38: describe('signalmap-stream module â€” smoke tests', { skip: Boolean(importError) }, () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2391:  39:   // 1. handleSignalMapStream is an async function
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2392:  40:   it('handleSignalMapStream is an async function', () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2393:  41:     assert.equal(typeof handleSignalMapStream, 'function', 'handleSignalMapStream should be a function');
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2396:  44:       handleSignalMapStream.constructor.name === 'AsyncFunction',
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2397:  45:       `Expected AsyncFunction, got ${handleSignalMapStream.constructor.name}`,
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2401:  49:   // 2. setupSignalMapStreamShutdown is idempotent (calling twice doesn't add multiple listeners)
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2402:  50:   it('setupSignalMapStreamShutdown is idempotent â€” does not add multiple SIGTERM listeners', () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2407:  55:     setupSignalMapStreamShutdown();
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2411:  59:     setupSignalMapStreamShutdown();
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2418:  66:       `Second call to setupSignalMapStreamShutdown added listeners (${afterFirst} â†’ ${afterSecond})`,
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2467: 115:     handleSignalMapStream(req, res).catch((err) => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2489: 137: describe('signalmap-stream integration â€” live Redis', { skip: Boolean(importError) || probeFailed }, () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2505: 153:     // Also quit the singleton used internally by handleSignalMapStream â€”
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2533: 181:   // 4. handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2534: 182:   it('handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor', { skip: probeFailed }, async () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2570: 218:   // 5. handleSignalMapStream replays prior events as SSE frames and decrements registry on close
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2571: 219:   it('handleSignalMapStream replays prior events as SSE frames and decrements registry on close', { skip: probeFailed }, async () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2623: 271:   // 6. handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2624: 272:   it('handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence', { skip: probeFailed }, async () => {
.\docs\SignalMap\_review\phase-3-codex-review-v2.md:2970:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "setupSignalMapStreamShutdown|handleSignalMapStream|signalmap-stream" .' in C:\Coding_Workspace\Github_P\worldmonitor
.\docs\SignalMap\spec.md:124:      signalmap-stream.ts            # SSE
.\docs\SignalMap\spec.md:428:| 3d SSE endpoint + replay ring | `server/api/routes/signalmap-stream.ts`, `src/server/lib/sse-replay-ring.ts` | Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`); `ZRANGEBYSCORE` for replay; subscribe to `signalmap:events` pubsub channel; heartbeat every `SSE_HEARTBEAT_SECONDS`; on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n` | `npx tsx --test tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs` | Use in-memory replay |
.\docs\SignalMap\PROGRESS.md:152:| 2026-04-27 | phase-3 | 3d | complete | SSE endpoint + Redis sorted-set replay ring. RedisAdapter contract extended with zadd/zrangeByScore/zremRangeByRank/zcard (Phase 0c-deferred). sse-replay-ring.ts: monotonic INCR ids, ZADD ring capped via ZREMRANGEBYRANK, ZRANGEBYSCORE replay with lost-detection. signalmap-stream.ts: full SSE handler with replay, pub/sub, heartbeat, jittered shutdown via SIGTERM. 4 + 2 smoke tests pass; 11 baseline redis-adapter tests still pass. typecheck:all clean. |
.\tests\sse-stream.test.mjs:2: * Smoke tests for the signalmap-stream SSE handler.
.\tests\sse-stream.test.mjs:18:let handleSignalMapStream;
.\tests\sse-stream.test.mjs:19:let setupSignalMapStreamShutdown;
.\tests\sse-stream.test.mjs:25:// getRedisAdapter() singleton won't be called until handleSignalMapStream is
.\tests\sse-stream.test.mjs:28:  const mod = await import('../server/api/routes/signalmap-stream.ts');
.\tests\sse-stream.test.mjs:29:  handleSignalMapStream = mod.handleSignalMapStream;
.\tests\sse-stream.test.mjs:30:  setupSignalMapStreamShutdown = mod.setupSignalMapStreamShutdown;
.\tests\sse-stream.test.mjs:38:describe('signalmap-stream module — smoke tests', { skip: Boolean(importError) }, () => {
.\tests\sse-stream.test.mjs:39:  // 1. handleSignalMapStream is an async function
.\tests\sse-stream.test.mjs:40:  it('handleSignalMapStream is an async function', () => {
.\tests\sse-stream.test.mjs:41:    assert.equal(typeof handleSignalMapStream, 'function', 'handleSignalMapStream should be a function');
.\tests\sse-stream.test.mjs:44:      handleSignalMapStream.constructor.name === 'AsyncFunction',
.\tests\sse-stream.test.mjs:45:      `Expected AsyncFunction, got ${handleSignalMapStream.constructor.name}`,
.\tests\sse-stream.test.mjs:49:  // 2. setupSignalMapStreamShutdown is idempotent (calling twice doesn't add multiple listeners)
.\tests\sse-stream.test.mjs:50:  it('setupSignalMapStreamShutdown is idempotent — does not add multiple SIGTERM listeners', () => {
.\tests\sse-stream.test.mjs:55:    setupSignalMapStreamShutdown();
.\tests\sse-stream.test.mjs:59:    setupSignalMapStreamShutdown();
.\tests\sse-stream.test.mjs:66:      `Second call to setupSignalMapStreamShutdown added listeners (${afterFirst} → ${afterSecond})`,
.\tests\sse-stream.test.mjs:115:    handleSignalMapStream(req, res).catch((err) => {
.\tests\sse-stream.test.mjs:137:describe('signalmap-stream integration — live Redis', { skip: Boolean(importError) || probeFailed }, () => {
.\tests\sse-stream.test.mjs:153:    // Also quit the singleton used internally by handleSignalMapStream —
.\tests\sse-stream.test.mjs:181:  // 4. handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor
.\tests\sse-stream.test.mjs:182:  it('handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor', { skip: probeFailed }, async () => {
.\tests\sse-stream.test.mjs:218:  // 5. handleSignalMapStream replays prior events as SSE frames and decrements registry on close
.\tests\sse-stream.test.mjs:219:  it('handleSignalMapStream replays prior events as SSE frames and decrements registry on close', { skip: probeFailed }, async () => {
.\tests\sse-stream.test.mjs:271:  // 6. handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence
.\tests\sse-stream.test.mjs:272:  it('handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence', { skip: probeFailed }, async () => {
.\server\api\routes\signalmap-stream.ts:42:export async function handleSignalMapStream(
.\server\api\routes\signalmap-stream.ts:87:      console.warn('[signalmap-stream] failed to handle pub/sub message', err);
.\server\api\routes\signalmap-stream.ts:114:export function setupSignalMapStreamShutdown(): void {

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "server/api/routes|/api/signalmap|signalmap-stream|handleSignalMapStream|routes" server src api -g "*.ts" -g "*.js" -g "*.mjs"' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files server api src | rg "(router|routes|signalmap|stream)"' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1239ms:
server\cors.ts:5: * to 'GET, POST, OPTIONS' (sebuf routes support GET and POST).
server\api\routes\signalmap-stream.ts:42:export async function handleSignalMapStream(
server\api\routes\signalmap-stream.ts:87:      console.warn('[signalmap-stream] failed to handle pub/sub message', err);
server\api\schemas\signalmap.ts:17:// Endpoint 1 — GET /api/signalmap/list
server\api\schemas\signalmap.ts:37:// Endpoint 3 — GET /api/signalmap/source-health
server\api\schemas\signalmap.ts:46:// Endpoint 5 — POST /api/signalmap/brief/global
server\api\schemas\signalmap.ts:63:// Endpoint 6 — POST /api/signalmap/brief/event/{id}
server\api\schemas\signalmap.ts:77:  '/api/signalmap/list': {
server\api\schemas\signalmap.ts:97:  '/api/signalmap/event/{id}': {
server\api\schemas\signalmap.ts:119:  '/api/signalmap/source-health': {
server\api\schemas\signalmap.ts:138:  '/api/signalmap/stream': {
server\api\schemas\signalmap.ts:175:  '/api/signalmap/brief/global': {
server\api\schemas\signalmap.ts:205:  '/api/signalmap/brief/event/{id}': {
api\internal\brief-why-matters.ts:236:      // set to 'openrouter' in prod). `callLlmReasoning` routes through
src\utils\supplier-route-risk.ts:2:import { TRADE_ROUTES } from '@/config/trade-routes';
src\utils\supplier-route-risk.ts:51:// so routes like gulf-europe-oil don't attribute Hormuz/Bab el-Mandeb to GR→TR refined petroleum.
src\utils\supplier-route-risk.ts:133:  // For intra-regional pairs (same coastSide), overlapping "pass-through" routes like
src\utils\proxy.ts:50:// In production browser deployments, routes are handled by Vercel serverless functions.
src\utils\proxy.ts:51:// In local dev, Vite proxy handles these routes.
src\services\aviation\watchlist.ts:3: * Stores a short list of airports, airlines, and routes the user cares about.
src\services\aviation\watchlist.ts:11:  routes: string[];     // "ORG-DST" e.g. ['IST-LHR']
src\services\aviation\watchlist.ts:17:  routes: ['IST-LHR', 'IST-FRA'],
src\services\aviation\watchlist.ts:28:      routes: Array.isArray(parsed.routes) ? parsed.routes : DEFAULT_WATCHLIST.routes,
src\services\aviation\watchlist.ts:84:    if (!wl.routes.includes(route)) {
src\services\aviation\watchlist.ts:85:      wl.routes = [...wl.routes, route].slice(0, 20);
src\services\aviation\watchlist.ts:92:    wl.routes = wl.routes.filter(r => r !== route);
src\types\index.ts:441:  isRedundant: boolean;  // Has alternative routes
src\services\breaking-news-alerts.ts:200:        // On desktop the fetch patch intercepts /api/* and routes to the local sidecar.
src\config\variants\energy.ts:51:  tradeRoutes: true,        // Tanker trade routes
src\config\variants\commodity.ts:60:  tradeRoutes: true,        // Commodity trade routes
src\config\variants\commodity.ts:82:  ais: true,              // Commodity shipping, tanker routes, bulk carriers
src\config\trade-routes.ts:256:      if (import.meta.env.DEV) console.error(`[trade-routes] Missing port: ${!fromCoord ? route.from : route.to}`);
src\config\trade-routes.ts:265:        if (import.meta.env.DEV) console.error(`[trade-routes] Missing waterway: ${wpId}`);
src\config\gulf-fdi.ts:152:    description: 'DP World-operated Caribbean transshipment hub serving Latin American trade routes.',
src\config\commands.ts:72:  { id: 'layer:tradeRoutes', keywords: ['trade routes', 'shipping lanes', 'trade'], label: 'Toggle trade routes', icon: '\u{1F6A2}', category: 'layers' },
server\router.ts:4: * Static routes (no path params) use exact Map lookup for O(1) matching.
server\router.ts:5: * Dynamic routes (with {param} segments) fall back to linear scan with pattern matching.
server\gateway.ts:4: * Each domain edge function calls `createDomainGateway(routes)` to get a
server\gateway.ts:250:  '/api/signalmap/v1/list-signal-map-events': 'fast',
server\gateway.ts:275: * Creates a Vercel Edge handler for a single domain's routes.
server\gateway.ts:281:  routes: RouteDescriptor[],
server\gateway.ts:283:  const router = createRouter(routes);
server\gateway.ts:311:    // returns null, so feature routes do not trigger bearer resolution.
server\gateway.ts:332:    // API key validation. Product-tier feature routes do not force API keys.
src\generated\server\worldmonitor\signalmap\v1\service_server.ts:122:      path: "/api/signalmap/v1/list-signal-map-events",
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:53:  routes: string[];
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:106:  { id: 'suez', name: 'Suez Canal', lat: 30.45, lon: 32.35, primaryKeywords: ['suez canal', 'suez'], areaKeywords: ['suez canal', 'suez', 'gulf of suez', 'red sea'], routes: ['China-Europe (Suez)', 'Gulf-Europe Oil', 'Qatar LNG-Europe'], threatLevel: 'high', threatDescription: 'JWC Listed Area — adjacent to active Red Sea conflict and Iran-Israel war spillover', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:107:  { id: 'malacca_strait', name: 'Strait of Malacca', lat: 2.5, lon: 101.5, primaryKeywords: ['strait of malacca', 'malacca'], areaKeywords: ['strait of malacca', 'malacca', 'singapore strait'], routes: ['China-Middle East Oil', 'China-Europe (via Suez)', 'Japan-Middle East Oil'], threatLevel: 'normal', threatDescription: '', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:108:  { id: 'hormuz_strait', name: 'Strait of Hormuz', lat: 26.56, lon: 56.25, primaryKeywords: ['strait of hormuz', 'hormuz'], areaKeywords: ['strait of hormuz', 'hormuz', 'persian gulf', 'arabian gulf', 'gulf of oman', 'iran naval', 'iran military'], routes: ['Gulf Oil Exports', 'Qatar LNG', 'Iran Exports'], threatLevel: 'war_zone', threatDescription: 'Active conflict — Iran-Israel war; Iranian naval blockade risk and mines reported in Persian Gulf', directions: ['eastbound', 'westbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:109:  { id: 'bab_el_mandeb', name: 'Bab el-Mandeb', lat: 12.58, lon: 43.33, primaryKeywords: ['bab el-mandeb', 'bab al-mandab'], areaKeywords: ['bab el-mandeb', 'bab al-mandab', 'mandeb', 'aden', 'houthi', 'yemen', 'gulf of aden', 'red sea'], routes: ['Suez-Indian Ocean', 'Gulf-Europe Oil', 'Red Sea Transit'], threatLevel: 'critical', threatDescription: 'JWC Listed Area — active Houthi attacks on commercial shipping', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:110:  { id: 'panama', name: 'Panama Canal', lat: 9.08, lon: -79.68, primaryKeywords: ['panama canal'], areaKeywords: ['panama canal', 'panama'], routes: ['US East Coast-Asia', 'US East Coast-South America', 'Atlantic-Pacific Bulk'], threatLevel: 'normal', threatDescription: '', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:111:  { id: 'taiwan_strait', name: 'Taiwan Strait', lat: 24.0, lon: 119.5, primaryKeywords: ['taiwan strait', 'formosa'], areaKeywords: ['taiwan strait', 'formosa', 'taiwan', 'south china sea'], routes: ['China-Japan Trade', 'Korea-Southeast Asia', 'Pacific Semiconductor'], threatLevel: 'elevated', threatDescription: 'Cross-strait military tensions and PLA exercises', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:112:  { id: 'cape_of_good_hope', name: 'Cape of Good Hope', lat: -34.36, lon: 18.49, primaryKeywords: ['cape of good hope', 'good hope'], areaKeywords: ['cape of good hope', 'good hope', 'cape town', 'south africa', 'cape agulhas'], routes: ['Asia-Europe (Cape Route)', 'Gulf-Americas Oil', 'Suez Bypass'], threatLevel: 'normal', threatDescription: '', directions: ['eastbound', 'westbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:113:  { id: 'gibraltar', name: 'Strait of Gibraltar', lat: 35.96, lon: -5.35, primaryKeywords: ['strait of gibraltar', 'gibraltar'], areaKeywords: ['strait of gibraltar', 'gibraltar', 'mediterranean', 'algeciras', 'tangier'], routes: ['Atlantic-Mediterranean', 'Gulf-Europe Oil (final leg)', 'India-Europe'], threatLevel: 'normal', threatDescription: '', directions: ['eastbound', 'westbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:114:  { id: 'bosphorus', name: 'Bosporus Strait', lat: 41.12, lon: 29.05, primaryKeywords: ['bosphorus', 'bosporus', 'dardanelles', 'canakkale', 'turkish straits'], areaKeywords: ['bosphorus', 'bosporus', 'dardanelles', 'canakkale', 'istanbul', 'marmara', 'black sea', 'turkish straits', 'gallipoli', 'aegean'], routes: ['Russia Black Sea Exports', 'Ukraine Grain', 'Caspian Oil Transit', 'Aegean-Marmara Transit'], threatLevel: 'elevated', threatDescription: 'Montreux Convention restrictions; elevated due to Russia-Ukraine war and periodic Turkish traffic controls', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:115:  { id: 'korea_strait', name: 'Korea Strait', lat: 34.0, lon: 129.0, primaryKeywords: ['korea strait', 'tsushima strait'], areaKeywords: ['korea strait', 'tsushima', 'busan', 'shimonoseki', 'sea of japan', 'east sea'], routes: ['Japan-Korea Trade', 'China-Japan (alternate)', 'Pacific-East Asia'], threatLevel: 'normal', threatDescription: '', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:116:  { id: 'dover_strait', name: 'Dover Strait', lat: 51.05, lon: 1.45, primaryKeywords: ['dover strait', 'strait of dover', 'english channel'], areaKeywords: ['dover', 'calais', 'english channel', 'north sea', 'pas-de-calais'], routes: ['North Sea-Atlantic', 'Europe Intra-Trade', 'UK-Continental Europe'], threatLevel: 'normal', threatDescription: '', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:117:  { id: 'kerch_strait', name: 'Kerch Strait', lat: 45.33, lon: 36.60, primaryKeywords: ['kerch strait', 'kerch bridge'], areaKeywords: ['kerch', 'crimea', 'azov', 'sea of azov', 'black sea'], routes: ['Ukraine Grain (Azov)', 'Russia Azov Ports', 'Crimea Supply'], threatLevel: 'war_zone', threatDescription: 'Active conflict zone; Russia controls Kerch Bridge; Ukraine grain exports via Azov severely restricted', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:118:  { id: 'lombok_strait', name: 'Lombok Strait', lat: -8.47, lon: 115.72, primaryKeywords: ['lombok strait'], areaKeywords: ['lombok', 'bali', 'indonesia', 'nusa tenggara'], routes: ['Malacca Bypass (VLCCs)', 'Australia-Asia', 'Indian Ocean-Pacific'], threatLevel: 'normal', threatDescription: '', directions: ['northbound', 'southbound'] },
server\worldmonitor\supply-chain\v1\get-chokepoint-status.ts:327:      affectedRoutes: cp.routes,
server\worldmonitor\supply-chain\v1\get-sector-dependency.ts:52:  // Landlocked or unmapped countries have no routes; return empty so callers
server\worldmonitor\supply-chain\v1\get-route-explorer-lane.ts:15: *     because origin and destination clusters share no routes
server\worldmonitor\supply-chain\v1\get-route-explorer-lane.ts:41:import { TRADE_ROUTES } from '../../../../src/config/trade-routes';
src\components\DeckGLMap.ts:113:import { resolveTradeRouteSegments, TRADE_ROUTES as TRADE_ROUTES_LIST, type TradeRouteSegment, type TradeRouteStatus } from '@/config/trade-routes';
src\components\DeckGLMap.ts:1785:    // Trade routes layer
src\components\DeckGLMap.ts:1797:      this.layerCache.delete('trade-routes-layer');
src\components\DeckGLMap.ts:4625:    if (layerId === 'trade-routes-layer') {
src\components\DeckGLMap.ts:5557:    // When a scenario is active, override colors for routes that transit disrupted chokepoints.
src\components\DeckGLMap.ts:5590:      id: 'trade-routes-layer',
src\components\EnergyDisruptionsPanel.ts:255:    // delegated click handler on `this.content` that routes by data-
src\components\GlobeMap.ts:26:import { resolveTradeRouteSegments, type TradeRouteSegment } from '@/config/trade-routes';
server\worldmonitor\supply-chain\v1\_route-explorer-static-tables.ts:20: * `id` field from `src/config/trade-routes.ts`. Ranges span different vessel
server\worldmonitor\supply-chain\v1\scenario-templates.ts:59:      'Simultaneous 80% blockage of the Suez Canal and Bab el-Mandeb Strait for 60 days — full Red Sea corridor closure affecting all sectors on Asia-Europe routes.',
server\worldmonitor\supply-chain\v1\scenario-templates.ts:71:      'Severe drought reduces Panama Canal capacity to 50% for 90 days — vessels diverted via Cape Horn or Suez, adding 12–18 transit days on transpacific routes.',
server\worldmonitor\supply-chain\v1\scenario-templates.ts:107:      'US imposes 50% tariff on electronics imports (HS 85) for 365 days — no chokepoint closure but severe cost shock on transpacific container routes carrying consumer electronics.',
src\components\MapPopup.ts:2:import type { TradeRouteSegment } from '@/config/trade-routes';
src\components\CountryDeepDivePanel.ts:15:import { getChokepointRoutes } from '@/config/trade-routes';
src\components\CountryDeepDivePanel.ts:1310:          // panel-layout listener routes to the matching asset panel.
src\components\CountryDeepDivePanel.ts:1864:    const routesLabel = this.el('div', 'cdp-bypass-heading', `Routes via ${cpName}:`);
src\components\CountryDeepDivePanel.ts:1865:    wrap.append(routesLabel);
src\components\CountryDeepDivePanel.ts:2124:              text += ` ${altFlag} ${exp.safeAlternative} supplies ${altPct}% via routes avoiding this chokepoint.`;
src\components\CountryDeepDivePanel.ts:2141:          safeItem.textContent = '\u2713 All current suppliers use routes that avoid disrupted chokepoints.';
src\services\push-notifications.ts:37: * surfacing it as "unsupported" routes the UI through the same
src\components\AirlineIntelPanel.ts:98:        const firstRoute = wl.routes[0];
src\client\types.ts:7:    "/api/signalmap/list": {
src\client\types.ts:24:    "/api/signalmap/event/{id}": {
src\client\types.ts:41:    "/api/signalmap/source-health": {
src\client\types.ts:58:    "/api/signalmap/stream": {
src\client\types.ts:75:    "/api/signalmap/brief/global": {
src\client\types.ts:92:    "/api/signalmap/brief/event/{id}": {
src\client\base-url.ts:32: *     a `/api/...` path will compose with `/api/signalmap/...` to produce a
src\components\RouteExplorer\RouteExplorer.ts:34:import { TRADE_ROUTES } from '@/config/trade-routes';
src\components\RouteExplorer\tabs\AlternativesTab.ts:2: * Alternatives tab — ranked bypass sea routes. Arrow keys move selection,
src\components\RouteExplorer\tabs\AlternativesTab.ts:68:    listEl.setAttribute('aria-label', 'Alternative sea routes');
src\components\SupplyChainPanel.ts:781:      ? `<div class="sc-scenario-tagline">Simulating ${escapeHtml(taglineParts)} on ${result.affectedChokepointIds.length} chokepoint${result.affectedChokepointIds.length === 1 ? '' : 's'}. Chokepoint card below shows projected score; map highlights disrupted routes.</div>`
src\components\UnifiedSettings.ts:581:    // a late-arriving "you're a paying user" state routes to the billing
src\generated\client\worldmonitor\signalmap\v1\service_client.ts:116:    let path = "/api/signalmap/v1/list-signal-map-events";

 succeeded in 1601ms:
server\api\schemas\signalmap.ts
src\types\signalmap.ts
server\api\routes\signalmap-stream.ts
api\signalmap\v1\[rpc].ts
src\services\signalmap.ts
src\services\signalmap-watchlist.ts
src\services\live-stream-settings.ts
server\worldmonitor\supply-chain\v1\_portwatch-upstream.ts
server\worldmonitor\supply-chain\v1\_corridorrisk-upstream.ts
server\worldmonitor\signalmap\v1\_radar.ts
server\worldmonitor\signalmap\v1\_provider-status.ts
server\worldmonitor\signalmap\v1\list-signals.ts
server\worldmonitor\signalmap\v1\handler.ts
src\generated\server\worldmonitor\signalmap\v1\service_server.ts
server\worldmonitor\aviation\v1\get-youtube-live-stream-info.ts
server\router.ts
src\config\signalmap.ts
src\config\trade-routes.ts
src\generated\client\worldmonitor\signalmap\v1\service_client.ts

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "build:openapi|build:types|openapi.yaml|client/types|git diff|diff --exit" .github tests package.json scripts docs/SignalMap -g "*.yml" -g "*.yaml" -g "*.mjs" -g "*.json" -g "*.md"' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content public/openapi.yaml | ForEach-Object { $i++; if ($i -le 220) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content src/client/types.ts | ForEach-Object { $i++; if ($i -le 430) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
 succeeded in 1764ms:
package.json:27:    "build:openapi": "tsx scripts/build-openapi.mjs",
package.json:28:    "build:types": "openapi-typescript public/openapi.yaml -o src/client/types.ts",
package.json:30:    "prebuild": "npm run build:openapi && npm run build:agent-skills",
package.json:34:    "build:full": "npm run build:openapi && npm run build:agent-skills && npm run build:blog && cross-env-shell VITE_VARIANT=full \"tsc && vite build\"",
package.json:35:    "build:tech": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=tech \"tsc && vite build\"",
package.json:36:    "build:finance": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=finance \"tsc && vite build\"",
package.json:37:    "build:happy": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=happy \"tsc && vite build\"",
package.json:38:    "build:commodity": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=commodity \"tsc && vite build\"",
docs/SignalMap\design-summary.md:330:| **3** | API Contract + Client + SSE Replay | 3a choose code-first OpenAPI: `zod-openapi` or `ts-rest` (council recommended) → 3b define route schemas for the 6 endpoints → 3c generate OpenAPI spec into `public/openapi.yaml` at build → 3d generate types via `openapi-typescript` → 3e implement `openapi-fetch` client wrapper with canonical `getApiBaseUrl()` + normalization → 3f contract test asserting no `/api/ws/api` paths → 3g implement SSE endpoint with Redis replay ring (sorted set `signalmap:sse:ring`, monotonic IDs, eviction beyond size/TTL, heartbeats, jittered retry, graceful shutdown event) → 3h SSE replay tests | All 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green |
docs/SignalMap\handoff.md:175:| 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` |
docs/SignalMap\legacy-inventory.md:37:| `docs/api/SignalMapService.openapi.yaml` | SignalMap OpenAPI contract (YAML form) — drives generated client/server stubs | added 2026-04-26 sign-off (worker initially missed) |
docs/SignalMap\legacy-inventory.md:1077:11. **`docs/api/SignalMapService.openapi.yaml` (if it exists)** — The glob for `docs/api/` shows OpenAPI specs for all domains. A SignalMap-specific OpenAPI spec, if it exists, should be kept. The current file list did not show one explicitly named `SignalMapService` — it may live under a different name or may not yet be generated.
scripts\build-openapi.mjs:5: * the result as YAML to public/openapi.yaml.
scripts\build-openapi.mjs:18:const outPath = resolve(repoRoot, 'public', 'openapi.yaml');
scripts\build-openapi.mjs:33:console.log(`Wrote ${Buffer.byteLength(yamlText, 'utf8')} bytes to public/openapi.yaml`);
docs/SignalMap\PROGRESS.md:6:- **Last completed:** Phase 3 unit 3e. Canonical Phase 3 gate (`npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs`) all green: build:openapi wrote 11486 bytes; openapi-typescript 7.13.0 emitted src/client/types.ts; typecheck:all exit 0; 20/20 tests pass (7 openapi-spec-generation + 5 api-base-url-contract + 8 sse-replay-ring). Phase 3 checkpoint deliberation review (Codex/Gemini auth + Opus fallback) pending — Foreman MCP disconnected mid-session, must be invoked when reconnected.
docs/SignalMap\PROGRESS.md:61:**Phase 3 gate:** `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs`
docs/SignalMap\PROGRESS.md:149:| 2026-04-27 | phase-3 | 3a | complete | zod-openapi route schemas + spec generator. server/api/schemas/{common,signalmap}.ts + server/api/openapi.ts (generateSpec(): oas31.OpenAPIObject pure function). All 6 SignalMap endpoints defined with zod request/response schemas, 5XX error envelopes, component refs. zod ^3.25.76 + zod-openapi ^4.2.4 added. tests/openapi-spec-generation.test.mjs 7/7 pass; typecheck:all exit 0. build:openapi script untouched (Phase 3b owns it). |
docs/SignalMap\PROGRESS.md:150:| 2026-04-27 | phase-3 | 3b | complete | OpenAPI build pipeline + typed client. scripts/build-openapi.mjs serializes generateSpec() to public/openapi.yaml via yaml package. build:types runs openapi-typescript → src/client/types.ts. src/client/openapi.ts exports typed openapi-fetch client; src/client/base-url.ts exports protocol-preserving getApiBaseUrl(). Generated artifacts: 434-line YAML + 407-line types.ts. openapi-fetch ^0.14.0 + openapi-typescript ^7.0.0 added. All three gate commands exit 0. |
docs/SignalMap\PROGRESS.md:154:| 2026-04-27 | phase-3 | gate | PASS (canonical, deliberation pending) | Canonical Phase 3 gate green: `npm run build:openapi` (11486 bytes) && `npm run build:types` (openapi-typescript 7.13.0) && `npm run typecheck:all` (exit 0) && `npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` (20/20 pass). Multi-advisor deliberation review (Codex/Gemini auth + Opus fallback per Phase 1/2 precedent) is OWED — Foreman MCP disconnected mid-session. New session required for Phase 4 per context-budget discipline. |
docs/SignalMap\spec.md:130:    openapi.ts                       # generates public/openapi.yaml at build
docs/SignalMap\spec.md:146:  openapi.yaml                       # generated at build (do not hand-edit)
docs/SignalMap\spec.md:160:- `public/openapi.yaml` — generated at build by `npm run build:openapi` from `server/api/schemas/`
docs/SignalMap\spec.md:161:- `src/client/types.ts` — `openapi-typescript`-generated TS types from the spec
docs/SignalMap\spec.md:426:| 3b Generated types + client | `public/openapi.yaml` (generated), `src/client/types.ts` (generated), `src/client/openapi.ts`, `src/client/base-url.ts` | Add `npm run build:openapi` script (calls `openapi.ts.generateSpec()` → write YAML); add `npm run build:types` (calls `openapi-typescript public/openapi.yaml -o src/client/types.ts`); `openapi.ts` exports `client = createClient<paths>({ baseUrl: getApiBaseUrl() })`; `base-url.ts` exports canonical `getApiBaseUrl()` with explicit normalization (collapses double slashes, strips trailing) | `npm run build:openapi && npm run build:types && npm run typecheck:all` | Hand-edit `types.ts` or `openapi.yaml` |
docs/SignalMap\spec.md:431:**Phase 3 checkpoint:** `npm run build:openapi && npm run build:types && npm run typecheck:all` clean; all 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green.
docs/SignalMap\spec.md:507:| 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` | All contract + SSE tests pass |
.github\workflows\pro-bundle-freshness.yml:40:          if ! git diff --exit-code public/pro/; then
docs/SignalMap\_review\phase-3-review-prompt.md:21:- `public/openapi.yaml` (generated)
docs/SignalMap\_review\phase-3-review-prompt.md:22:- `src/client/types.ts` (generated)
docs/SignalMap\_review\phase-3-review-prompt.md:35:- `build:openapi` (rewired to `tsx scripts/build-openapi.mjs`)
docs/SignalMap\_review\phase-3-review-prompt.md:36:- `build:types` (`openapi-typescript public/openapi.yaml -o src/client/types.ts`)
docs/SignalMap\_review\phase-3-review-prompt.md:74:- Phase 3a deferred wiring of `build:openapi`/`build:types` from the spec to keep the unit testable independently. Phase 3b owns the wiring.
docs/SignalMap\_review\phase-3-gemini-review.md:31:**Spec**: "Generated `openapi.yaml` MUST contain definitions for all 6 SignalMap endpoints."
docs/SignalMap\_review\phase-3-gemini-review.md:32:**Issue**: The test `tests/openapi-spec-generation.test.mjs` validates that the `openapi.yaml` file is generated and contains some basic metadata like `info.title`. However, it does not programmatically verify that all 6 of the required SignalMap endpoints are present in the generated `paths` object. A developer could accidentally remove an endpoint from `server/api/schemas/signalmap.ts` and this test would still pass, violating the spec.
docs/SignalMap\_review\phase-3-codex-review-v2.md:33:- `public/openapi.yaml` (generated)
docs/SignalMap\_review\phase-3-codex-review-v2.md:34:- `src/client/types.ts` (generated)
docs/SignalMap\_review\phase-3-codex-review-v2.md:47:- `build:openapi` (rewired to `tsx scripts/build-openapi.mjs`)
docs/SignalMap\_review\phase-3-codex-review-v2.md:48:- `build:types` (`openapi-typescript public/openapi.yaml -o src/client/types.ts`)
docs/SignalMap\_review\phase-3-codex-review-v2.md:86:- Phase 3a deferred wiring of `build:openapi`/`build:types` from the spec to keep the unit testable independently. Phase 3b owns the wiring.
docs/SignalMap\_review\phase-3-codex-review-v2.md:254:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "signalmap|SSE|openapi|base-url|replay|Redis|brief|event" server/api/schemas/common.ts server/api/schemas/signalmap.ts server/api/openapi.ts scripts/build-openapi.mjs src/client/base-url.ts src/client/openapi.ts src/client/types.ts src/server/lib/redis.types.ts src/server/lib/redis.ts src/server/lib/sse-replay-ring.ts server/api/routes/signalmap-stream.ts tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs package.json' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review-v2.md:310:431:**Phase 3 checkpoint:** `npm run build:openapi && npm run build:types && npm run typecheck:all` clean; all 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green.
docs/SignalMap\_review\phase-3-codex-review-v2.md:325:scripts/build-openapi.mjs:5: * the result as YAML to public/openapi.yaml.
docs/SignalMap\_review\phase-3-codex-review-v2.md:328:scripts/build-openapi.mjs:18:const outPath = resolve(repoRoot, 'public', 'openapi.yaml');
docs/SignalMap\_review\phase-3-codex-review-v2.md:329:scripts/build-openapi.mjs:33:console.log(`Wrote ${Buffer.byteLength(yamlText, 'utf8')} bytes to public/openapi.yaml`);
docs/SignalMap\_review\phase-3-codex-review-v2.md:394:package.json:27:    "build:openapi": "tsx scripts/build-openapi.mjs",
docs/SignalMap\_review\phase-3-codex-review-v2.md:395:package.json:28:    "build:types": "openapi-typescript public/openapi.yaml -o src/client/types.ts",
docs/SignalMap\_review\phase-3-codex-review-v2.md:396:package.json:30:    "prebuild": "npm run build:openapi && npm run build:agent-skills",
docs/SignalMap\_review\phase-3-codex-review-v2.md:397:package.json:34:    "build:full": "npm run build:openapi && npm run build:agent-skills && npm run build:blog && cross-env-shell VITE_VARIANT=full \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:398:package.json:35:    "build:tech": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=tech \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:399:package.json:36:    "build:finance": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=finance \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:400:package.json:37:    "build:happy": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=happy \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:401:package.json:38:    "build:commodity": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=commodity \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:618:src/client/types.ts:2: * This file was auto-generated by openapi-typescript.
docs/SignalMap\_review\phase-3-codex-review-v2.md:619:src/client/types.ts:7:    "/api/signalmap/list": {
docs/SignalMap\_review\phase-3-codex-review-v2.md:620:src/client/types.ts:14:        /** List SignalMap events with filters */
docs/SignalMap\_review\phase-3-codex-review-v2.md:621:src/client/types.ts:24:    "/api/signalmap/event/{id}": {
docs/SignalMap\_review\phase-3-codex-review-v2.md:622:src/client/types.ts:31:        /** Get a single SignalMap event by ID */
docs/SignalMap\_review\phase-3-codex-review-v2.md:623:src/client/types.ts:41:    "/api/signalmap/source-health": {
docs/SignalMap\_review\phase-3-codex-review-v2.md:624:src/client/types.ts:58:    "/api/signalmap/stream": {
docs/SignalMap\_review\phase-3-codex-review-v2.md:625:src/client/types.ts:65:        /** SSE stream of live SignalMap events */
docs/SignalMap\_review\phase-3-codex-review-v2.md:626:src/client/types.ts:75:    "/api/signalmap/brief/global": {
docs/SignalMap\_review\phase-3-codex-review-v2.md:627:src/client/types.ts:84:        /** Get AI-generated global SignalMap brief (cached) */
docs/SignalMap\_review\phase-3-codex-review-v2.md:628:src/client/types.ts:92:    "/api/signalmap/brief/event/{id}": {
docs/SignalMap\_review\phase-3-codex-review-v2.md:629:src/client/types.ts:101:        /** Get AI-generated why-it-matters brief for a specific event (cached) */
docs/SignalMap\_review\phase-3-codex-review-v2.md:630:src/client/types.ts:162:            eventCount: number;
docs/SignalMap\_review\phase-3-codex-review-v2.md:631:src/client/types.ts:196:            /** @description Filtered SignalMap events with source health */
docs/SignalMap\_review\phase-3-codex-review-v2.md:632:src/client/types.ts:203:                        events: components["schemas"]["SignalMapEvent"][];
docs/SignalMap\_review\phase-3-codex-review-v2.md:633:src/client/types.ts:232:            /** @description SignalMap event */
docs/SignalMap\_review\phase-3-codex-review-v2.md:634:src/client/types.ts:288:                /** @description Resume SSE stream from a previously received event ID */
docs/SignalMap\_review\phase-3-codex-review-v2.md:635:src/client/types.ts:296:            /** @description SSE event stream (text/event-stream) */
docs/SignalMap\_review\phase-3-codex-review-v2.md:636:src/client/types.ts:302:                    "text/event-stream": string;
docs/SignalMap\_review\phase-3-codex-review-v2.md:637:src/client/types.ts:337:            /** @description Global brief with bullet points and sources */
docs/SignalMap\_review\phase-3-codex-review-v2.md:638:src/client/types.ts:382:            /** @description Event brief with why-it-matters explanation */
docs/SignalMap\_review\phase-3-codex-review-v2.md:738: 160: - `public/openapi.yaml` â€” generated at build by `npm run build:openapi` from `server/api/schemas/`
docs/SignalMap\_review\phase-3-codex-review-v2.md:739: 161: - `src/client/types.ts` â€” `openapi-typescript`-generated TS types from the spec
docs/SignalMap\_review\phase-3-codex-review-v2.md:801: 426: | 3b Generated types + client | `public/openapi.yaml` (generated), `src/client/types.ts` (generated), `src/client/openapi.ts`, `src/client/base-url.ts` | Add `npm run build:openapi` script (calls `openapi.ts.generateSpec()` â†’ write YAML); add `npm run build:types` (calls `openapi-typescript public/openapi.yaml -o src/client/types.ts`); `openapi.ts` exports `client = createClient<paths>({ baseUrl: getApiBaseUrl() })`; `base-url.ts` exports canonical `getApiBaseUrl()` with explicit normalization (collapses double slashes, strips trailing) | `npm run build:openapi && npm run build:types && npm run typecheck:all` | Hand-edit `types.ts` or `openapi.yaml` |
docs/SignalMap\_review\phase-3-codex-review-v2.md:806: 431: **Phase 3 checkpoint:** `npm run build:openapi && npm run build:types && npm run typecheck:all` clean; all 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green.
docs/SignalMap\_review\phase-3-codex-review-v2.md:816: 507: | 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` | All contract + SSE tests pass |
docs/SignalMap\_review\phase-3-codex-review-v2.md:1178:   5:  * the result as YAML to public/openapi.yaml.
docs/SignalMap\_review\phase-3-codex-review-v2.md:1191:  18: const outPath = resolve(repoRoot, 'public', 'openapi.yaml');
docs/SignalMap\_review\phase-3-codex-review-v2.md:1206:  33: console.log(`Wrote ${Buffer.byteLength(yamlText, 'utf8')} bytes to public/openapi.yaml`);
docs/SignalMap\_review\phase-3-codex-review-v2.md:1312:  27:     "build:openapi": "tsx scripts/build-openapi.mjs",
docs/SignalMap\_review\phase-3-codex-review-v2.md:1313:  28:     "build:types": "openapi-typescript public/openapi.yaml -o src/client/types.ts",
docs/SignalMap\_review\phase-3-codex-review-v2.md:1315:  30:     "prebuild": "npm run build:openapi && npm run build:agent-skills",
docs/SignalMap\_review\phase-3-codex-review-v2.md:1319:  34:     "build:full": "npm run build:openapi && npm run build:agent-skills && npm run build:blog && cross-env-shell VITE_VARIANT=full \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:1320:  35:     "build:tech": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=tech \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:1321:  36:     "build:finance": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=finance \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:1322:  37:     "build:happy": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=happy \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:1323:  38:     "build:commodity": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=commodity \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review-v2.md:2976:.\docs\SignalMap\_review\phase-3-codex-review.md:251:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files | rg "''^(server/api/schemas/common'"\\.ts|server/api/schemas/signalmap\\.ts|server/api/openapi\\.ts|scripts/build-openapi\\.mjs|src/client/base-url\\.ts|src/client/openapi\\.ts|public/openapi\\.yaml|src/client/types\\.ts|src/server/lib/redis\\.types\\.ts|src/server/lib/redis\\.ts|src/server/lib/sse-replay-ring\\.ts|server/api/routes/signalmap-stream\\.ts|tests/openapi-spec-generation\\.test\\.mjs|tests/api-base-url-contract\\.test\\.mjs|tests/sse-replay-ring\\.test\\.mjs|tests/sse-stream\\.test\\.mjs|package\\.json)"'$"' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review-v2.md:3014:.\docs\SignalMap\_review\phase-3-codex-review-v2.md:254:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "signalmap|SSE|openapi|base-url|replay|Redis|brief|event" server/api/schemas/common.ts server/api/schemas/signalmap.ts server/api/openapi.ts scripts/build-openapi.mjs src/client/base-url.ts src/client/openapi.ts src/client/types.ts src/server/lib/redis.types.ts src/server/lib/redis.ts src/server/lib/sse-replay-ring.ts server/api/routes/signalmap-stream.ts tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs package.json' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review-v2.md:3241:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "build:openapi|build:types|openapi.yaml|client/types|git diff|diff --exit" .github tests package.json scripts docs/SignalMap -g "*.yml" -g "*.yaml" -g "*.mjs" -g "*.json" -g "*.md"' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review-v2.md:3243:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content public/openapi.yaml | ForEach-Object { $i++; if ($i -le 220) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review-v2.md:3245:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content src/client/types.ts | ForEach-Object { $i++; if ($i -le 430) { '"'{0,4}: {1}' -f "'$i, $_ } }' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review.md:34:- `public/openapi.yaml` (generated)
docs/SignalMap\_review\phase-3-codex-review.md:35:- `src/client/types.ts` (generated)
docs/SignalMap\_review\phase-3-codex-review.md:48:- `build:openapi` (rewired to `tsx scripts/build-openapi.mjs`)
docs/SignalMap\_review\phase-3-codex-review.md:49:- `build:types` (`openapi-typescript public/openapi.yaml -o src/client/types.ts`)
docs/SignalMap\_review\phase-3-codex-review.md:87:- Phase 3a deferred wiring of `build:openapi`/`build:types` from the spec to keep the unit testable independently. Phase 3b owns the wiring.
docs/SignalMap\_review\phase-3-codex-review.md:251:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files | rg "''^(server/api/schemas/common'"\\.ts|server/api/schemas/signalmap\\.ts|server/api/openapi\\.ts|scripts/build-openapi\\.mjs|src/client/base-url\\.ts|src/client/openapi\\.ts|public/openapi\\.yaml|src/client/types\\.ts|src/server/lib/redis\\.types\\.ts|src/server/lib/redis\\.ts|src/server/lib/sse-replay-ring\\.ts|server/api/routes/signalmap-stream\\.ts|tests/openapi-spec-generation\\.test\\.mjs|tests/api-base-url-contract\\.test\\.mjs|tests/sse-replay-ring\\.test\\.mjs|tests/sse-stream\\.test\\.mjs|package\\.json)"'$"' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review.md:318:431:**Phase 3 checkpoint:** `npm run build:openapi && npm run build:types && npm run typecheck:all` clean; all 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green.
docs/SignalMap\_review\phase-3-codex-review.md:329:507:| 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` | All contract + SSE tests pass |
docs/SignalMap\_review\phase-3-codex-review.md:1532:docs\WorldMap\api\worldmonitor.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1533:docs\WorldMap\api\WildfireService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1535:docs\WorldMap\api\WebcamService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1537:docs\WorldMap\api\UnrestService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1539:docs\WorldMap\api\TradeService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1541:docs\WorldMap\api\ThermalService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1543:docs\WorldMap\api\SupplyChainService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1545:docs\WorldMap\api\ShippingV2Service.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1547:docs\WorldMap\api\SeismologyService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1549:docs\WorldMap\api\ScenarioService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1551:docs\WorldMap\api\SanctionsService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1553:docs\WorldMap\api\ResilienceService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1555:docs\WorldMap\api\ResearchService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1557:docs\WorldMap\api\RadiationService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1559:docs\WorldMap\api\PredictionService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1561:docs\WorldMap\api\PositiveEventsService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1563:docs\WorldMap\api\NewsService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1565:docs\WorldMap\api\NaturalService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1567:docs\WorldMap\api\MilitaryService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1569:docs\WorldMap\api\MarketService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1571:docs\WorldMap\api\MaritimeService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1573:docs\WorldMap\api\LeadsService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1575:docs\WorldMap\api\IntelligenceService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1577:docs\WorldMap\api\InfrastructureService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1579:docs\WorldMap\api\ImageryService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1581:docs\WorldMap\api\HealthService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1583:docs\WorldMap\api\GivingService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1585:docs\WorldMap\api\ForecastService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1587:docs\WorldMap\api\EconomicService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1589:docs\WorldMap\api\DisplacementService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1591:docs\WorldMap\api\CyberService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1593:docs\WorldMap\api\ConsumerPricesService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1595:docs\WorldMap\api\ConflictService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1597:docs\WorldMap\api\ClimateService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:1599:docs\WorldMap\api\AviationService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2162:docs\api\worldmonitor.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2163:docs\api\WildfireService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2166:docs\api\WebcamService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2169:docs\api\UnrestService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2171:docs\api\TradeService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2173:docs\api\ThermalService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2175:docs\api\SupplyChainService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2177:docs\api\SignalMapService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2179:docs\api\ShippingV2Service.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2181:docs\api\SeismologyService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2183:docs\api\ScenarioService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2185:docs\api\SanctionsService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2187:docs\api\ResilienceService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2189:docs\api\ResearchService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2191:docs\api\RadiationService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2193:docs\api\PredictionService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2195:docs\api\PositiveEventsService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2197:docs\api\NewsService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2199:docs\api\NaturalService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2201:docs\api\MilitaryService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2203:docs\api\MarketService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2205:docs\api\MaritimeService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2207:docs\api\LeadsService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2209:docs\api\IntelligenceService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2211:docs\api\InfrastructureService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2213:docs\api\ImageryService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2215:docs\api\HealthService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2217:docs\api\GivingService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2219:docs\api\ForecastService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2221:docs\api\EconomicService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2223:docs\api\DisplacementService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2225:docs\api\CyberService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2227:docs\api\ConsumerPricesService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2229:docs\api\ConflictService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2231:docs\api\ClimateService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:2233:docs\api\AviationService.openapi.yaml
docs/SignalMap\_review\phase-3-codex-review.md:3395:  160: - `public/openapi.yaml` â€” generated at build by `npm run build:openapi` from `server/api/schemas/`
docs/SignalMap\_review\phase-3-codex-review.md:3396:  161: - `src/client/types.ts` â€” `openapi-typescript`-generated TS types from the spec
docs/SignalMap\_review\phase-3-codex-review.md:3460:  507: | 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` | All contract + SSE tests pass |
docs/SignalMap\_review\phase-3-codex-review.md:3468:  426: | 3b Generated types + client | `public/openapi.yaml` (generated), `src/client/types.ts` (generated), `src/client/openapi.ts`, `src/client/base-url.ts` | Add `npm run build:openapi` script (calls `openapi.ts.generateSpec()` â†’ write YAML); add `npm run build:types` (calls `openapi-typescript public/openapi.yaml -o src/client/types.ts`); `openapi.ts` exports `client = createClient<paths>({ baseUrl: getApiBaseUrl() })`; `base-url.ts` exports canonical `getApiBaseUrl()` with explicit normalization (collapses double slashes, strips trailing) | `npm run build:openapi && npm run build:types && npm run typecheck:all` | Hand-edit `types.ts` or `openapi.yaml` |
docs/SignalMap\_review\phase-3-codex-review.md:3473:  431: **Phase 3 checkpoint:** `npm run build:openapi && npm run build:types && npm run typecheck:all` clean; all 6 endpoints type-checked end-to-end; SSE replay tests pass; contract test green.
docs/SignalMap\_review\phase-3-codex-review.md:3872:    5:  * the result as YAML to public/openapi.yaml.
docs/SignalMap\_review\phase-3-codex-review.md:3885:   18: const outPath = resolve(repoRoot, 'public', 'openapi.yaml');
docs/SignalMap\_review\phase-3-codex-review.md:3900:   33: console.log(`Wrote ${Buffer.byteLength(yamlText, 'utf8')} bytes to public/openapi.yaml`);
docs/SignalMap\_review\phase-3-codex-review.md:5357:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'package.json'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ if($lines[$i-1] -match '"'build:openapi|build:types|typecheck:all|zod|openapi'){ '{0,5}: {1}' -f "'$i,$lines[$i-1] } }' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review.md:5359:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'public/openapi.yaml'; "'$lines=Get-Content $path; for($i=1;$i -le $lines.Length;$i++){ if($i -le 240){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] } }' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review.md:5746:   27:     "build:openapi": "tsx scripts/build-openapi.mjs",
docs/SignalMap\_review\phase-3-codex-review.md:5747:   28:     "build:types": "openapi-typescript public/openapi.yaml -o src/client/types.ts",
docs/SignalMap\_review\phase-3-codex-review.md:5748:   30:     "prebuild": "npm run build:openapi && npm run build:agent-skills",
docs/SignalMap\_review\phase-3-codex-review.md:5749:   34:     "build:full": "npm run build:openapi && npm run build:agent-skills && npm run build:blog && cross-env-shell VITE_VARIANT=full \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review.md:5750:   35:     "build:tech": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=tech \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review.md:5751:   36:     "build:finance": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=finance \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review.md:5752:   37:     "build:happy": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=happy \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review.md:5753:   38:     "build:commodity": "npm run build:openapi && npm run build:agent-skills && cross-env-shell VITE_VARIANT=commodity \"tsc && vite build\"",
docs/SignalMap\_review\phase-3-codex-review.md:5761:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'public/openapi.yaml'; "'$lines=Get-Content $path; for($i=241;$i -le [Math]::Min($lines.Length,420);$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review.md:5945:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'public/openapi.yaml'; "'$lines=Get-Content $path; for($i=421;$i -le [Math]::Min($lines.Length,520);$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review.md:5963:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'src/client/types.ts'; "'$lines=Get-Content $path; for($i=1;$i -le [Math]::Min($lines.Length,260);$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
docs/SignalMap\_review\phase-3-codex-review.md:5965:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$path='"'src/client/types.ts'; "'$lines=Get-Content $path; for($i=261;$i -le [Math]::Min($lines.Length,520);$i++){ '"'{0,5}: {1}' -f "'$i,$lines[$i-1] }' in C:\Coding_Workspace\Github_P\worldmonitor
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
tests\supply-chain-v2.test.mjs:133:  const yamlSpec = readSrc('docs/api/SupplyChainService.openapi.yaml');

 succeeded in 2272ms:
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

 succeeded in 2411ms:
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

codex
One implementation-level issue is already clear: live pub/sub handling is connection-local, so the replay ring is mutated once per connected client and not at all when no client is connected. I’m running the Phase 3 tests now to see whether the advertised gate actually catches that class of failure or silently skips coverage.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs tests/sse-stream.test.mjs' in C:\Coding_Workspace\Github_P\worldmonitor
2026-04-27T19:30:04.563355Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 2.9 seconds
Output:
TAP version 13
# Subtest: tests\\api-base-url-contract.test.mjs
not ok 1 - tests\\api-base-url-contract.test.mjs
  ---
  duration_ms: 5.9231
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
  duration_ms: 3.6094
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
  duration_ms: 2.8169
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
  duration_ms: 2.042
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
# duration_ms 18.0108

 exited 1 in 2933ms:
TAP version 13
# Subtest: tests\\api-base-url-contract.test.mjs
not ok 1 - tests\\api-base-url-contract.test.mjs
  ---
  duration_ms: 5.9231
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
  duration_ms: 3.6094
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
  duration_ms: 2.8169
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
  duration_ms: 2.042
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
# duration_ms 18.0108

codex
## [CRITICAL] [b] Pub/Sub Events Are Added To The Replay Ring Once Per Connected Client

**File**: `server/api/routes/signalmap-stream.ts:79`, `src/server/lib/redis.ts:71`  
**Spec**: "Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` ... subscribe to `signalmap:events` pubsub channel"  
**Issue**: `handleSignalMapStream()` registers a Redis subscription handler per SSE connection. The adapter then invokes every registered handler for one published message, and each handler calls `nextEventId()` and `addEventToRing()`. With 3 clients, one upstream event becomes 3 replay-ring entries with 3 different SSE IDs; with 0 clients, no one is subscribed and the event is never written to the replay ring.  
**Recommendation**: Move pub/sub consumption and ring writes to one process-level broadcaster, or make the event publisher write the replay ring once before publishing. Per-connection code should only fan out the already-assigned event ID/payload.

## [HIGH] [b] Replay Ring Stores IDs, Not Event JSON As Specified

**File**: `src/server/lib/sse-replay-ring.ts:49`  
**Spec**: "Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`)"  
**Issue**: The implementation writes payloads to separate `signalmap:sse:event:<id>` keys and stores `String(id)` as the sorted-set member. That is not the specified ring shape. It also creates a second failure mode where the zset member can survive while the payload key expires or disappears.  
**Recommendation**: Store the serialized event payload directly as the zset member, or update the spec and all replay/loss semantics to explicitly define the two-key design.

## [HIGH] [b] TTL-Expired Replay Payloads Are Silently Dropped Instead Of Returning Replay Lost

**File**: `src/server/lib/sse-replay-ring.ts:106`  
**Spec**: "SSE Last-Event-ID evicted from ring | `204 X-Replay-Lost: true`"  
**Issue**: When `getJson(signalmap:sse:event:<id>)` returns `null`, the code filters the event out and still returns `lost: false` at line 109. `handleSignalMapStream()` only sends `204 X-Replay-Lost` when `replay.lost` is true, so a client can miss events after reconnect and receive a normal `200` stream with no indication it must refetch.  
**Recommendation**: Treat any missing payload in the requested replay range as `lost: true`, or eliminate independent payload expiry by keeping replay data in the zset member.

## [HIGH] [a] Graceful Shutdown Hook Is Exported But Not Wired

**File**: `server/api/routes/signalmap-stream.ts:114`  
**Spec**: "on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n`"  
**Issue**: `setupSignalMapStreamShutdown()` installs the SIGTERM/SIGINT handlers, but repo search shows it is only called by tests, not production startup or route registration. Exporting the function does not implement the shutdown behavior unless something calls it.  
**Recommendation**: Invoke `setupSignalMapStreamShutdown()` exactly once from the server/bootstrap path that installs SignalMap routes, or install it safely at module initialization.

## [MEDIUM] [c] Subscribe Failure Leaves Clients On A Dead Heartbeat Stream

**File**: `src/server/lib/redis.ts:147`  
**Spec**: "subscribe to `signalmap:events` pubsub channel"  
**Issue**: Redis `SUBSCRIBE` failures are caught and logged inside the adapter, while `handleSignalMapStream()` has already opened a `200 text/event-stream`. The client can remain connected and receive heartbeats, but never receive live events, with no retry signal or HTTP error.  
**Recommendation**: Add an async subscribe path that confirms subscription before opening the stream, or send an SSE error/shutdown frame and close if subscription fails.

## [HIGH] [d] SSE Tests Can Pass Without Redis Coverage

**File**: `tests/sse-replay-ring.test.mjs:26`, `tests/sse-stream.test.mjs:82`  
**Spec**: "Tests: monotonic ID generation, ring eviction past size+TTL, replay from `Last-Event-ID`, `204 X-Replay-Lost` when ID evicted, jittered shutdown retry, heartbeat cadence"  
**Issue**: Both SSE suites skip when `REDIS_URL` is absent or unreachable. That makes the Phase 3 gate capable of reporting success without exercising the required Redis-backed replay behavior.  
**Recommendation**: In CI, start a Redis service/container and fail if unavailable. Keep local skipping behind an explicit opt-out env var, not the default gate path.

## [HIGH] [d] No Test Covers Live Pub/Sub Delivery Or Multi-Client Replay Ring Semantics

**File**: `tests/sse-stream.test.mjs:218`  
**Spec**: "SSE handler subscribes to a Redis pub/sub channel and pushes deltas to connected browsers."  
**Issue**: The integration suite tests replay, 204 lost response, and heartbeat, but never publishes to `signalmap:events`. It therefore misses the critical bug where one published event is inserted once per connected client and not inserted at all with zero clients.  
**Recommendation**: Add a live publish test with at least two clients. Assert both clients receive the same event ID and the replay ring contains exactly one new entry.

## [MEDIUM] [d] Shutdown Test Does Not Verify The Shutdown SSE Frame

**File**: `tests/sse-stream.test.mjs:162`  
**Spec**: "Tests: ... jittered shutdown retry"  
**Issue**: The test only samples `_jitteredRetryMs()`. It does not open an SSE connection, trigger the shutdown path, and assert the client receives `event: shutdown` with a `retry:` field before close.  
**Recommendation**: Add an integration test that connects a client, invokes the shutdown handler deterministically, and verifies the exact SSE frame.

Category (a): findings above.  
Category (b): findings above.  
Category (c): findings above.  
Category (d): findings above.

I attempted the Phase 3 test command, but this sandbox blocks Node test-runner child process spawning with `spawn EPERM`, so I could not use the test output as validation.
2026-04-27T19:31:09.568904Z ERROR codex_core::session: failed to record rollout items: thread 019dd067-8e57-7fd0-a197-917ccfa52abc not found
tokens used
198,997
## [CRITICAL] [b] Pub/Sub Events Are Added To The Replay Ring Once Per Connected Client

**File**: `server/api/routes/signalmap-stream.ts:79`, `src/server/lib/redis.ts:71`  
**Spec**: "Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` ... subscribe to `signalmap:events` pubsub channel"  
**Issue**: `handleSignalMapStream()` registers a Redis subscription handler per SSE connection. The adapter then invokes every registered handler for one published message, and each handler calls `nextEventId()` and `addEventToRing()`. With 3 clients, one upstream event becomes 3 replay-ring entries with 3 different SSE IDs; with 0 clients, no one is subscribed and the event is never written to the replay ring.  
**Recommendation**: Move pub/sub consumption and ring writes to one process-level broadcaster, or make the event publisher write the replay ring once before publishing. Per-connection code should only fan out the already-assigned event ID/payload.

## [HIGH] [b] Replay Ring Stores IDs, Not Event JSON As Specified

**File**: `src/server/lib/sse-replay-ring.ts:49`  
**Spec**: "Replay ring: `ZADD signalmap:sse:ring <monotonic_id> <event_json>` (Redis sorted set, capped at `SSE_REPLAY_RING_SIZE`)"  
**Issue**: The implementation writes payloads to separate `signalmap:sse:event:<id>` keys and stores `String(id)` as the sorted-set member. That is not the specified ring shape. It also creates a second failure mode where the zset member can survive while the payload key expires or disappears.  
**Recommendation**: Store the serialized event payload directly as the zset member, or update the spec and all replay/loss semantics to explicitly define the two-key design.

## [HIGH] [b] TTL-Expired Replay Payloads Are Silently Dropped Instead Of Returning Replay Lost

**File**: `src/server/lib/sse-replay-ring.ts:106`  
**Spec**: "SSE Last-Event-ID evicted from ring | `204 X-Replay-Lost: true`"  
**Issue**: When `getJson(signalmap:sse:event:<id>)` returns `null`, the code filters the event out and still returns `lost: false` at line 109. `handleSignalMapStream()` only sends `204 X-Replay-Lost` when `replay.lost` is true, so a client can miss events after reconnect and receive a normal `200` stream with no indication it must refetch.  
**Recommendation**: Treat any missing payload in the requested replay range as `lost: true`, or eliminate independent payload expiry by keeping replay data in the zset member.

## [HIGH] [a] Graceful Shutdown Hook Is Exported But Not Wired

**File**: `server/api/routes/signalmap-stream.ts:114`  
**Spec**: "on graceful shutdown send `event: shutdown\nretry: <jittered>\n\n`"  
**Issue**: `setupSignalMapStreamShutdown()` installs the SIGTERM/SIGINT handlers, but repo search shows it is only called by tests, not production startup or route registration. Exporting the function does not implement the shutdown behavior unless something calls it.  
**Recommendation**: Invoke `setupSignalMapStreamShutdown()` exactly once from the server/bootstrap path that installs SignalMap routes, or install it safely at module initialization.

## [MEDIUM] [c] Subscribe Failure Leaves Clients On A Dead Heartbeat Stream

**File**: `src/server/lib/redis.ts:147`  
**Spec**: "subscribe to `signalmap:events` pubsub channel"  
**Issue**: Redis `SUBSCRIBE` failures are caught and logged inside the adapter, while `handleSignalMapStream()` has already opened a `200 text/event-stream`. The client can remain connected and receive heartbeats, but never receive live events, with no retry signal or HTTP error.  
**Recommendation**: Add an async subscribe path that confirms subscription before opening the stream, or send an SSE error/shutdown frame and close if subscription fails.

## [HIGH] [d] SSE Tests Can Pass Without Redis Coverage

**File**: `tests/sse-replay-ring.test.mjs:26`, `tests/sse-stream.test.mjs:82`  
**Spec**: "Tests: monotonic ID generation, ring eviction past size+TTL, replay from `Last-Event-ID`, `204 X-Replay-Lost` when ID evicted, jittered shutdown retry, heartbeat cadence"  
**Issue**: Both SSE suites skip when `REDIS_URL` is absent or unreachable. That makes the Phase 3 gate capable of reporting success without exercising the required Redis-backed replay behavior.  
**Recommendation**: In CI, start a Redis service/container and fail if unavailable. Keep local skipping behind an explicit opt-out env var, not the default gate path.

## [HIGH] [d] No Test Covers Live Pub/Sub Delivery Or Multi-Client Replay Ring Semantics

**File**: `tests/sse-stream.test.mjs:218`  
**Spec**: "SSE handler subscribes to a Redis pub/sub channel and pushes deltas to connected browsers."  
**Issue**: The integration suite tests replay, 204 lost response, and heartbeat, but never publishes to `signalmap:events`. It therefore misses the critical bug where one published event is inserted once per connected client and not inserted at all with zero clients.  
**Recommendation**: Add a live publish test with at least two clients. Assert both clients receive the same event ID and the replay ring contains exactly one new entry.

## [MEDIUM] [d] Shutdown Test Does Not Verify The Shutdown SSE Frame

**File**: `tests/sse-stream.test.mjs:162`  
**Spec**: "Tests: ... jittered shutdown retry"  
**Issue**: The test only samples `_jitteredRetryMs()`. It does not open an SSE connection, trigger the shutdown path, and assert the client receives `event: shutdown` with a `retry:` field before close.  
**Recommendation**: Add an integration test that connects a client, invokes the shutdown handler deterministically, and verifies the exact SSE frame.

Category (a): findings above.  
Category (b): findings above.  
Category (c): findings above.  
Category (d): findings above.

I attempted the Phase 3 test command, but this sandbox blocks Node test-runner child process spawning with `spawn EPERM`, so I could not use the test output as validation.
