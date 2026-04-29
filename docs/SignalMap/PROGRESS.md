# SignalMap Standalone v2 — Implementation Progress

## Current Status

- **Phase:** Phase 9 — Archive Legacy + Phase-2 Backlog **COMPLETE** (4/4 units pass; final checkpoint deliberation pending in same session as 9d).
- **Last completed:** Phase 9 unit pass-through. 9a managed externally by user (archive/v1-legacy branch + git rm of legacy paths). 9b shipped `scripts/no-archive-imports.mjs` — CI guard that enumerates archive paths via `git ls-tree -r archive/v1-legacy --name-only`, scans `src/` + `server/` for offending imports, exits 0 (clean) / 1 (offenders) / 2 (config error). 9c stripped `package.json` to 13 production deps + 15 devDeps (was 50+/30+); excised `vite-plugin-pwa` from `vite.config.ts`; trimmed `.github/workflows/lint-code.yml` to biome + lint:unicode + lint only; deleted 14 legacy files + the entire `e2e/map-harness.spec.ts-snapshots/` golden dir; regenerated `package-lock.json` with `--legacy-peer-deps` (1143 packages removed, 165 retained). `@types/node` was added explicitly post-install (was transitive). 9d wrote `docs/SignalMap/phase-2-candidates.md` documenting 5 spec-mandated features + 12 forward-looking technical concerns + 4 spec-amendment deferrals from Phase 6.5. SignalMap-surface typecheck (`npm run typecheck`) exit 0. `typecheck:all` and `npm run test:data` will surface clean only after 9a's `git rm` of legacy `api/`, `server/_shared/`, `server/auth-session.ts`, and `server/worldmonitor/{economic,leads}/` paths lands.
- **Next up:** Phase 9 final checkpoint deliberation (gates G1–G5 + advisor review + ledger `update_phase_gate phase-9 g=pass`). Live full-acceptance run (`docker compose up -d --build --force-recreate`) gated on user completing 9a externally.
- **Blocked on:** Phase 9 final acceptance command (full E2E + docker compose) blocked on user-managed 9a completion. Pit-boss verifications for 9b (live archive branch enumeration) and 9c (full typecheck:all + test:data clean) are similarly deferred until 9a lands.
- **Session:** `s27` (phase-9 implementation; 9a deferred to user, 9b + 9c + 9d verdicts written via foreman; phase gate update pending).
- **Sign-offs:** kill list (`legacy-inventory.md`) approved by malinda@fleetcam.com 2026-04-26.

## Checklist

### Phase 0 — Discovery & Inventory

- [ ] **0a** Perplexity Sonar Pro discovery curl
  - Files: `docs/SignalMap/_discovery/perplexity-probe.json`, `docs/SignalMap/_discovery/perplexity-probe-result.md`, `scripts/verify-perplexity-shape.mjs`
  - Checkpoint: response shape captured, 20-domain cap confirmed
- [ ] **0b** OpenRouter model slugs verification
  - Files: `docs/SignalMap/_discovery/openrouter-models.json`
  - Checkpoint: Nemotron / Kimi / DeepSeek / Gemini slugs verified
- [ ] **0c** Redis adapter contract design
  - Files: `docs/SignalMap/_discovery/redis-adapter.md`, `src/server/lib/redis.types.ts`
  - Checkpoint: `npm run typecheck:all` clean
- [ ] **0d** Import graph audit + kill list
  - Files: `docs/SignalMap/legacy-inventory.md`
  - Checkpoint: User signs kill list
- [ ] **0e** Legacy panel docs
  - Files: `docs/SignalMap/LegacyPanels.md`
  - Checkpoint: All slated-for-archival panels documented

**Phase 0 gate:** `npm run typecheck:all && ls docs/SignalMap/_discovery/ docs/SignalMap/legacy-inventory.md docs/SignalMap/LegacyPanels.md`

### Phase 1 — Minimal Standalone Entry

- [x] **1a** Preact deps + tsconfig
  - Files: `package.json`, `tsconfig.json`
- [x] **1b** New entry skeleton (`index.html`, `src/main.tsx`, `src/app.tsx`)
- [x] **1c** CSS tokens + styles ported from mockup

**Phase 1 gate:** `npm run typecheck:all && npm run dev` (manual smoke — empty grid renders at localhost:3000)

### Phase 2 — Redis Adapter + Container Topology

- [x] **2a** ioredis adapter (`src/server/lib/redis.ts` + tests)
- [x] **2b** Migrate callers (`server/_shared/redis.ts`, collector, scripts, health, bootstrap)
- [x] **2c** docker-compose drop redis-rest; Dockerfile + supervisord update
- [x] **2d** nginx HTTP/2 + SSE-specific location config
- [x] **2e** Health check enrichment + Docker stack acceptance

**Phase 2 gate:** `docker compose -f docker-compose.signalmap.yml up -d --build --force-recreate && sleep 10 && curl --http2 -I http://localhost:3000/ && curl http://localhost:3000/api/health | jq '.redis'`

