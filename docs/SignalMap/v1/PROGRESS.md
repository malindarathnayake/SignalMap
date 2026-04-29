# SignalMap Progress

## Current Status

| Field | Value |
|-------|-------|
| Phase | Complete - all SignalMap phases |
| Last completed unit | Phase 5 checkpoint |
| Next unit | none |
| Blocked | none |

## Checklist

### Phase 0 - Discovery And Contract Grounding

- [x] Unit 0a: Provider/Radar fixture capture - `tests/fixtures/signalmap/*`
- [x] Unit 0b: Distill descriptor discovery - `C:\Coding_Workspace\Github_P\distill`
- [x] Unit 0c: Premium/gating impact inventory - `tests/signalmap-public-access.test.mjs`
- [x] Unit 0d: Docker and LanceDB runtime inventory - `tests/signalmap-docker-runtime.test.mjs`
- [x] Checkpoint: `npm run test:data`

### Phase 1 - Public Web Baseline

- [x] Unit 1a: Public API gate policy
- [x] Unit 1b: Frontend premium UI removal
- [x] Unit 1c: Premium fetch/client cleanup
- [x] Checkpoint: `npm run typecheck:all && npm run test:data`

### Phase 2 - SignalMap Contracts And RPC

- [x] Unit 2a: Types and config
- [x] Unit 2b: Proto/RPC shell
- [x] Unit 2c: Radar normalizer
- [x] Unit 2d: Provider status normalizer
- [x] Checkpoint: `npm run typecheck:all && npm run test:data`

### Phase 3 - News Collector, Distill, OpenRouter, Geocoder, LanceDB

- [x] Unit 3a: Distill bridge
- [x] Unit 3b: OpenRouter parser
- [x] Unit 3c: Geocoder/country resolver
- [x] Unit 3d: LanceDB vector store
- [x] Unit 3e: News collector
- [x] Checkpoint: `npm run test:data`

### Phase 4 - Watchlists And UI Shell

- [x] Unit 4a: Watchlist service
- [x] Unit 4b: SignalMap service/data-loader wiring
- [x] Unit 4c: Claude Design UI port
- [x] Checkpoint: `npm run typecheck:all && npm run test:data`

### Phase 5 - Deployment And Ops

- [x] Unit 5a: Health and seed-meta
- [x] Unit 5b: Docker runtime
- [x] Unit 5c: Deployment docs/config
- [x] Checkpoint: `npm run typecheck:all && npm run test:data && npm run test:sidecar`

## Decisions And Notes

| Decision | Value | Source |
|----------|-------|--------|
| Product name | SignalMap | User |
| UI source | `docs/SignalMap/Claude_Design` | User |
| LLM provider | OpenRouter OpenAI-compatible endpoint | User |
| Model selection | User-selectable from server allowlist | User |
| Full extraction sources | Risky Business News, The Hacker News | User |
| Distill path | `C:\Coding_Workspace\Github_P\distill` | User |
| Distill mode | Node library/CLI bridge, no Python port | User |
| Docker runtime | SignalMap web/API/collector runtime with persistent data volume | User |
| LanceDB | Local vector store for story embeddings and related-story retrieval | User |
| LanceDB live-criticality | Degraded LanceDB must not block Redis-backed live map signals | Spec |
| API exposure | Same-origin public browser APIs | User accepted default |
| Sign-in | v1 anonymous/local-only | User accepted default |
| Tauri | Freeze for v1 | User accepted default |
| Retention | 7 days | User accepted default |

## Session Log

