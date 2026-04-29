# SignalMap v2 Legacy Inventory — Kill List

> **Status: APPROVED 2026-04-26 by malinda@fleetcam.com.** All 12 open questions
> resolved (see §6). One worker classification corrected:
> `docs/api/SignalMapService.openapi.{yaml,json}` moved to **keep**.
>
> Phase 9 may execute archive / delete per the buckets below.
>
> Generated: 2026-04-26
> Audit method: systematic Grep + find enumeration.

---

## 1. Summary Table

| Bucket  | File count | Notes |
|---------|-----------|-------|
| keep    | ~45        | SignalMap product surface: collector pipeline, services, types, config, Redis adapter, API endpoints, Docker runtime, discovery docs, kept infra |
| rename  | 4          | Four SignalMap UI class components — path changes in Phase 8 when they move into `src/components/{shell,feed,inspector,status-strips}/` |
| archive | ~480       | Non-SignalMap functionality revivable from `archive/v1-legacy` branch: legacy panels, variant system, SaaS (auth/billing/MCP/briefs/OAuth/notifications), all legacy API endpoints, server domain handlers, generated clients/servers, Tauri desktop, seeders, tests, e2e snapshots, locales, blog-site, pro-test, convex, consumer-prices-core |
| delete  | ~30        | Pure dead weight: variant build scripts, temp fixture files, e2e golden PNG snapshots for variant layers, abandoned test HTML harnesses, `scripts/_sigterm-once-fixture-*.mjs` temp file |

> File counts are approximate — `node_modules/` trees, lock files, and generated lock directories are excluded. The counts cover source + config + test + doc files the team owns.

---

## 2. Keep (SignalMap product surface)

| Path | Why keep | Notes |
|------|----------|-------|
| `scripts/signalmap-news-collector.mjs` | Collector pipeline — Phase 1 core | unchanged |
| `scripts/signalmap-lancedb-store.mjs` | LanceDB vector store for signals | unchanged |
| `scripts/signalmap-openrouter-parser.mjs` | LLM parse step in collector | unchanged |
| `scripts/signalmap-embedding-model.mjs` | Embedding model helper used by collector | unchanged |
| `scripts/signalmap-geocoder.mjs` | Geo-enrichment step in collector | unchanged |
| `scripts/signalmap-distill-bridge.mjs` | Distill bridge — wires collector output to Redis | unchanged |
| `docs/api/SignalMapService.openapi.yaml` | SignalMap OpenAPI contract (YAML form) — drives generated client/server stubs | added 2026-04-26 sign-off (worker initially missed) |
| `docs/api/SignalMapService.openapi.json` | SignalMap OpenAPI contract (JSON form) — same source-of-truth | added 2026-04-26 sign-off |
| `src/services/signalmap.ts` | Core SignalMap data service | unchanged |
| `src/services/signalmap-watchlist.ts` | Watchlist service | unchanged |
| `src/types/signalmap.ts` | SignalMap TypeScript types | unchanged |
| `src/config/signalmap.ts` | SignalMap config (provider list, polling intervals) | unchanged |
| `src/components/SignalMapShell.ts` | Shell component — rewritten Preact in Phase 4, data wiring kept | rename in Phase 8 |
| `src/components/SignalMapFeed.ts` | Feed component — same as above | rename in Phase 8 |
| `src/components/SignalMapInspector.ts` | Inspector component — same | rename in Phase 8 |
| `src/components/SignalMapStatusStrips.ts` | Status strips — same | rename in Phase 8 |
| `src/server/lib/redis.types.ts` | New Redis adapter contract (Phase 3) | unchanged |
| `tests/redis-adapter-contract.test.mts` | Redis adapter contract test | unchanged |
| `src/services/runtime.ts` | Generic env wrappers — used by SignalMap services | unchanged |
| `src/utils/sync-keys.ts` | Key sync utility — used by collector pipeline | unchanged |
| `api/health.js` | Health endpoint — used by SignalMap Docker runtime | unchanged |
| `api/bootstrap.js` | Bootstrap endpoint — used by SignalMap UI shell | unchanged |
| `api/signalmap/v1/[rpc].ts` | SignalMap RPC API entry point | keep |
| `src/generated/server/worldmonitor/signalmap/v1/service_server.ts` | Generated server stub for SignalMap v1 | keep |
| `src/generated/client/worldmonitor/signalmap/v1/service_client.ts` | Generated client stub for SignalMap v1 | keep |
| `server/worldmonitor/signalmap/v1/handler.ts` | SignalMap RPC handler | keep |
| `server/worldmonitor/signalmap/v1/list-signals.ts` | list-signals RPC implementation | keep |
| `server/worldmonitor/signalmap/v1/_provider-status.ts` | Provider status helper | keep |
| `server/worldmonitor/signalmap/v1/_radar.ts` | Radar aggregation helper | keep |
| `tests/signalmap-docker-runtime.test.mjs` | Docker runtime smoke test | keep |
| `tests/signalmap-lancedb-store.test.mjs` | LanceDB store unit test | keep |
| `tests/signalmap-llm-schema.test.mjs` | LLM schema contract test | keep |
| `tests/signalmap-news-collector.test.mjs` | News collector unit test | keep |
| `tests/signalmap-provider-status.test.mjs` | Provider status test | keep |
| `tests/signalmap-public-access.test.mjs` | Public access guard test | keep |
| `tests/signalmap-radar-normalization.test.mjs` | Radar normalization test | keep |
| `tests/signalmap-rpc-shell.test.mjs` | RPC shell contract test | keep |
| `tests/signalmap-watchlist.test.mjs` | Watchlist service test | keep |
| `tests/fixtures/signalmap/azure-status.xml` | SignalMap test fixture | keep |
| `tests/fixtures/signalmap/cloudflare-radar-anomaly.json` | SignalMap test fixture | keep |
| `tests/fixtures/signalmap/cloudflare-radar-outage.json` | SignalMap test fixture | keep |
| `tests/fixtures/signalmap/cloudflare-status-summary.json` | SignalMap test fixture | keep |
| `tests/fixtures/signalmap/m365-status.xml` | SignalMap test fixture | keep |
| `tests/fixtures/signalmap/okta-status.xml` | SignalMap test fixture | keep |
| `tests/fixtures/signalmap/wasabi-status.xml` | SignalMap test fixture | keep |
| `tests/runtime-env-guards.test.mjs` | Runtime env guard test — will be edited in Phase 7 to drop variant assertions | keep (edit in Phase 7) |
| `docker/Dockerfile.signalmap` | SignalMap Docker image definition | keep |
| `docker/supervisord.signalmap.conf` | Supervisor config for SignalMap container | keep |
| `docker/signalmap-entrypoint.sh` | Entrypoint script for SignalMap container | keep |
| `docker-compose.signalmap.yml` | Docker Compose for SignalMap runtime | keep |
| `docker/nginx.conf` | Nginx config — shared by SignalMap container | keep |
| `docs/SignalMap/_discovery/` (entire directory) | Discovery artifacts — reference for Phase 2 + 6 | keep as-is |
| `docs/SignalMap/spec.md` | v2 spec | keep |
| `docs/SignalMap/handoff.md` | v2 handoff | keep |
| `docs/SignalMap/design-summary.md` | v2 design | keep |
| `docs/SignalMap/deployment.md` | Deployment guide | keep |
| `docs/SignalMap/PROGRESS.md` | Phase tracker | keep |
| `docs/SignalMap/testing-harness.md` | Testing harness spec | keep |
| `docs/SignalMap/distill-reference.md` | Distill bridge reference | keep |
| `docs/SignalMap/council-report-2026-04-26.md` | Architecture council report | keep |
| `docs/SignalMap/claude-design-prompt-signalmap.md` | Design prompt | keep |
| `docs/SignalMap/Claude_Design/` (entire directory) | Preact UI mockup reference for Phase 4 | keep |
| `vite.config.ts` | Build config — will be heavily simplified in Phase 5 | keep (edit in Phase 5) |
| `tsconfig.json` | TypeScript root config | keep |
| `tsconfig.api.json` | API TypeScript config | keep |
| `biome.json` | Linter config | keep |
| `package.json` | Root package manifest — scripts will be pruned in Phase 5 | keep (edit in Phase 5) |
| `proto/worldmonitor/signalmap/` (entire directory) | SignalMap protobuf definitions | keep |
| `proto/buf.yaml` | Buf config | keep |
| `proto/buf.gen.yaml` | Buf code-gen config | keep |
| `proto/buf.lock` | Buf lockfile | keep |

---

## 3. Rename (UI-facing in Phase 8)

Phase 8 moves the four SignalMap components into sub-folder paths and drops the redundant `SignalMap` prefix (the product is SignalMap, so the prefix is noise once they live inside `src/components/signalmap/`).

| Current path → New path | Why rename | Notes |
|------------------------|------------|-------|
| `src/components/SignalMapShell.ts` → `src/components/signalmap/Shell.ts` | Follows Phase 8 folder convention | Preact rewrite happens in Phase 4; rename in Phase 8 |
| `src/components/SignalMapFeed.ts` → `src/components/signalmap/Feed.ts` | Same | |
| `src/components/SignalMapInspector.ts` → `src/components/signalmap/Inspector.ts` | Same | |
| `src/components/SignalMapStatusStrips.ts` → `src/components/signalmap/StatusStrips.ts` | Same | |

---

## 4. Archive (revive from `archive/v1-legacy` branch if needed)

These files represent functioning WorldMap/WorldMonitor v1 functionality that has no role in SignalMap v2 but has revival value if the user ever re-activates a legacy mode or spins up a WorldMap-compatible build.