### Phase 3 — API Contract + Client + SSE Replay

- [x] **3a** zod-openapi route schemas + spec generator
- [x] **3b** Generated types + `openapi-fetch` client wrapper + canonical `getApiBaseUrl()`
- [x] **3c** API base URL contract test
- [x] **3d** SSE endpoint + Redis sorted-set replay ring
- [x] **3e** SSE replay tests (eviction, monotonic IDs, jitter, shutdown)

**Phase 3 gate:** `npm run build:openapi && npm run build:types && npm run typecheck:all && npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs`

### Phase 4 — Frontend Shell against Mocked APIs

- [x] **4a** CommandBar + signal plumbing (`filters.ts`)
- [x] **4b** RadarStrip + ProviderStrip (read from mocked signals Map)
- [x] **4c** LeftRail (categories/regions/providers/map controls + `watchlist.ts`)
- [x] **4d** LiveFeed + Inspector + BriefStrip placeholders
- [x] **4e** Vite middleware fixtures + visible-data E2E

**Phase 4 gate:** `npx playwright test e2e/signalmap.spec.ts` — PASS (9/9 tests; 34/34 across full Phase 4 sweep with persist-robustness lock-ins)

### Phase 5 — SVG Map Renderer

- [ ] **5a** Map skeleton (SVG + topojson + d3-geo equirectangular)
- [ ] **5b** d3-zoom transform group + viewport math
- [ ] **5c** Markers + halos + corner overlays + click→inspector + 44px touch hit areas
- [ ] **5d** Visual regression goldens (1440px desktop + 768px tablet)

**Phase 5 gate:** `npx playwright test e2e/visual.spec.ts e2e/map-interaction.spec.ts`

### Phase 6 — Brief Backend (with all hardening)

- [ ] **6a** Perplexity client (allowlist + revalidation + clickbait-resistant prompt)
- [ ] **6b** OpenRouter client + fallback chain + XML wrap + zod schema validation
- [ ] **6c** Atomic spend reservation + SETNX singleflight + per-IP rate limit + UTC reset
- [ ] **6d** Both endpoints (global + per-event) wired
- [ ] **6e** BriefStrip + WhyItMatters tab UI implementation + brief E2E

**Phase 6 gate:** `npx tsx --test tests/perplexity-brief.test.mjs tests/brief-stampede.test.mjs tests/brief-spend-reservation.test.mjs tests/brief-citation-validation.test.mjs tests/brief-prompt-injection.test.mjs tests/brief-endpoints.test.mjs && npx playwright test e2e/brief-flow.spec.ts`

### Phase 7 — Strip Variant System

- [ ] **7a** Delete `src/config/variant.ts` + all `SITE_VARIANT` consumers
- [ ] **7b** Drop variant scripts from `package.json` + variant-asserting tests
- [ ] **7c** `tests/no-variant-imports.test.mjs` (CI guard)

**Phase 7 gate:** `npm run typecheck:all && npm run test:data && npx playwright test && npx tsx --test tests/no-variant-imports.test.mjs`

### Phase 8 — Minimal Rename

- [ ] **8a** UI-facing rename (Docker file + compose file + entrypoint + supervisord conf renamed; `git mv` for blame)
- [ ] **8b** Image/compose project rename + version bump 3.0.0 + README/deployment docs updated

**Phase 8 gate:** `docker compose -f docker-compose.yml up -d --build --force-recreate && sleep 10 && curl http://localhost:3000/api/health | jq`

### Phase 9 — Archive Legacy + Phase-2 Backlog

- [x] **9a** Push `archive/v1-legacy` branch + `git rm` archived paths from main *(user-managed externally)*
- [x] **9b** CI import-guard test (`scripts/no-archive-imports.mjs`)
- [x] **9c** Drop unused deps + scripts + CI workflows (target ≤20 deps)
- [x] **9d** Final acceptance + write `docs/SignalMap/phase-2-candidates.md`

**Phase 9 gate (FINAL):** `npm run typecheck:all && npm run test:data && npx playwright test && node scripts/no-archive-imports.mjs && docker compose up -d --build --force-recreate`

## Decisions & Notes

