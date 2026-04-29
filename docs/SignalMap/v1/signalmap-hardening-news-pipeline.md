# SignalMap Hardening and News Intelligence Plan

Status: working design brief. This is not an implementation spec yet because several product and integration decisions are still open.

Assumptions:

- The product name is **SignalMap**.
- The public app target is a normal HTTPS web app at `https://signalmap.<domain>`.
- "License key crap" means product gating, API-key gating, PRO locks, Clerk/Dodo billing, and entitlement checks. It does not mean deleting legal license or copyright notices.
- Cloudflare Radar is a primary signal source and should be front and center in the product experience.
- Radar dots appear only for observed outages, disruptions, or traffic anomalies. Healthy/normal regions should not render dots.
- Provider status feeds are first-class signals: Cloudflare Status API, Okta Status RSS, Microsoft service health feed, Azure status RSS, and Wasabi Status.
- Users can select "My Regions" and "My Providers" so SignalMap promotes incidents that matter to them.
- `C:\Coding_Workspace\Github_P\distill` remains the descriptor-driven extraction engine. It is currently TypeScript/Node, not Python.
- Python is the collector/orchestrator unless the extraction engine is explicitly ported.

## Scoping Questions

- What is the exact public hostname: `signalmap.<domain>`, `app.<domain>`, or another domain?
- Should all auth, billing, API-key, and PRO gates be removed, or should sign-in remain for preferences, alerts, and saved layouts?
- Should "My Regions" be anonymous/local-only, account-synced, or both?
- Should APIs be public only to same-origin browser traffic, or also open to third-party scripts without keys?
- Should the Tauri desktop app remain supported, be frozen, or be removed from the public-web fork?
- Which LLM runtime is preferred for article parsing: local Ollama, an OpenAI-compatible endpoint, Groq/OpenRouter, or a pluggable chain?
- Should `distill` be called from Python as a CLI/library sidecar, or should its extraction engine be ported to Python?
- Which sources are approved for full article extraction versus RSS title/snippet-only ingestion?
- What freshness and retention target do you want: 5-minute, 15-minute, or hourly polling; 24 hours, 7 days, or 30 days retained?

## Current Risks / Ambiguities

- The repo uses AGPL/commercial-license language in docs and README. Removing access gates is different from removing legal license notices.
- Existing premium logic is spread across UI panel gating, runtime request injection, gateway checks, API-key helpers, MCP/OAuth, billing, and docs.
- Cloudflare Radar is a central integration. The implementation needs confirmed API token scope, sample payloads, rate limits, and outage/anomaly location fields before finalizing the data model.
- Provider status feeds need sample payload discovery. Cloudflare Status exposes Statuspage-style JSON endpoints; Wasabi is also Statuspage-backed and exposes region components plus RSS/Atom links. The Okta, Microsoft 365, and Azure feed payload shapes still need fixture capture.
- Azure status RSS appears to emit items mainly when there is an issue, so an empty feed may mean healthy rather than broken. This must be encoded explicitly in source adapters.
- Scraping news sites directly can violate site terms, robots rules, copyright, or paywall restrictions. Prefer RSS feeds, official APIs, and short excerpts with attribution.
- `distill` is not a Python scraper today. Treating it as Python would create avoidable duplication unless there is a hard Python-only requirement.
- LLM location extraction can hallucinate coordinates. The map must require evidence, confidence, and geocoder validation before showing a point.
- Full article text should not be stored or displayed by default. Store normalized facts, summaries, snippets, source URLs, and hashes.
- The current source list already has many RSS domains and source-tier metadata. Duplicating this in a separate scraper config would drift.

## Proposed Simplification

