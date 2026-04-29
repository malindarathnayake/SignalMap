# Legacy Panel Documentation — Revival Contract

This document describes every panel and orchestration module that is being archived into the `archive/v1-legacy` branch as part of the Phase 9 migration to the SignalMap / Preact + signals architecture. Each section is a self-contained revival contract: if a future engineer wants to bring a panel back, reading the section for that panel should tell them exactly what files to restore, what services to re-wire, and how much effort to budget. Do not speculate from this document — every claim here was verified by reading the source file directly.

---

## Index

| Panel / Module | File path | Lines | Revival effort |
|---|---|---|---|
| NewsPanel | `src/components/NewsPanel.ts` | 866 | High |
| LiveNewsPanel | `src/components/LiveNewsPanel.ts` | 1792 | High |
| MarketPanel | `src/components/MarketPanel.ts` | 706 | Medium |
| InsightsPanel | `src/components/InsightsPanel.ts` | 843 | High |
| StatusPanel | `src/components/StatusPanel.ts` | 121 | Low |
| RegionalIntelligenceBoard | `src/components/RegionalIntelligenceBoard.ts` | 204 | Medium |
| UnifiedSettings | `src/components/UnifiedSettings.ts` | 1054 | High |
| panel-layout | `src/app/panel-layout.ts` | 2236 | High |
| data-loader | `src/app/data-loader.ts` | 3440 | High |
| event-handlers | `src/app/event-handlers.ts` | 1553 | High |
| settings-window | `src/settings-window.ts` | 104 | Low |

---

## NewsPanel