### 4a. Variant system

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `src/config/variant.ts` | Reads `VITE_VARIANT` env; exports active variant | low | Core of the variant switching system |
| `src/config/variant-meta.ts` | Variant metadata (display names, feature flags) | low | |
| `src/config/panels.ts` | Default panel layouts per variant | med | ~200 panel entries |
| `src/config/variants/base.ts` | Base variant definition | low | |
| `src/config/variants/commodity.ts` | Commodity variant | low | |
| `src/config/variants/energy.ts` | Energy variant | low | |
| `src/config/variants/finance.ts` | Finance variant | low | |
| `src/config/variants/full.ts` | Full variant | low | |
| `src/config/variants/happy.ts` | Happy/positive-news variant | low | |
| `src/config/variants/tech.ts` | Tech variant | low | |

### 4b. App-level wiring (WorldMap shell)

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `src/App.ts` | Root app class — mounts all panels, handles layout | high | Wires 100+ panels; depends on variant system |
| `src/app/panel-layout.ts` | Panel layout engine | high | |
| `src/app/data-loader.ts` | Parallel data loading orchestrator | high | |
| `src/app/event-handlers.ts` | Global keyboard/click/resize handlers | med | |
| `src/app/search-manager.ts` | Panel search / quick-switch | med | |
| `src/app/desktop-updater.ts` | Tauri auto-update bridge | med | Desktop only |
| `src/app/country-intel.ts` | Country intel modal orchestration | med | |
| `src/app/app-context.ts` | Global app context store | med | |
| `src/app/index.ts` | App barrel | low | |
| `src/app/pending-panel-data.ts` | Pending data queue | med | |
| `src/app/refresh-scheduler.ts` | Panel refresh scheduler | med | |
| `src/main.ts` | App entry point | high | |
| `src/settings-main.ts` | Settings window entry point | med | |
| `src/settings-window.ts` | Settings window root | med | |
| `index.html` | Main HTML entry | med | |
| `settings.html` | Settings HTML entry | med | |
| `live-channels.html` | Live channels HTML entry | med | |

### 4c. Legacy panel components (107 panel files)

All `src/components/*Panel.ts` files that are not SignalMap panels. Each is a self-contained panel widget for the WorldMap v1 grid layout.

| Path | What it does | Revival cost |
|------|-------------|-------------|
| `src/components/AAIISentimentPanel.ts` | AAII investor sentiment survey | low |
| `src/components/AirlineIntelPanel.ts` | Airline intelligence (flight prices, ops) | low |
| `src/components/BigMacPanel.ts` | Big Mac index purchasing-power display | low |
| `src/components/BreakthroughsTickerPanel.ts` | Scientific breakthroughs ticker | low |
| `src/components/CIIPanel.ts` | Containership Freight Rate Index | low |
| `src/components/CascadePanel.ts` | Infrastructure cascade risk panel | med |
| `src/components/ChatAnalystPanel.ts` | AI chat analyst panel (Claude/OpenAI) | med |
| `src/components/ChokepointStripPanel.ts` | Chokepoint risk strip | low |
| `src/components/ClimateAnomalyPanel.ts` | Climate anomaly display | low |
| `src/components/ClimateNewsPanel.ts` | Climate-focused news feed | low |
| `src/components/ConsumerPricesPanel.ts` | Consumer prices / grocery basket | med |
| `src/components/CorrelationPanel.ts` | Signal correlation display | med |
| `src/components/CotPositioningPanel.ts` | CFTC COT futures positioning | low |
| `src/components/CountersPanel.ts` | Humanity counters panel | low |
| `src/components/CountryBriefPanel.ts` | Country brief digest | med |
| `src/components/CountryDeepDivePanel.ts` | Full country deep dive | high |
| `src/components/CountryDeepDivePanel-news-utils.ts` | News utilities for country deep dive | low |
| `src/components/CrossSourceSignalsPanel.ts` | Cross-source signal aggregation | med |
| `src/components/CustomWidgetPanel.ts` | User-defined widget panel | med |
| `src/components/DailyMarketBriefPanel.ts` | Daily market brief | med |
| `src/components/DeductionPanel.ts` | AI deduction / scenario panel | med |
| `src/components/DefensePatentsPanel.ts` | Defense patent activity | low |
| `src/components/DisasterCorrelationPanel.ts` | Disaster-market correlation | low |
| `src/components/DiseaseOutbreaksPanel.ts` | Disease outbreak tracker | low |
| `src/components/DisplacementPanel.ts` | Displacement / refugee data | low |
| `src/components/ETFFlowsPanel.ts` | ETF fund flows | low |
| `src/components/EarningsCalendarPanel.ts` | Earnings calendar | low |
| `src/components/EconomicCalendarPanel.ts` | Economic event calendar | low |
| `src/components/EconomicCorrelationPanel.ts` | Economic correlation | low |
| `src/components/EconomicPanel.ts` | Macro economic data | low |
| `src/components/EnergyComplexPanel.ts` | Energy complex overview | low |
| `src/components/EnergyCrisisPanel.ts` | Energy crisis tracking | low |
| `src/components/EnergyDisruptionsPanel.ts` | Energy disruption events | low |
| `src/components/EscalationCorrelationPanel.ts` | Conflict escalation correlation | low |
| `src/components/FSIPanel.ts` | Financial Stress Index | low |
| `src/components/FaoFoodPriceIndexPanel.ts` | FAO food price index | low |
| `src/components/FearGreedPanel.ts` | Fear & Greed index | low |
| `src/components/ForecastPanel.ts` | AI forecast panel | med |
| `src/components/FuelPricesPanel.ts` | Fuel prices | low |
| `src/components/FuelShortagePanel.ts` | Fuel shortage alerts | low |
| `src/components/GdeltIntelPanel.ts` | GDELT intelligence | low |
| `src/components/GeoHubsPanel.ts` | Geographic hubs map | low |
| `src/components/GivingPanel.ts` | Humanitarian giving data | low |
| `src/components/GoldIntelligencePanel.ts` | Gold market intelligence | low |
| `src/components/GoodThingsDigestPanel.ts` | Positive news digest | low |
| `src/components/GroceryBasketPanel.ts` | Grocery basket price tracker | med |
| `src/components/GulfEconomiesPanel.ts` | Gulf region economies | low |
| `src/components/HeroSpotlightPanel.ts` | Hero spotlight (human interest) | low |
| `src/components/HormuzPanel.ts` | Strait of Hormuz tracker | low |
| `src/components/InsightsPanel.ts` | AI insights panel | med |
| `src/components/InternetDisruptionsPanel.ts` | Internet outage tracker | low |
| `src/components/InvestmentsPanel.ts` | Investment flows | low |
| `src/components/LatestBriefPanel.ts` | Latest brief display | med |
| `src/components/LiquidityShiftsPanel.ts` | Liquidity shift signals | low |
| `src/components/LiveNewsPanel.ts` | Live news feed | med |
| `src/components/LiveWebcamsPanel.ts` | Live webcam feeds | low |
| `src/components/MacroSignalsPanel.ts` | Macro signals overview | low |
| `src/components/MacroTilesPanel.ts` | Macro tiles grid | low |
| `src/components/MarketBreadthPanel.ts` | Market breadth indicators | low |
| `src/components/MarketImplicationsPanel.ts` | AI market implications | med |
| `src/components/MarketPanel.ts` | Markets overview panel | med |
| `src/components/McpDataPanel.ts` | MCP data panel | med |
| `src/components/MilitaryCorrelationPanel.ts` | Military-market correlation | low |
| `src/components/MonitorPanel.ts` | Custom monitor panel | low |
| `src/components/NationalDebtPanel.ts` | National debt ticker | low |
| `src/components/NewsPanel.ts` | Main news feed | high |
| `src/components/OilInventoriesPanel.ts` | Oil inventories | low |
| `src/components/OrefSirensPanel.ts` | Israel OREF siren alerts | low |
| `src/components/Panel.ts` | Base Panel class | high — all panels depend on this |
| `src/components/PinnedWebcamsPanel.ts` | Pinned webcams | low |
| `src/components/PipelineStatusPanel.ts` | Pipeline status | low |
| `src/components/PopulationExposurePanel.ts` | Population exposure to hazards | low |
| `src/components/PositioningPanel.ts` | Market positioning | low |
| `src/components/PositiveNewsFeedPanel.ts` | Positive news feed | low |
| `src/components/PredictionPanel.ts` | Prediction market panel | low |
| `src/components/ProgressChartsPanel.ts` | UN progress charts | low |
| `src/components/RadiationWatchPanel.ts` | Radiation monitoring | low |
| `src/components/RegulationPanel.ts` | Regulatory actions | low |
| `src/components/RenewableEnergyPanel.ts` | Renewable energy data | low |
| `src/components/RuntimeConfigPanel.ts` | Runtime config panel | med |
| `src/components/SanctionsPressurePanel.ts` | Sanctions pressure | low |
| `src/components/SatelliteFiresPanel.ts` | Satellite fire detections | low |
| `src/components/SecurityAdvisoriesPanel.ts` | Security advisories | low |
| `src/components/ServiceStatusPanel.ts` | Service status (cloud providers) | low |
| `src/components/SocialVelocityPanel.ts` | Social velocity signals | low |
| `src/components/SpeciesComebackPanel.ts` | Species recovery news | low |
| `src/components/StablecoinPanel.ts` | Stablecoin market data | low |
| `src/components/StatusPanel.ts` | System status panel | low |
| `src/components/StockAnalysisPanel.ts` | Stock analysis AI | med |
| `src/components/StockBacktestPanel.ts` | Stock backtest AI | med |
| `src/components/StorageFacilityMapPanel.ts` | Storage facility map | low |
| `src/components/StrategicPosturePanel.ts` | Strategic posture | low |
| `src/components/StrategicRiskPanel.ts` | Strategic risk | low |
| `src/components/SupplyChainPanel.ts` | Supply chain overview | med |
| `src/components/TechEventsPanel.ts` | Tech events calendar | low |
| `src/components/TechHubsPanel.ts` | Tech hubs map | low |
| `src/components/TechReadinessPanel.ts` | Tech readiness indices | low |
| `src/components/TelegramIntelPanel.ts` | Telegram intelligence feed | med |
| `src/components/ThermalEscalationPanel.ts` | Thermal escalation index | low |
| `src/components/TradePolicyPanel.ts` | Trade policy / tariffs | low |
| `src/components/UcdpEventsPanel.ts` | UCDP conflict events | low |
| `src/components/WsbTickerScannerPanel.ts` | WallStreetBets ticker scanner | low |
| `src/components/WorldClockPanel.ts` | World clock | low |
| `src/components/YieldCurvePanel.ts` | Yield curve display | low |