- Phase 1: make the existing app a public web app first. Remove paywall and API-key gating, keep server-side secrets only for upstream data providers, and keep same-origin browser APIs rate-limited.
- Phase 2: put Cloudflare Radar at the center of the map as the first production SignalMap layer. Show only active issues, not healthy placeholders.
- Phase 3: add provider status adapters and a region/provider watchlist before broadening the news layer.
- Phase 4: reuse the existing public source catalog, RSS digest, source-tier, and seed freshness infrastructure before adding any new scraper. Enrich only selected links through `distill`.
- Phase 5: add a single normalized geocoded story layer to the existing map.
- Phase 6: revamp UI using the Claude Design prompt in `docs/claude-design-prompt-signalmap.md`.

## Logical Source Strategy

SignalMap should reuse the source stack that already exists in WorldMonitor. The repo is already built around public data first, optional server-side keys second, and graceful degradation when a provider is unavailable. Do not create a separate competing source registry unless a source cannot fit the existing seed/RPC/feed shape.

Source classes:

- Core public/no-key signals: RSS digest feeds, GDELT, USGS earthquakes, GDACS, NASA EONET, Open-Meteo climate/weather, NWS alerts, security/travel/health advisories, several cyber feeds, public market/crypto sources, UN and humanitarian feeds, BIS/World Bank/WTO-style open data, and static infrastructure registries.
- Core keyed-but-central signals: Cloudflare Radar. This is still front and center, but the product should clearly show Radar as unavailable/stale when the token is missing instead of blocking the whole app.
- Provider status signals: public status pages and RSS feeds for Cloudflare Status, Azure, Microsoft 365, Okta, Wasabi, and the many existing service-status providers.
- Context/reference layers: cloud regions, datacenters, submarine cables, ports, airports, financial centers, chokepoints, pipelines, waterways, tech HQs, and startup hubs.
- Optional enrichments: ACLED, UCDP, NASA FIRMS, AviationStack, ICAO NOTAM, AISStream, FRED/EIA, OTX, AbuseIPDB, LLM providers, and full article extraction through `distill`.

Map rule: context/reference layers can help explain an incident, but they are not incidents by themselves. SignalMap should not draw a dot just because a cloud region, cable landing, port, or company HQ exists. It should draw or promote those locations only when Radar, provider status, public event data, or a high-confidence story says something is happening there.

## Existing Sources To Keep

| Signal Role | Existing Asset | Auth Shape | SignalMap Use |
|-------------|----------------|------------|---------------|
| Internet outage/anomaly | `scripts/seed-internet-outages.mjs`, `list-internet-outages`, `list-traffic-anomalies`, `list-ddos-attacks` | Cloudflare Radar token | Primary map signal layer; only active/recent issues render markers |
| Provider service health | `server/worldmonitor/infrastructure/v1/list-service-statuses.ts`, `scripts/seed-service-statuses.mjs` | Mostly public status pages/RSS | Extend instead of replacing; add Okta, Microsoft 365, Wasabi details and region/component incident records |
| RSS/news digest | `src/config/feeds.ts`, `server/worldmonitor/news/v1/_feeds.ts`, `shared/rss-allowed-domains.json` | Public RSS and Google News RSS | First source catalog for story discovery; keep source type and risk metadata |
| Source credibility | `server/_shared/source-tiers.ts`, `shared/source-tiers.json`, `SOURCE_PROPAGANDA_RISK` | Local config | Use as LLM/story confidence input and visible source-quality badges |
| GDELT intelligence | `scripts/seed-gdelt-intel.mjs`, GDELT handlers | Public API, rate limited | Keep as global news/event/tone signal and corroboration source |
| Natural events | `seed-earthquakes`, `seed-natural-events` | Public APIs | Keep USGS/GDACS/EONET as validated map events |
| Climate/weather | `seed-climate-anomalies`, `seed-weather-alerts`, weather services | Public APIs | Keep as environmental stress and hazard signals |
| Security advisories | `scripts/seed-security-advisories.mjs` | Public RSS/Atom via allowlisted relay | Keep as authoritative country/service risk signals |
| Cyber threats | `scripts/seed-cyber-threats.mjs` | Mixed public + optional keys | Keep public IOC feeds; treat OTX/AbuseIPDB/URLhaus auth as optional enrichment |
| Public tech/finance feeds | Tech, AI, finance, crypto, energy, commodities feeds in existing feed configs | Public RSS/API where available | Feed LLM categorization and story map; avoid duplicate scraper config |
| Prediction markets | `scripts/seed-prediction-markets.mjs` | Public/browser fallback | Keep as corroboration/early-warning context, not a map-dot source by itself |
| Infrastructure context | `cloudRegions`, `cables`, datacenters, ports, airports, waterways, chokepoints, pipelines | Static/open curated data | Use as affected-asset context when a real signal intersects it |
| GPS interference | `seed-gpsjam`, GPS interference services | Public-ish source | Keep as map signal where data freshness is healthy |
| Aviation | FAA ASWS plus optional AviationStack/ICAO/OpenSky/Wingbits | FAA public, others keyed | Keep FAA as public baseline; optional paid/free-key providers enrich coverage |
| Maritime/AIS | AIS relay and vessel services | Keyed | Defer from SignalMap MVP unless maritime intelligence remains in scope |
| Conflict/unrest | GDELT public fallback plus optional ACLED/UCDP | Mixed public/token | Keep GDELT public; enable ACLED/UCDP where credentials exist |

