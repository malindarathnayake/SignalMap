---
project: SignalMap Standalone v2
artifact: handoff
audience: implementor (worker agent or human dev)
date: 2026-04-26
input: docs/SignalMap/spec.md
---

# SignalMap Standalone v2 — Implementor Handoff

## Project Overview

You're implementing the clean-slate rewrite of the worldmonitor SignalMap UI as a single-product Preact + JSX dashboard. The full spec is in `docs/SignalMap/spec.md`. The design rationale is in `docs/SignalMap/design-summary.md`. The architecture council that arbitrated key decisions is in `docs/SignalMap/council-report-2026-04-26.md`.

**Top-level goal:** Replace the variant-based shell with a standalone Preact app that matches `docs/SignalMap/Claude_Design/`, keep the existing collector pipeline (renamed), drop ~35 unused dependencies, archive non-SignalMap code to a `archive/v1-legacy` git branch, and ship a 2-service Docker stack (signalmap + redis) behind HTTP/2 nginx. Brief feature uses Perplexity Sonar Pro retrieval + OpenRouter Nemotron synthesis with stampede / spend / citation / injection hardening.

## Before Starting

Read in this order:
1. `docs/SignalMap/spec.md` — the implementation spec (what to build, in what order, with what test commands)
2. This file — implementor rules, dependency context, common pitfalls
3. `docs/SignalMap/PROGRESS.md` — your phase + unit pointer; check `next_up` before doing anything

Then call `mcp__foreman__session_orient` to confirm the ledger position matches PROGRESS.md.

## Rules

1. **Ledger is authority.** Never trust your own memory of "what's done" — read `mcp__foreman__read_ledger` and `mcp__foreman__read_progress` at session start.
2. **One unit at a time.** Do not start unit `Nb` before unit `Na` is marked complete in the ledger.
3. **Tests before completion.** A unit is not complete until its test command passes. Update the ledger only after the test command exits 0.
4. **No scope additions.** If something looks wrong outside your unit's files, log it in PROGRESS.md "Error Recovery Log" and continue. Don't refactor opportunistically.
5. **No skipping tests.** If a test fails because of an environment issue, fix the environment, not the test.
6. **Verify before claiming.** Trust-but-verify pattern: after Write/Edit, re-read the file to confirm.
7. **Pre-commit hook fails ⇒ NEW commit, not amend.** When a hook blocks a commit, fix the issue and create a new commit. Never `git commit --amend` without explicit user approval.
8. **No `--no-verify`, no `--force` push.**
9. **For destructive ops** (git rm of archived paths, dropping deps, deleting variant code): commit smaller chunks so revert is cheap.
10. **Council amendments are non-negotiable.** The 9 amendments in `council-report-2026-04-26.md` are baked into the spec. Don't second-guess them mid-unit.

## Implementation Order

The full breakdown lives in `spec.md` §Implementation Order. Below adds the per-unit dependency context and the common pitfalls each unit hits.

### Phase 0 — Discovery & Inventory (5 units: 0a, 0b, 0c, 0d, 0e)