### 4d. Non-panel legacy components

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `src/components/AuthHeaderWidget.ts` | Auth header widget (Clerk) | low | SaaS-only |
| `src/components/AuthLauncher.ts` | Auth launch modal (Clerk) | low | SaaS-only |
| `src/components/AviationCommandBar.ts` | Aviation command bar | low | |
| `src/components/BreakingNewsBanner.ts` | Breaking news banner | low | |
| `src/components/CommunityWidget.ts` | Community link widget | low | |
| `src/components/CountryBriefPage.ts` | Country brief standalone page | med | |
| `src/components/CountryIntelModal.ts` | Country intel modal | med | |
| `src/components/CountryTimeline.ts` | Country event timeline | low | |
| `src/components/DeckGLMap.ts` | DeckGL map layer renderer | high | Core map engine |
| `src/components/DownloadBanner.ts` | Desktop download banner | low | |
| `src/components/FrameworkSelector.ts` | Analysis framework selector | low | |
| `src/components/GlobeMap.ts` | 3D globe component | high | Core map engine |
| `src/components/IntelligenceGapBadge.ts` | Intelligence gap indicator | low | |
| `src/components/LlmStatusIndicator.ts` | LLM health status badge | low | |
| `src/components/Map.ts` | Map base class | high | |
| `src/components/MapContainer.ts` | Map container | high | |
| `src/components/MapContextMenu.ts` | Map right-click menu | low | |
| `src/components/MapPopup.ts` | Map popup | low | |
| `src/components/McpConnectModal.ts` | MCP connect modal | low | |
| `src/components/MobileWarningModal.ts` | Mobile warning modal | low | |
| `src/components/PizzIntIndicator.ts` | Pizzint intelligence indicator | low | |
| `src/components/PlaybackControl.ts` | Map playback control | low | |
| `src/components/ProBanner.ts` | Pro upgrade banner | low | SaaS-only |
| `src/components/RegionalIntelligenceBoard.ts` | Regional intelligence board | med | |
| `src/components/ResilienceWidget.ts` | Resilience widget | low | |
| `src/components/RouteExplorer/` (entire directory) | Supply chain route explorer | high | 11 files |
| `src/components/SearchModal.ts` | Panel search modal | low | |
| `src/components/SignalModal.ts` | Signal detail modal | low | Check: may be needed by SignalMapInspector |
| `src/components/StoryModal.ts` | Story share modal | low | |
| `src/components/UnifiedSettings.ts` | Settings panel | med | |
| `src/components/VerificationChecklist.ts` | Verification checklist | low | |
| `src/components/VirtualList.ts` | Virtual list utility | low | |
| `src/components/WidgetChatModal.ts` | Widget chat modal | low | |
| `src/components/checkout-failure-banner.ts` | Checkout failure banner | low | SaaS-only |
| `src/components/payment-failure-banner.ts` | Payment failure banner | low | SaaS-only |
| `src/components/regional-intelligence-board-utils.ts` | RIB utilities | low | |
| `src/components/resilience-choropleth-utils.ts` | Resilience choropleth utils | low | |
| `src/components/resilience-widget-utils.ts` | Resilience widget utils | low | |
| `src/components/index.ts` | Component barrel export | low | |
| `src/components/TelegramIntelPanel.ts` | (listed again for completeness) | med | |

### 4e. Variant-consumed config files (non-SignalMap)

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `src/config/ai-datacenters.ts` | AI datacenter geo data | low | Tech variant |
| `src/config/ai-regulations.ts` | AI regulation data | low | Tech variant |
| `src/config/ai-research-labs.ts` | AI research lab locations | low | Tech variant |
| `src/config/airports.ts` | Airport data | low | Aviation panels |
| `src/config/apt-groups.ts` | APT cyber group data | low | Cyber panel |
| `src/config/basemap.ts` | Basemap style config | low | Map component |
| `src/config/bases-expanded.ts` | Expanded military base data | low | |
| `src/config/beta.ts` | Beta feature flags | low | |
| `src/config/bypass-corridors.ts` | Trade bypass corridor data | low | |
| `src/config/chokepoint-registry.ts` | Chokepoint registry | low | |
| `src/config/cii-colors.ts` | CII color scale | low | |
| `src/config/commands.ts` | Command palette entries | low | |
| `src/config/commodity-geo.ts` | Commodity geographic data | low | |
| `src/config/commodity-markets.ts` | Commodity market symbols | low | |
| `src/config/commodity-miners.ts` | Mining company data | low | |
| `src/config/countries.ts` | Country metadata | low | May be needed by SignalMap geocoder — see Open Questions |
| `src/config/entities.ts` | Entity definitions | low | |
| `src/config/feeds.ts` | RSS/feed configurations | low | |
| `src/config/finance-geo.ts` | Finance geo data | low | Finance variant |
| `src/config/geo.ts` | General geo config | low | |
| `src/config/gulf-fdi.ts` | Gulf FDI data | low | |
| `src/config/hs2-sectors.ts` | HS2 trade sector codes | low | |
| `src/config/index.ts` | Config barrel | low | |
| `src/config/irradiators.ts` | Radiation monitoring sites | low | |
| `src/config/map-layer-definitions.ts` | Map layer definitions per variant | high | Variant-specific |
| `src/config/markets.ts` | Market symbol lists | low | |
| `src/config/military-base-colors.ts` | Military base color scheme | low | |
| `src/config/military.ts` | Military data | low | |
| `src/config/mineral-colors.ts` | Mineral color scheme | low | |
| `src/config/ml-config.ts` | ML inference config | low | |
| `src/config/pipelines.ts` | Pipeline geo data | low | |
| `src/config/ports.ts` | Port data | low | |
| `src/config/products.ts` | Product/tier definitions | low | SaaS-only |
| `src/config/products.generated.ts` | Generated product config | low | SaaS-only |
| `src/config/push.ts` | Push notification config | low | |
| `src/config/scenario-templates.ts` | Scenario templates | low | |
| `src/config/startup-ecosystems.ts` | Startup ecosystem data | low | Tech variant |
| `src/config/tech-companies.ts` | Tech company data | low | Tech variant |
| `src/config/tech-geo.ts` | Tech geographic data | low | Tech variant |
| `src/config/trade-routes.ts` | Trade route data | low | |

### 4f. SaaS-only services (auth, billing, notifications, MCP, etc.)

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `src/services/api-keys.ts` | API key management (Convex) | med | SaaS |
| `src/services/auth-state.ts` | Auth state (Clerk) | med | SaaS |
| `src/services/billing.ts` | Billing state (DodoPayments) | med | SaaS |
| `src/services/checkout.ts` | Checkout flow orchestration | med | SaaS |
| `src/services/checkout-attempt.ts` | Checkout attempt tracking | low | SaaS |
| `src/services/checkout-banner-state.ts` | Checkout banner state | low | SaaS |
| `src/services/checkout-duplicate-dialog.ts` | Duplicate checkout guard | low | SaaS |
| `src/services/checkout-error-toast.ts` | Checkout error toasts | low | SaaS |
| `src/services/checkout-errors.ts` | Checkout error classification | low | SaaS |
| `src/services/checkout-no-user-policy.ts` | No-user checkout policy | low | SaaS |
| `src/services/checkout-plan-names.ts` | Plan name mapping | low | SaaS |
| `src/services/checkout-return.ts` | Post-checkout return handling | low | SaaS |
| `src/services/checkout-sentry-policy.ts` | Checkout Sentry policy | low | SaaS |
| `src/services/clerk.ts` | Clerk auth client | low | SaaS |
| `src/services/convex-client.ts` | Convex client | low | SaaS |
| `src/services/entitlements.ts` | Entitlement checks (Clerk/Convex) | med | SaaS |
| `src/services/entitlement-watchdog.ts` | Entitlement watchdog | low | SaaS |
| `src/services/notification-channels.ts` | Notification channel preferences | low | SaaS |
| `src/services/notifications-settings.ts` | Notification settings | low | SaaS |
| `src/services/push-notifications.ts` | Web Push subscriptions | low | SaaS |
| `src/services/referral.ts` | Referral program | low | SaaS |
| `src/services/referral-capture.ts` | Referral capture | low | SaaS |
| `src/services/user-identity.ts` | User identity (Clerk) | low | SaaS |
| `src/services/mcp-store.ts` | MCP connection store | low | MCP |
| `src/services/webmcp.ts` | WebMCP service | low | MCP |
| `src/services/telegram-intel.ts` | Telegram intelligence | med | Third-party |
| `src/services/story-share.ts` | Story sharing (OG) | low | |
| `src/services/premium-fetch.ts` | Premium-gated fetch | low | SaaS |