## Provider Status Source Notes

- Cloudflare Status is already in the repo as a Statuspage-style status endpoint. The public API also exposes summary, components, unresolved incidents, all incidents, and maintenance endpoints.
- Wasabi appears Statuspage-backed and should be adapted through the same Statuspage parser after fixture capture.
- Azure RSS can be empty during healthy periods. Empty feed must mean "no current public issue" only after a successful fetch, not "source broken."
- Microsoft 365 and Okta feed formats need fixture capture before finalizing parser contracts.
- Region mapping should be evidence-based. Status text like "West Europe" can map to a provider region; vague text like "some customers" should remain feed-only unless the provider payload includes region/component metadata.

## Target Architecture

```text
Cloudflare Radar API
  -> Radar collector/seed job
  -> Normalize outage/anomaly records
  -> Redis signal keys + seed-meta
  -> SignalMap RPC
  -> Map internet-health layer

Provider status feeds
  -> Source adapters (Cloudflare Status, Okta, Microsoft 365, Azure, Wasabi)
  -> Normalize provider incidents/components/regions
  -> Apply user region/provider watchlist
  -> Redis provider-status keys + seed-meta
  -> SignalMap RPC
  -> Provider status strip + optional map markers

Source catalog
  -> Python collector/scheduler
  -> RSS/API fetch with allowlist, robots/ToS policy, rate limits
  -> Optional distill extraction for approved article pages
  -> Normalizer and deduper
  -> LLM event parser with strict JSON schema
  -> Geocoder/country resolver with confidence gate
  -> Redis story keys + seed-meta
  -> News/Intelligence RPC
  -> SPA data-loader
  -> Map story layer + signal inspector panel
```

## Auth And Gating Removal Map

| Area | Current Shape | Public-Web Direction |
|------|---------------|----------------------|
| Panel gates | `WEB_PREMIUM_PANELS`, panel `premium: 'locked'`, `panel-gating.ts` | Remove premium locks; every panel either renders or is hidden because the data source is unavailable |
| Gateway gates | `server/gateway.ts`, `PREMIUM_RPC_PATHS`, entitlement checks | Public same-origin endpoints; keep rate limits and cache tiers |
| API keys | `api/_api-key.js`, `WORLDMONITOR_VALID_KEYS`, `X-WorldMonitor-Key` | Remove user-facing keys; keep internal service secrets for cron/relay/admin-only routes |
| Billing/auth | Clerk, Dodo, Convex entitlements, checkout overlays | Remove from default app unless user accounts remain for preferences |
| MCP/OAuth | PRO-gated OAuth and MCP token flow | Either disable MCP or expose a public read-only MCP with strict rate limits |
| Desktop | Tauri sidecar and keychain fallback | Freeze or remove from public-web scope unless explicitly retained |
| Docs | license, auth, premium, API-key deployment docs | Rewrite docs to describe public web deployment and remaining internal secrets |