| Date | Phase | Unit | Outcome | Notes |
|------|-------|------|---------|-------|
| 2026-04-26 | Phase 5 | Checkpoint | Completed | Final Phase 5 checkpoint passes after clean-review repair: focused SignalMap suites `npx tsx --test tests\signalmap-news-collector.test.mjs tests\signalmap-radar-normalization.test.mjs tests\signalmap-provider-status.test.mjs tests\signalmap-docker-runtime.test.mjs`; `npm run typecheck:all`; `npm run test:data`; `npm run test:sidecar`; `docker compose -f docker-compose.signalmap.yml config`; `node --check scripts\seed-internet-outages.mjs`. Codex/Gemini advisor CLIs are installed but auth-expired, so checkpoint review used clean-context fallback agents. |
| 2026-04-26 | Phase 5 | Unit 5c | Completed | Added `docs/SignalMap/deployment.md` covering Docker runtime files, compose quick start, required env/secrets, persistent volumes, Docker build/runtime env, process model, HTTPS/DNS proxying, Redis, OpenRouter, distill root, LanceDB path, embedding model cache, collector cadence, Vercel static caveat, and Tauri freeze. Clean review found deployment doc overstated `/api/health` payload detail and missed some Docker env inventory; both were corrected. |
| 2026-04-26 | Phase 5 | Unit 5c | Started | Scope limited to SignalMap deployment docs/config. Worker Meitner delegated for clean-context documentation. |
| 2026-04-26 | Phase 5 | Unit 5b | Completed | Added additive SignalMap container runtime files without changing the existing frontend-only `docker/Dockerfile`: `docker/Dockerfile.signalmap`, `docker/supervisord.signalmap.conf`, `docker/signalmap-entrypoint.sh`, and `docker-compose.signalmap.yml`. Runtime builds the SignalMap Vite variant, runs nginx plus local Node API plus the SignalMap news collector, persists LanceDB/model data under `/data/signalmap`, mounts local distill read-only, and sources secrets only from env/secrets. Expanded `tests/signalmap-docker-runtime.test.mjs`. Validation passes: `npx tsx --test tests\signalmap-docker-runtime.test.mjs`; `docker compose -f docker-compose.signalmap.yml config`; `npm run test:data`. |
| 2026-04-26 | Phase 5 | Unit 5b | Started | Scope limited to additive SignalMap Docker runtime files and static runtime tests. Worker Darwin delegated for clean-context implementation. |
| 2026-04-26 | Phase 5 | Unit 5a | Completed | Added independent SignalMap health domains in `api/health.js` for Radar, providers, news, LLM, distill, LanceDB, and embeddings; collector-owned domains now publish Redis health keys plus `seed-meta`; collector health includes sanitized LanceDB open/writable/table/record/error status; and tests cover domain registration, health writes, no secret/path leakage, and missing-key health semantics. Validation passes: `npx tsx --test tests\signalmap-news-collector.test.mjs tests\signalmap-lancedb-store.test.mjs`; `npm run test:data`. Clean review found one missing-key/empty-data issue, fixed it, and final clean review reported no blocking findings. |
| 2026-04-26 | Phase 5 | Unit 5a | Started | Scope limited to SignalMap health domains, seed-meta registration/publishing, LanceDB health shape, and targeted collector/vector-store tests. Worker Bernoulli delegated for clean-context implementation. |
| 2026-04-26 | Phase 4 | Checkpoint | Completed | Phase 4 checkpoint passed after UI shell repairs and clean-context reviews. Validation passes: `npm run typecheck:all`; `npm run test:data`; `npx tsx --test tests\signalmap-watchlist.test.mjs`; focused SignalMap Playwright `signalmap.spec.ts` 3/3 using a manual Windows Vite server workaround because the repo Playwright webServer command is POSIX-only. |
| 2026-04-26 | Phase 4 | Unit 4c | Completed | Added the SignalMap shell/status/feed/inspector UI, SignalMap variant panel/layout integration, compact CSS, and focused E2E coverage. Checkpoint repairs persist and reapply variant panel defaults on switch-back, add a bounded SignalMap fetch timeout, pass marker-eligible events to `MapContainer`, render watchlist-styled markers in DeckGL/SVG/Globe, fix marker-eligible story inspector feed-only behavior, and surface watchlist promotion in strips/inspector. Validation passes: `npm run typecheck:all`; `npm run test:data`; `npx tsx --test tests\signalmap-watchlist.test.mjs`; focused SignalMap Playwright `signalmap.spec.ts` 3/3. |
| 2026-04-26 | Phase 4 | Unit 4b | Completed | Added `src/services/signalmap.ts` and wired SignalMap into `src/app/data-loader.ts` plus `src/App.ts`. The service builds generated-client `ListSignalMapEvents` requests from time range, categories, and the local watchlist; normalizes public events; annotates and prioritizes watchlist matches; and returns source-health, stale, upstream-unavailable, and degraded no-throw state. DataLoader now loads SignalMap only in SignalMap variant and queues payloads for the upcoming shell/status/feed/inspector components. App marks the SignalMap root, schedules only SignalMap refreshes for SignalMap variant, and no-ops legacy panel priming in that variant. Accepted after one pit-boss correction for legacy prime leakage. Validation passes: `npm run typecheck`; `npm run test:data`. |
| 2026-04-26 | Phase 4 | Unit 4a | Completed | Added `src/services/signalmap-watchlist.ts` and expanded `tests/signalmap-watchlist.test.mjs`. Watchlists now load/save the spec localStorage keys, fall back safely when storage is unavailable or invalid, validate and dedupe provider/region ids against config, preserve explicit empty arrays, annotate provider/region/global matches without mutation, and stably promote matched events without filtering unmatched/global signals. Validation passes: `npx tsx --test tests\signalmap-watchlist.test.mjs`; `npm run typecheck`; `npm run test:data`. Foreman npm runner still reports Windows `npm` ENOENT, so PowerShell output is authoritative. |
| 2026-04-26 | Phase 3 | Checkpoint | Completed | Phase 3 checkpoint passed after independent read-only review found and fresh workers fixed five contract gaps: Distill timeout default/env handling now uses `15000` ms and `SIGNALMAP_DISTILL_TIMEOUT_MS`; OpenRouter requests use strict `json_schema` response format while local validation remains authoritative; ambiguous geocoder names require textual country/region evidence rather than `countryIso2` alone; existing LanceDB table schemas degrade no-throw on mismatch/inspection failure; and Distill fallback marks source health degraded while continuing RSS fallback publication. Validation passes: `npx tsx --test tests\signalmap-news-collector.test.mjs tests\signalmap-llm-schema.test.mjs tests\signalmap-lancedb-store.test.mjs`; `npm run test:data`. Foreman npm runner still reports Windows `npm` ENOENT, so PowerShell output is authoritative. |
| 2026-04-26 | Phase 3 | Unit 3e | Completed | Added the collector-side SignalMap news collector. It reuses the shared source-tier config, parses RSS, gates full extraction to `risky.biz` and `thehackernews.com`, dedupes by canonical URL and title hash before LLM/vector work, uses LanceDB related-story lookup for semantic dedupe, upserts both marker-eligible and feed-only accepted stories when vectors are enabled, publishes `signalmap:news:v1` plus `seed-meta:signalmap:news`, and keeps full article body fields out of events/published payloads/vector upserts. Accepted after one rejection/fresh-worker fix for vector default behavior and `SignalMapSource` `id`/`label` fields. Validation passes: `npx tsx --test tests\signalmap-news-collector.test.mjs`; `npm run test:data`. |
| 2026-04-26 | Phase 3 | Unit 3d | Completed | Added collector-side embedding helpers and the LanceDB vector store using verified `@lancedb/lancedb` 0.27.2. Vector records are metadata-only, preserve `countryIso2` as arrays, validate dimensions before writes, support bounded related-story search and retention pruning, and degrade without throwing when disabled or unavailable. Accepted after one rejection/fresh-worker fix for `countryIso2` array handling and no-throw health. Validation passes: `npx tsx --test tests\signalmap-lancedb-store.test.mjs`; `npm run test:data`. |
| 2026-04-26 | Phase 3 | Unit 3c | Completed | Added the offline collector-side SignalMap geocoder/country resolver. It uses the existing local country resolver, shared country bounding boxes, and deterministic static place entries; country-only locations resolve to country-scope bbox centroids rather than invented city points; ambiguous names such as Georgia require country evidence; low-confidence resolved locations remain feed-only; and array resolution preserves input order. Validation passes: `npx tsx --test tests\signalmap-llm-schema.test.mjs`; `npm run test:data`. |
| 2026-04-25 | Phase 3 | Unit 3b | Completed | Added the collector-side OpenRouter parser and LLM schema tests. The parser reads only `OPENROUTER_API_KEY`, posts to the OpenRouter chat completions endpoint, enforces `SIGNALMAP_LLM_MODELS` allowlisting with safe default fallback, uses the spec `30000` ms default timeout, strips raw HTML before bounded untrusted article prompting, rejects markdown-wrapped or invalid JSON, validates controlled categories/severities, and rejects locations without evidence. Accepted after one rejection/fresh-worker fix for timeout/default-model semantics. Validation passes: `npx tsx --test tests\signalmap-llm-schema.test.mjs`; `npm run test:data`. Foreman npm runner still reports Windows `npm` ENOENT, so PowerShell output is authoritative. |
| 2026-04-25 | Phase 3 | Unit 3a | Completed | Added the collector-side Distill bridge and news-collector tests. The bridge resolves `SIGNALMAP_DISTILL_ROOT`, refuses full extraction unless the distill repo is built at `dist/index.js`, maps Risky Business News and The Hacker News to source-specific descriptors, calls `new Distill({ descriptors }).extract(url)`, enforces extraction timeout, validates the distilled article contract, and falls back to RSS title/snippet for missing root/build/descriptor, unsupported source, timeout, extraction error, or invalid output. Validation passes: `npx tsx --test tests\signalmap-news-collector.test.mjs`; `npm run typecheck:api`; `npm run test:data`. |
| 2026-04-25 | Phase 2 | Checkpoint | Completed | Phase 2 contracts/RPC are complete after the provider-status normalizer. Phase checkpoint validation passes: `npm run typecheck:all`; `npm run test:data` (outside sandbox due Windows child-process restrictions). External Codex/Gemini CLI review was unavailable because auth was expired/timeouts occurred, so two clean read-only fallback review agents checked Unit 2d and reported no confirmed issues. |
| 2026-04-25 | Phase 2 | Unit 2d | Completed | Added the pure provider-status SignalMap normalizer for Cloudflare Status JSON plus Okta, Microsoft 365, Azure, and Wasabi RSS fixtures. Operational, empty, and resolved states create source health only; active incidents and maintenance become `provider_status` events; Microsoft 365 weak geography remains feed-only with `markerEligible: false`; Wasabi `US-WEST-1` maps deterministically to supported `region` scope. Validation passes: `npx tsx --test tests\signalmap-provider-status.test.mjs`; `npm run typecheck:api`; `npm run typecheck:all`; `npm run test:data`. |
| 2026-04-25 | Phase 2 | Unit 2c | Completed | Added the pure Cloudflare Radar SignalMap normalizer for existing outage and traffic-anomaly cache payloads, including raw Radar fixture envelopes and the existing normalized cache shapes. Healthy empty payloads now produce source health only, missing payloads degrade to unavailable health, active records with usable geography become marker-eligible events, and ended/non-active records stay feed-only. Validation passes: `npm run typecheck:api`; `npm run typecheck:all`; `npx tsx --test tests\signalmap-radar-normalization.test.mjs`; `npm run test:data` (outside sandbox due Windows child-process restrictions). |
| 2026-04-25 | Phase 2 | Unit 2b | Completed | Added the SignalMap `ListSignalMapEvents` proto/RPC shell, generated client/server/OpenAPI artifacts through Buf/sebuf, added the Vercel edge gateway wrapper, added explicit fast cache tier coverage, and added `tests/signalmap-rpc-shell.test.mjs`. The RPC reads the raw Redis cache by normalized time/category/watchlist filters and degrades to an empty response with source health when cache data is unavailable. Validation passes: `npx tsx --test tests\signalmap-rpc-shell.test.mjs`; `npm run typecheck:api`; `npm run typecheck:all`; `npm run test:data` (outside sandbox due Windows child-process restrictions). |
| 2026-04-25 | Phase 2 | Unit 2a | Completed | Added SignalMap event/type contracts and controlled config for categories, severities, provider ids, region groups, localStorage keys/defaults, and the `SIGNALMAP_LOCATION_CONFIDENCE_MIN` 0.7 marker threshold. Added `tests/signalmap-watchlist.test.mjs` guardrails for controlled values, defaults, type/source contract fields, and confidence bounds. Validation passes: `npx tsx --test tests\signalmap-watchlist.test.mjs` (6 tests, outside sandbox due Windows `spawn EPERM`); `npm run typecheck`; `npm run test:data` (full suite green). |
| 2026-04-25 | Phase 1 | Checkpoint | Completed | Repaired stale/local test-suite failures before Phase 2: Windows path handling in node:test fixtures and MDX lint, CRLF/Windows direct-run handling in agent-skills and seed-envelope scripts, source-level VM extraction for regulatory seed tests, WebMCP source extraction, Edge helper file URL import, product ID guard traversal, Makefile static recipe parsing, resilience methodology/snapshot doc paths, minimal OpenAPI checkpoint artifacts, and Windows-inapplicable SIGTERM cleanup tests. Validation passes: `npm run typecheck:all`; `npm run test:data` (full suite green). Foreman npm runner still reports `spawn C:\Program Files\nodejs\npm ENOENT` on Windows, so PowerShell command output is authoritative for this checkpoint. |
| 2026-04-25 | Phase 1 | Unit 1c | Completed | Removed product-tier/premium guards from fetch, generated-client call paths, gateway/RPC helpers, direct API handlers, CountryDeepDive product cards, browser entitlement compatibility helpers, notifications settings, export/playback controls, flight search, and globe layer toggles. Full functionality is enabled for this personal fork while CORS, rate limits, upstream secrets, sign-in for user-owned resources, and shipping webhook force-key protections remain. Pit-boss validation passes: `npm run typecheck:all`; focused `npx tsx --test tests/signalmap-public-access.test.mjs tests/widget-builder.test.mjs tests/digest-rollout-flags.test.mjs tests/quiet-hours-rollout-flags.test.mjs tests/comtrade-bilateral-hs4.test.mjs tests/multi-sector-cost-shock.test.mjs tests/premium-fetch.test.mts tests/widget-agent-auth.test.mts tests/brief-edge-route-smoke.test.mjs tests/supply-chain-validation.test.mjs tests/supply-chain-sprint2.test.mjs tests/resilience-map-layer.test.mts tests/get-regional-snapshot.test.mts tests/get-regime-history.test.mts tests/regional-snapshot-weekly-brief.test.mjs` passes: 504 tests; `npx vitest run server/__tests__/entitlement-check.test.ts --config vitest.config.mts` passes: 4 tests; stale product-gate regression suite passes: 176 tests. Phase checkpoint `npm run test:data` remains red on unrelated baseline failures: 6724 passed, 24 failed. |
| 2026-04-25 | Phase 1 | Unit 1b | Completed | Removed user-facing frontend product gates: base panel lock/CTA calls now pass through without replacing content, panel gating resolves to public access, panel config and component constructors no longer ship locked/enhanced metadata, Latest Brief no longer skips fetches on local entitlement state, and stock/backtest visible labels plus locale tooltips no longer say Premium. Pit-boss validation passes: `npm run typecheck`; `npx tsx --test tests/signalmap-public-access.test.mjs` (19 tests). |
| 2026-04-25 | Phase 1 | Unit 1a | Completed | Public no-Origin/no-Referer same-origin Fetch Metadata requests can reach bootstrap, RSS proxy, and public gateway routes without an API key. Desktop/Tauri origins, premium/tier-gated routes, shipping webhooks, CORS, and rate limits remain protected. Focused `npx tsx --test tests/signalmap-public-access.test.mjs tests/bootstrap.test.mjs tests/gateway-cdn-origin-policy.test.mts tests/premium-stock-gateway.test.mts` passes: 61 tests. |
| 2026-04-25 | Phase 0 | Unit 0d | Completed | Added `tests/signalmap-docker-runtime.test.mjs` to inventory the current frontend/nginx Dockerfile, reusable supervisord/local API entrypoint patterns, and expected SignalMap data/LanceDB/model/OpenRouter/Redis env keys. Targeted test passes. |
| 2026-04-25 | Phase 0 | Checkpoint | Blocked | `npm run test:data` still fails on pre-existing agent-skills sha drift and `tests/regulatory-seed-unit.test.mjs` `import.meta` VM SyntaxError. The new Phase 0 inventory tests pass together outside the sandbox. |
| 2026-04-25 | Phase 0 | Unit 0c | Completed | Added `tests/signalmap-public-access.test.mjs` to inventory current `premiumFetch`, `PREMIUM_RPC_PATHS`, `validateApiKey`, `premium: 'locked'`, and user-facing license-key copy before Phase 1 changes. Targeted test passes. |
| 2026-04-25 | Phase 0 | Unit 0b | Completed | Added Risky Business News and The Hacker News descriptors, captured local HTML fixtures, and added distill fixture tests. Distill `npm test` passes: 11 files, 162 tests. |
| 2026-04-25 | Phase 0 | Unit 0a | Completed | Created seven provider/Radar fixtures under `tests/fixtures/signalmap`; targeted JSON/XML parse validation passed. `npm run test:data` remains red on unrelated baseline failures recorded below. |
| 2026-04-25 | Phase 0 | Unit 0b | Started | Scope limited to Risky Business News and The Hacker News descriptors, HTML fixtures, and descriptor tests in `C:\Coding_Workspace\Github_P\distill`. Distill baseline `npm test` passes after dependency install. |
| 2026-04-25 | Phase 0 | Unit 0a | Started | Scope limited to `worldmonitor` fixture capture under `tests/fixtures/signalmap`; distill and Docker are out of scope for this unit. |
| 2026-04-25 | Planning | Spec generation | Created docs | Foreman spec generated from `design-summary.md`. |
| 2026-04-25 | Planning | Spec update | Updated docs | Added Docker runtime and local LanceDB vector memory to design/spec/handoff/testing plan. |