**File**: `src/components/NewsPanel.ts` (866 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

NewsPanel is the primary news feed display. The user sees a vertically scrolling list of news clusters — groups of related articles deduplicated and ranked by relevance or recency. Each cluster shows a headline, source tier badge, propagation-risk badge, velocity badge (breaking/surge/normal), related geopolitical assets (pipelines, cables, military bases), and a "NEW" tag for items that arrived since the last scroll. A sort toggle switches between relevance (ML-ranked) and newest-first ordering. A "Summarize" button in the header generates an LLM summary of the visible headlines using body text from RSS descriptions to ground the model. The panel also displays an AI deviation indicator in the header when the incoming news rate is statistically unusual.

### Data sources

- **Primary**: Driven externally — `data-loader.ts` calls `renderClusters(clusters: ClusteredEvent[])` or `renderFlat(items: NewsItem[])` on the panel instance after assembling data. No internal fetch.
- **Secondary**: `generateSummary()` from `@/services` is called on-demand when the user clicks the Summarize button; `translateText()` from `@/services` is called per-item when the translate button is clicked.

### Lifecycle

- **Mount**: `new NewsPanel(id, title, infoTooltip?)` — constructor calls `super({ id, title, showCount: true, trackActivity: true })`, then runs `createDeviationIndicator()`, `createSortToggle()`, `createSummarizeButton()`, `setupActivityTracking()`, `initWindowedList()`, and `setupContentDelegation()`. The DOM element is `this.element` (inherited from `Panel`). The caller (panel-layout) appends `panel.getElement()` into the grid.
- **Refresh**: Purely push-based. `data-loader.ts` calls `panel.renderClusters(clusters)` or `panel.renderFlat(items)` each time new data arrives (typically every 3–5 minutes per `loadNewsFeeds` in data-loader). The panel caches the last raw clusters/items in `this.lastRawClusters` / `this.lastRawItems` for the sort-toggle re-render. Virtual scrolling via `WindowedList` renders 8 items per chunk with a 1-chunk buffer.
- **Dispose**: `destroy()` (inherited from `Panel`) is expected to be called. The panel registers listeners via `activityTracker.register(panelId)` and attaches scroll/click handlers to `this.content` and `this.element`. These are stored in `boundScrollHandler` and `boundClickHandler` and should be removed on destroy, though the base class `Panel.destroy()` removes the DOM element which implicitly clears attached listeners.

### Watchlist coupling

Indirect: `data-loader.ts` pre-filters news clusters by topic/region before passing them to `renderClusters()`. The panel itself has no watchlist logic; it renders whatever clusters it receives. Related-asset overlays on map are triggered via callbacks set by `setRelatedAssetHandlers({ onRelatedAssetClick, onRelatedAssetsFocus, onRelatedAssetsClear })`.

### Error & empty states

- **Loading skeleton**: None — the panel remains empty until `renderClusters` or `renderFlat` is first called.
- **Empty state**: `showRetrying(message)` (from `Panel` base) is called by data-loader when the feed fetch fails; displays the message inline.
- **Error state**: Feed errors are surfaced by data-loader calling `panel.showRetrying()`. Within the panel, LLM summarization errors are swallowed silently (the summary container is hidden).

### Dependencies

- Imports from `src/services/`: `analysisWorker`, `enrichWithVelocityML`, `getClusterAssetContext`, `MAX_DISTANCE_KM`, `activityTracker`, `generateSummary`, `translateText`
- Imports from `src/types/`: `NewsItem`, `ClusteredEvent`, `DeviationLevel`, `RelatedAsset`, `RelatedAssetContext`
- Imports from `src/config/`: `THREAT_PRIORITY` (from `@/services/threat-classifier`), `getSourcePropagandaRisk`, `getSourceTier`, `getSourceType` (from `@/config/feeds`), `SITE_VARIANT` (from `@/config`)
- Imports from `src/components/`: `Panel` (base class), `WindowedList` (from `./VirtualList`)
- npm deps used: none direct (uses internal utilities `dompurify`-equivalent via `escapeHtml`/`sanitizeUrl` from `@/utils/sanitize`, `i18next`-equivalent via `t()`/`getCurrentLanguage()` from `@/services/i18n`)

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/components/NewsPanel.ts` and `src/components/VirtualList.ts` from `archive/v1-legacy` branch.
2. No additional npm deps — all dependencies are internal services.
3. Wire it into the new SignalMap shell: mount as a dedicated feed column in the main Inspector area or as a standalone route panel; call `panel.renderClusters(clusters)` from the new data pipeline.
4. Adapt to the Preact + signals architecture: the class extends vanilla `Panel`; port to a Preact `FunctionComponent` consuming a `signal<ClusteredEvent[]>`. The `WindowedList` virtual scroller will need a Preact-compatible equivalent or replacement.
5. Replace `localStorage.getItem`/`setItem` calls for sort-mode persistence (`wm_sort_${SITE_VARIANT}_${panelId}`) with the new `state/` signal pattern.
6. Replace `activityTracker.register(panelId)` + `onChange` subscription with the new activity/notification signal architecture.

**Estimated revival effort**: High — the panel has complex rendering (virtual scroll, cluster HTML builder, related-asset overlays, deviation indicator, sort toggle, summarize button with LLM). The rendering logic is largely self-contained but the data pipeline coupling to data-loader is pervasive.

### Notable quirks / known issues

- Line 43: `private sortMode!: SortMode` — definite assignment assertion; the value is set in `loadSortMode()` called from the constructor, but not in the declaration. TypeScript strictness requires the `!`.
- Line 54–56: Comment explains `currentBodies` is needed to prevent the summarization LLM from hallucinating across unrelated headlines. The grounding mechanism (feeding RSS descriptions alongside headlines) is non-obvious.
- Lines 78–93: `WindowedList` is initialized with `chunkSize: 8` and `bufferChunks: 1`. The `VIRTUAL_SCROLL_THRESHOLD = 15` constant (line 16) is defined but not referenced anywhere in the file — appears to be dead code (a threshold that was removed when virtual scrolling was made unconditional).
- The `setRiskScoreGetter` public method (line 63) wires in an optional per-cluster risk badge. It is set externally by data-loader; if omitted, risk badges are hidden.

---

## LiveNewsPanel

**File**: `src/components/LiveNewsPanel.ts` (1,792 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

LiveNewsPanel embeds 24/7 live broadcast news streams directly in the dashboard. The user sees a grid of video players showing channels such as Bloomberg, Sky News, Euronews, DW, CNBC, CNN, France 24, and many more across North America, Europe, Latin America, Asia, Middle East, and Africa (190+ optional channels total). Each cell shows the channel name; clicking activates the stream. Channels are played via the YouTube IFrame API (for YouTube-backed channels) or via a native `<video>` element for HLS/direct streams. The panel includes a settings drawer for managing the active channel list: users can reorder, add custom channels, and rename built-ins. Stream quality can be configured via an AI flow settings integration. An "Always On" toggle allows streams to play even when the tab is idle.

### Data sources

- **Primary**: `fetchLiveVideoInfo(channel)` from `@/services/live-news` — queries the backend for the current live video ID for each YouTube channel handle, with no fixed cadence (called once on mount and on manual refresh).
- **Secondary**: `getLocalApiPort()` / `getRemoteApiBaseUrl()` / `getApiBaseUrl()` from `@/services/runtime` — used to proxy HLS streams through the local backend to avoid CORS issues. `getStreamQuality()` from `@/services/ai-flow-settings` — controls YouTube playback quality.

### Lifecycle

- **Mount**: `new LiveNewsPanel(channels?: LiveChannel[])` — channels default to `loadChannelsFromStorage()`. The constructor calls `super()` on `Panel`, builds the channel grid DOM, initializes the YouTube IFrame API script tag if not already present, and assigns `window.onYouTubeIframeAPIReady`. DOM attachment: the caller appends `panel.getElement()` into the panel grid.
- **Refresh**: On `init()` / settings save, the panel calls `fetchLiveVideoInfo()` for each YouTube channel to detect if a live broadcast is active (vs. falling back to `fallbackVideoId`). Players are created lazily on channel cell click. The `subscribeLiveStreamsSettingsChange` callback in `@/services/live-stream-settings` re-triggers mounting when the "Always On" setting changes.
- **Dispose**: `destroy()` calls `player.destroy()` on every active `YouTubePlayer` instance and removes all HLS `<video>` elements. Idle-detection event listeners (`mousedown`, `keydown`, `scroll`, `touchstart`, `mousemove`) are removed. The `subscribeLiveStreamsSettingsChange` unsubscribe function is called.

### Watchlist coupling

None for watchlist regions/providers. Channel selection is user-managed via `STORAGE_KEYS.liveChannels` in localStorage. Geo-availability filtering is applied at the optional channel list level: channels with `geoAvailability: string[]` are filtered by the user's detected country code.

### Error & empty states

- **Loading skeleton**: Each channel cell shows the channel name and a spinner while the YouTube IFrame API loads.
- **Empty state**: If all channels are removed from the active list, the grid is empty. The settings drawer prompts the user to add channels.
- **Error state**: YouTube player `onError` events fall back to the `fallbackVideoId` for the channel. HLS streams that fail to load show the browser's native video error state. No toast is shown.

### Dependencies

- Imports from `src/services/`: `live-news` (`fetchLiveVideoInfo`), `runtime` (`isDesktopRuntime`, `getRemoteApiBaseUrl`, `getApiBaseUrl`, `getLocalApiPort`), `i18n` (`t`), `ai-flow-settings` (`getStreamQuality`), `live-stream-settings` (`getLiveStreamsAlwaysOn`, `setLiveStreamsAlwaysOn`, `subscribeLiveStreamsSettingsChange`), `analytics` (`track`)
- Imports from `src/types/`: none direct (YouTube types defined inline)
- Imports from `src/config/`: `IDLE_PAUSE_MS`, `STORAGE_KEYS`, `SITE_VARIANT`
- Imports from `src/components/`: `Panel` (base class)
- npm deps used: YouTube IFrame API (loaded dynamically via `<script>` tag at `https://www.youtube.com/iframe_api`); HLS playback via native `<video>` element (no external HLS.js — relies on browser-native HLS support or desktop passthrough).

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/components/LiveNewsPanel.ts` and `src/services/live-news.ts` and `src/services/live-stream-settings.ts` from `archive/v1-legacy` branch.
2. No extra npm deps for playback — YouTube uses dynamic script injection; HLS uses native `<video>`. The `ai-flow-settings` service must also be restored if stream quality control is desired.
3. Wire into the SignalMap shell: mount as a dedicated fullscreen panel or floating overlay. Call `new LiveNewsPanel(loadChannelsFromStorage())` and append the element.
4. Adapt to Preact + signals: the class is large and has significant imperative DOM manipulation (player grid, drag-to-reorder channel list, inline settings drawer). A port requires wrapping YouTube IFrame API calls in `useEffect` hooks and managing player refs.
5. The sort-mode / channel order is persisted in `localStorage` under `STORAGE_KEYS.liveChannels`. Replace with the new `state/` signal pattern.
6. No panel-layout coupling beyond a simple `getElement()` append.

**Estimated revival effort**: High — 1,792 lines with YouTube IFrame API lifecycle management, HLS native video, geo-filtering, drag-to-reorder settings UI, idle detection, and Always On mode. The channel data structures (`FULL_LIVE_CHANNELS`, `TECH_LIVE_CHANNELS`, `OPTIONAL_LIVE_CHANNELS`, `OPTIONAL_CHANNEL_REGIONS`) and `DIRECT_HLS_MAP` / `PROXIED_HLS_MAP` are all defined in this file and must be maintained.

### Notable quirks / known issues

- Lines 241–293: `DIRECT_HLS_MAP` contains 50+ hardcoded HLS manifest URLs for channels. These URLs are public streams that can go stale (CDN changes, network restructuring). They are not validated at build time. During development (line 303), a console error is logged for any `DIRECT_HLS_MAP` key that has no matching channel definition — a useful integrity check.
- Lines 296–299: `PROXIED_HLS_MAP` handles CNBC which requires a `Referer` header for CORS. The proxy passes the referer through the local backend. This only works in desktop runtime or when the backend proxy is available.
- The `geoAvailability` field on some channels (e.g., Phoenix for DE/AT/CH, NRK1 for NO) means those channels are filtered out for users outside those countries. If the user's country is unknown, all channels are shown.
- `SITE_VARIANT === 'happy'` results in an empty default channel list (line 205) — the happy variant never showed live news streams.

---

## MarketPanel

**File**: `src/components/MarketPanel.ts` (706 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

MarketPanel displays a real-time financial market ticker: stocks, indices, commodities, and crypto assets as a scrollable list of rows showing price, percentage change, and a sparkline mini-chart. A "Watchlist" button in the header opens a modal letting users add extra ticker symbols with optional friendly labels (e.g., `TSLA|Tesla`). The same file also exports `HeatmapPanel`, a sector performance heatmap with a tab-switching UI for "Performance" vs. "Valuations" (P/E, beta, YTD return). Note: `HeatmapPanel` is a separate class in the same file but documents its own functionality.

### Data sources

- **Primary**: Driven by `data-loader.ts` calling `panel.renderMarkets(data: MarketData[], rateLimited?)` — data comes from `fetchMultipleStocks()` / `fetchCommodityQuotes()` orchestrated in data-loader. Typical refresh cadence: every ~3 minutes.
- **Secondary**: `getMarketWatchlistEntries()` / `parseMarketWatchlistInput()` / `resetMarketWatchlist()` / `setMarketWatchlistEntries()` from `@/services/market-watchlist` — persisted in localStorage; used to extend the default ticker list.

### Lifecycle

- **Mount**: `new MarketPanel()` — no constructor args; calls `super({ id: 'markets', title: t('panels.markets') })` and `createSettingsButton()`. The Watchlist button is appended to `this.header`.
- **Refresh**: Push-based; `data-loader.ts` calls `renderMarkets(data)` on each market data fetch. The market watchlist change event (`wm-market-watchlist-changed`) is listened to in `data-loader.init()` which triggers a re-fetch and re-render.
- **Dispose**: The watchlist modal is removed from DOM when closed. No persistent listeners are registered by the panel itself beyond DOM delegation on the modal overlay.

### Watchlist coupling

Yes — via `getMarketWatchlistEntries()` from `@/services/market-watchlist`. The user's custom tickers are read by data-loader and merged into the request payload before fetching. The panel's watchlist modal writes to this service, which dispatches `wm-market-watchlist-changed` to trigger a data-loader reload.

### Error & empty states

- **Loading skeleton**: None.
- **Empty state**: `this.showRetrying(rateLimited ? t('common.rateLimitedMarket') : t('common.failedMarketData'))` — shown when `data.length === 0`.
- **Error state**: Same as empty state — market data failures call `showRetrying()`.

### Dependencies

- Imports from `src/services/`: `market-watchlist` (`getMarketWatchlistEntries`, `parseMarketWatchlistInput`, `resetMarketWatchlist`, `setMarketWatchlistEntries`)
- Imports from `src/types/`: `MarketData`, `CryptoData`, `TokenData`
- Imports from `src/config/`: `SITE_VARIANT`
- Imports from `src/components/`: `Panel` (base class)
- npm deps used: none direct — sparklines via `miniSparkline()` from `@/utils/sparkline` (internal)

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/components/MarketPanel.ts` and `src/services/market-watchlist.ts` and `src/utils/sparkline.ts` from `archive/v1-legacy` branch.
2. No external npm deps.
3. Wire into the SignalMap shell: mount in a market/finance-focused column. Call `renderMarkets(data)` from the new market data signal.
4. Adapt to Preact + signals: `renderMarkets` is a pure render function receiving `MarketData[]`; port to a Preact component consuming a `signal<MarketData[]>`. The watchlist modal can be a separate Preact modal component.
5. Replace `localStorage` watchlist access with the new `state/` pattern. The `wm-market-watchlist-changed` custom event dispatch should become a signal write.
6. `HeatmapPanel` is co-located in the same file; if reviving one, review whether both are needed.

**Estimated revival effort**: Medium — the rendering logic is straightforward (list of rows + sparklines). The main complexity is the watchlist modal and the HeatmapPanel co-location (706 lines total for both classes).

### Notable quirks / known issues

- Lines 148–206 define `HeatmapPanel` as a second exported class in the same file. The heatmap has a "Valuations" tab that is conditionally shown only when `_valuations` data is non-empty. The tab bar rendering at line 190 guards on `Object.keys(this._valuations).length > 0`.
- The modal overlay (`this.overlay`) uses a simple guard `if (this.overlay) return` to prevent double-open. This means if the modal DOM element is removed externally (e.g., by a parent destroying the panel), the guard can get stuck `true`.

---

## InsightsPanel

**File**: `src/components/InsightsPanel.ts` (843 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

InsightsPanel is the AI-generated geopolitical intelligence brief. The user sees a structured digest containing: a world brief (LLM narrative), ML-detected "missed stories" (headlines flagged by parallel multi-perspective analysis that didn't trend on the main feed), geographic convergence zones (locations where internet outage + military flight + protest signals cluster simultaneously), focal points (named geopolitical hotspots with correlated news + signals), and a theater posture summary (critical military deployments). The panel has a FrameworkSelector in the header that lets users pick the analytical lens (e.g., realist, liberal, critical) for the LLM brief. A 2-minute cooldown prevents re-generation while the API rate limits. The brief is cached to IndexedDB via `persistent-cache`.

### Data sources

- **Primary**: `getServerInsights()` from `@/services/insights-loader` — pre-computed server-side insights fetched during bootstrap; preferred path.
- **Fallback**: Client-side pipeline on non-mobile web: `parallelAnalysis()` from `@/services/parallel-analysis`, `signalAggregator` from `@/services/signal-aggregator`, `focalPointDetector` from `@/services/focal-point-detector`, `getTheaterPostureSummaries()` from `@/services/military-surge`, `generateSummary()` from `@/services/summarization`, `mlWorker` from `@/services/ml-worker`. All are invoked internally in `updateInsights(clusters)`.
- **Cache**: `getPersistentCache` / `setPersistentCache` / `deletePersistentCache` from `@/services/persistent-cache` with key `summary:world-brief` and 6-hour TTL.

### Lifecycle

- **Mount**: `new InsightsPanel()` — no args; calls `super({ id: 'insights', title: ... })`, subscribes to AI flow changes via `subscribeAiFlowChange()` (web, non-mobile only), subscribes to framework changes via `subscribeFrameworkChange('insights', ...)`, and mounts a `FrameworkSelector` widget in the header.
- **Refresh**: `updateInsights(clusters: ClusteredEvent[])` is called by data-loader after each news clustering cycle. The 2-minute cooldown (`BRIEF_COOLDOWN_MS = 120000`) prevents re-running the LLM. Server-side insights are preferred and bypass the cooldown. The AI flow change subscription causes re-run when a provider is toggled.
- **Dispose**: `aiFlowUnsubscribe?.()` and `frameworkUnsubscribe?.()` are called in `destroy()`. The `FrameworkSelector` is destroyed via `this.fwSelector?.destroy()`.

### Watchlist coupling

None directly. The clusters fed to `updateInsights(clusters)` are pre-filtered by data-loader based on the user's watchlist. The CII (Country Instability Index) scores are accessed internally via `getCountryScore()` from `@/services/country-instability` and used to weight the `selectTopStories` selection algorithm.

### Error & empty states

- **Loading skeleton**: A progress bar (`insights-progress`) renders between steps during client-side generation, showing step number / total and a status message (line 169–179).
- **Empty state**: `<div class="insights-empty">${t('components.insights.waitingForData')}</div>` shown when clusters are empty and no server insights.
- **Error state**: Errors from individual steps (e.g., `generateSummary` failure) are caught internally; the section is either omitted or shows the cached value. No toast.

### Dependencies

- Imports from `src/services/`: `ml-worker`, `summarization`, `parallel-analysis`, `signal-aggregator`, `focal-point-detector`, `oref-alerts` (`stripOrefLabels`), `country-instability` (`ingestNewsForCII`, `getCountryScore`), `military-surge` (`getTheaterPostureSummaries`), `cached-theater-posture`, `runtime` (`isDesktopRuntime`), `persistent-cache`, `i18n`, `ai-flow-settings`, `analysis-framework-store`, `panel-gating`, `insights-loader`, `entity-extraction`, `entity-index`
- Imports from `src/types/`: `ClusteredEvent`, `FocalPoint`, `MilitaryFlight`
- Imports from `src/config/`: `SITE_VARIANT`
- Imports from `src/components/`: `Panel` (base class), `FrameworkSelector`
- npm deps used: none direct

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/components/InsightsPanel.ts`, `src/components/FrameworkSelector.ts`, and all listed services from `archive/v1-legacy` branch.
2. The `persistent-cache` service uses IndexedDB — ensure the new architecture supports it or replace with a signal-based cache.
3. Wire into the SignalMap shell: mount as a dedicated Intelligence/Brief panel. Call `panel.updateInsights(clusters)` from the new clustering signal subscription.
4. Adapt to Preact + signals: `updateInsights` is async and runs a multi-step pipeline with intermediate progress rendering. Port to an async Preact effect with progress state signals.
5. The framework selector (`FrameworkSelector`) is a standalone vanilla TS class; it must be ported to Preact separately.
6. The `mlWorker` (Web Worker) must be initialized before `InsightsPanel` is mounted.

**Estimated revival effort**: High — the client-side AI pipeline is the most complex in the codebase (parallel multi-perspective analysis, ML worker, signal aggregation, ISQ scoring, focal point detection, theater posture). Server-side insights bypass most of this, so if the backend continues to serve pre-computed insights, the revival effort drops to medium.

### Notable quirks / known issues

- Line 40: `private static readonly BRIEF_COOLDOWN_MS = 120000` — a 2-minute cooldown on the LLM summary. The `updateGeneration` counter (line 39) is used to drop stale async completions when `updateInsights` is called again before the previous run finishes (a generation guard pattern).
- Lines 110–165: `extractISQInput` + `selectTopStories` implement a tiered story-selection algorithm (ISQ = Information Signal Quality) that balances source count, alert status, velocity, threat level, and country CII. The `MAX_PER_SOURCE = 3` cap prevents one outlet from dominating the brief.
- Line 116: comment notes that keyword-match country attribution is intentionally excluded because shared-actor terms like "hezbollah" or "hamas" are ambiguous across multiple countries.

---

## StatusPanel

**File**: `src/components/StatusPanel.ts` (121 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

StatusPanel is a developer/operator diagnostic panel that tracks the health of all data feeds and external APIs. The user sees a two-column grid: RSS/data feeds (with last-update timestamp and item count) and API endpoints (with latency). Each row is color-coded: green (ok), yellow (warning), red (error), grey (disabled). The panel is variant-aware — the `tech` variant shows a subset of feeds/APIs relevant to the tech news product, while the `world` variant shows the geopolitical intelligence feeds.

### Data sources

- **Primary**: Push-only — `data-loader.ts` calls `panel.updateFeed(name, status)` and `panel.updateApi(name, status)` after each fetch completes. No internal polling.
- No external endpoint fetching of any kind.

### Lifecycle

- **Mount**: `new StatusPanel()` — calls `super({ id: 'status', title: t('panels.status') })` and `init()`. The `init()` method selects the allowed feeds/APIs for the current `SITE_VARIANT` and calls `initDefaultStatuses()` which pre-populates all entries as `disabled`. Note: the constructor overrides `this.element` with `h('div', { className: 'status-panel-container' })` — this breaks the standard `Panel` base class DOM structure. The rendering of the actual feed/API grid is done externally by the caller (event-handlers renders the status panel DOM).
- **Refresh**: `updateFeed()` and `updateApi()` update the internal maps and call `this.onUpdate?.()` — a callback set by the caller to trigger re-render.
- **Dispose**: No listeners registered; nothing to clean up.

### Watchlist coupling

None.

### Error & empty states

- **Loading skeleton**: All entries start as `status: 'disabled'` until the first data arrives.
- **Empty state**: N/A — the panel always shows the allowlisted feeds/APIs in their current state.
- **Error state**: Feed/API errors are pushed in by data-loader as `status: 'error'` with an optional `errorMessage`.

### Dependencies

- Imports from `src/config/`: `SITE_VARIANT`
- Imports from `src/utils/`: `dom-utils` (`h`)
- Imports from `src/services/i18n`: `t`
- Imports from `src/components/`: `Panel` (base class)
- npm deps used: none

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/components/StatusPanel.ts` from `archive/v1-legacy` branch. Lightweight — 121 lines with no complex dependencies.
2. No extra npm deps.
3. Wire into the SignalMap shell: mount as a collapsible "System Status" drawer or a diagnostics route. Set `panel.onUpdate = () => { /* re-render the DOM grid */ }`.
4. Adapt to Preact + signals: the internal state (`feeds` Map, `apis` Map) maps cleanly to a signal. Expose `updateFeed`/`updateApi` as functions that write to the signal; the Preact component re-renders reactively.
5. No localStorage access — no signal replacement needed.
6. The `allowedFeeds`/`allowedApis` allowlists are hardcoded sets at the top of the file; the new architecture should keep these as config constants.

**Estimated revival effort**: Low — minimal logic, no external fetching, no complex lifecycle.

### Notable quirks / known issues

- Line 64: `this.element = h('div', { className: 'status-panel-container' })` — this re-assigns `this.element` after the base `Panel` constructor has already created it. This is intentional (the status panel needs a flat container, not the standard panel chrome), but it means `getElement()` returns the raw container, not the standard panel chrome with header/content.
- The external rendering of the status grid is done by the settings modal or a dedicated renderer (not inside StatusPanel itself) — the panel is essentially a data model with an `onUpdate` callback hook.

---

## RegionalIntelligenceBoard

**File**: `src/components/RegionalIntelligenceBoard.ts` (204 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

RegionalIntelligenceBoard renders a structured intelligence brief for a user-selected geopolitical region. The user sees six data blocks: (1) Regime label + transition driver, (2) 7-axis balance vector with a net_balance bar chart, (3) top 5 actors by leverage score with deltas, (4) three-horizon scenario lanes with probability bars, (5) top 5 transmission paths, (6) watchlist triggers and watch items. Narrative sections (situation, balance_assessment, 24h/7d/30d outlooks) render above the blocks when populated by the backend LLM layer. A region selector dropdown in the header switches between regions without page reload. Data is fetched from the backend RPC API; results are cached on the gateway (6-hour TTL). A two-phase loading strategy renders the snapshot immediately (Phase 1) then appends regime history and weekly brief in the background (Phase 2).

### Data sources

- **Primary**: `IntelligenceServiceClient.getRegionalSnapshot({ regionId })` — RPC call to `/api/intelligence/v1/get-regional-snapshot`. Called once per region selection.
- **Secondary (Phase 2)**: `client.getRegimeHistory({ regionId, limit: 20 })` and `client.getRegionalBrief({ regionId })` — fired in parallel after the snapshot renders. Gateway-cached; typical data age up to 6 hours.

### Lifecycle

- **Mount**: `new RegionalIntelligenceBoard()` — no args. Constructor calls `super({ id: 'regional-intelligence', ... })`, builds a region selector `<select>` populated from `BOARD_REGIONS`, attaches a change handler that calls `loadCurrent()`, then immediately calls `renderLoading()` and `void this.loadCurrent()`.
- **Refresh**: No polling. Each region change triggers one `loadCurrent()` call. The `latestSequence` counter (line 46) ensures only the most recent in-flight request renders — rapid region switches drop stale responses.
- **Dispose**: `destroy()` (line 88) bumps `latestSequence` to invalidate any pending RPC response that resolves after destroy, then calls `super.destroy()`.

### Watchlist coupling

None — the region selector is entirely user-driven via the dropdown. There is no connection to the user's watchlist regions system.

### Error & empty states

- **Loading**: `renderLoading()` shows `"Loading regional snapshot…"` in dim text.
- **Empty state**: `renderEmpty()` shows a message explaining the next cron cycle will populate data within 6 hours.
- **Error state**: `renderError(message)` shows the RPC error message in red.
- Phase 2 enrichment failures (history / brief RPC) are handled gracefully: `null` = RPC failed (block omitted), empty array = RPC succeeded with no data (empty state shown).

### Dependencies

- Imports from `src/services/`: `rpc-client` (`getRpcBaseUrl`), `runtime` (implicit via `IS_EMBEDDED_PREVIEW`)
- Imports from `src/generated/client/`: `IntelligenceServiceClient`, `RegionalSnapshot`, `RegimeTransition`, `RegionalBrief`
- Imports from `src/utils/`: `dom-utils` (`h`, `replaceChildren`), `sanitize` (`escapeHtml`)
- Imports from `src/components/`: `Panel` (base class), `regional-intelligence-board-utils` (`BOARD_REGIONS`, `DEFAULT_REGION_ID`, `buildBoardHtml`, `buildRegimeHistoryBlock`, `buildWeeklyBriefBlock`, `isLatestSequence`)
- npm deps used: none

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/components/RegionalIntelligenceBoard.ts` and `src/components/regional-intelligence-board-utils.ts` and the generated client `src/generated/client/worldmonitor/intelligence/v1/service_client.ts` from `archive/v1-legacy` branch.
2. The backend `IntelligenceService` RPC endpoint must be live and seeding snapshots.
3. Wire into the SignalMap shell: this panel is a natural fit as a dedicated route or Inspector tab in the new SignalMap product.
4. Adapt to Preact + signals: `loadCurrent()` is an async method with sequence-guard; port to `useEffect` with an abort ref or signal-based cancellation. The three-phase render maps naturally to `useState` for loading / snapshot / enrichments.
5. No localStorage access — no signal replacement needed.
6. The HTML builders in `regional-intelligence-board-utils.ts` return raw HTML strings; these must be ported to Preact JSX or kept as `dangerouslySetInnerHTML` (safe — no user content, server-controlled data).

**Estimated revival effort**: Medium — the panel's logic is clean and well-commented. The main work is porting the generated RPC client and adapting the two-phase async loading pattern to the Preact lifecycle.

### Notable quirks / known issues

- Lines 44–46: The `latestSequence` guard (comment in source) replaces a naive `loading` boolean that was dropping rapid region switches. The pattern is: claim sequence before `await`, check `isLatestSequence()` after each await point.
- Lines 98–103: `IS_EMBEDDED_PREVIEW` guard short-circuits all RPCs when the app is running in an embedded preview mode. Revival must preserve this guard.
- Lines 187–200: `renderBoard()` is a public method — used directly in tests and agent tools to inject snapshot data without going through the RPC flow. This is a useful seam to preserve.

---

## UnifiedSettings

**File**: `src/components/UnifiedSettings.ts` (1,054 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

UnifiedSettings is the main settings modal that appears when the user clicks the gear icon in the header. It presents a tabbed interface with five tabs: (1) Settings — appearance, theme, map provider, language, miscellaneous preferences; (2) Panels — grid of all available panels with on/off toggles, category filter pills, and a search box; (3) Sources — grid of all RSS/intel feed sources grouped by region, with per-source toggles, select all/none, and a search box; (4) Notifications — push notification channels configuration; (5) API Keys — create and revoke API keys for programmatic data access. Changes to panel toggles are saved as a draft (not immediately applied) until "Save" is clicked. Entitlement-gated panels show a "Pro" lock badge. The modal handles its own Escape key and click-outside-to-close behavior.

### Data sources

- No external data fetching. All state is read from and written to the services passed in via `UnifiedSettingsConfig` at construction time.
- API key operations: `listApiKeys()`, `createApiKey(name)`, `revokeApiKey(id)` from `@/services/api-keys` — REST calls to the backend.

### Lifecycle

- **Mount**: `new UnifiedSettings(config: UnifiedSettingsConfig)` — config provides callbacks (`getPanelSettings`, `savePanelSettings`, `getDisabledSources`, `toggleSource`, etc.). The constructor creates the overlay DOM element and registers the Escape key handler. The modal is not appended to DOM until `open()` is called.
- **Open/Close**: `open()` appends the overlay to `document.body`, renders the active tab, and loads API keys if on that tab. `close()` removes the overlay and calls cleanup (`prefsCleanup?.()`, `notifCleanup?.()`).
- **Dispose**: `destroy()` removes the overlay from DOM and calls cleanup functions. The `unsubscribeEntitlement?.()` callback is called to stop entitlement change listening.

### Watchlist coupling

Yes — the Sources tab directly manages the user's enabled/disabled feed sources via `config.getDisabledSources()`, `config.toggleSource()`, and `config.setSourcesEnabled()`. Source regions are rendered using `SOURCE_REGION_MAP` from `@/config/feeds`. The Panels tab manages `config.getPanelSettings()` / `config.savePanelSettings()`.

### Error & empty states

- **Loading**: API Keys tab shows "Loading..." while keys are being fetched.
- **Error**: API key errors display inline in `#usApiKeysError`. Creation errors have specific messages for `KEY_LIMIT_REACHED` (max 5 keys) and `API_ACCESS_REQUIRED` (subscription required).
- **Entitlement pending**: If entitlement state hasn't resolved after 3 seconds, a fallback timer (`entitlementReadyTimer`) forces the UI to render anyway to avoid stranding signed-in free users on a blank placeholder.

### Dependencies

- Imports from `src/config/`: `feeds` (`FEEDS`, `INTEL_SOURCES`, `SOURCE_REGION_MAP`), `panels` (`PANEL_CATEGORY_MAP`, `ALL_PANELS`, `VARIANT_DEFAULTS`, `getEffectivePanelConfig`, `isPanelEntitled`, `FREE_MAX_PANELS`), `variant` (`SITE_VARIANT`)
- Imports from `src/services/`: `widget-store` (`isProUser`), `i18n` (`t`), `preferences-content` (`renderPreferences`), `notifications-settings` (`renderNotificationsSettings`), `auth-state` (`getAuthState`), `analytics` (`track`), `entitlements` (`isEntitled`, `hasFeature`, `onEntitlementChange`, `getEntitlementState`), `panel-gating` (`hasPremiumAccess`), `billing` (`getSubscription`, `openBillingPortal`, `prereserveBillingPortalTab`), `api-keys` (`createApiKey`, `listApiKeys`, `revokeApiKey`)
- Imports from `src/types/`: `MapProvider`, `PanelConfig`
- Imports from `src/components/`: none (standalone)
- npm deps used: none direct

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/components/UnifiedSettings.ts` and all listed services from `archive/v1-legacy` branch.
2. No extra npm deps.
3. Wire into the SignalMap shell: instantiate with a `UnifiedSettingsConfig` that bridges to the new panel registry and source management signals. Mount by calling `settings.open()` from the header gear icon handler.
4. Adapt to Preact + signals: the 1,054-line modal is heavily imperative. Port options: (a) keep as vanilla TS modal (it doesn't depend on the Preact tree) and call `open()` imperatively from a Preact event handler; (b) port to a Preact `<Modal>` component — large effort. Option (a) is safer for revival.
5. The `UnifiedSettingsConfig` interface is the main seam — reimplement the callbacks to read from and write to the new `state/` signals.
6. The billing portal integration (`openBillingPortal`, `prereserveBillingPortalTab`) requires Dodo Payments to remain active.

**Estimated revival effort**: High — 1,054 lines of tabbed modal UI with entitlement gating, billing integration, API key management, and a draft panel settings system. The `UnifiedSettingsConfig` interface is well-designed as a dependency injection seam, which reduces coupling.

### Notable quirks / known issues

- Lines 70–73: `entitlementReady` flag + `entitlementReadyTimer` (3-second fallback) exist because `onEntitlementChange` can fail to fire if Convex is disabled / auth times out / init silently fails, leaving `currentState === null` forever. The comment cites specific lines in `src/services/entitlements.ts` (41, 47, 58, 78) as the failure modes.
- Lines 110–113: `prereserveBillingPortalTab()` is called synchronously inside the click handler to pre-open the popup window before the async Convex action, preventing popup blocker suppression.
- Lines 138–200: All tab/pill/toggle/source clicks are handled via a single click delegation block on `this.overlay`. Adding new interactive elements requires adding a new `target.closest()` branch here.

---

## panel-layout

**File**: `src/app/panel-layout.ts` (2,236 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

`panel-layout.ts` contains `PanelLayoutManager` — the factory and orchestrator for all panel instances. It creates every panel object (`new NewsPanel(...)`, `new MarketPanel()`, etc.), arranges them in the DOM grid (`#panelsGrid`, `#mapBottomGrid`), handles panel enable/disable based on `panelSettings`, enforces entitlement gating (Pro vs. free panel limits), manages the panel drag-and-drop reorder system, handles panel resize (vertical resizing via drag handles, horizontal map/panel width resizing), saves panel order to localStorage, and wires up the Aviation command bar. It also manages premium panel access gating, custom widget (AI-generated) panels, and MCP data panels.

### Data sources

- No direct external data fetching. All data rendering is initiated by `data-loader.ts` calling methods on panel instances held in `ctx.panels`.

### Lifecycle

- **Mount**: `new PanelLayoutManager(ctx, callbacks)` — `ctx` is the `AppContext` shared object containing references to all panel instances, map, panel settings, etc. Calls `constructor` → `init()` → `renderLayout()`. `renderLayout()` instantiates all enabled panels, appends their elements to the grid, and calls `setupDragAndDrop()` for each panel.
- **Refresh**: Panel visibility changes (settings save, entitlement change, auth change) call `applyPanelSettings()` which shows/hides/creates panels dynamically. The entitlement change subscription (`onEntitlementChange`) triggers `updatePanelGating()` which re-evaluates each panel's lock state.
- **Dispose**: `destroy()` calls `clearAllPendingCalls()`, cancels debounced functions, removes all event listeners and subscriptions, and destroys all panel instances in `ctx.panels`.

### Watchlist coupling

Indirect — panel creation respects `panelSettings` which is managed by UnifiedSettings. The panel order is persisted in `localStorage` under `STORAGE_KEYS.panels`. The `SIGNALMAP_WATCHLIST_CHANGED_EVENT` listener is handled in `data-loader.ts`, not here.

### Error & empty states

- Panels that fail to instantiate are skipped silently (no error boundary).
- Premium-gated panels that the user is not entitled to are rendered with a locked overlay showing "Pro" badge and "Upgrade" CTA.

### Dependencies

- Imports from `src/components/`: All panel classes (40+ imports — NewsPanel, MarketPanel, InsightsPanel, LiveNewsPanel, etc.)
- Imports from `src/services/`: `rpc-client`, `entitlements`, `billing`, `auth-state`, `user-identity`, `checkout`, `checkout-return`, `payment-failure-banner`, `panel-gating`, `widget-store`, `mcp-store`, `analytics`
- Imports from `src/config/`: `FEEDS`, `INTEL_SOURCES`, `STORAGE_KEYS`, `SITE_VARIANT`, `ALL_PANELS`, `VARIANT_DEFAULTS`, `beta`
- npm deps used: none direct

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/app/panel-layout.ts` and all panel classes it imports from `archive/v1-legacy` branch.
2. No extra npm deps.
3. In the SignalMap Preact architecture, `PanelLayoutManager` is replaced by the Preact component tree itself. The concept of a centralized factory becomes a `panelRegistry` signal and a Preact render loop. Do NOT port this class as-is — extract only the panel instantiation logic and gating rules.
4. The `AppContext` (`ctx`) object is the central mutable state bag. In Preact, this becomes the signal store.
5. The drag-and-drop system (lines ~1880–2100) is entirely vanilla DOM with ghost elements and drop indicators. If revival requires reorder, consider a purpose-built drag-and-drop library (e.g., `@dnd-kit/core`) for the Preact port.
6. Replace `localStorage` panel-order persistence with the new `state/` signal pattern.

**Estimated revival effort**: High — 2,236 lines with 40+ panel class imports, entitlement gating, checkout integration, drag-and-drop, resize handles, and AppContext mutations. This file is an archeological record of every panel added since v1. Revival means decomposing it rather than porting it monolithically.

### Notable quirks / known issues

- Lines 126–135: `WEB_PREMIUM_PANELS` is a hardcoded set of panel IDs that receive legacy web premium gating. The comment "Public SignalMap gating resolves to NONE" notes that these are not gated in the SignalMap product — the set is only relevant for the legacy web product.
- Lines 177–254: Checkout return handling is embedded in the constructor. `handleCheckoutReturn()` reads URL params from Dodo Payments redirect; `consumePostCheckoutFlag()` reads a session flag for overlay-mode returns. The comment at line 241 references a specific 2026-04-17/18 duplicate-subscription incident.
- Lines 163–165: `applyTimeRangeFilterDebounced` debounce on 120ms — fires `applyTimeRangeFilterToNewsPanels()` which syncs the time range filter across all NewsPanel instances.

---

## data-loader

**File**: `src/app/data-loader.ts` (3,440 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

`data-loader.ts` contains `DataLoaderManager` — the central data orchestration engine. It fetches data from every external API and feed, processes it (clustering, ML enrichment, CII scoring, signal aggregation, deviation detection), and pushes results to individual panel instances by calling render methods on them. It manages: RSS feed fetching and clustering, market/crypto/commodity data, military flight and vessel tracking, GDELT intelligence, internet outage monitoring, AIS (ship tracking) streaming, conflict events (ACLED/UCDP), climate anomalies, displacement data, satellite fire detection, cyber threats, trade policy/sanctions, oil inventories, economic calendar, and 30+ other data sources. It implements a circuit breaker for the digest endpoint, a time-range filter for news panels, and LLM-based market briefs and stock analysis.

### Data sources

Over 50 distinct services are imported and called. Key ones:
- **News**: `fetchCategoryFeeds()`, `fetchCategoryFeeds()` (intel sources) — RSS proxy, circuit-broken digest endpoint
- **Markets**: `fetchMultipleStocks()`, `fetchCommodityQuotes()`, `fetchSectors()`, `fetchCrypto()`
- **Intelligence**: `fetchGdeltTensions()`, `fetchConflictEvents()`, `fetchUcdpEvents()`, `fetchOrefAlerts()`
- **Signals**: `fetchMilitaryFlights()`, `fetchMilitaryVessels()`, `fetchInternetOutages()`, `fetchGpsInterference()`, `fetchSatelliteTLEs()`
- **Economic**: `fetchFredData()`, `fetchBisData()`, `fetchBlsData()`, `fetchTradeRestrictions()`
- All fetches are orchestrated by `loadAllData()` and sub-loaders called on a schedule from `refresh-scheduler.ts`.

### Lifecycle

- **Mount**: `new DataLoaderManager(ctx, callbacks)` — subscribes to market watchlist changes and SignalMap watchlist changes in `init()`. Subscribes to framework changes for daily brief and market implications.
- **Refresh**: `loadAllData()` is the main entry point called by `refresh-scheduler.ts` on a 3–5 minute cadence. Individual sub-loaders (`loadMarkets()`, `loadNewsFeeds()`, `loadMilitaryFlights()`, etc.) can be called independently for layer-specific refreshes.
- **Dispose**: `destroy()` stops satellite propagation, clears Oref polling, cancels debounced functions, removes all event listeners, and calls framework unsubscribers.

### Watchlist coupling

Yes — heavily. `wm-market-watchlist-changed` event triggers `loadMarkets()`. `SIGNALMAP_WATCHLIST_CHANGED_EVENT` triggers `loadSignalMap()`. The SignalMap storage handler listens for changes to `SIGNALMAP_STORAGE_KEYS.watchRegions` and `watchProviders` in localStorage.

### Error & empty states

- Individual fetch errors are caught per-loader; failed panels receive `showRetrying()` calls.
- The digest endpoint uses a circuit breaker (`digestBreaker`) with three states: closed / open (5-minute cooldown) / half-open. On open state, the last good digest or persisted cache is served.
- Oref polling errors are logged but do not surface to the user.

### Dependencies

- Imports from `src/services/`: 50+ services (see file lines 1–210 for the full import list)
- Imports from `src/components/`: `MarketPanel`, `InsightsPanel`, `CIIPanel`, and 10+ other panel classes (for type-safe method calls)
- Imports from `src/config/`: `FEEDS`, `INTEL_SOURCES`, `SECTORS`, `COMMODITIES`, `MARKET_SYMBOLS`, `SITE_VARIANT`, `LAYER_TO_SOURCE`
- npm deps used: none direct (all external API access is via internal service modules)

### Revival contract

If you want to bring this panel back later, you need:
1. This module should NOT be ported to SignalMap as-is. Instead, decompose each sub-loader into a dedicated signal-producing service or React Query hook.
2. If a specific data source (e.g., military flights) needs to be revived, restore the corresponding `fetch*()` service from `archive/v1-legacy` and wire it to a signal.
3. The circuit breaker pattern for the digest endpoint (lines 300–307, 389–440) should be preserved in any news-feed revival.
4. The `callPanel(key, method, ...args)` pattern (line 279–288) with `enqueuePanelCall` handles panels not yet mounted when data arrives — this pending-call queue pattern should be replicated in the new architecture's panel data delivery.
5. Replace `localStorage` watchlist event listeners with signal subscriptions.

**Estimated revival effort**: High — 3,440 lines are the accumulated data-fetching logic for the entire product. Revival means selective extraction, not wholesale porting.

### Notable quirks / known issues

- Lines 300–307: `digestBreaker` and related constants implement a manual circuit breaker (not using a library). State machine: closed → open (on 3 failures) → half-open → closed. The `persistedDigestMaxAgeMs` (6 hours) allows serving cached data during extended outages.
- Line 260: `CYBER_LAYER_ENABLED` is a compile-time environment variable gate (`VITE_ENABLE_CYBER_LAYER`). Cyber threat fetching is conditionally excluded based on this flag.
- Lines 116–117: `ingestNewsForCII` is called after each news clustering cycle to update the Country Instability Index — this is the coupling between news freshness and CII scores on the map.

---

## event-handlers

**File**: `src/app/event-handlers.ts` (1,553 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

`event-handlers.ts` contains `EventHandlerManager` — the global browser event wiring layer. It handles: header button clicks (search, copy link, download, settings), panel close/undo (close stack of up to 20 panels, Ctrl+Z restores the last closed panel), panel resize via drag handles (vertical resize per panel, horizontal map/panel width resize), map fullscreen toggle, mobile menu keyboard navigation, idle detection (pauses data loading after `IDLE_PAUSE_MS` of inactivity), visibility change (pauses loading when tab is hidden), localStorage change propagation (cross-tab sync for panel settings and live channels), TV mode (keyboard Shift+T shortcut, cycling through panels for happy variant), theme change listener, and snapshot auto-save (saves a dashboard snapshot every 5 minutes). It also instantiates and wires up `UnifiedSettings`, `AuthLauncher`, and `AuthHeaderWidget`.

### Data sources

- No external data fetching. Reads `STORAGE_KEYS.panels` and `STORAGE_KEYS.liveChannels` from localStorage via `window.storage` events (cross-tab sync).

### Lifecycle

- **Mount**: `new EventHandlerManager(ctx, callbacks)` — `init()` calls `setupEventListeners()`, `setupIdleDetection()`, and `setupTvMode()`. All handlers are stored as `private bound*` fields.
- **Refresh**: Stateless — responds to events. The clock interval (updates a clock element in the header) ticks every second. The snapshot interval saves every 5 minutes.
- **Dispose**: `destroy()` removes every bound listener, clears intervals/timeouts, and calls `destroy()` on `UnifiedSettings`, `AuthLauncher`, and `AuthHeaderWidget` (lines 201–312).

### Watchlist coupling

None directly. Cross-tab panel settings sync reads from `STORAGE_KEYS.panels` on `window.storage` events (line 348–366). Live channel changes sync to `LiveNewsPanel.refreshChannelsFromStorage()` (line 356–363).

### Error & empty states

- Panel close undo stack is capped at 20 (line 108: `closedPanelStack: string[]`).
- Panel restore from undo is blocked for free users if `enabledCount >= FREE_MAX_PANELS` (line 144).
- Drag-and-drop: ghost elements are stripped of `<iframe>` children to prevent duplicate network requests (line 1934).

### Dependencies

- Imports from `src/components/`: `PlaybackControl`, `StatusPanel`, `PizzIntIndicator`, `LlmStatusIndicator`, `CIIPanel`, `PredictionPanel`, `UnifiedSettings`, `AuthLauncher`, `AuthHeaderWidget`, `DownloadBanner`
- Imports from `src/services/`: `widget-store`, `mcp-store`, `analytics`, `runtime`, `storage`, `gps-interference`, `data-freshness`, `ml-worker`, `i18n`, `tv-mode`
- Imports from `src/config/`: `IDLE_PAUSE_MS`, `STORAGE_KEYS`, `SITE_VARIANT`, `LAYER_TO_SOURCE`, `FEEDS`, `INTEL_SOURCES`
- npm deps used: none direct

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/app/event-handlers.ts` from `archive/v1-legacy` branch.
2. In the SignalMap Preact architecture, most of this module's responsibilities are replaced by: Preact event handlers, `useEffect` cleanup, and signal subscriptions. Do NOT port as-is.
3. Selectively extract the cross-tab localStorage sync (panel settings + live channels) — this is reusable regardless of framework.
4. The idle detection pattern (lines ~130–135, with `IDLE_PAUSE_MS`) should be replicated to pause data loading when the user is idle.
5. The panel close undo stack (lines 108–157) is a useful UX feature worth porting — implement as a signal holding the stack.
6. `UnifiedSettings` / `AuthLauncher` / `AuthHeaderWidget` wiring moves to the Preact component tree.

**Estimated revival effort**: High — 1,553 lines of browser event wiring. Revival means decomposing and distributing responsibilities into Preact components and signal effects rather than porting.

### Notable quirks / known issues

- Lines 114–118: `debouncedUrlSync` debounced at 250ms — syncs map/panel state to the URL via `history.replaceState()` for shareable links.
- Lines 120–124: `debouncedWebcamReload` debounced at 350ms — fires when map viewport changes to reload nearby webcam data.
- Line 108: `closedPanelStack` has no explicit max-size enforcement beyond the comment "max-items: 20" — the stack will grow unbounded if the user rapidly closes panels without any undo.
- Lines 1900–2000 (drag-and-drop, in panel-layout.ts): The drag ghost (line 1934) clones the panel including its live content but removes iframes. This clone-and-strip approach can produce visual artifacts with canvas elements.

---

## settings-window

**File**: `src/settings-window.ts` (104 lines)
**Status**: archive (revivable from archive/v1-legacy)

### What it does

`settings-window.ts` is a standalone lightweight settings page for the Tauri desktop app. When the main app window opens a child Tauri window with `?settings=1` in the URL, this module renders a minimal panel-toggles grid — a checklist of all available panels that the user can enable/disable. It does not include the full tabbed UnifiedSettings modal (no sources, notifications, API keys, or preferences tabs). Changes are written directly to `STORAGE_KEYS.panels` in localStorage and picked up by the main window via a `storage` event listener. A close button calls `window.close()` to dismiss the Tauri child window.

### Data sources

- No external data fetching. Reads `STORAGE_KEYS.panels` from localStorage; writes back on toggle.

### Lifecycle

- **Mount**: `initSettingsWindow()` is the entry point — called from the Tauri-mode app initialization path. It reads panel settings from localStorage, prunes stale keys, merges variant defaults, and renders the toggle grid into `#app`.
- **Refresh**: Re-renders the entire toggle grid on each click (closes and regenerates `grid.innerHTML`). No virtual DOM.
- **Dispose**: Window close (`window.close()`) — no explicit cleanup needed.

### Watchlist coupling

None.

### Error & empty states

- Pro-locked panels silently block enabling (no error shown) when `isPanelEntitled()` returns false.
- Free users silently block enabling when `enabledCount >= FREE_MAX_PANELS`.

### Dependencies

- Imports from `src/types/`: `PanelConfig`
- Imports from `src/config/`: `DEFAULT_PANELS`, `STORAGE_KEYS`, `ALL_PANELS`, `VARIANT_DEFAULTS`, `getEffectivePanelConfig`, `isPanelEntitled`, `FREE_MAX_PANELS`
- Imports from `src/services/`: `widget-store` (`isProUser`), `runtime` (`isDesktopRuntime`)
- Imports from `src/config/variant`: `SITE_VARIANT`
- Imports from `src/utils/`: `loadFromStorage`, `saveToStorage`
- Imports from `src/services/i18n`: `t`
- Imports from `src/utils/sanitize`: `escapeHtml`
- npm deps used: none

### Revival contract

If you want to bring this panel back later, you need:
1. Restore `src/settings-window.ts` from `archive/v1-legacy` branch. Trivial — 104 lines.
2. This module is Tauri desktop-specific. If the new SignalMap product has a Tauri desktop build, restore the Tauri window management logic that opens this as a child window.
3. If the new architecture uses a web-based settings route instead of a Tauri child window, this module can be replaced by a simple route rendering the panel toggle grid as a Preact component.
4. No signal pattern replacement needed — the module reads/writes localStorage directly, which is fine for a standalone window (no reactive update to itself is needed since it re-renders on each click).
5. No panel-layout coupling.

**Estimated revival effort**: Low — 104 lines, no external deps, no complex lifecycle.

### Notable quirks / known issues

- Line 36–39: Stale panel keys (e.g., from a renamed panel) are pruned from the saved settings on load. This prevents ghost entries from accumulating in localStorage across product versions.
- Line 51: `cw-` prefixed panels (custom widget panels) are hidden from this settings window unless the user is a Pro user. MCP panels follow the same pattern.
- The `window.close()` call on line 100 works in Tauri's child window context. In a browser, `window.close()` only works if the window was opened by script — this module is Tauri-only by design.