## Signal Data Contracts

```ts
interface RadarSignalEvent {
  id: string;
  provider: 'cloudflare-radar';
  kind: 'internet_outage' | 'traffic_anomaly';
  title: string;
  locationName: string;
  countryIso2?: string;
  regionName?: string;
  asn?: number;
  networkName?: string;
  lat?: number;
  lon?: number;
  scope?: 'country' | 'region' | 'network' | 'unknown';
  cause?: string;
  startedAt?: string;
  endedAt?: string;
  lastObservedAt: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  sourceUrl?: string;
}

interface ProviderStatusSignalEvent {
  id: string;
  provider: 'cloudflare-status' | 'okta' | 'microsoft-365' | 'azure' | 'wasabi';
  kind: 'provider_status';
  title: string;
  serviceName?: string;
  componentName?: string;
  providerRegion?: string;
  regionGroup?: 'global' | 'north_america' | 'europe' | 'mena' | 'asia_pacific' | 'south_asia' | 'africa' | 'south_america' | 'unknown';
  countryIso2?: string;
  lat?: number;
  lon?: number;
  status: 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage' | 'maintenance' | 'resolved' | 'unknown';
  impact: 'none' | 'minor' | 'major' | 'critical' | 'unknown';
  startedAt?: string;
  endedAt?: string;
  lastUpdatedAt: string;
  latestUpdate?: string;
  sourceUrl: string;
  watchlistMatch: boolean;
}

interface GeocodedStoryEvent {
  id: string;
  canonicalTitle: string;
  summary: string;
  category: 'technology' | 'finance' | 'geopolitics' | 'conflict' | 'cyber' | 'climate' | 'health' | 'energy' | 'supply_chain' | 'infrastructure' | 'general';
  tags: string[];
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  eventTime: string | null;
  firstSeen: string;
  lastSeen: string;
  locations: Array<{
    name: string;
    countryIso2?: string;
    lat?: number;
    lon?: number;
    confidence: number;
    evidence: string;
  }>;
  sources: Array<{
    name: string;
    url: string;
    publishedAt?: string;
    tier?: number;
  }>;
  confidence: number;
  extractionMethod: 'rss' | 'distill' | 'api';
  llmModel?: string;
}
```

Map display rules:
- Radar issue markers render only for active or recent outage/anomaly records.
- Healthy locations do not render markers.
- Provider-status markers render only for non-operational provider incidents with reliable geography.
- Provider incidents without reliable geography stay in the provider/status feed and inspector; they do not create fake map dots.
- User-selected regions/providers should promote matching provider and Radar signals in the header, feed, and map ordering.
- Story markers render only when at least one location has coordinates and `confidence >= 0.7`.
- Country-only stories can shade the country polygon, but should not invent a city point.

## Region And Provider Watchlist

The watchlist controls prioritization, not censorship. Users can still view global signals, but selected regions/providers are elevated.

Initial region groups:
- Global
- North America
- Europe
- MENA
- Asia-Pacific
- South Asia
- Africa
- South America

Initial provider-region examples:
- Azure: East US, West US, West Europe, North Europe, Southeast Asia, Australia East
- Wasabi: US-Central-1, US-East-1, US-West-1, EU-Central-1, EU-West-1, AP-Northeast-1, AP-Southeast-1, AP-Southeast-2
- Cloudflare: global service components plus any API/Radar location fields available from incidents
- Okta and Microsoft 365: service incidents only unless feed payloads expose reliable region fields

Storage options:
- Local-only: `localStorage` for anonymous public users.
- Account-synced: only if sign-in survives gate removal.
- URL-shareable: optional query params for region/provider filters.

## LLM Parsing Rules