## Error Recovery Log

| Date | Error | Fix | Status |
|------|-------|-----|--------|
| 2026-04-26 | Final Phase 5 clean-context checkpoint review found `/api/health` did not expose sanitized LanceDB details, SignalMap health-domain seed-meta counts were not payload-specific, Radar/provider health keys had no writers, and compose quick start defaulted Redis tokens to empty. | Added an allowlisted small-detail GET for `signalmap:health:lancedb:v1` with sanitized `checks.signalMapLanceDb.details`; changed collector health-domain seed-meta to use payload record counts; added Radar and provider health writers; set a consistent `local-dev-token` compose default with production override docs; reran focused suites and full checkpoint. | fixed |
| 2026-04-26 | `npm run test:sidecar` failed because the cloud-fallback test still expected no `Origin` header, but sidecar cloud fallback intentionally strips the desktop/browser origin and substitutes `https://worldmonitor.app` so cloud API auth accepts the fallback request. | Rewired the stale assertion to verify the desktop origin is not forwarded and the trusted canonical origin is sent; `npm run test:sidecar` now passes. | fixed |
| 2026-04-26 | Unit 5c clean review found `deployment.md` overstated `/api/health` as returning LanceDB payload details and lacked a compact Docker build/runtime env inventory. | Clarified that `/api/health` reports health-key freshness/status while collector-owned Redis payloads carry detailed sanitized LanceDB/embedding fields, and added the missing Docker build/runtime env table. | fixed |
| 2026-04-26 | Unit 5c worker Meitner stalled without returning a patch. | Closed the worker, logged Foreman rejection `W_FAIL`, completed the deployment guide locally, and used clean-context review before pass verdict. | fixed |
| 2026-04-26 | Initial Unit 5b Dockerfile used `build:agent-skills`, which can fail inside the Docker context because `.dockerignore` excludes markdown skill files. | Matched the existing root Dockerfile build path for the container image: bundle handlers, then run `npx tsc && npx vite build` for the SignalMap variant. | fixed |
| 2026-04-26 | Unit 5b worker Darwin stalled without returning a patch. | Closed the worker, logged Foreman rejection `W_FAIL`, completed the implementation locally, and used a clean read-only reviewer before pass verdict. | fixed |
| 2026-04-26 | Initial Unit 5a registration put SignalMap domains in `EMPTY_DATA_OK_KEYS`, which would have allowed fresh seed-meta to hide a missing Redis data key. | Changed `api/health.js` so missing data keys can only become `STALE_SEED` via empty-data tolerance, while `OK` for zero records is reachable only when the Redis data key exists; added a source-level regression assertion. | fixed |
| 2026-04-26 | Unit 5a worker Bernoulli stalled without returning a patch. | Closed the worker, logged Foreman rejection `W_FAIL`, completed the implementation locally, and used clean read-only reviewers before pass verdict. | fixed |
| 2026-04-26 | Initial Unit 4b wiring still let SignalMap variant startup run `App.primeVisiblePanelData(true)`, whose force-all path can invoke legacy loaders without mounted panels. | Added an early SignalMap-variant return in `primeVisiblePanelData`, and avoided binding the legacy market-watchlist reload listener in SignalMap variant. | fixed |
| 2026-04-26 | Initial Unit 4c UI port missed map-primary behavior and persistence edge cases: marker-eligible events were not rendered on the map, story events were labeled feed-only solely by kind, watchlist promotion was incomplete, SignalMap fetch lacked timeout, and variant-switch panel defaults were not persisted/reapplied on switch-back. | Added map event forwarding plus DeckGL/SVG/Globe markers, fixed inspector/status behavior, added a 12s fetch timeout, persisted/reapplied SignalMap defaults, and expanded focused E2E coverage. | fixed |
| 2026-04-26 | `npm run test:e2e:full` cannot start Playwright on this Windows shell because `playwright.config.ts` uses POSIX `VITE_E2E=1` in `webServer.command`. | Used a manual Vite process with PowerShell env assignment and a temporary no-webServer Playwright config for focused SignalMap E2E. | open |
| 2026-04-25 | `npm run test:data` baseline initially failed because `node_modules` was missing and `tsx` was unavailable. | Ran `npm install` with approval. | fixed |
| 2026-04-25 | Foreman `run_tests` cannot spawn npm on Windows (`C:\Program Files\nodejs\npm` ENOENT). | Used PowerShell fallback for the same command and logged Foreman runner friction. | open |
| 2026-04-25 | Sandboxed `npm run test:data` failed with `spawn EPERM` for every test file. | Reran outside sandbox with approval. | fixed |
| 2026-04-25 | Escalated `npm run test:data` is red before Unit 0a changes: agent-skills hash drift and `tests/regulatory-seed-unit.test.mjs` `import.meta` VM SyntaxError. | Resolved during Phase 1 checkpoint suite repair; full `npm run test:data` now passes. | fixed |
| 2026-04-25 | Distill baseline `npm test` initially failed because `vitest` was unavailable. | Ran `npm install` in `C:\Coding_Workspace\Github_P\distill` with approval; reran `npm test` and all 160 tests passed. | fixed |
| 2026-04-25 | Unit 0c `npm run test:data` still fails on unrelated baseline issues: agent-skills `fetch-country-brief` sha256 drift and `tests/regulatory-seed-unit.test.mjs` `import.meta` VM SyntaxError. | Resolved during Phase 1 checkpoint suite repair; full `npm run test:data` now passes. | fixed |
| 2026-04-25 | Initial Unit 0d worker output had a self-referential env-key assertion that did not validate against spec or repo files. | Rejected and fixed with a fresh worker; env-key assertions now read `docs/SignalMap/spec.md`, `.env.example`, and `docker/redis-rest-proxy.mjs`. | fixed |
| 2026-04-25 | Phase 0 checkpoint `npm run test:data` remains red after Units 0a-0d. Failures are unchanged baseline issues: agent-skills `fetch-country-brief` sha256 drift and `tests/regulatory-seed-unit.test.mjs` `import.meta` VM SyntaxError. | Resolved during Phase 1 checkpoint suite repair; full `npm run test:data` now passes. | fixed |
| 2026-04-25 | Initial Unit 1a worker patch bypassed `validateApiKey` for any `Sec-Fetch-Site: same-origin` request without a key, including desktop/Tauri origins. | Rejected and fixed with a fresh worker; bypass now requires no API key, no `Origin`, and no `Referer`, and tests assert Tauri origin still returns 401. | fixed |
| 2026-04-25 | Unit 1a full `npm run test:data` remains red after focused tests pass. Failures are unchanged baseline issues: agent-skills `fetch-country-brief` sha256 drift and `tests/regulatory-seed-unit.test.mjs` `import.meta` VM SyntaxError. | Resolved during Phase 1 checkpoint suite repair; full `npm run test:data` now passes. | fixed |
| 2026-04-25 | Initial Unit 1b worker output removed base Panel overlays but left component-level gates: Latest Brief rendered Pro/Upgrade copy and stock/backtest panels still exposed Premium titles and locked metadata. | Rejected twice and fixed with fresh workers; guardrails now scan frontend source and locale JSON files for these product-gate regressions. | fixed |
| 2026-04-25 | Initial Unit 1c broad worker timed out after two waits. | Split Unit 1c into smaller workers for server/RPC gates, client premiumFetch imports, direct APIs, CountryDeepDive UI gates, active browser helper gates, and stale tests. | fixed |
| 2026-04-25 | Unit 1c independent validation found residual active product gates in `CountryDeepDivePanel.ts`, `isProUser`, `hasFeature`/`hasTier`, export/playback role checks, flight search, notifications settings, and globe layer toggles. | Rejected and fixed with fresh narrow workers; focused product-gate suites pass and guardrails now cover these paths. | fixed |
| 2026-04-25 | Phase 1 checkpoint `npm run test:data` remains red after Unit 1c. Current filtered full-suite result: 6724 passed, 24 failed, including agent-skills sha drift, bundle-runner process tests, regulatory `import.meta` VM failures, OpenAPI/catalog drift, Edge helper resolution, mdx/product-id/resilience snapshot/doc lint failures, seed SIGTERM tests, and WebMCP readiness/teardown failures. | Resolved by stale test/artifact rewiring and Windows harness fixes; full `npm run test:data` now passes. | fixed |
| 2026-04-25 | Phase 1 checkpoint full suite was blocked by stale tests/artifacts and Windows-local harness issues. | Rewired stale tests and regenerated/fixed artifacts; `npm run test:data` and `npm run typecheck:all` now pass. | fixed |
| 2026-04-25 | Unit 2a review found `SignalMapSource.tier` typed as `string` in the worker output, while the spec requires `number`. | Corrected the type, added a watchlist contract guard for `tier?: number`, and reran focused, typecheck, and full data-suite validation. | fixed |
| 2026-04-25 | Unit 2b Buf generation was blocked inside the sandbox because Buf could not create its AppData cache directory. | Installed the pinned sebuf plugins, then reran `buf generate` outside the sandbox; generated SignalMap client/server/OpenAPI artifacts successfully. | fixed |
| 2026-04-25 | Initial Unit 2c worker did not return before timeout after producing partial target-file edits. | Closed the worker, inspected the partial output, fixed TypeScript/geography/last-observed semantics in the pit-boss pass, and reran focused, typecheck, and full data-suite validation. | fixed |
| 2026-04-25 | Initial Unit 2d worker output used unsupported `SignalMapLocation.scope` value `cloud_region` and the test asserted the invented literal. | Rejected the output, spawned a fresh narrow fix worker, changed Wasabi region scope to supported `region`, and added a scope whitelist assertion. | fixed |
| 2026-04-25 | Phase 2 checkpoint external advisor review could not use Codex/Gemini CLIs because auth was expired and Codex invocation timed out. | Logged the CLI friction and used two clean read-only fallback review agents; both reported no confirmed issues. | fixed |
| 2026-04-25 | Initial Unit 3a worker output accepted any non-empty Distill output `sourceName`, widening the `DistilledNewsArticle` contract beyond Risky Business News and The Hacker News. | Rejected the output, required successful Distill output to use a supported source name, and added invalid-source fallback coverage. | fixed |
| 2026-04-25 | Unit 3a descriptor-missing handling was global, so a missing unrelated descriptor blocked extraction for a supported source. | Rejected the output, made descriptor checks source-specific, and added coverage that missing unrelated descriptors do not block extraction. | fixed |
| 2026-04-25 | Initial Unit 3b worker output used `DEFAULT_SIGNALMAP_LLM_TIMEOUT_MS = 15000` instead of the spec `30000` default and warned when `SIGNALMAP_LLM_DEFAULT_MODEL` was omitted. | Rejected the output, fixed the default timeout, made omitted default model resolve to the first allowlisted model without warning, and added regression coverage. | fixed |
| 2026-04-26 | Initial Unit 3d worker output stored `SignalMapVectorRecord.countryIso2` as a single string and health could throw if table row count failed. | Rejected the output, fixed `countryIso2` as an array through record creation, LanceDB serialization, and related-story projection, and wrapped count failures into degraded health. | fixed |
| 2026-04-26 | Initial Unit 3e worker output defaulted vector mode off when `SIGNALMAP_VECTOR_ENABLED` was omitted and emitted story sources without required `SignalMapSource` `id`/`label` fields. | Rejected the output, made vector mode inherit the spec/LanceDB default enabled state, added default-vector regression coverage, and normalized story sources to include stable `id`, `label`, numeric `tier`, `url`, and `fetchedAt`. | fixed |
| 2026-04-26 | Phase 3 checkpoint review found five contract gaps: Distill timeout default/env handling, OpenRouter provider-side strict schema, ambiguous geocoder evidence, LanceDB existing-table schema mismatch degradation, and collector source health on Distill fallback. | Spawned fresh narrow fix workers with disjoint write sets; reran focused Phase 3 suites and `npm run test:data`; phase gate now passes. | fixed |

Recovery protocol:

- Record every failed command here with command, failure, and next attempt.
- Do not retry external network commands repeatedly without changing inputs.
- For fixture drift, update fixture first, then parser, then tests.

## Context Management

At session start answer:

| Question | Answer Source |
|----------|---------------|
| Where am I? | Current Status above |
| Where am I going? | Checklist first unchecked unit |
| What is the goal? | [spec.md](./spec.md) Intent |
| What has been tried? | Session Log |
| What failed? | Error Recovery Log |

New chat policy:

- Read `spec.md`, `handoff.md`, and this file before editing.
- Trust this file over memory.
- Update this file whenever a unit starts or completes.

## Environment Notes

- WorldMonitor dependencies are not currently installed in this workspace unless `node_modules` exists.
- Distill is a separate repo at `C:\Coding_Workspace\Github_P\distill`.
- Editing distill may require filesystem permission outside the `worldmonitor` writable root.
- LanceDB data should live under a Docker-mounted `SIGNALMAP_DATA_DIR`, default `/data/signalmap`.
- `@lancedb/lancedb` 0.27.2 was verified during Unit 3d and added for the collector-side vector store.
- OpenRouter credentials belong in server/collector env vars, never client code.
