# SignalMap Handoff

## Project Overview

SignalMap is the public-web evolution of WorldMonitor. The full implementation spec is [spec.md](./spec.md). The work removes user-facing license/API-key friction, builds first-class Radar/provider signal layers, adds local watchlists, adds a constrained OpenRouter + distill story-map pipeline, and runs the SignalMap runtime in Docker with local LanceDB vector memory.

## Before Starting

1. Read [spec.md](./spec.md).
2. Read this handoff.
3. Read [PROGRESS.md](./PROGRESS.md).
4. Check the current git status.
5. Confirm whether you will edit only `worldmonitor` or also `C:\Coding_Workspace\Github_P\distill`.
6. If editing `distill`, request filesystem permission if the current sandbox does not include that path.
7. Confirm whether Docker runtime files are in scope for the session before touching `docker/` or root compose files.

## Rules

- Do not import `docs/SignalMap/Claude_Design` React/Babel files into production code.
- Do not edit `src/generated/` manually.
- Do not render markers for healthy provider regions or static context locations.
- Do not expose `OPENROUTER_API_KEY` to the browser.
- Do not store or display full article bodies in SignalMap.
- Do not remove legal license notices as part of product-gating removal.
- Do not port distill to Python in v1.
- Do not import `@lancedb/lancedb` into browser code.
- Do not make LanceDB a hard dependency for Radar/provider incident rendering.
- Do not store full article bodies in LanceDB.
- Preserve same-origin CORS, rate limiting, and internal cron/admin protections.

## Implementation Order

### Phase 0 - Discovery And Contract Grounding

Start here. This phase makes the later work concrete.

- **0a Provider/Radar fixture capture:** create fixtures under `tests/fixtures/signalmap`.
- **0b Distill descriptor discovery:** work in `C:\Coding_Workspace\Github_P\distill`; create Risky Business News and The Hacker News descriptors plus fixture tests.
- **0c Premium/gating impact inventory:** add an inventory test for current premium/API-key surfaces before changing them.
- **0d Docker and LanceDB runtime inventory:** document current Docker frontend-only shape and expected SignalMap runtime/env keys in a test.

Checkpoint: `npm run test:data`

### Phase 1 - Public Web Baseline

Remove product gates carefully. This is the highest regression risk because premium behavior is spread across frontend, runtime fetch, gateway, and tests.

- **1a Public API gate policy**
- **1b Frontend premium UI removal**
- **1c Premium fetch/client cleanup**

Checkpoint: `npm run typecheck:all && npm run test:data`

### Phase 2 - SignalMap Contracts And RPC

Create the stable contract before UI work.

- **2a Types and config**
- **2b Proto/RPC shell**
- **2c Radar normalizer**
- **2d Provider status normalizer**

Checkpoint: `npm run typecheck:all && npm run test:data`

### Phase 3 - News Collector, Distill, OpenRouter, Geocoder, LanceDB

Keep this collector-side. Nothing in this phase belongs in browser code or Edge runtime unless explicitly designed as an API wrapper.

- **3a Distill bridge**
- **3b OpenRouter parser**
- **3c Geocoder/country resolver**
- **3d LanceDB vector store**
- **3e News collector**

Checkpoint: `npm run test:data`

### Phase 4 - Watchlists And UI Shell

Port the Claude Design product experience into the existing app.

- **4a Watchlist service**
- **4b SignalMap service/data-loader wiring**
- **4c Claude Design UI port**

Checkpoint: `npm run typecheck:all && npm run test:data`

### Phase 5 - Deployment And Ops

Make the system operable.

- **5a Health and seed-meta**
- **5b Docker runtime**
- **5c Deployment docs/config**

Checkpoint: `npm run typecheck:all && npm run test:data && npm run test:sidecar`

## Testing Strategy Summary

Archetype: data pipeline + API service + frontend integration.

Use fixtures for all external systems in normal tests:

- provider status feeds
- Radar payloads
- Risky Business News and The Hacker News HTML
- OpenRouter responses
- geocoder responses
- LanceDB temp directories with deterministic mock vectors

Run live discovery only in Phase 0 or manually when refreshing fixtures.

## Quick Reference

| Task | Command |
|------|---------|
| Typecheck app | `npm run typecheck` |
| Typecheck app + API | `npm run typecheck:all` |
| Data/unit tests | `npm run test:data` |
| Sidecar/API tests | `npm run test:sidecar` |
| E2E | `npm run test:e2e` |
| Distill tests | from `C:\Coding_Workspace\Github_P\distill`: `npm test` |
| Distill build | from `C:\Coding_Workspace\Github_P\distill`: `npm run build` |
| LanceDB tests | `npm run test:data` after `tests/signalmap-lancedb-store.test.mjs` exists |
| Docker runtime static tests | `npm run test:data` after `tests/signalmap-docker-runtime.test.mjs` exists |

## Error Recovery

| Problem | Recovery |
|---------|----------|
| Missing `node_modules` | Run `npm install` only with user approval if network is required. |
| Distill path not writable | Ask for permission to edit `C:\Coding_Workspace\Github_P\distill`. |
| LanceDB dependency version unknown | Verify with `npm view @lancedb/lancedb version` before adding it to `package.json`. |
| LanceDB path not writable | Use degraded vector mode; keep Redis-backed live signals working. |
| Embedding model unavailable | Skip vector writes and keep canonical URL/title hash dedupe. |
| Provider feed shape differs from fixture | Update fixture and parser test first, then code. |
| OpenRouter model fails | Verify model is in `SIGNALMAP_LLM_MODELS`; do not accept arbitrary browser-supplied model names. |
| Generated code stale | Run `make generate`; do not edit generated files manually. |
| Premium gate removal breaks tests | Update old tests intentionally after confirming the new public behavior. |

## First Session Instructions

Start with Phase 0 Unit 0a unless PROGRESS.md says otherwise. Do not start UI work before SignalMap event contracts, normalizers, Docker/LanceDB inventory, and collector contracts exist.

## Resume Instructions

On resume:

1. Read [PROGRESS.md](./PROGRESS.md).
2. Find the first unchecked unit.
3. Re-read that unit in [spec.md](./spec.md).
4. Check git status.
5. Run the unit's test command before editing if feasible.