- The model receives bounded source text, never raw HTML and never untrusted text as instructions.
- Output must be strict JSON validated with a schema before storage.
- The model must cite the exact phrase that supports each extracted location.
- Categories are controlled vocabulary only; no free-form top-level category names.
- If no reliable location exists, return an empty `locations` array.
- Summaries must be short derived summaries, not article copies.

## Scraping And Source Policy

- Start with existing RSS feeds from `src/config/feeds.ts` and `shared/rss-allowed-domains.json`.
- Use `distill` only on approved article URLs where extraction is permitted and useful.
- Respect robots.txt, source terms, rate limits, and paywalls.
- Store URL, title, source, timestamp, short snippet, hash, extracted facts, and normalized event records.
- Do not store full article bodies unless a source explicitly permits it.

## Hardening Workstreams

| Workstream | Goal | Verification |
|------------|------|--------------|
| Public web deployment | Run at the new domain with correct API origin, CORS, canonical URLs, and cache headers | `npm run typecheck`, API smoke tests, deployed health endpoint |
| Gate removal | No user-facing API keys, paywalls, checkout, or PRO overlays | Targeted tests around panel layout, gateway, runtime request headers |
| Cloudflare Radar layer | Active outage/anomaly records appear front and center; healthy regions stay quiet | Radar fixture tests, stale-data tests, map screenshot tests |
| Provider status layer | Cloudflare/Okta/Microsoft/Azure/Wasabi incidents normalize into one signal model | Feed fixture tests, provider-region mapping tests |
| Region watchlist | User-selected regions/providers promote relevant signals without hiding global context | Local storage tests, URL-state tests, UI screenshot tests |
| Ingestion safety | SSRF allowlist, per-source rate limits, robots/ToS policy, no paywall bypass | Unit tests for URL validation and source config |
| LLM safety | Prompt injection boundaries, schema validation, confidence gates | Fixtures with hostile article text and ambiguous locations |
| Map correctness | Only validated locations appear; country-only events do not become fake city markers | E2E map screenshot and data contract fixtures |
| Observability | Seed freshness, source failures, extraction failures, LLM failures, geocode confidence | Health endpoint includes `seed-meta:<key>` for new signal keys |

## Initial Implementation Phases

1. Inventory all auth, billing, entitlement, API-key, and premium paths.
2. Introduce SignalMap public-web config for hostname, API origin, CORS, and branding.
3. Remove UI gates and request header injection, then adjust gateway behavior.
4. Promote the existing Cloudflare Radar seed/RPC/map layer into the SignalMap primary layer; only add missing contract fields or tests.
5. Extend the existing service-status handler for Cloudflare Status incidents, Okta, Microsoft 365, Azure, and Wasabi provider-region detail.
6. Add My Regions/My Providers watchlist filtering and prioritization using local storage first.
7. Formalize source policy around the existing feed/source-tier/allowlist data.
8. Build the Python collector only for gaps the existing RSS/GDELT/seed stack does not cover; call `distill` for approved URLs instead of duplicating extraction logic.
9. Add or revise server RPCs for normalized Radar signals, provider status signals, and geocoded story events.
10. Add the SignalMap event inspector panel.
11. Run UI revamp against the stable signal contracts.

## Open Items

| Item | Status | Blocking |
|------|--------|----------|
| Exact domain | UNKNOWN | Yes |
| Whether accounts/preferences survive | UNKNOWN | Yes |
| Cloudflare Radar token scope, limits, and sample payloads | UNKNOWN | Yes |
| Provider feed sample fixtures for Okta, Microsoft 365, Azure, Wasabi | UNKNOWN | Yes |
| Region watchlist storage mode | UNKNOWN | Yes |
| LLM provider/runtime | UNKNOWN | Yes |
| Python-only vs Python plus Node `distill` | UNKNOWN | Yes |
| Approved source list and extraction permissions | UNKNOWN | Yes |
| Desktop/Tauri scope | UNKNOWN | No, if web-only |
| MCP public access policy | UNKNOWN | No, can be deferred |
