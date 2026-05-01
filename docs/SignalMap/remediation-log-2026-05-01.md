# SignalMap Remediation Log - 2026-05-01

This note records the fixes made during the SignalMap source/brief/map remediation session, based on the working session history. It is intentionally documentation-only.

## Original Problems

- Brief cron logged `Brief synthesis failed schema validation: output is not valid JSON`, but the raw model output was discarded, making diagnosis impossible.
- News sources were inconsistent: some UI rows were fixtures/mocks, NewsAPI was missing, security sources needed Distill extraction, provider-status sources were missing, and Cloudflare Radar was not producing reliable map data.
- Cold starts did not reliably repopulate all sources.
- The UI had stale/no-data brief copy, missing source links, an exposed debug projection overlay, and a briefing panel that was hard to scan and could not be collapsed.
- Category counts did not always correspond to visible map markers, which made GeoPolitics/Supply Chain look broken.
- Low-value stories could become signals even when they were sports, animal-interest, routine local business, or weak commodity/agriculture items.
- Docker/runtime wiring became inconsistent after previous edits.

## Fixes Made

### Brief JSON Diagnostics

- Added shared LLM JSON parsing behavior that trims whitespace and strips leading/trailing Markdown code fences such as:
  - ```json ... ```
  - ``` ... ```
- Updated both brief synthesis and per-event synthesis parsing paths to use this behavior.
- Parse failures now preserve the required `failed schema validation` substring while also including:
  - the parse error message
  - a sanitized first-content snippet of the raw model output
- Files involved:
  - `src/server/lib/llm-json.ts`
  - `src/server/lib/brief-pipeline.ts`
  - `src/server/lib/per-event-synth.ts`

### NewsAPI Source

- Added NewsAPI as a collector source behind `NEWSAPI_API_KEY`.
- Intended cadence: hourly via `SIGNALMAP_RSS_POLL_MINUTES=60` or equivalent compose env.
- Added placeholders/config notes so the user can add the real API key locally without committing secrets.
- NewsAPI articles are sent through the same LLM classification path as other news sources, so they map into existing SignalMap categories instead of creating a separate NewsAPI category.

### Distill Packaging And News Descriptors

- Vendored Distill into the repo under `vendor/distill` so a fresh clone plus compose build can run without requiring a separate host checkout.
- Added source-specific descriptors for the new security/news sites instead of using unrelated Oracle descriptors.
- Added extraction coverage for:
  - Risky Business News
  - The Hacker News
- Kept full extraction allowlisted to the supported sites, with RSS/snippet fallback for other sources.

### Provider Status Sources

- Added provider-status ingestion for:
  - OpenAI Status: `https://status.openai.com/`
  - Anthropic Status: `https://status.claude.com/`
  - AWS Lambda us-east-1 status RSS
  - Wasabi Status: `https://status.wasabi.com/`
- Added provider-style locations so provider incidents can map when the incident is provider/region scoped:
  - OpenAI/Anthropic around San Francisco
  - AWS us-east-1 around Virginia
  - Wasabi around Boston

### Cloudflare Radar

- Expanded Radar normalization so country names are resolved beyond the old hardcoded list.
- Added shared country metadata:
  - `scripts/shared/country-bboxes.json`
  - `scripts/shared/country-names.json`
- Radar outage/anomaly events now normalize into SignalMap with health/source metadata and mappable geography when the upstream data supplies a usable country/network location.

### Cold Start Refresh

- Updated startup/hydration behavior so the browser asks for live refresh data instead of relying only on the static fixture list.
- Intended behavior: after a cold start or volume reset, sources with missing/null update metadata should refresh rather than waiting for a stale timer.

### Brief Content Source

- Confirmed the “No live search results...” brief was not stale frontend text.
- Updated brief cron behavior so the global brief includes local Redis SignalMap events as context.
- The goal was to prevent the brief from saying no live data exists when local collector/provider/radar signals are present.

### UI Fixes

- Added source links in the inspector/details view so clicking a signal exposes source URLs that open in a new tab.
- Added source links for generated “Why this matters” briefs where sources are available.
- Reworked the briefing panel:
  - cleaner line wrapping
  - source chips/links
  - collapsible state
  - persisted collapsed preference
- Removed the visible debug projection overlay:
  - `Projection`
  - `Equirectangular - 960x480`
- Updated initial UI refresh behavior to pull live data on load.

### Categories, Severities, And Map Filtering