### 4g. Other non-SignalMap services

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `src/services/activity-tracker.ts` | User activity tracking | low | |
| `src/services/ai-classify-queue.ts` | AI classification queue | med | |
| `src/services/ai-flow-settings.ts` | AI flow settings | low | |
| `src/services/analysis-core.ts` | Analysis core engine | med | |
| `src/services/analysis-framework-store.ts` | Analysis framework store | low | |
| `src/services/analysis-worker.ts` | Analysis web worker | med | |
| `src/services/analytics.ts` | Analytics (Sentry/Vercel) | low | |
| `src/services/aviation/index.ts` | Aviation service | low | |
| `src/services/aviation/watchlist.ts` | Aviation watchlist | low | |
| `src/services/bootstrap.ts` | Bootstrap service | low | |
| `src/services/breaking-news-alerts.ts` | Breaking news alerts | low | |
| `src/services/cable-activity.ts` | Submarine cable activity | low | |
| `src/services/cable-health.ts` | Cable health monitoring | low | |
| `src/services/cached-risk-scores.ts` | Cached risk scores | low | |
| `src/services/cached-theater-posture.ts` | Cached theater posture | low | |
| `src/services/celebration.ts` | Celebration events | low | |
| `src/services/climate-air-quality.ts` | Climate air quality | low | |
| `src/services/climate/index.ts` | Climate service | low | |
| `src/services/climate/ocean-ice.ts` | Ocean ice data | low | |
| `src/services/clustering.ts` | Map clustering service | low | |
| `src/services/conflict/index.ts` | Conflict service | low | |
| `src/services/conservation-data.ts` | Conservation data | low | |
| `src/services/consumer-prices/index.ts` | Consumer prices | low | |
| `src/services/correlation-engine/` (all files) | Correlation engine | med | |
| `src/services/correlation.ts` | Correlation service | low | |
| `src/services/country-geometry.ts` | Country geometry | low | |
| `src/services/country-instability.ts` | Country instability | low | |
| `src/services/cross-module-integration.ts` | Cross-module integration | low | |
| `src/services/cross-source-signals.ts` | Cross-source signals | low | |
| `src/services/cyber/index.ts` | Cyber service | low | |
| `src/services/daily-market-brief.ts` | Daily market brief | med | |
| `src/services/data-freshness.ts` | Data freshness tracking | low | |
| `src/services/desktop-readiness.ts` | Desktop readiness | low | Tauri |
| `src/services/disease-outbreaks.ts` | Disease outbreak data | low | |
| `src/services/displacement/index.ts` | Displacement service | low | |
| `src/services/earthquakes.ts` | Earthquake data | low | |
| `src/services/economic/index.ts` | Economic service | low | |
| `src/services/entity-extraction.ts` | Entity extraction | med | |
| `src/services/entity-index.ts` | Entity index | low | |
| `src/services/eonet.ts` | NASA EONET events | low | |
| `src/services/feed-date.ts` | Feed date utilities | low | |
| `src/services/focal-point-detector.ts` | Focal point detection | low | |
| `src/services/font-settings.ts` | Font settings | low | |
| `src/services/forecast.ts` | Forecast service | med | |
| `src/services/gdelt-intel.ts` | GDELT intelligence | low | |
| `src/services/geo-activity.ts` | Geo activity service | low | |
| `src/services/geo-convergence.ts` | Geo convergence | low | |
| `src/services/geo-hub-index.ts` | Geo hub index | low | |
| `src/services/giving/index.ts` | Giving service | low | |
| `src/services/globe-render-settings.ts` | Globe render settings | low | |
| `src/services/gps-interference.ts` | GPS interference data | low | |
| `src/services/happiness-data.ts` | Happiness data | low | |
| `src/services/happy-share-renderer.ts` | Happy share renderer | low | |
| `src/services/health-air-quality.ts` | Health air quality | low | |
| `src/services/hormuz-tracker.ts` | Hormuz tracker | low | |
| `src/services/hotspot-escalation.ts` | Hotspot escalation | low | |
| `src/services/hub-activity-scoring.ts` | Hub activity scoring | low | |
| `src/services/humanity-counters.ts` | Humanity counters | low | |
| `src/services/i18n.ts` | i18next service | low | Goes with locales |
| `src/services/imagery.ts` | Satellite imagery | low | |
| `src/services/imf-country-data.ts` | IMF country data | low | |
| `src/services/index.ts` | Service barrel | low | |
| `src/services/infrastructure-cascade.ts` | Infrastructure cascade | low | |
| `src/services/infrastructure/index.ts` | Infrastructure service | low | |
| `src/services/insider-transactions.ts` | Insider transactions | low | |
| `src/services/insights-loader.ts` | Insights loader | med | |
| `src/services/intelligence/index.ts` | Intelligence service | low | |
| `src/services/investments-focus.ts` | Investments focus | low | |
| `src/services/kindness-data.ts` | Kindness / positive data | low | |
| `src/services/live-news.ts` | Live news service | med | |
| `src/services/live-stream-settings.ts` | Live stream settings | low | |
| `src/services/maritime/index.ts` | Maritime service | low | |
| `src/services/market-implications.ts` | Market implications AI | med | |
| `src/services/market-watchlist.ts` | Market watchlist | low | |
| `src/services/market/index.ts` | Market service | low | |
| `src/services/meta-tags.ts` | Meta tag management | low | |
| `src/services/military-bases.ts` | Military base service | low | |
| `src/services/military-flights.ts` | Military flight tracking | low | |
| `src/services/military-surge.ts` | Military surge detection | low | |
| `src/services/military-vessels.ts` | Military vessel tracking | low | |
| `src/services/military/index.ts` | Military service | low | |
| `src/services/ml-capabilities.ts` | ML capabilities | low | |
| `src/services/ml-worker.ts` | ML web worker | low | |
| `src/services/news/index.ts` | News service | med | |
| `src/services/ollama-models.ts` | Ollama local models | low | |
| `src/services/oref-alerts.ts` | OREF alert service | low | |
| `src/services/oref-locations.ts` | OREF locations | low | |
| `src/services/panel-gating.ts` | Panel feature gating | low | |
| `src/services/parallel-analysis.ts` | Parallel analysis | low | |
| `src/services/persistent-cache.ts` | Persistent IndexedDB cache | low | |
| `src/services/pizzint.ts` | Pizzint indicator | low | |
| `src/services/population-exposure.ts` | Population exposure | low | |
| `src/services/positive-classifier.ts` | Positive event classifier | low | |
| `src/services/positive-events-geo.ts` | Positive events geo | low | |
| `src/services/prediction/index.ts` | Prediction market service | low | |
| `src/services/preferences-content.ts` | Preferences content | low | |
| `src/services/progress-data.ts` | Progress data (SDG) | low | |
| `src/services/radiation.ts` | Radiation service | low | |
| `src/services/related-assets.ts` | Related assets | low | |
| `src/services/renewable-energy-data.ts` | Renewable energy data | low | |
| `src/services/renewable-installations.ts` | Renewable installations | low | |
| `src/services/research/index.ts` | Research service | low | |
| `src/services/resilience.ts` | Resilience index service | med | |
| `src/services/rpc-client.ts` | Generic RPC client | low | |
| `src/services/rss.ts` | RSS feed service | low | |
| `src/services/runtime-config.ts` | Runtime config service | low | |
| `src/services/sanctions-pressure.ts` | Sanctions pressure | low | |
| `src/services/satellites.ts` | Satellite data | low | |
| `src/services/scenario/index.ts` | Scenario service | low | |
| `src/services/security-advisories.ts` | Security advisories | low | |
| `src/services/sentiment-gate.ts` | Sentiment gate | low | |
| `src/services/settings-constants.ts` | Settings constants | low | |
| `src/services/settings-manager.ts` | Settings manager | low | |
| `src/services/signal-aggregator.ts` | Signal aggregation | low | |
| `src/services/social-velocity.ts` | Social velocity | low | |
| `src/services/stock-analysis.ts` | Stock analysis AI | med | |
| `src/services/stock-analysis-history.ts` | Stock analysis history | low | |
| `src/services/stock-backtest.ts` | Stock backtest AI | med | |
| `src/services/storage.ts` | Storage service | low | |
| `src/services/story-data.ts` | Story data | low | |
| `src/services/story-renderer.ts` | Story renderer | low | |
| `src/services/summarization.ts` | Summarization service | med | |
| `src/services/supply-chain/index.ts` | Supply chain service | med | |
| `src/services/tauri-bridge.ts` | Tauri IPC bridge | med | Desktop |
| `src/services/tech-activity.ts` | Tech activity | low | |
| `src/services/tech-hub-index.ts` | Tech hub index | low | |
| `src/services/temporal-baseline.ts` | Temporal baseline | low | |
| `src/services/thermal-escalation.ts` | Thermal escalation | low | |
| `src/services/threat-classifier.ts` | Threat classifier | med | |
| `src/services/throttled-target-requests.ts` | Throttled requests | low | |
| `src/services/trade/index.ts` | Trade service | low | |
| `src/services/trending-keywords.ts` | Trending keywords | low | |
| `src/services/tv-mode.ts` | TV/kiosk mode | low | |
| `src/services/unrest/index.ts` | Unrest service | low | |
| `src/services/usa-spending.ts` | USA spending data | low | |
| `src/services/usni-fleet.ts` | USNI fleet tracker | low | |
| `src/services/velocity.ts` | Velocity service | low | |
| `src/services/weather.ts` | Weather service | low | |
| `src/services/webcams/index.ts` | Webcam service | low | |
| `src/services/webcams/pinned-store.ts` | Pinned webcam store | low | |
| `src/services/widget-store.ts` | Widget store | low | |
| `src/services/wildfires/index.ts` | Wildfire service | low | |
| `src/services/wingbits.ts` | Wingbits ADS-B data | low | |

