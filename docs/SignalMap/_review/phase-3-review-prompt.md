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