**Why first:** Council blocked design completion on Perplexity schema verification (design's 35-domain allowlist exceeds documented 20-cap). Container topology decisions also depend on Redis adapter contract being agreed before any code touches the data layer. Legacy inventory + panel docs must be written *while the legacy code is still in `src/`*, because that's when behavior is easiest to characterize accurately.

**Pitfalls:**
- 0a: Don't use the Perplexity MCP tool for the discovery curl — that hides the raw HTTP shape. Use real `curl` and capture the response verbatim into `docs/SignalMap/_discovery/perplexity-probe-result.md`. The Perplexity MCP tool may abstract things we need to know.
- 0a: If `PERPLEXITY_API_KEY` isn't set in your shell, ask the user to `export PERPLEXITY_API_KEY=...` (or use the bang prefix `! export …`) before running the curl. Do not skip this unit.
- 0b: OpenRouter slugs change frequently. The fallback chain default in `SIGNALMAP_LLM_MODELS` may already be stale; commit whatever you find as authoritative for this deploy and move on.
- 0c: Redis adapter contract is *types only* in this unit — no impl. The interface goes into `src/server/lib/redis.types.ts`; the impl lands in 2a.
- 0d: Use `Grep` (not `find`/`grep` shell) to enumerate. Output is a markdown table per file: `path | decision | notes`. Get user sign-off before any move/delete.
- 0e: One section per panel. Include: data sources, mount/dispose, refresh cadence, deps, watchlist coupling, error/empty states. Doc-only — no code change.

### Phase 1 — Minimal Standalone Entry (3 units: 1a, 1b, 1c)

**Why before legacy removal:** Council's reordering insight — building the new shell *alongside* the legacy lets you validate the entry works before touching anything that could break the existing build. Lower-risk path.

**Pitfalls:**
- 1a: `tsconfig.json` change to `"jsx": "preserve"` + `"jsxImportSource": "preact"` will affect typecheck across the existing codebase. If existing files use JSX-incompatible patterns (e.g., `as any` cast tricks that JSX parser rejects), narrow the JSX config to a `tsconfig.signalmap.json` extending the root, and update build scripts accordingly. Keep the legacy build green.
- 1b: The new `index.html` lives at the repo root. The existing `index.html` already exists — rename it temporarily to `index.legacy.html` and reference from `vite.config.ts`'s legacy build entry. The new entry replaces the default. (When Phase 9 archives legacy, `index.legacy.html` goes too.)
- 1c: CSS port is verbatim. Don't merge with existing tokens — that's `tokens.css.legacy`. The mockup tokens are intentionally different.

### Phase 2 — Redis Adapter + Container Topology (5 units: 2a, 2b, 2c, 2d, 2e)

**Why early (council reorder):** Building Phase 4-6 features against the soon-to-be-replaced `redis-rest` HTTP shim is wasted work. Swap the data driver first, then iterate.

**Pitfalls:**
- 2a: `ioredis` is the standard for TCP Redis. Do NOT use `@upstash/redis` — it's HTTP-only (verified by Codex). Use `redis:7-alpine` Docker container for tests, **not** a mocked Redis library.
- 2b: When migrating callers, preserve the `signalmap:` key prefix exactly. Check via `grep -r "signalmap:" server/ scripts/` before/after.
- 2c: `docker-compose.signalmap.yml` rename happens in Phase 8, not here. In Phase 2 you only drop the `redis-rest` service block.
- 2d: nginx config requires `listen 8080 http2;` — the `http2` token is a separate listen flag in nginx 1.25+; on older versions it's `listen 8080 ssl http2;` (requires SSL). Verify nginx version in Dockerfile (`apk info nginx` shows version) before committing config.
- 2e: Health check criticality: only `cloudflare_radar` is "critical" in v1. Other sources stale → `degraded` but container stays healthy.

### Phase 3 — API Contract + Client + SSE Replay (5 units: 3a, 3b, 3c, 3d, 3e)

**Pitfalls:**
- 3a: Pick `zod-openapi` over `ts-rest` — `zod-openapi` lets you keep handler logic plain (functions taking validated input), whereas `ts-rest` couples handler shape to the contract DSL. Defer the choice to the unit if you encounter a deal-breaker.
- 3b: `getApiBaseUrl()` is the canonical entry point. Existing code has `runtime.ts` with `getConfiguredWebApiBaseUrl()` etc. — that file is going away; do NOT call into it from the new client. Write fresh.
- 3c: The contract test must verify *behavior* (compose path strings via the real openapi-fetch client and check no `/api/ws/api`), not pattern-match the source. Test runs at typecheck level, not runtime.
- 3d: Redis sorted-set monotonic IDs use `ZADD signalmap:sse:ring <score> <event_id>` where score is a monotonic integer (e.g., from `INCR signalmap:sse:counter`). Event payload stored separately at `signalmap:sse:event:<id>`. Replay via `ZRANGEBYSCORE` from `Last-Event-ID + 1`.
- 3e: SSE tests must use real Redis (not a mock) and a real HTTP client (Node's `EventSource` polyfill or `node:fetch` with `text/event-stream` parsing).

### Phase 4 — Frontend Shell against Mocked APIs (5 units: 4a-4e)

**Pitfalls:**
- 4a: `@preact/signals` requires a Preact component to subscribe via `useSignal` / `useComputed` / `useSignalEffect`. Plain `signal.value` reads inside JSX work but don't subscribe — use the hooks to ensure re-render.
- 4a: `persist(signal, key)` helper — write it once in `src/state/persist.ts`. Pattern: `effect(() => localStorage.setItem(key, JSON.stringify(signal.value)))`.
- 4d: Inspector "Why this matters" tab is a placeholder — button click is no-op until Phase 6. The button must exist and be clickable for E2E, but the brief endpoint isn't wired yet.
- 4e: Vite middleware fixtures pattern: `configureServer(server) { server.middlewares.use((req, res, next) => { if (req.url?.startsWith('/api/signalmap/')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(fixtureFor(req.url))); return; } next(); }); }`.

### Phase 5 — SVG Map Renderer (4 units: 5a, 5b, 5c, 5d)

**Pitfalls:**
- 5a: `topojson-client.feature(world, world.objects.countries)` returns a GeoJSON FeatureCollection. Pass into `d3-geo.geoEquirectangular().fitSize([w, h], featureCollection)`. Use `d3-geo.geoPath(projection)` to generate the SVG `d` attribute.
- 5b: `d3-zoom` requires the SVG element as the listener; transform applies to a single inner `<g>` containing both the base and the markers. Compute scale/offset from the actual SVG client rect (not the `viewBox`) to handle non-2:1 containers.
- 5c: 44px touch hit areas are `<rect width="44" height="44" x={cx-22} y={cy-22} fill="transparent" pointer-events="all">` — inside the same `<g>` so they zoom with the marker.
- 5d: Visual regression goldens must commit to `e2e/__screenshots__/`. CI runs `playwright test` not `playwright test --update-snapshots` — first commit the goldens locally with `--update-snapshots`, then commit.

### Phase 6 — Brief Backend (5 units: 6a-6e)

**Pitfalls:**
- 6a: Perplexity request includes `search_domain_filter: [<≤20 domains>]`. If you pass more, expect 400. Validate against allowlist size at the wrapper level.
- 6b: XML wrap pattern: `<retrieved_context>\n${escapeXml(perplexityOutput)}\n</retrieved_context>`. Escape `<` and `&` in the input (don't escape `>`); if the input contains `</retrieved_context>` after escaping, the wrap is intact. Test this case explicitly.
- 6c: Atomic spend reservation pseudocode:
  ```
  const estCost = estimateCost(model, estInputTok, estOutputTok)
  const newTotal = await redis.incrByFloat('signalmap:llm:spend:'+today, estCost)
  if (newTotal > BUDGET) {
    await redis.incrByFloat('signalmap:llm:spend:'+today, -estCost)
    return { ok: false, reason: 'budget_exhausted' }
  }
  // ...make call...
  // refund the difference
  await redis.incrByFloat('signalmap:llm:spend:'+today, actualCost - estCost)
  ```
- 6c: Singleflight lock pattern:
  ```
  const acquired = await redis.setNx(lockKey, pid, LOCK_TTL_SEC)
  if (!acquired) {
    // poll cache
    for (let i = 0; i < 150; i++) { // 30s / 200ms
      const cached = await redis.getJson(cacheKey)
      if (cached) return cached
      await sleep(STAMPEDE_POLL_MS)
    }
    return { ok: false, reason: 'stampede_timeout' }
  }
  // ... compute ... write cache ... release lock
  ```
- 6d: Per-event cache forever (no TTL); event IDs are immutable.
- 6e: BriefStrip auto-refresh uses `setInterval` cleared on unmount via `useEffect` cleanup. Don't run during E2E unless test mocks the timer.

### Phase 7 — Strip Variant System (3 units: 7a, 7b, 7c)

**Pitfalls:**
- 7a: Phase 0d audit gives you the file list. Don't grep again — work from the kill list.
- 7c: The `no-variant-imports.test.mjs` greps source files for `SITE_VARIANT`, `VITE_VARIANT`, and `from '@/config/variant'`. If any match exists, fail the test. Allow no exceptions.

### Phase 8 — Minimal Rename (2 units: 8a, 8b)

**Pitfalls:**
- 8a: Use `git mv` so blame survives. Update import paths in the same commit.
- 8b: Bumping `package.json` version to `3.0.0` is intentional — major bump signals the breaking deploy contract change (Docker tag, compose project, env keys).

### Phase 9 — Archive + Cleanup (4 units: 9a, 9b, 9c, 9d)

**Pitfalls:**
- 9a: `git push origin archive/v1-legacy` BEFORE `git rm` from main. Verify the branch is on the remote (`git ls-remote origin archive/v1-legacy`) before deleting locally.
- 9b: Import-guard test — when CI clones the archive branch (shallow), it lists archived file paths via `git ls-tree -r archive/v1-legacy --name-only`. Then `grep -r "from '<archived-path>'" src/ server/` — any match fails CI.
- 9c: Run `npm install` AFTER removing deps to update the lockfile. Verify build still works (`npm run build` and `npm run test:data`) before committing.
- 9d: Final acceptance from a clean state: `docker system prune -a` (with user permission), then `docker compose up -d --build --force-recreate`. This verifies no residual cached layers hide regressions.

## Testing Strategy

Archetype: **Data Pipeline + API Service**.

Run tests at three tiers:

1. **Unit (per-unit)** — `npx tsx --test <file>` for the test command in each unit's table row.
2. **Phase checkpoint** — the `Quality Gates Summary` table in `spec.md` lists the exact command per phase.
3. **Final acceptance** — Phase 9d checkpoint command.

Full testing harness details: `docs/SignalMap/testing-harness.md`.

## Quick Reference

### Phase checkpoint commands

| Phase | Command |
|-------|---------|
| 0 | `npm run typecheck:all && ls docs/SignalMap/_discovery/ docs/SignalMap/legacy-inventory.md docs/SignalMap/LegacyPanels.md` |
| 1 | `npm run typecheck:all && npm run dev` (manual smoke) |
| 2 | `docker compose -f docker-compose.signalmap.yml up -d --build --force-recreate && sleep 10 && curl --http2 -I http://localhost:3000/ && curl http://localhost:3000/api/health \| jq '.redis'` |
| 3 | `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` |
| 4 | `npx playwright test e2e/signalmap.spec.ts` |
| 5 | `npx playwright test e2e/visual.spec.ts e2e/map-interaction.spec.ts` |
| 6 | `npx tsx --test tests/perplexity-brief.test.mjs tests/brief-stampede.test.mjs tests/brief-spend-reservation.test.mjs tests/brief-citation-validation.test.mjs tests/brief-prompt-injection.test.mjs tests/brief-endpoints.test.mjs && npx playwright test e2e/brief-flow.spec.ts` |
| 7 | `npm run typecheck:all && npm run test:data && npx playwright test && npx tsx --test tests/no-variant-imports.test.mjs` |
| 8 | `docker compose -f docker-compose.yml up -d --build --force-recreate && sleep 10 && curl http://localhost:3000/api/health \| jq` |
| 9 | `npm run typecheck:all && npm run test:data && npx playwright test && node scripts/no-archive-imports.mjs && docker compose up -d --build --force-recreate` |

### Error recovery

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `/api/ws/api/...` 404 in browser | Phase 3 base URL contract regressed | Re-run `tests/api-base-url-contract.test.mjs`; check `getApiBaseUrl()` normalization |
| Brief endpoint hangs at lock acquisition | Singleflight lock TTL elapsed but holder didn't release | Verify lock is released in `finally`; tune `SIGNALMAP_BRIEF_LOCK_TIMEOUT_SECONDS` |
| Visual regression diff > 0.1% | Font fallback or animation timing | Disable animations in test setup; pin Playwright Chromium version |
| `redis-cli ping` works but adapter `getJson` errors | Connection pool exhausted | Check `ioredis` `maxRetriesPerRequest` setting; verify `REDIS_URL` env reaches process |
| HTTP/2 not negotiated | nginx version too old or SSL not configured | Upgrade nginx in Dockerfile; v1 dev uses HTTP/2 over plaintext (`http2_prior_knowledge`) — verify supported |
| Perplexity 400 "domain limit exceeded" | Allowlist > 20 | Validate at wrapper; refuse request with 503 if env config invalid |
| LanceDB error during news collector test | Temp dir not cleaned between runs | Test setup: `await rm(tmpDir, { recursive: true, force: true })` before each test |
| OpenRouter 401 in CI | Test accidentally hit live endpoint | Confirm fixture mocks intercept all OpenRouter URLs; `RUN_LIVE_LLM=1` should be unset |

## Start

### First session

1. Read `spec.md` end to end (~15 min).
2. Read this file (you're here).
3. `mcp__foreman__session_orient` → confirm at `phase-0 / 0a`.
4. Begin unit `0a Perplexity discovery` per spec.

### Resuming

1. `mcp__foreman__session_orient` → tells you `next_pending_unit`.
2. `mcp__foreman__read_progress` → see last completed + checklist.
3. Read the *next* unit's row in `spec.md` §Implementation Order.
4. Execute. Update ledger after test command passes.

If `session_orient` shows you in a unit that's already partially complete from a prior session: re-read the files, re-validate state, re-run the test command. Do not assume prior progress is correct — replay the unit.