### 4h. Non-SignalMap API endpoints

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `api/_api-key.js` | API key validation helper | low | |
| `api/_cors.js` | CORS helper | low | |
| `api/_cors.test.mjs` | CORS test | low | |
| `api/_crypto.js` | Crypto helpers | low | |
| `api/_github-release.js` | GitHub release fetcher | low | |
| `api/_json-response.js` | JSON response helper | low | |
| `api/_oauth-token.js` | OAuth token helper | low | |
| `api/_product-fallback-prices.js` | Product fallback prices | low | SaaS |
| `api/_rate-limit.js` | Rate limit helper (Upstash) | low | |
| `api/_relay.js` | Relay helper | low | |
| `api/_rss-allowed-domains.js` | RSS domain allowlist | low | |
| `api/_seed-envelope.js` | Seed envelope helper | low | |
| `api/_sentry-edge.js` | Sentry edge helper | low | |
| `api/_upstash-json.js` | Upstash JSON helper | low | |
| `api/api-route-exceptions.json` | Route exception config | low | |
| `api/aviation/v1/[rpc].ts` | Aviation RPC | low | |
| `api/brief/[userId]/[issueDate].ts` | Brief API | med | SaaS/briefs |
| `api/brief/carousel/[userId]/[issueDate]/[page].ts` | Brief carousel | med | |
| `api/brief/public/[hash].ts` | Public brief | med | |
| `api/brief/share-url.ts` | Brief share URL | low | |
| `api/cache-purge.js` | Cache purge endpoint | low | |
| `api/chat-analyst.ts` | Chat analyst API | med | |
| `api/climate/v1/[rpc].ts` | Climate RPC | low | |
| `api/conflict/v1/[rpc].ts` | Conflict RPC | low | |
| `api/consumer-prices/v1/[rpc].ts` | Consumer prices RPC | low | |
| `api/create-checkout.ts` | Checkout creation | low | SaaS |
| `api/customer-portal.ts` | Customer portal | low | SaaS |
| `api/cyber/v1/[rpc].ts` | Cyber RPC | low | |
| `api/data/city-coords.ts` | City coords data | low | |
| `api/discord/oauth/callback.ts` | Discord OAuth callback | low | |
| `api/discord/oauth/start.ts` | Discord OAuth start | low | |
| `api/displacement/v1/[rpc].ts` | Displacement RPC | low | |
| `api/download.js` | Download handler | low | Desktop |
| `api/economic/v1/[rpc].ts` | Economic RPC | low | |
| `api/forecast/v1/[rpc].ts` | Forecast RPC | low | |
| `api/fwdstart.js` | Forward start | low | |
| `api/geo.js` | Geo lookup | low | |
| `api/giving/v1/[rpc].ts` | Giving RPC | low | |
| `api/gpsjam.js` | GPS jam proxy | low | |
| `api/health/v1/[rpc].ts` | Health service RPC | low | Note: distinct from `api/health.js` (keep) |
| `api/imagery/v1/[rpc].ts` | Imagery RPC | low | |
| `api/infrastructure/v1/[rpc].ts` | Infrastructure RPC | low | |
| `api/intelligence/v1/[rpc].ts` | Intelligence RPC | low | |
| `api/internal/brief-why-matters.ts` | Brief why-matters endpoint | low | |
| `api/invalidate-user-api-key-cache.ts` | API key cache invalidation | low | |
| `api/latest-brief.ts` | Latest brief endpoint | low | SaaS |
| `api/leads/v1/[rpc].ts` | Leads RPC | low | |
| `api/loaders-xml-wms-regression.test.mjs` | Loader regression test | low | |
| `api/maritime/v1/[rpc].ts` | Maritime RPC | low | |
| `api/market/v1/[rpc].ts` | Market RPC | low | |
| `api/mcp-proxy.js` | MCP proxy | low | |
| `api/mcp.ts` | MCP API endpoint | low | |
| `api/me/entitlement.ts` | User entitlement | low | SaaS |
| `api/military/v1/[rpc].ts` | Military RPC | low | |
| `api/natural/v1/[rpc].ts` | Natural events RPC | low | |
| `api/news/v1/[rpc].ts` | News RPC | low | |
| `api/notification-channels.ts` | Notification channels | low | SaaS |
| `api/notify.ts` | Notification sender | low | SaaS |
| `api/oauth-protected-resource.ts` | OAuth resource | low | |
| `api/oauth/authorize.js` | OAuth authorize | low | |
| `api/oauth/register.js` | OAuth register | low | |
| `api/oauth/token.js` | OAuth token | low | |
| `api/og-story.js` | OG story image | low | |
| `api/og-story.test.mjs` | OG story test | low | |
| `api/opensky.js` | OpenSky ADS-B proxy | low | |
| `api/oref-alerts.js` | OREF alerts proxy | low | |
| `api/polymarket.js` | Polymarket proxy | low | |
| `api/positive-events/v1/[rpc].ts` | Positive events RPC | low | |
| `api/prediction/v1/[rpc].ts` | Prediction RPC | low | |
| `api/product-catalog.js` | Product catalog | low | SaaS |
| `api/radiation/v1/[rpc].ts` | Radiation RPC | low | |
| `api/referral/me.ts` | Referral endpoint | low | SaaS |
| `api/research/v1/[rpc].ts` | Research RPC | low | |
| `api/resilience/v1/[rpc].ts` | Resilience RPC | low | |
| `api/reverse-geocode.js` | Reverse geocode proxy | low | |
| `api/rss-proxy.js` | RSS proxy | low | |
| `api/sanctions/v1/[rpc].ts` | Sanctions RPC | low | |
| `api/scenario/v1/[rpc].ts` | Scenario RPC | low | |
| `api/scenario/v1/run.ts` | Scenario run | low | |
| `api/scenario/v1/status.ts` | Scenario status | low | |
| `api/scenario/v1/templates.ts` | Scenario templates | low | |
| `api/seed-contract-probe.ts` | Seed contract probe | low | |
| `api/seed-health.js` | Seed health | low | |
| `api/seismology/v1/[rpc].ts` | Seismology RPC | low | |
| `api/skills/fetch-agentskills.ts` | Agent skills | low | |
| `api/slack/oauth/callback.ts` | Slack OAuth callback | low | |
| `api/slack/oauth/start.ts` | Slack OAuth start | low | |
| `api/story.js` | Story endpoint | low | |
| `api/supply-chain/hormuz-tracker.js` | Hormuz tracker | low | |
| `api/supply-chain/v1/[rpc].ts` | Supply chain RPC | low | |
| `api/supply-chain/v1/country-products.ts` | Country products | low | |
| `api/supply-chain/v1/multi-sector-cost-shock.ts` | Cost shock | low | |
| `api/telegram-feed.js` | Telegram feed proxy | low | |
| `api/thermal/v1/[rpc].ts` | Thermal RPC | low | |
| `api/trade/v1/[rpc].ts` | Trade RPC | low | |
| `api/unrest/v1/[rpc].ts` | Unrest RPC | low | |
| `api/user-prefs.ts` | User preferences | low | SaaS |
| `api/v2/shipping/[rpc].ts` | Shipping v2 RPC | low | |
| `api/v2/shipping/webhooks/[subscriberId].ts` | Shipping webhooks | low | |
| `api/v2/shipping/webhooks/[subscriberId]/[action].ts` | Shipping webhook action | low | |
| `api/version.js` | Version endpoint | low | |
| `api/webcam/v1/[rpc].ts` | Webcam RPC | low | |
| `api/widget-agent.ts` | Widget agent | low | |
| `api/wildfire/v1/[rpc].ts` | Wildfire RPC | low | |
| `api/youtube/embed.js` | YouTube embed proxy | low | |
| `api/youtube/embed.test.mjs` | YouTube embed test | low | |
| `api/youtube/live.js` | YouTube live proxy | low | |

### 4i. Server-side domain handlers (non-SignalMap)

The entire `server/` tree except `server/worldmonitor/signalmap/v1/` is v1 legacy. This is approximately 320 files covering aviation, climate, conflict, consumer-prices, cyber, displacement, economic, forecast, giving, health (v1 RPC), imagery, infrastructure, intelligence, leads, maritime, market, military, natural, news, positive-events, prediction, radiation, research, resilience, sanctions, scenario, seismology, shipping, supply-chain, thermal, trade, unrest, webcam, wildfire — plus all `server/_shared/` helpers.

| Path | What it does | Revival cost |
|------|-------------|-------------|
| `server/_shared/` (all ~40 files) | Shared server utilities (auth, redis, relay, brief, entitlement, etc.) | high |
| `server/worldmonitor/aviation/v1/` (all files) | Aviation RPC handlers | low |
| `server/worldmonitor/climate/v1/` | Climate handlers | low |
| `server/worldmonitor/conflict/v1/` | Conflict handlers | low |
| `server/worldmonitor/consumer-prices/v1/` | Consumer prices handlers | low |
| `server/worldmonitor/cyber/v1/` | Cyber handlers | low |
| `server/worldmonitor/displacement/v1/` | Displacement handlers | low |
| `server/worldmonitor/economic/v1/` | Economic handlers | low |
| `server/worldmonitor/forecast/v1/` | Forecast handlers | med |
| `server/worldmonitor/giving/v1/` | Giving handlers | low |
| `server/worldmonitor/health/v1/` | Health RPC handlers | low |
| `server/worldmonitor/imagery/v1/` | Imagery handlers | low |
| `server/worldmonitor/infrastructure/v1/` | Infrastructure handlers | low |
| `server/worldmonitor/intelligence/v1/` | Intelligence handlers | med |
| `server/worldmonitor/leads/v1/` | Leads handlers | low |
| `server/worldmonitor/maritime/v1/` | Maritime handlers | low |
| `server/worldmonitor/market/v1/` | Market handlers | med |
| `server/worldmonitor/military/v1/` | Military handlers | low |
| `server/worldmonitor/natural/v1/` | Natural events handlers | low |
| `server/worldmonitor/news/v1/` | News handlers | med |
| `server/worldmonitor/positive-events/v1/` | Positive events handlers | low |
| `server/worldmonitor/prediction/v1/` | Prediction handlers | low |
| `server/worldmonitor/radiation/v1/` | Radiation handlers | low |
| `server/worldmonitor/research/v1/` | Research handlers | low |
| `server/worldmonitor/resilience/v1/` | Resilience handlers | med |
| `server/worldmonitor/sanctions/v1/` | Sanctions handlers | low |
| `server/worldmonitor/scenario/v1/` | Scenario handlers | low |
| `server/worldmonitor/seismology/v1/` | Seismology handlers | low |
| `server/worldmonitor/shipping/v2/` | Shipping v2 handlers | low |
| `server/worldmonitor/supply-chain/v1/` | Supply chain handlers | med |
| `server/worldmonitor/thermal/v1/` | Thermal handlers | low |
| `server/worldmonitor/trade/v1/` | Trade handlers | low |
| `server/worldmonitor/unrest/v1/` | Unrest handlers | low |
| `server/worldmonitor/webcam/v1/` | Webcam handlers | low |
| `server/worldmonitor/wildfire/v1/` | Wildfire handlers | low |
| `server/alias-rewrite.ts` | Alias rewrite middleware | low |
| `server/auth-session.ts` | Auth session middleware | low |
| `server/cors.ts` | CORS middleware | low |
| `server/env.d.ts` | Server env types | low |
| `server/error-mapper.ts` | Error mapper | low |
| `server/gateway.ts` | Gateway router | low |
| `server/router.ts` | Server router | low |
| `server/worldmonitor/_bootstrap-cache-key-refs.ts` | Bootstrap cache key refs | low |
| `server/__tests__/entitlement-check.test.ts` | Entitlement test | low |

