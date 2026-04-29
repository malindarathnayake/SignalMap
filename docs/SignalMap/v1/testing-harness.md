# SignalMap Testing Harness

## Archetype

Data pipeline + API service + frontend integration. Most tests should be fixture-driven and deterministic.

## Operator Questions

| Question | Answer |
|----------|--------|
| Can tests call live provider/Radar/news endpoints by default? | No. Use fixtures. |
| Can tests call live OpenRouter? | No. Mock OpenRouter. |
| Can tests write to Redis? | No by default. Use mocks/fakes unless explicitly running real integration. |
| Can tests write to LanceDB? | Yes only in temp directories created by tests; never use the production Docker volume in unit tests. |
| Can tests download embedding models? | No. Use deterministic mock vectors in normal tests. |
| Can implementation edit `C:\Coding_Workspace\Github_P\distill`? | Requires operator/sandbox permission if not writable. |
| Exact production hostname | `signalmap.<domain>` placeholder until deployment. |

## Test Tiers

### Tier 1 - Unit Tests

Purpose:

- pure normalizers
- schema validation
- watchlist storage helpers
- LLM response validation
- LanceDB vector store helper behavior with temp dirs
- Docker runtime config static checks
- provider/Radar status tables

Commands:

- `npm run test:data`
- `npm run typecheck`

Expected files:

- `tests/signalmap-provider-status.test.mjs`
- `tests/signalmap-radar-normalization.test.mjs`
- `tests/signalmap-llm-schema.test.mjs`
- `tests/signalmap-lancedb-store.test.mjs`
- `tests/signalmap-watchlist.test.mjs`
- `tests/signalmap-docker-runtime.test.mjs`

### Tier 2 - Mocked Integration Tests

Purpose:

- SignalMap RPC reads mocked Redis/cached payloads
- collector consumes RSS fixture + distill fixture + mocked OpenRouter
- collector upserts mocked embeddings into a temp LanceDB store when vector mode is enabled
- no-key public API behavior

Commands:

- `npm run test:data`
- `npm run typecheck:api`

Expected files:

- `tests/signalmap-public-access.test.mjs`
- `tests/signalmap-news-collector.test.mjs`
- `tests/signalmap-lancedb-store.test.mjs`

### Tier 3 - Distill Descriptor Tests

Purpose:

- verify Risky Business News and The Hacker News descriptors extract required fields from fixed HTML fixtures.

Working directory:

- `C:\Coding_Workspace\Github_P\distill`

Commands:

- `npm run build`
- `npm test`

Expected files:

- `descriptors/risky-business-news.json`
- `descriptors/the-hacker-news.json`
- `test/fixtures/risky-business-news-article.html`
- `test/fixtures/the-hacker-news-article.html`
- `src/__tests__/news-descriptors.test.ts`

### Tier 4 - Real Integration Smoke Tests

Purpose:

- manually verify current provider feeds/Radar/OpenRouter, local embeddings, LanceDB persistence, and Docker runtime after fixtures and unit tests pass.

Rules:

- Do not run in CI by default.
- Require explicit env vars.
- Write captured payloads back to fixtures only after reviewing secrets.
- Use a disposable LanceDB directory unless intentionally validating the mounted Docker volume.

Suggested commands:

- `node scripts/signalmap-news-collector.mjs --dry-run --limit 5`
- `node scripts/signalmap-news-collector.mjs --dry-run --source riskybiz`
- `node scripts/signalmap-news-collector.mjs --dry-run --source thehackernews`
- `node scripts/signalmap-news-collector.mjs --dry-run --vector-smoke --limit 2`
- `docker compose -f docker-compose.signalmap.yml up --build`

### Tier 5 - E2E/UI

Purpose:

- verify SignalMap layout opens, filters, selects markers, and handles empty/healthy states.

Commands:

- `npm run test:e2e:full`

Expected file:

- `e2e/signalmap.spec.ts`

## Archetype-Specific Patterns

- Use table-driven status tests for provider status mapping.
- Use golden HTML fixtures for distill descriptors.
- Use mocked OpenRouter JSON for LLM parser tests.
- Use deterministic fixed-length vectors for LanceDB tests; assert dimension mismatch is rejected.
- Use a fake geocoder that returns exact, country-only, ambiguous, and no-match cases.
- Test the integration seam before isolated components when a contract crosses collector -> Redis -> RPC -> UI.
- Treat LanceDB as collector/local API infrastructure, not browser infrastructure.

## Quick Reference

| Need | Command |
|------|---------|
| App typecheck | `npm run typecheck` |
| API typecheck | `npm run typecheck:api` |
| All typecheck | `npm run typecheck:all` |
| Unit/data tests | `npm run test:data` |
| Sidecar/API tests | `npm run test:sidecar` |
| E2E | `npm run test:e2e` |
| LanceDB temp-dir tests | `npm run test:data` |
| Docker runtime static tests | `npm run test:data` |
| Distill build | `npm run build` from distill repo |
| Distill tests | `npm test` from distill repo |

## Common Failures

| Failure | Meaning | Fix |
|---------|---------|-----|
| `Cannot find module dist/index.js` from distill bridge | Distill repo was not built | Run `npm run build` in `C:\Coding_Workspace\Github_P\distill`. |
| Descriptor test missing `articleBody` | Selector drift or bad fixture | Regenerate/refine descriptor from fixture. |
| OpenRouter 401 | Missing/invalid `OPENROUTER_API_KEY` | Fix env; do not put key in client code. |
| Model rejected | Browser selected model outside allowlist | Update `SIGNALMAP_LLM_MODELS` or reject in UI. |
| LanceDB import fails | `@lancedb/lancedb` missing or incompatible with runtime platform | Verify/add dependency version and keep import collector-side only. |
| LanceDB path unwritable | Docker volume/env path not mounted or permissions wrong | Fix volume mount or run vector mode degraded. |
| Vector dimension mismatch | Embedding model output does not match `SIGNALMAP_EMBEDDING_DIM` | Update config or model after test review. |
| Embedding model download in unit test | Test is using live model path | Replace with deterministic mock vectors. |
| Healthy provider creates marker | Normalizer bug | Fix status table implementation. |
| Low confidence story creates marker | Confidence gate bug | Fix marker eligibility logic. |

## Pre-Implementation Discovery

Before coding beyond Phase 0:

1. Capture provider/Radar fixtures.
2. Capture one article fixture from Risky Business News.
3. Capture one article fixture from The Hacker News.
4. Build distill and validate descriptors against fixtures.
5. Confirm existing geocoder/country data path or implement fixture-backed resolver.
6. Verify current `@lancedb/lancedb` package version before adding dependency.
7. Confirm Docker runtime target and writable volume paths for `/data/signalmap/lancedb` and `/data/signalmap/models`.
8. Confirm `node_modules` availability or install dependencies with approval.