- Synced frontend categories/severities with backend event values.
- Added support for categories such as:
  - `supply_chain`
  - `infrastructure`
- Added severity support for:
  - `high`
  - `medium`
  - `low`
  - `info`
- Added marker type filtering from the map legend:
  - outage
  - anomaly
  - provider
  - event
- Important behavior clarified:
  - Every category can produce map markers if the event has valid coordinates and is marker eligible.
  - Category counts may include feed-only events.
  - Feed-only events are intentionally not shown on the map.

### Geocoder And Feed-Only Logic

- Added static geocoder support for:
  - Kerala, India
  - Golders Green, UK
- Preserved feed-only behavior for non-geographic/platform locations such as PyPI.
- Example decision:
  - PyTorch/PyPI supply-chain compromise can be a valid feed signal, but PyPI itself is not a meaningful map coordinate.

### Low-Signal Filtering

- Tightened the LLM parser prompt so only actionable global/regional/systemic items should become SignalMap events.
- Explicitly deprioritized or rejected routine noise such as:
  - sports
  - entertainment
  - celebrity/lifestyle stories
  - animal-interest stories
  - routine local commodity-price stories
  - ordinary agriculture/business stories
- Added a default event confidence floor:
  - `SIGNALMAP_EVENT_CONFIDENCE_MIN=0.7`
- Low-confidence parsed stories are skipped before geocoding/vector work.
- Added diagnostics for `low_signal_confidence` so skipped stories are explainable.

### LLM Schema Robustness

- Found live parser failures where the model emitted unsupported location scopes such as `software_registry`.
- Updated scope normalization so unsupported scopes are normalized to `unknown` instead of failing the whole event.
- Updated the parser prompt to tell the model that allowed scopes are:
  - `city`
  - `region`
  - `country`
  - `network`
  - `provider`
  - `unknown`
- Added guidance to use `unknown` for software registries, platforms, products, and non-place entities.

### Collector Publishing Contract

- Restored custom publisher metadata for SignalMap news publishing.
- The injected `publishImpl` now receives:
  - canonical data key
  - canonical meta key
  - health domain cache/meta keys
- This fixed the test contract around custom Redis publishers.

## Verification Completed

- Focused LLM schema/news collector tests passed:
  - `56` passing tests
- Broader SignalMap source/map-related test set passed:
  - `81` passing tests
- Vite production build passed:
  - `npx vite build`
- Earlier Playwright map interaction gate passed after the marker-filter update:
  - `8/8` passing tests

## Important Runtime Discovery

The Docker wiring was later rechecked and the earlier assumption about the compose stack was wrong for the current checked-out files.

Current `docker-compose.yml` defines only:

- `signalmap`
  - built from `docker/Dockerfile`
  - static/nginx-style image
- `redis`
  - built from `redis:7-alpine`

Current `docker-compose.yml` does **not** define:

- `signalmap-api`
- `signalmap-collector`
- `signalmap-cron`

`docker/Dockerfile.node` and `docker/entrypoint-node.sh` still exist, but they are not currently wired into compose. Also, current `package.json` does not expose `start:api`, `start:collector`, or `start:cron` scripts at the point this note was written.

This means live collector/cron/API behavior may not match the code changes until compose/runtime wiring is repaired.

## Known Remaining Issues / Risks

- The current compose file appears to run a combined/static `signalmap` service rather than separate API/collector/cron services.
- If the app is expected to ingest live sources continuously, compose needs to wire live API/collector/cron services again or the single container needs to run those processes deliberately.
- Some TypeScript worker wrapper files had placeholder/refactor code during the session. The real script implementations were working better than the placeholder wrappers, but final runtime verification was interrupted.
- `npm run test:data -- --test-name-pattern="brief"` did not filter to brief tests; it ran the whole data suite and surfaced unrelated pre-existing failures.
- The broad data suite had many failures unrelated to the source/brief/map changes, including missing legacy files and stale guardrail tests.
- Live Docker rebuild/restart verification was not completed after the last runtime-discovery interruption.

## Product Rule Captured

SignalMap should not show every article that technically fits a category. A story should become a visible signal only when it has real operational, security, geopolitical, infrastructure, supply-chain, financial, health, climate, energy, or regional significance.

Routine sports, animal-interest, entertainment, celebrity, lifestyle, local commodity, local agriculture, and ordinary business stories should be skipped unless there is clear systemic impact.