### 4j. Generated clients and servers (non-SignalMap)

All generated stubs except `signalmap/v1/`.

| Path group | What it does | Revival cost |
|-----------|-------------|-------------|
| `src/generated/client/worldmonitor/aviation/v1/` | Aviation client | low |
| `src/generated/client/worldmonitor/climate/v1/` | Climate client | low |
| `src/generated/client/worldmonitor/conflict/v1/` | Conflict client | low |
| `src/generated/client/worldmonitor/consumer_prices/v1/` | Consumer prices client | low |
| `src/generated/client/worldmonitor/cyber/v1/` | Cyber client | low |
| `src/generated/client/worldmonitor/displacement/v1/` | Displacement client | low |
| `src/generated/client/worldmonitor/economic/v1/` | Economic client | low |
| `src/generated/client/worldmonitor/forecast/v1/` | Forecast client | low |
| `src/generated/client/worldmonitor/giving/v1/` | Giving client | low |
| `src/generated/client/worldmonitor/health/v1/` | Health client | low |
| `src/generated/client/worldmonitor/imagery/v1/` | Imagery client | low |
| `src/generated/client/worldmonitor/infrastructure/v1/` | Infrastructure client | low |
| `src/generated/client/worldmonitor/intelligence/v1/` | Intelligence client | low |
| `src/generated/client/worldmonitor/leads/v1/` | Leads client | low |
| `src/generated/client/worldmonitor/maritime/v1/` | Maritime client | low |
| `src/generated/client/worldmonitor/market/v1/` | Market client | low |
| `src/generated/client/worldmonitor/military/v1/` | Military client | low |
| `src/generated/client/worldmonitor/natural/v1/` | Natural client | low |
| `src/generated/client/worldmonitor/news/v1/` | News client | low |
| `src/generated/client/worldmonitor/positive_events/v1/` | Positive events client | low |
| `src/generated/client/worldmonitor/prediction/v1/` | Prediction client | low |
| `src/generated/client/worldmonitor/radiation/v1/` | Radiation client | low |
| `src/generated/client/worldmonitor/research/v1/` | Research client | low |
| `src/generated/client/worldmonitor/resilience/v1/` | Resilience client | low |
| `src/generated/client/worldmonitor/sanctions/v1/` | Sanctions client | low |
| `src/generated/client/worldmonitor/scenario/v1/` | Scenario client | low |
| `src/generated/client/worldmonitor/seismology/v1/` | Seismology client | low |
| `src/generated/client/worldmonitor/shipping/v2/` | Shipping v2 client | low |
| `src/generated/client/worldmonitor/supply_chain/v1/` | Supply chain client | low |
| `src/generated/client/worldmonitor/thermal/v1/` | Thermal client | low |
| `src/generated/client/worldmonitor/trade/v1/` | Trade client | low |
| `src/generated/client/worldmonitor/unrest/v1/` | Unrest client | low |
| `src/generated/client/worldmonitor/webcam/v1/` | Webcam client | low |
| `src/generated/client/worldmonitor/wildfire/v1/` | Wildfire client | low |
| `src/generated/server/worldmonitor/aviation/v1/` | Aviation server | low |
| (same pattern for all non-signalmap domains …) | | low |

### 4k. Proto definitions (non-SignalMap)

| Path | What it does | Revival cost |
|------|-------------|-------------|
| `proto/worldmonitor/aviation/` | Aviation protos | low |
| `proto/worldmonitor/climate/` | Climate protos | low |
| `proto/worldmonitor/conflict/` | Conflict protos | low |
| `proto/worldmonitor/consumer_prices/` | Consumer prices protos | low |
| `proto/worldmonitor/core/` | Core protos | low |
| `proto/worldmonitor/cyber/` | Cyber protos | low |
| `proto/worldmonitor/displacement/` | Displacement protos | low |
| `proto/worldmonitor/economic/` | Economic protos | low |
| `proto/worldmonitor/forecast/` | Forecast protos | low |
| `proto/worldmonitor/giving/` | Giving protos | low |
| `proto/worldmonitor/health/` | Health protos | low |
| `proto/worldmonitor/imagery/` | Imagery protos | low |
| `proto/worldmonitor/infrastructure/` | Infrastructure protos | low |
| `proto/worldmonitor/intelligence/` | Intelligence protos | low |
| `proto/worldmonitor/leads/` | Leads protos | low |
| `proto/worldmonitor/maritime/` | Maritime protos | low |
| `proto/worldmonitor/market/` | Market protos | low |
| `proto/worldmonitor/military/` | Military protos | low |
| `proto/worldmonitor/natural/` | Natural protos | low |
| `proto/worldmonitor/news/` | News protos | low |
| `proto/worldmonitor/positive_events/` | Positive events protos | low |
| `proto/worldmonitor/prediction/` | Prediction protos | low |
| `proto/worldmonitor/radiation/` | Radiation protos | low |
| `proto/worldmonitor/research/` | Research protos | low |
| `proto/worldmonitor/resilience/` | Resilience protos | low |
| `proto/worldmonitor/sanctions/` | Sanctions protos | low |
| `proto/worldmonitor/scenario/` | Scenario protos | low |
| `proto/worldmonitor/seismology/` | Seismology protos | low |
| `proto/worldmonitor/shipping/` | Shipping protos | low |
| `proto/worldmonitor/supply_chain/` | Supply chain protos | low |
| `proto/worldmonitor/thermal/` | Thermal protos | low |
| `proto/worldmonitor/trade/` | Trade protos | low |
| `proto/worldmonitor/unrest/` | Unrest protos | low |
| `proto/worldmonitor/webcam/` | Webcam protos | low |
| `proto/worldmonitor/wildfire/` | Wildfire protos | low |
| `proto/sebuf/` | Sebuf HTTP annotation protos | low |

### 4l. Locales (i18next going away)

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `src/locales/en.json` + `.d.ts` | English locale strings | low | All 20 languages + type defs |
| `src/locales/ar.json` + `.d.ts` | Arabic | low | RTL |
| `src/locales/bg.json` | Bulgarian | low | |
| `src/locales/cs.json` | Czech | low | |
| `src/locales/de.json` | German | low | |
| `src/locales/el.json` | Greek | low | |
| `src/locales/es.json` + `.d.ts` | Spanish | low | |
| `src/locales/fr.json` | French | low | |
| `src/locales/it.json` + `.d.ts` | Italian | low | |
| `src/locales/ja.json` | Japanese | low | |
| `src/locales/ko.json` | Korean | low | |
| `src/locales/nl.json` + `.d.ts` | Dutch | low | |
| `src/locales/pl.json` + `.d.ts` | Polish | low | |
| `src/locales/pt.json` + `.d.ts` | Portuguese | low | |
| `src/locales/ro.json` | Romanian | low | |
| `src/locales/ru.json` + `.d.ts` | Russian | low | |
| `src/locales/sv.json` + `.d.ts` | Swedish | low | |
| `src/locales/th.json` + `.d.ts` | Thai | low | |
| `src/locales/tr.json` + `.d.ts` | Turkish | low | |
| `src/locales/vi.json` + `.d.ts` | Vietnamese | low | |
| `src/locales/zh.json` + `.d.ts` | Chinese | low | |

### 4m. Tauri (desktop) — entire subtree

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `src-tauri/` (entire directory) | Tauri v2 Rust shell + desktop config | high | ~60 files incl. Cargo.lock, icons, capabilities |
| `src-tauri/tauri.conf.json` | Default Tauri config | high | |
| `src-tauri/tauri.finance.conf.json` | Finance variant Tauri config | low | |
| `src-tauri/tauri.tech.conf.json` | Tech variant Tauri config | low | |
| `src-tauri/sidecar/local-api-server.mjs` | Local API sidecar server | high | |
| `src-tauri/src/main.rs` | Tauri main Rust file | high | |
| `scripts/desktop-package.mjs` | Desktop packaging script | med | |
| `scripts/sync-desktop-version.mjs` | Version sync for desktop | low | |
| `scripts/build-sidecar-sebuf.mjs` | Sidecar sebuf build | low | |
| `scripts/build-sidecar-handlers.mjs` | Sidecar handler build | low | |

### 4n. Sub-projects (blog-site, pro-test, convex, consumer-prices-core)