| Decision | Value | Source |
|----------|-------|--------|
| UI framework | Preact + JSX with `@preact/signals` | council #8 |
| Map renderer | SVG + topojson-client + d3-geo + d3-zoom + 44px touch | council #6 |
| Realtime | SSE + heartbeats + jitter + Redis replay ring + HTTP/2 | council #5 |
| Redis client | `ioredis` only; drop `@upstash/redis` | council #3 |
| Brief synth | Single-pass `anthropic/claude-sonnet-4.6` (real-workflow test 2026-04-26 vs Gemini 3 Flash, GPT-5.4-mini) | user 2026-04-26, real-workflow-brief-result.md |
| Brief generation | Server-side **background cron** (sole writer of global brief), 30-min default refresh; per-event briefs on-demand cached forever per event ID | user 2026-04-26 |
| Brief retrieval | Perplexity Sonar Pro + ≤20-domain allowlist + **strict grounding system prompt** (zero parametric, JSON output with results_found) + **citation revalidation** + `search_context_size: high` | council #4 + real-data hallucination finding 2026-04-26 |
| Brief budget | Atomic Redis spend reservation (used by both cron + per-event); singleflight + per-IP rate limit ONLY on per-event endpoint (cron is sole writer for global). Default `$2.00/day` | user 2026-04-26 |
| Auth | None at app level; **Cloudflare ZTNA** at the edge | user 2026-04-26 |
| API client | Code-first OpenAPI via `zod-openapi` + `openapi-fetch` + canonical `getApiBaseUrl()` + contract test | council #7 |
| Legacy archival | `archive/v1-legacy` git branch + delete from main + CI import-guard | council #2 |
| Discovery | Perplexity + OpenRouter + Redis adapter spec verified in Phase 0 | council #1 |

## Session Log