| Path | What it does | Revival cost | Notes |
|------|-------------|-------------|-------|
| `blog-site/` (entire directory) | Astro marketing blog | med | Marketing asset |
| `pro-test/` (entire directory) | Pro landing page test | low | ~10 source files + node_modules |
| `convex/` (entire directory) | Convex backend (auth, billing, API keys) | high | ~35 files; Clerk + DodoPayments integration |
| `consumer-prices-core/` (entire directory) | Consumer prices scraper sub-project | med | Separate Docker container, independent codebase |

### 4o. Non-SignalMap scripts (seeder scripts and their helpers)

The entire `scripts/` tree except the 6 SignalMap scripts (kept). Approximately 250 files covering ~100 seed scripts, regional-snapshot workers, resilience validation scripts, brief pipeline, notification relay, shared data files.

Notable groups:
- `scripts/lib/` — brief LLM pipeline helpers
- `scripts/regional-snapshot/` — regional snapshot workers (~12 files)
- `scripts/shared/` — shared data (country names, commodities, crypto, etc.)
- `scripts/data/` — static JSON data files
- `scripts/seed-*.mjs` (100+ files) — all seeder scripts for legacy panels
- `scripts/notification-relay.cjs` — Notification relay daemon

### 4p. API OpenAPI specs (non-SignalMap)

| Path | What it does | Revival cost |
|------|-------------|-------------|
| `docs/api/AviationService.openapi.json/yaml` | Aviation API spec | low |
| `docs/api/ClimateService.openapi.json/yaml` | Climate API spec | low |
| `docs/api/ConflictService.openapi.json/yaml` | Conflict API spec | low |
| `docs/api/ConsumerPricesService.openapi.json/yaml` | Consumer prices API spec | low |
| `docs/api/CyberService.openapi.json/yaml` | Cyber API spec | low |
| `docs/api/DisplacementService.openapi.json/yaml` | Displacement API spec | low |
| `docs/api/EconomicService.openapi.json/yaml` | Economic API spec | low |
| `docs/api/ForecastService.openapi.json/yaml` | Forecast API spec | low |
| (… all remaining 30+ non-SignalMap service specs …) | | low |

### 4q. Legacy tests (non-SignalMap)

The majority of `tests/*.test.*` files cover legacy panel, seeder, SaaS, and infrastructure functionality. Archive the ~270 non-SignalMap test files. Key groups:

- `tests/brief-*.test.*` — Brief/digest pipeline tests (~15 files)
- `tests/checkout-*.test.mts` — Checkout/billing tests (~8 files)
- `tests/resilience-*.test.mts` — Resilience index tests (~40 files)
- `tests/seed-*.test.mjs` — Seeder contract tests (~25 files)
- `tests/supply-chain-*.test.*` — Supply chain tests (~7 files)
- `tests/regional-snapshot-*.test.*` — Regional snapshot tests (~7 files)
- `tests/market-*.test.*` — Market tests (~5 files)
- All other domain-specific tests (aviation, climate, conflict, cyber, etc.)
- `tests/helpers/` (except `fake-upstash-redis.mts` — see Open Questions)
- `tests/fixtures/` (all non-signalmap fixtures)

### 4r. E2E tests and snapshots

| Path | What it does | Revival cost |
|------|-------------|-------------|
| `e2e/auth-ui.spec.ts` | Auth UI e2e | low |
| `e2e/circuit-breaker-persistence.spec.ts` | Circuit breaker e2e | low |
| `e2e/deduct-situation.spec.ts` | Deduction e2e | low |
| `e2e/investments-panel.spec.ts` | Investments panel e2e | low |
| `e2e/keyword-spike-flow.spec.ts` | Keyword spike e2e | low |
| `e2e/map-harness.spec.ts` | Map harness e2e | high — visual baseline |
| `e2e/map-harness.spec.ts-snapshots/` (60 PNG files) | Golden screenshot baselines | low — regenerate from scratch |
| `e2e/mobile-map-native.spec.ts` | Mobile map e2e | low |
| `e2e/mobile-map-popup.spec.ts` | Mobile map popup e2e | low |
| `e2e/rag-vector-store.spec.ts` | RAG vector store e2e | low |
| `e2e/runtime-fetch.spec.ts` | Runtime fetch e2e | low |
| `e2e/theme-toggle.spec.ts` | Theme toggle e2e | low |
| `e2e/tsconfig.json` | E2E TypeScript config | low |
| `e2e/widget-builder.spec.ts` | Widget builder e2e | low |
| `e2e/signalmap.spec.ts` | SignalMap e2e | **keep** — SignalMap product |

### 4s. Bootstrap CSS, styles (variant-specific)

| Path | What it does | Revival cost |
|------|-------------|-------------|
| `src/styles/base-layer.css` | Base CSS layer | med |
| `src/styles/country-deep-dive.css` | Country deep dive styles | low |
| `src/styles/happy-theme.css` | Happy variant theme | low |
| `src/styles/main.css` | Main CSS (references all panels) | high |
| `src/styles/map-context-menu.css` | Map context menu | low |
| `src/styles/panels.css` | Panel base styles | high |
| `src/styles/route-explorer.css` | Route explorer styles | low |
| `src/styles/rtl-overrides.css` | RTL overrides (i18n) | low |
| `src/styles/settings-window.css` | Settings window styles | low |
| `src/styles/supply-chain-panel.css` | Supply chain styles | low |

### 4t. Shared utilities (non-SignalMap)

| Path | What it does | Revival cost |
|------|-------------|-------------|
| `src/utils/analysis-constants.ts` | Analysis constants | low |
| `src/utils/analyst-markdown.ts` | Analyst markdown renderer | low |
| `src/utils/attribution-footer.ts` | Attribution footer | low |
| `src/utils/circuit-breaker.ts` | Circuit breaker utility | low |
| `src/utils/cloud-prefs-sync.ts` | Cloud prefs sync | low |
| `src/utils/country-codes.ts` | Country code utilities | low |
| `src/utils/country-flag.ts` | Country flag renderer | low |
| `src/utils/cross-domain-storage.ts` | Cross-domain storage | low |
| `src/utils/distance.ts` | Distance calculations | low |
| `src/utils/dom-utils.ts` | DOM utilities | low |
| `src/utils/embedded-preview.ts` | Embedded preview | low |
| `src/utils/export.ts` | Data export | low |
| `src/utils/format-intel-brief.ts` | Brief formatter | low |
| `src/utils/hash.ts` | Hash utilities | low |
| `src/utils/hs2-ring-chart.ts` | HS2 ring chart | low |
| `src/utils/imagery-preview.ts` | Imagery preview | low |
| `src/utils/index.ts` | Utils barrel | low |
| `src/utils/keyword-match.ts` | Keyword matching | low |
| `src/utils/layer-warning.ts` | Layer warning | low |
| `src/utils/map-locale.ts` | Map locale | low |
| `src/utils/news-context.ts` | News context | low |
| `src/utils/proxy.ts` | Proxy utility | low |
| `src/utils/reverse-geocode.ts` | Reverse geocode | low |
| `src/utils/sanitize.ts` | Input sanitization | low |
| `src/utils/settings-persistence.ts` | Settings persistence | low |
| `src/utils/signal-quality.ts` | Signal quality | low |
| `src/utils/sparkline.ts` | Sparkline renderer | low |
| `src/utils/storage-quota.ts` | Storage quota | low |
| `src/utils/summary-cache-key.ts` | Summary cache key | low |
| `src/utils/supplier-route-risk.ts` | Supplier route risk | low |
| `src/utils/theme-colors.ts` | Theme colors | low |
| `src/utils/theme-manager.ts` | Theme manager | low |
| `src/utils/transit-chart.ts` | Transit chart | low |
| `src/utils/urlState.ts` | URL state sync | low |
| `src/utils/user-location.ts` | User location | low |
| `src/utils/utm.ts` | UTM tracking | low |
| `src/utils/widget-sanitizer.ts` | Widget sanitizer | low |

### 4u. Misc root-level files

| Path | What it does | Revival cost |
|------|-------------|-------------|
| `Dockerfile` | Main Docker image (full WorldMap) | med |
| `Dockerfile.digest-notifications` | Digest notification Docker | low |
| `Dockerfile.relay` | Relay Docker | low |
| `Dockerfile.seed-bundle-portwatch-port-activity` | Seed Docker | low |
| `Dockerfile.seed-bundle-resilience-validation` | Seed Docker | low |
| `docker-compose.yml` | Main Docker Compose (non-SignalMap) | med |
| `docker/Dockerfile` | Docker build | med |
| `docker/Dockerfile.redis-rest` | Redis REST Docker | low |
| `docker/build-handlers.mjs` | Handler builder | low |
| `docker/docker-entrypoint.sh` | Docker entrypoint (legacy) | low |
| `docker/entrypoint.sh` | Docker entrypoint | low |
| `docker/nginx-security-headers.conf` | Nginx security headers | low |
| `docker/nginx.conf.template` | Nginx template | low |
| `docker/redis-rest-proxy.mjs` | Redis REST proxy | low |
| `docker/supervisord.conf` | Supervisord (legacy) | low |
| `vercel.json` | Vercel deployment config | low |
| `middleware.ts` | Vercel edge middleware (auth/variant) | med |
| `brief-palette-playground.html` | Brief palette dev tool | low |
| `playwright.config.ts` | Playwright config (all variants) | low |
| `vitest.config.mts` | Vitest config (Convex tests) | low |
| `nixpacks.toml` | Nixpacks build config | low |
| `DEPLOYMENT-PLAN.md` | WorldMap deployment plan | low |
| `ARCHITECTURE.md` | WorldMap architecture doc | low |
| `CHANGELOG.md` | Changelog | low |
| `CONTRIBUTING.md` | Contributing guide | low |
| `SELF_HOSTING.md` | Self-hosting guide | low |
| `docs/WorldMap/` (entire directory) | WorldMap legacy docs | low |
| `docs/snapshots/` | Doc snapshots | low |
| `deploy/` | Nginx deploy configs | low |
| `compound-engineering.local.md` | Local engineering notes | low |
| `src/vite-env.d.ts` | Vite env type defs | low |
| `src/types/globe-gl.d.ts` | Globe GL types | low |
| `src/types/index.ts` | Types barrel | low |
| `src/workers/analysis.worker.ts` | Analysis web worker | low |
| `src/workers/ml.worker.ts` | ML web worker | low |
| `src/workers/vector-db.ts` | Vector DB worker | low |
| `src/shims/child-process-proxy.ts` | Child process shim | low |
| `src/shims/child-process.ts` | Child process shim | low |
| `src/bootstrap/chunk-reload.ts` | Chunk reload bootstrap | low |
| `src/bootstrap/sw-update.ts` | Service worker update bootstrap | low |
| `src/shared/` (all files) | Shared server/client modules | med |