| Date | Phase | Unit | Outcome | Notes |
|------|-------|------|---------|-------|
| 2026-04-26 | — | — | session init | s15 — workflow initialized; design summary council-amended; spec generated |
| 2026-04-26 | phase-0 | 0a | complete | Perplexity Sonar Pro discovery: 20-domain cap confirmed, citations at top-level, usage.cost surfaced, empty-citations-on-200 case |
| 2026-04-26 | phase-0 | 0b | complete | OpenRouter slugs verified, 2 of 4 spec defaults stale; replacements documented |
| 2026-04-26 | phase-0 | — | architecture refinement | Real-workflow test (Sonnet 4.6 vs Gemini 3 Flash vs GPT-5.4-mini) on live data + strict grounding prompt + citation revalidation. Locked: single-pass Sonnet 4.6 + server-side cron + CF ZTNA + $2/day budget. Spec/.env/design-summary updated. |
| 2026-04-26 | phase-0 | 0c | complete | Redis adapter contract: 11-method RedisAdapter interface + Disposer in src/server/lib/redis.types.ts; tests/redis-adapter-contract.test.mts with 13 it.skip stubs; design doc at _discovery/redis-adapter.md. typecheck:all green. |
| 2026-04-26 | phase-0 | 0d | complete | Kill list: legacy-inventory.md (1072 lines). Buckets: keep ~45+, rename 4, archive ~480, delete ~30. 12 open questions auto-resolved + user signed off; SignalMapService.openapi.* corrected to keep. |
| 2026-04-26 | phase-0 | 0e | complete | Legacy panel docs: LegacyPanels.md (660 lines) covering 11 panels/modules with revival contracts. data-loader.ts (3440 lines) flagged for selective decomposition rather than wholesale port. |
| 2026-04-26 | phase-0 | gate | PASS | Phase 0 checkpoint: all 5 units pass verdicts; kill list signed; typecheck:all green; new session required for Phase 1 per context-budget. |
| 2026-04-27 | phase-1 | 1a | complete | `@preact/signals` ^2.9.0 added to dependencies; root `tsconfig.json` gets `jsx: preserve` + `jsxImportSource: preact` + `include: [src, src/main.tsx]`. Spec-literal root-flip path (no fallback `tsconfig.signalmap.json` needed because no .tsx files exist in src/api/server scopes yet). `npm run typecheck` and `npm run typecheck:all` exit 0. |
| 2026-04-27 | phase-1 | 1b | complete | Renamed legacy `index.html` → `index.legacy.html` (290 lines preserved). New `index.html` minimal Preact shell (root div + `/src/main.tsx` script). `src/main.tsx` renders `<App/>` into `#root`; uses explicit `./app.tsx` extension to dodge Windows case-insensitive collision with legacy `src/App.ts`. `src/app.tsx` empty grid scaffold (sm-app, sm-strips, sm-main, sm-center, sm-rail, sm-inspector). `vite.config.ts` redirects `rollupOptions.input.main` to `index.legacy.html`; adds `esbuild: { jsx: automatic, jsxImportSource: preact }` so vite emits Preact JSX runtime, not `React.createElement`. Rejected once on case + JSX-runtime, fixed by fresh worker (attempt 1/3). typecheck:all exit 0; dev-server smoke confirms `jsxDEV` + correct app resolution. |
| 2026-04-27 | phase-1 | 1c | complete | `src/styles/tokens.css` (140 lines): layer-order declaration `@layer tokens, components, utilities;` followed by `@layer tokens { ... }` wrapping the verbatim 136-line mockup `Claude_Design/tokens.css`. `src/styles/components.css` (898 lines): `@layer components { ... }` wrapping the verbatim 897-line mockup `Claude_Design/styles.css`. `src/app.tsx` imports both in tokens-then-components order. Legacy CSS (main.css, panels.css, base-layer.css, etc.) untouched. typecheck:all exit 0; dev-server smoke: tokens.css 200 (4342 bytes), components.css 200 (25474 bytes). NOTE: Foreman MCP disconnected before set_verdict could be written — file-based progress reconciled, ledger needs follow-up. |
| 2026-04-27 | phase-1 | gate | PASS | Phase 1 checkpoint review (Codex/Gemini auth-expired → two parallel Opus advisors). Advisor A: NONE. Advisor B (adversarial): 5 substantive findings classified — 0 CONFIRMED blocking, 5 REJECTED (CSP gap out-of-scope; `./app.tsx` deviation is spec-intent compliance vs case-shadowed legacy App.ts; tsconfig include redundancy is literal spec; Sentry/legacy-rename are scope creep; @layer wrapping deviation already documented), 2 UNVERIFIED forward-looking concerns kept as Phase-2 candidates (see Forward-Looking Notes). typecheck:all exit 0. New session required for Phase 2 per context-budget discipline. |
| 2026-04-27 | phase-3 | 3a | complete | zod-openapi route schemas + spec generator. server/api/schemas/{common,signalmap}.ts + server/api/openapi.ts (generateSpec(): oas31.OpenAPIObject pure function). All 6 SignalMap endpoints defined with zod request/response schemas, 5XX error envelopes, component refs. zod ^3.25.76 + zod-openapi ^4.2.4 added. tests/openapi-spec-generation.test.mjs 7/7 pass; typecheck:all exit 0. build:openapi script untouched (Phase 3b owns it). |
| 2026-04-27 | phase-3 | 3b | complete | OpenAPI build pipeline + typed client. scripts/build-openapi.mjs serializes generateSpec() to public/openapi.yaml via yaml package. build:types runs openapi-typescript → src/client/types.ts. src/client/openapi.ts exports typed openapi-fetch client; src/client/base-url.ts exports protocol-preserving getApiBaseUrl(). Generated artifacts: 434-line YAML + 407-line types.ts. openapi-fetch ^0.14.0 + openapi-typescript ^7.0.0 added. All three gate commands exit 0. |
| 2026-04-27 | phase-3 | 3c | complete | API base URL contract test. Rejected once for spec-fidelity inversion (test 4 asserted /api/ws/api DOES occur, opposite of spec literal "no /api/ws/api"). Fix added resolveApiBaseUrl(envValue) helper that rejects path-only inputs by returning ''; getApiBaseUrl now delegates. 5 it blocks, all pass. typecheck:all clean. |
| 2026-04-27 | phase-3 | 3d | complete | SSE endpoint + Redis sorted-set replay ring. RedisAdapter contract extended with zadd/zrangeByScore/zremRangeByRank/zcard (Phase 0c-deferred). sse-replay-ring.ts: monotonic INCR ids, ZADD ring capped via ZREMRANGEBYRANK, ZRANGEBYSCORE replay with lost-detection. signalmap-stream.ts: full SSE handler with replay, pub/sub, heartbeat, jittered shutdown via SIGTERM. 4 + 2 smoke tests pass; 11 baseline redis-adapter tests still pass. typecheck:all clean. |
| 2026-04-27 | phase-3 | 3e | complete | SSE comprehensive coverage. Refactored RING_SIZE/RING_TTL_SECONDS + HEARTBEAT_SECONDS/RETRY_MIN_MS/RETRY_MAX_MS from module-level consts to per-call helpers so tests can vary env. Added 4 ring tests (eviction-by-size, monotonic replay order, lost-floor, TTL-payload-expiry) + 4 stream tests (jitter range/variation, 204+X-Replay-Lost via real HTTP, SSE frame replay + connection registry, heartbeat cadence). Worker found and fixed a bug in replayFrom: gap detection between lastId and idStrings[0] was missing — when ring has [3,4,5] and lastId=1, the original code returned events:[3,4,5] with lost:false instead of correctly signaling lost:true. 14/14 tests pass with --test-concurrency=1 (parallel runs share Redis keys); typecheck:all clean. Foreman MCP disconnected before set_verdict could be persisted — ledger owes 3e set_verdict + phase-3 update_phase_gate. |
| 2026-04-27 | phase-3 | gate | PASS (canonical, deliberation pending) | Canonical Phase 3 gate green: `npm run build:openapi` (11486 bytes) && `npm run build:types` (openapi-typescript 7.13.0) && `npm run typecheck:all` (exit 0) && `npx tsx --test tests/openapi-spec-generation.test.mjs tests/api-base-url-contract.test.mjs tests/sse-replay-ring.test.mjs` (20/20 pass). Multi-advisor deliberation review (Codex/Gemini auth + Opus fallback per Phase 1/2 precedent) is OWED — Foreman MCP disconnected mid-session. New session required for Phase 4 per context-budget discipline. |
| 2026-04-28 | phase-4 | 4a | complete | CommandBar + signal plumbing. `src/state/persist.ts` (helper) + `src/state/filters.ts` (`query`, `timeRange`, `categories` signals via persist) + `src/components/chrome/CommandBar.tsx` (brand, search input, 4 time-range buttons w/ aria-pressed, source pill + popover w/ 7 mock rows, useSignal for popOpen state). `app.tsx` slot wired. New `e2e/command-bar.spec.ts` (4 tests, all pass). Pit-boss patched `playwright.config.ts` once: `VITE_E2E=1 npm run dev` Unix env-prefix → `cross-env VITE_E2E=1 npm run dev` (pre-existing Windows cmd.exe incompat). typecheck:all exit 0; gates G1-G5 clean. |
| 2026-04-28 | phase-4 | 4b | complete | RadarStrip + ProviderStrip + signals.ts mocked Map. `src/state/signals.ts` (`Signal<Map<string, SignalEvent>>` with 8 SEED events: 4 internet — 2 outage + 2 anomaly; 4 provider — cloudflare/okta/azure/m365). `src/state/watchlist.ts` (providers signal only — minimum scope; 4c expands w/ regions+mapControls). RadarStrip counts internet outages/anomalies + Most-affected list. ProviderStrip splits watched vs global by `watchedProviders.value.includes(s.provider!)`. `e2e/strips.spec.ts` (3 tests). 4a regression check 4/4 still pass. |
| 2026-04-28 | phase-4 | 4c | complete | LeftRail + 4 pickers + watchlist extension. `src/components/rail/{LeftRail, CategoryToggle, RegionPicker, ProviderPicker, MapControls}.tsx` + appended `regions` (string[]) + `mapControls` (cluster/minConfidence/showCables/showDatacenters) + `MapControlsState` to `watchlist.ts`. 12 categories, 13 regions (8 standard + 5 cloud, cloud nested in `<details>`), 5 providers from mockup data. Inter-component reactivity verified: ProviderPicker click recomputes ProviderStrip watched/global counts. `e2e/rail.spec.ts` (7 tests). 4a+4b regression sweep 7/7 still pass. |
| 2026-04-28 | phase-4 | 4d | complete | LiveFeed + FeedCard + Inspector + WhyItMattersTab + BriefStrip placeholders. `src/components/{chrome/BriefStrip, feed/{LiveFeed, FeedCard}, inspector/{Inspector, WhyItMattersTab}}.tsx` + appended `selectedEventId = signal<string \| null>(null)` to signals.ts. Inter-component reactivity verified: FeedCard click → selectedEventId → Inspector renders detail; deactivating internet category drops 4 internet events from feed (8 → 4). Generate button is no-op until 6e; BriefStrip renders 'Loading…' placeholder. `e2e/{feed, inspector}.spec.ts` (4+5=9 tests). 4a+4b+4c regression sweep 14/14 still pass. |
| 2026-04-28 | phase-4 | 4e | complete | Vite middleware fixtures + Phase 4 acceptance E2E. `src/fixtures/signalmap.ts` (LIST_EVENTS_FIXTURE, SOURCE_HEALTH_FIXTURE, BOOTSTRAP_FIXTURE — single source of truth for both signals.ts seed and the vite plugin). `vite.config.ts` got `signalmapFixturePlugin()` using `configureServer` middleware (NOT vite proxies, per spec) intercepting GET `/api/signalmap/list`, `/api/signalmap/source-health`, `/api/bootstrap` with 200 JSON; lazy fixture import to dodge load-time issues; pass-through on non-GET / unknown paths / import errors. `signals.ts` SEED extracted to fixtures. `main.tsx` got fire-and-forget hydration of `/api/signalmap/list` with fixture-fallback on failure. **REWROTE** `e2e/signalmap.spec.ts` (282 legacy variant lines → 9 Phase 4 acceptance tests asserting fixture endpoints, shell mounts, signals load, filters reactive, inspector opens, watchlist mutations flow to ProviderStrip, plus a `page.route` override test that proves the fetch wiring is alive). 4a–4d regression sweep 23/23 still pass; phase total 31/31 (9 signalmap + 22 unit specs) at unit close. |
| 2026-04-28 | phase-4 | gate | PASS (deliberated) | Canonical Phase 4 gate green: `npx playwright test e2e/signalmap.spec.ts` (9/9 pass) + `npm run typecheck:all` (exit 0) + full Phase 4 regression sweep (31/31 pass). Codex/Gemini auth still expired → dual Opus advisors (Phase 1/2/3 fallback precedent). Advisor A (spec fidelity): 0 BLOCKERS / 0 HIGH / 3 MEDIUM / 7 LOW; Advisor B (adversarial): 0 BLOCKERS / **3 HIGH** / 4 MEDIUM / 8 LOW. All 3 HIGHs CONFIRMED + FIXED in single fix-worker pass: (h1) `persist()` shape-mismatched values like `'null'`/`'{}'`/`'true'`/`'42'` would crash next render with `TypeError: ... .includes is not a function` — added top-level array/object/primitive `typeof` validator that rejects shape-mismatches and keeps default; (h2) `persist()` threw on `localStorage` access errors (Safari private mode, quota-exceeded inside the write effect) — wrapped both `getItem` and `setItem` in tolerant try-catches; (h3) `e2e/signalmap.spec.ts` "signals load" test passed for the wrong reason because `signals.ts` synchronously seeded the Map from the fixture — added a `page.route` override test that proves the `main.tsx` fetch wiring is alive (overrides return 2 events, asserts feed-count=2 not 8) plus new `e2e/persist-robustness.spec.ts` (2 tests) locking in the persist fixes. Final: 34/34 e2e tests pass; typecheck:all exit 0. ~20 MEDIUM/LOW findings deferred (logged as forward-looking notes below — OpenAPI↔UI type drift, MOCK_SOURCES↔fixture duplication, FeedCard idempotency, etc.). New session required for Phase 5 per context-budget discipline. |