---

## 5. Delete (no revival value)

| Path | Why delete | Notes |
|------|-----------|-------|
| `package.json` scripts: `dev:tech`, `dev:finance`, `dev:happy`, `dev:commodity`, `build:tech`, `build:finance`, `build:happy`, `build:commodity`, `build:full`, `test:e2e:full`, `test:e2e:tech`, `test:e2e:finance`, `test:e2e:visual:full`, `test:e2e:visual:tech`, `test:e2e:visual`, `test:e2e:visual:update:*`, `desktop:build:tech`, `desktop:build:finance`, `desktop:package:*:tech`, `desktop:package:*:finance`, `test:convex`, `test:convex:watch` | Variant build scripts and convex test scripts — rebuild from scratch if SignalMap ever needs variants | Edit `package.json`, do not archive the script entries |
| `scripts/_sigterm-once-fixture-1777116163265.mjs` | Temp fixture file generated by a test — timestamp in filename confirms it's not authored | Delete immediately |
| `e2e/map-harness.spec.ts-snapshots/*.png` (all 60 PNG files) | Golden screenshot baselines for variant layers (tech/finance/full) — will never be re-run in v2 | No revival value; large binary files |
| `tests/map-harness.html` | Abandoned manual test harness | |
| `tests/mobile-map-harness.html` | Abandoned manual test harness | |
| `tests/mobile-map-integration-harness.html` | Abandoned manual test harness | |
| `tests/runtime-harness.html` | Abandoned manual test harness | |
| `signalmap-loaded.png` | Root-level screenshot — appears to be a one-off capture, not a test artifact | |
| `scripts/need-work.csv` | Ad-hoc tracking spreadsheet | |
| `scripts/rss-feeds-report.csv` | RSS feeds report — static artifact, not a source file | |
| `tests/variant-layer-guardrail.test.mjs` | Tests the variant layer guardrail — guardrail itself is being deleted | |
| `tests/panel-config-guardrails.test.mjs` | Tests panel config guardrails — panels.ts config being archived | |
| `.github/workflows/build-desktop.yml` | Desktop build CI — Tauri going away | Archive is also fine if CI history matters |
| `.github/workflows/test-linux-app.yml` | Desktop test CI — Tauri going away | Same |

---

## 6. Open Questions — RESOLVED 2026-04-26

All 12 questions resolved by pit-boss (auto-resolution via grep verification) +
user (ambiguous case). Resolutions:

| # | Item | Resolution | Reasoning |
|---|------|------------|-----------|
| 1 | `src/components/SignalModal.ts` | **archive** | Not imported by `SignalMapInspector.ts` (grep verified) |
| 2 | `src/config/countries.ts` | **archive** | Not imported by any `signalmap-*` collector script (grep across `scripts/` shows 83 importers, none from SignalMap) |
| 3 | `tests/helpers/fake-upstash-redis.mts` | **archive** | Not referenced by any test file (grep verified). New Phase 2a Redis adapter test uses real `redis:7-alpine` container |
| 4 | `src/services/signal-aggregator.ts` | **archive** | File header: "feeds geographic context to AI Insights" — couples to legacy InsightsPanel, not SignalMap |
| 5 | `src/utils/signal-quality.ts` | **archive** | User decision 2026-04-26. Pure function (~90 lines) computing 4-tier ISQ score; only consumer is InsightsPanel (also archived). Revival cost ~30-60 min if SignalMap ever wants signal-prominence ranking (Phase-2 candidate) |
| 6 | `e2e/signalmap.spec.ts` | **keep, rewrite in Phase 4e** | File uses Playwright `mockSignalMapApi` v1 fixture harness; spec.md Phase 4e already calls for rewrite against new shell |
| 7 | `server/_shared/redis.ts` | **archive** | Not imported by `api/signalmap/*` (grep verified). Replaced by new `RedisAdapter` from Phase 0c |
| 8 | `middleware.ts` | **archive (recreate as simpler stub if needed)** | Currently does variant detection + auth routing. CF ZTNA at edge handles auth in v2; no variants. New stub may be needed for SSE-specific routing if nginx alone isn't sufficient |
| 9 | `src/shared/` directory | **archive** | Energy/pipeline panel server contracts (`premium-paths.ts`, `disruption-timeline.ts`, `pipeline-evidence.ts`); not consumed by SignalMap server handlers |
| 10 | `scripts/data/` static JSON files | **archive** | `signalmap-news-collector.mjs` does not reference `scripts/data/` (grep: no matches). Energy/pipeline static reference data |
| 11 | `docs/api/SignalMapService.openapi.{yaml,json}` | **KEEP** ⚠️ (worker missed) | Both files exist in `docs/api/`. This is the SignalMap API contract feeding `src/generated/{client,server}/worldmonitor/signalmap/v1/` stubs. Critical to preserve |
| 12 | `scripts/run-seeders.sh` | **archive** | SignalMap collector is a daemon (always-on cron loop), not a one-shot seed step. Orchestrator script is for legacy seed jobs |

### Sign-off

- Date: 2026-04-26
- Signer: malinda@fleetcam.com
- Phase 9 is unblocked to execute archive / delete per §2-§5 of this document plus the resolutions above.

---

## 6a. Original Open Questions (preserved for audit)

The original 12 questions the worker flagged for resolution:

1. **`src/components/SignalModal.ts`** — This could be the signal detail modal used by `SignalMapInspector.ts`. If `SignalMapInspector` calls `SignalModal`, this should be **keep** not archive. Needs a quick grep of SignalMapInspector's imports to confirm.

2. **`src/config/countries.ts`** — Contains country metadata used by many panels. The SignalMap geocoder (`scripts/signalmap-geocoder.mjs`) may import from here. If so, this should be **keep**. Needs import trace.

3. **`tests/helpers/fake-upstash-redis.mts`** — This mock is used by the Redis adapter contract test (keep). Confirm whether it is imported by `tests/redis-adapter-contract.test.mts`; if yes, **keep**.

4. **`src/services/signal-aggregator.ts`** — Name suggests SignalMap relevance. Needs a read to confirm whether it feeds into `signalmap.ts` or is a legacy WorldMap aggregation service.

5. **`src/utils/signal-quality.ts`** — Same concern as above. Could be used by the SignalMap pipeline.

6. **`e2e/signalmap.spec.ts`** — Listed as keep but needs confirmation that it tests the new v2 product and not a legacy integration harness.

7. **`server/_shared/redis.ts`** — Uses `@upstash/redis` directly (Upstash REST client). The new Redis adapter contract (`src/server/lib/redis.types.ts`) is a typed wrapper. Clarify whether `server/_shared/redis.ts` is still needed for SignalMap's server-side RPC handlers or replaced by the new adapter.

8. **`middleware.ts`** — Currently does variant detection + auth routing. After Phase 5 (vite simplification) this file needs a rewrite, not just archiving. Marking as "archive" is safe but it will need to be recreated as a simpler SignalMap-only middleware.

9. **`src/shared/` directory** — Contains `premium-paths.ts`, `disruption-timeline.ts`, `pipeline-evidence.ts`, etc. These look like shared server/client contracts for energy/pipeline panels. Likely archive, but confirm none are imported by SignalMap server handlers.

10. **`scripts/data/` static JSON files** — `cascade-rules.json`, `entity-graph.json`, `pipelines-gas.json`, `pipelines-oil.json` etc. are large static data files for legacy panels. Confirm none are imported by the SignalMap collector pipeline before archiving.

11. **`docs/api/SignalMapService.openapi.yaml` (if it exists)** — The glob for `docs/api/` shows OpenAPI specs for all domains. A SignalMap-specific OpenAPI spec, if it exists, should be kept. The current file list did not show one explicitly named `SignalMapService` — it may live under a different name or may not yet be generated.

12. **`scripts/run-seeders.sh`** — The SignalMap collector is not a seeder in the traditional sense, but this script orchestrates all seed jobs. If any SignalMap-specific seed step (e.g., initial LanceDB population) needs to be invoked from this script, it should be partially kept. Otherwise archive.

---

## 7. Verification Command

After Phase 9 archive/delete is complete, run this from the repo root to confirm the SignalMap product surface still type-checks and all SignalMap tests pass:

```bash
npm run typecheck:all && npm run test:data -- --testPathPattern="signalmap|redis-adapter"
```

If `npm run test:data` does not accept `--testPathPattern`, use:

```bash
npm run typecheck:all && node --test tests/signalmap-*.test.mjs tests/signalmap-*.test.mts tests/redis-adapter-contract.test.mts
```

Additionally, confirm the SignalMap Docker image still builds:

```bash
docker build -f docker/Dockerfile.signalmap -t signalmap-v2-smoke .
```

---

*This document is a proposal. No files were moved, deleted, or modified during its creation.*