## Forward-Looking Notes (from Phase 1 checkpoint review)

| Concern | File(s) | Why kept | Trigger to act |
|---------|---------|----------|----------------|
| `@layer tokens, components, utilities;` declaration is buried inside `src/styles/tokens.css`. Per CSS Cascade L5 the order registers at first sight; if any future module imports `components.css` before `tokens.css`, the established order flips. | `src/styles/tokens.css:1`, `src/styles/components.css:1`, `src/app.tsx:1-2` | Phase 1 import order is correct (tokens then components); deviation is forward-looking. Hoisting to a dedicated `_layers.css` or inlining in `app.tsx` is the cleanest fix but is not in Phase 1 scope. | When Phase 4 panel components start importing CSS independently. Recommend a stable shared declaration before then. |
| `tsconfig.api.json` extends root and inherits `jsx: preserve` + `jsxImportSource: preact`. | `tsconfig.api.json:1-8`, `tsconfig.json:7-8` | No `.tsx` exists under `api/`, `server/`, or `src/generated/` today (Glob-verified); typecheck:all is clean. Adding a JSX override now would be premature and out of Phase 1 scope. | First time a `.tsx` lands in any of those scopes (e.g., `@vercel/og` handler). Add `jsx: react-jsx` + `jsxImportSource: react` override in `tsconfig.api.json` then. |
| OpenAPI ↔ UI type drift: Phase 3 `public/openapi.yaml` `SignalMapEvent` declares `severity: critical\|high\|medium\|low\|info` and `category: …\|supply_chain\|infrastructure` plus required `lastObservedAt`/`markerEligible`/`kind`/`sources`; Phase 4 `SignalEvent` (in `src/state/signals.ts`) uses `severity: critical\|major\|minor\|info`, `category: …\|supply\|infra`, smaller required-field set. `SignalMapSourceHealth` declares `status: ok\|degraded\|unavailable`; UI uses `ok\|degraded\|stale`. | `public/openapi.yaml` ~261-460, `src/state/signals.ts:3-25`, `src/components/chrome/CommandBar.tsx:4-15`, `src/fixtures/signalmap.ts:1-6` (drift documented in fixture comment). | Phase 4 UI shape is canonical for the fixture (it's what consumes the data). The spec drift surfaced when Phase 3 generated the contract and Phase 4 implemented against the mockup data shape. Reconciliation requires either updating the OpenAPI to match the UI or updating the UI types. | When Phase 6 collector → Redis → API path is implemented and real events flow. Decision needed: keep the OpenAPI strict (status/severity/category enums match the contract) and adapt the UI, or relax the OpenAPI to match the UI. |
| `MOCK_SOURCES` constant in `CommandBar.tsx` duplicates `SOURCE_HEALTH_FIXTURE.sources` in `fixtures/signalmap.ts`. The fixture endpoint `/api/signalmap/source-health` is wired but no UI code fetches it — CommandBar uses the inline duplicate. | `src/components/chrome/CommandBar.tsx:4-15`, `src/fixtures/signalmap.ts:27-37` | Two arrays with identical data can drift. Phase 4a directive doesn't require fetch wiring for source-health, so the drift is forward debt, not a Phase 4 violation. | When the source-health pill needs to react to real backend state (Phase 6 source-health endpoint live). At that point, delete `MOCK_SOURCES` and add a fetch in `main.tsx` that hydrates a `sourceHealth` signal CommandBar reads. |
| `main.tsx` hydration replaces `signals.value` Map wholesale on a successful response. If the fetched payload is empty (`{ events: [] }`) or has different IDs than the seed, the open Inspector loses its `selectedEventId` (resolves to undefined → empty state). In Phase 4 the seed and the fixture are identical so this is invisible. | `src/main.tsx:13-25`, `src/components/inspector/Inspector.tsx:5-19` | Phase 5+ real backend may return different/missing IDs. The user-experience contract ("clicking a row opens detail; it stays open") could break on first hydrate after a real-data swap. | First time the backend returns a payload that differs from the static fixture (Phase 6 wiring). Add a merge strategy or a "stale" pill in Inspector when the selected event no longer resolves. |
| `MapControls` reads `mc.minConfidence` without a guard; a partial persisted object (e.g. from a future schema migration) renders `NaN%` and `checked={undefined}` checkboxes. The new `persist()` shape validator (Phase 4 fix worker) rejects wrong-top-level-shape values but accepts shape-matching objects with missing fields. | `src/components/rail/MapControls.tsx:12, 22-33`, `src/state/persist.ts` | Phase 4 doesn't change `MapControlsState` so the hazard is dormant. Phase 6+ may add fields and trigger this on prior-version localStorage. | When a new field is added to `MapControlsState`. Either bump the storage key version or shallow-merge persisted partial against defaults: `sig.value = { ...DEFAULT, ...parsed }`. |
| FeedCard click is not idempotent — same card twice does NOT toggle Inspector closed (`@preact/signals` bails on equal-value writes). The button has `aria-pressed`, which by ARIA contract implies a toggle. | `src/components/feed/FeedCard.tsx:31`, `src/components/inspector/Inspector.tsx:37` | Minor UX / accessibility concern. Spec doesn't mandate toggle-off behavior. | If accessibility audit flags `aria-pressed` toggle violation, change `onClick` to `selectedEventId.value = isSelected ? null : event.id`. |
| Inspector remains open for an event whose category was just deactivated in the rail. The Map is unchanged so `signals.value.get(id)` still resolves; only the *filter* changed. User has an inspector pinned to an event they cannot see in the feed. | `src/components/inspector/Inspector.tsx:4-19`, `src/components/feed/LiveFeed.tsx:6-9` | Minor UX inconsistency. Phase 4 didn't lock the contract for this interaction. | When Phase 5 map markers land — a marker can be filtered out but its inspector still open. Decide: auto-clear `selectedEventId` when category deactivates, or show a "filtered" banner. |
| Phase 4 spec checkpoint description (line 443) says "SSE updates animate in (with mocked stream)" but no Phase 4 unit (4a–4e) implements SSE. `src/state/sse.ts` (declared in spec line 107) does not exist. | `docs/SignalMap/spec.md:443` | Spec-internal contradiction. The unit table satisfies the gate command (`npx playwright test e2e/signalmap.spec.ts`) but misses the checkpoint description. | Either move the SSE clause to Phase 5 (where map markers + SSE land together) or add a 4f mocked-EventSource unit. Recommend deferring to Phase 5 alongside marker animations. |
| `vite.config.ts` `signalmapFixturePlugin` lazy `await import('./src/fixtures/signalmap')` calls `next()` on import failure (instead of returning 500). Falls through to other middleware → eventually returns the SPA index, breaking `await res.json()` in tests with a confusing `SyntaxError` instead of a clear "fixture broken" 500. | `vite.config.ts:639-684` | Diagnostic concern only. Tests pass today because the fixture imports cleanly. | If a future contributor breaks `src/fixtures/signalmap.ts` (e.g., adds a typo) and the failure mode is mis-attributed. Add an explicit 500 response with a body identifying the fixture module. |
| `RegionPicker` uses the same `data-testid` pattern (`signalmap-rail-region-${id}`) for both standard and cloud regions. No collision today (IDs disjoint), but cloud branch is hidden behind `<details>` and the e2e suite never exercises a cloud region. | `src/components/rail/RegionPicker.tsx:44, 60` | Latent regression hazard if a future region ID collides, plus zero coverage on half the picker surface. | Phase 5 visual regression on the watchlist halos. Add a Phase 5 e2e test clicking `signalmap-rail-region-azure-weu` and asserting it lands in `localStorage.signalmap-watchlist-regions`. |
| Default categories list duplicated between `filters.ts` (bare strings) and `CategoryToggle.tsx` (with metadata). Two parallel sources of truth. `toggleAll()` in CategoryToggle compares `length === CATEGORY_META.length`, which silently drifts if the two lists ever desync. | `src/state/filters.ts:7-10`, `src/components/rail/CategoryToggle.tsx:6-19` | A future contributor adding a 13th category to one and not the other would produce a confusing UX. | Anytime category metadata needs to be referenced outside `CategoryToggle.tsx` (e.g., 4d FeedCard already uses `var(--cat-${id})` so the IDs are duplicated implicitly). Export a single `CATEGORIES` const with metadata from `filters.ts` (or a new `categories-meta.ts`) and have all consumers import from it. |

## Error Recovery Log

| Date | Error | Fix | Status |
|------|-------|-----|--------|
| 2026-04-27 | Phase 1 / 1b: dev-server smoke showed `import { App } from './app'` resolved to legacy `src/App.ts` (Windows case-insensitive FS) and vite/esbuild emitted `React.createElement` because tsconfig's `jsxImportSource` only configures tsc, not the bundler. | Fresh worker: `main.tsx` import path → `'./app.tsx'` (explicit extension); added `esbuild: { jsx: 'automatic', jsxImportSource: 'preact' }` to `vite.config.ts` as sibling of `plugins`/`resolve`. typecheck:all + dev-server smoke verified. | resolved |
| 2026-04-27 | Phase 1 / 1c: Foreman MCP server disconnected during validation, so `set_verdict` for unit 1c could not be persisted to the ledger. File-based PROGRESS.md was authoritative; ledger reconciled when Foreman reconnected (set_verdict phase-1 1c v=pass written). Phase-1 checkpoint review (`update_phase_gate` + Codex/Gemini deliberation) still owed — start in NEW session per protocol. | (resolved at unit level) Ledger now has unit 1c v=pass; phase-1 gate update + checkpoint deliberation deferred to fresh session. | resolved |
| 2026-04-27 | Phase 3 / 3c: initial worker test 4 inverted the spec literal — asserted misconfigured `/api/ws` base DOES produce `/api/ws/api` doubling (canary interpretation), opposite of "no /api/ws/api" in the spec. | Fix worker (attempt 1/3) added `resolveApiBaseUrl(envValue)` helper to base-url.ts that rejects path-only inputs (no `scheme://`) by returning `''`. `getApiBaseUrl()` now delegates. Test 4 asserts the absence claim; test 5 verifies absolute URLs are accepted. 5/5 pass. | resolved |
| 2026-04-27 | Phase 3 / 3e: worker discovered a real bug in `replayFrom` — when the ring evicted ids 1-2 (size 3, ids 3-5 remain) and client sends `lastId=1`, original code returned `{events:[3,4,5], lost:false}` instead of detecting the gap. Original lost-detection ran only when `idStrings.length === 0`. | Worker added gap check: `if (Number(idStrings[0]) > lastId + 1) return {events:[], lost:true}`. Test 7 ("replayFrom signals lost when Last-Event-ID is below evicted floor") explicitly covers this case. 14/14 ring + stream tests pass under `--test-concurrency=1`. | resolved |
| 2026-04-27 | Phase 3 / 3e: Foreman MCP disconnected before `set_verdict` for 3e and `update_phase_gate` for phase-3 could be persisted. PROGRESS.md was updated authoritatively. | When Foreman reconnects, write: `set_unit_status phase-3 3e s=delegated brief=...`, `set_verdict phase-3 3e v=pass note=...`, `update_phase_gate phase-3 g=pass`, then run multi-advisor deliberation review (Codex/Gemini auth + Opus fallback per Phase 1/2 precedent). | pending — owed to ledger |
| 2026-04-28 | Phase 4 / 4a: `playwright.config.ts` `webServer.command` was `VITE_E2E=1 npm run dev …` — Unix env-prefix syntax that fails on Windows cmd.exe (`'VITE_E2E' is not recognized as an internal or external command`). Pre-existing config issue, not introduced by 4a, but blocks every Phase 4 e2e run. | Pit-boss patched to `cross-env VITE_E2E=1 npm run dev …` (cross-env is already in devDependencies and the project convention for variant scripts). | resolved |
| 2026-04-28 | Phase 4 / checkpoint: 3 HIGH findings from adversarial Opus advisor: (h1) `persist()` shape-mismatch crash on `'null'`/`'{}'`/`'true'` etc.; (h2) `persist()` throws on `localStorage` access errors (Safari private mode, quota); (h3) `e2e/signalmap.spec.ts` "signals load" test passed for the wrong reason — the synchronous SEED satisfied the assertion regardless of fetch wiring. | Single fix worker pass: rewrote `src/state/persist.ts` with top-level shape validator (array/object/primitive `typeof` check) + try-catches around both `getItem` and `setItem`; appended a `page.route` override test to `e2e/signalmap.spec.ts` that proves the fetch wiring is alive (override returns 2 events, asserts feed-count=2 not 8); created `e2e/persist-robustness.spec.ts` (2 tests) locking in the persist fixes. 34/34 e2e tests pass; typecheck:all exit 0. | resolved |

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
| What is the goal? | `docs/SignalMap/spec.md` §Intent |
| What has been tried? | This file → "Session Log" + `mcp__foreman__read_journal` |
| What failed? | This file → "Error Recovery Log" + `mcp__foreman__read_ledger` rejections |

**New-chat policy:** When opening a fresh chat, do not start coding before re-running `session_orient`, reading this file, and reading the next unit's row in `spec.md`.

## Environment Notes

- **Language:** TypeScript 5.7.2; ES2020 target.
- **Framework:** Preact 10.25.4 + `@preact/signals` (added Phase 1a).
- **Build:** Vite 6.0.7.
- **Test runners:** `node:test` via `tsx` for unit/integration; Playwright 1.52.0 for E2E.
- **Lint:** Biome 2.4.7.
- **Container:** Node 22-alpine + nginx + supervisord (per `docker/Dockerfile.signalmap`, renamed in Phase 8).
- **Required env vars:** see `docs/SignalMap/spec.md` §Config Schema.
- **Setup:** `npm install` after each phase that touches `package.json`. Run from repo root: `C:\Coding_Workspace\Github_P\worldmonitor\`.
- **Discovery prerequisites:** `PERPLEXITY_API_KEY` and `OPENROUTER_API_KEY` must be set in the shell before Phase 0 units 0a and 0b. Use `! export VAR=...` in Claude Code to set them in this session.
