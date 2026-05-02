# Changelog

All notable changes to SignalMap are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] — 2026-05-01

First release of the **v2 backend stack**. The Vercel-hosted, edge-function
architecture from v3.x is replaced with a self-contained Docker Compose
deployment that runs Redis, an API service, a long-running collector worker,
a brief-generation cron worker, and an nginx-fronted UI behind one host port.

### Added

- **Docker Compose v2 stack** — five services (`redis`, `signalmap-api`,
  `signalmap-collector`, `signalmap-cron`, `signalmap-ui`) wired with
  health-gated `depends_on`, named volumes for Redis/LanceDB/embedding
  models, and a Docker-secrets bridge for the admin token.
- **Sliding-window news merge** — collector reads the previous
  `signalmap:news:v1` blob each tick, prunes events older than
  `SIGNALMAP_NEWS_WINDOW_HOURS` (default 24h), merges with this tick's
  accepts (this run wins on `id` collision), and writes the union back.
  A barren tick (0 LLM accepts) no longer wipes the visible feed.
- **Persistent URL dedupe** — Redis SET (`signalmap:news:seen-urls:v1`,
  7-day TTL) suppresses re-classification of articles already accepted
  in a previous tick. Stops repeated LLM spend on the same RSS items.
- **Per-source progress channel** — collector publishes a live progress
  blob (`signalmap:collector:progress:v1`) every ~1.5s with per-source
  `fetched / processed / accepted / rejected` counts. Surfaced in the
  command-bar ingest pill ("HN 50/50 ✓45 · DR 50/50 ✓40 · NewsAPI 1/20")
  and on `/source-health-details`.
- **`/source-health-details` page + JSON endpoint** — full per-source
  diagnostics including upstream URL, env-key requirement, last-fetched
  age, parsed counts, and a "why articles were skipped" panel that
  aggregates the collector's `diagnostics[]` array (e.g.
  `5× low_signal_confidence — max 0.62 < threshold 0.70 · avg 0.47`).
  JSON is served at `/api/signalmap/source-health-details` for LLM
  consumption.
- **News sources** — The Hacker News (RSS), Dark Reading (RSS), NewsAPI
  top-headlines (when `NEWSAPI_API_KEY` is set). Distill descriptors
  vendored at `vendor/distill/` for full-article extraction; falls back
  to RSS snippet when extraction fails.
- **Provider-status sources** — Cloudflare, OpenAI, Anthropic, Azure,
  Okta, AWS Lambda (us-east-1, us-east-2), AWS RDS (us-east-1),
  AWS S3 (us-east-1). RSS or Statuspage v2 API per source.
- **Cloudflare datacenter geocoding** — IATA codes in incident titles
  (`SYD`, `PHL`, etc.) are mapped to ~80 datacenter cities so radar
  events show on the map at the actual datacenter location instead of
  defaulting to the country centroid.
- **Country centroid expansion** — `_radar.ts` reads
  `scripts/shared/country-bboxes.json` (~250 countries) instead of the
  prior 5-country hardcoded table.
- **Live ingest indicator** — command-bar pill shows the active
  collector tick (spinner + per-source progress) so a 3–7 minute pass
  isn't invisible.
- **Force-refresh from UI** — admin button on the brief strip triggers
  an immediate brief regeneration (rate-limited, admin-token guarded).
- **Health panel** — modal showing Redis / LanceDB / collector /
  brief / OpenRouter / Perplexity status, with live progress mirrored
  from the collector channel.
- **Refresh countdown** — visible timer to the next scheduled collector
  tick on the command bar.
- **`.gitattributes`** — pins `*.sh` to LF so Alpine `sh` and `tini`
  exec the entrypoint regardless of platform autocrlf settings.
- **CHANGELOG.md** (this file).

### Changed

- **Singleflight lock hardening** — `src/server/lib/singleflight.ts`
  switched to a Lua CAS pattern (`if GET == ARGV[1] then PEXPIRE`) so a
  hung event-loop can't extend another holder's TTL after lock takeover.
  Renewal interval cleared on `release()` and on the per-acquisition
  `AbortSignal`. Idempotent release via shared promise.
- **API top-level error catch** — `server/api/index.ts` wraps the
  router in a Promise catch so a Node 22 unhandled rejection inside a
  handler returns a 500 instead of crashing the worker.
- **Cache TTL** — `signalmap:news:v1` TTL bumped to
  `windowHours * 3600 + 1h` so the blob always outlives the merge
  window. Previously 30 min, which let the cache expire mid-window.
- **Collector return semantics** — `collectSignalMapNews()` returns
  the **delta** (this tick's accepts) for worker `eventCount` + SSE
  fanout, but **publishes the merged set** to Redis. The two are no
  longer the same array.
- **OpenRouter parser schema** — stripped provider-unsupported JSON
  Schema annotations (`maxItems`, `minLength`, `pattern`, `minimum`,
  `maximum`) that caused Azure-routed Claude to silently 400 every
  article. Schema is now type + enum + required + `additionalProperties`
  only. Made `countryIso2` required+nullable for the same reason.
- **News collector source list** — retired an unstable cyber source whose
  HTML layout drifted faster than its descriptor; The Hacker News + Dark
  Reading + NewsAPI cover the same beat.
- **Source-health command-bar popover** — wired to the live
  `/api/signalmap/source-health` endpoint instead of fixture mocks.
  Falls back to mocks only if the API never responds.
- **Per-event brief route** — wraps the entire post-acquire block in
  `try / finally` so an uncaught throw between `acquireOrPoll()` and
  natural release cannot leak the renewal `setInterval`.

### Fixed

- **Cache wipe on barren tick** — the original motivation for the
  sliding-window merge. Previously, a tick that LLM-rejected every
  fetched article (e.g. all 31 new articles below the 0.7 confidence
  threshold) overwrote `signalmap:news:v1` with `events: []`, even
  though the dedupe set still claimed those 90 URLs as "already
  accepted." The visible feed went empty until a tick happened to
  produce new accepts. The merge step preserves the prior window.
- **OpenRouter silent 400** — every news article was being rejected
  by the upstream provider with `For 'array' type, property
  'maxItems' is not supported` and the parser's caught-error handling
  swallowed the body. Now the readOpenRouterContent path captures the
  provider error envelope so future schema mismatches are visible.
- **Cloudflare datacenter events with no map marker** — events like
  `SYD (Sydney) on 2026-05-04` were dropping to the
  `weakProviderLocation` fallback at confidence 0.45 and getting
  filtered out by the 0.7 marker threshold. Now they geocode to the
  IATA datacenter city and surface as map markers.
- **Country radar markers missing** — `_radar.ts` had a hardcoded
  5-country `COUNTRY_CENTROIDS` table that dropped Malaysia, Iran,
  Sudan, etc. Now reads the full 250-country bbox file.
- **`/api/signalmap/list` filter race** — when the Redis blob was
  briefly missing during a republish, the list route returned an
  `upstreamUnavailable: true` flag that the SPA used to keep showing
  the prior fixture. Race window closed by the cache TTL bump above.
- **Entrypoint-script CRLF** — `docker/entrypoint-node.sh` had CRLF
  line endings from Windows tooling, causing Alpine to interpret the
  shebang as `/bin/sh\r` and refuse to start the container with
  `No such file or directory`. Converted to LF + `.gitattributes`
  pins it that way.
- **Collector progress reference error** — `flushProgress(isColdStart
  ? 'cold-start' : 'parsing')` referenced a removed variable after
  the cold-start window was deleted, causing every news source to
  silently fail with `rss_fetch_error`. Replaced with the static
  `'parsing'` stage.
- **Source popover showing fixture sources** — the v3 build leaked
  13 mocked rows with fake latencies into the chrome popover even
  when only 3 real sources were configured. Now reflects what the
  collector actually reaches.
- **Brief refresh-from-UI auth bypass** — the UI-fronted refresh
  endpoint accepted any same-origin request without a token; now
  requires the same admin token as the headless brief refresh.

### Test coverage

- 33/33 tests pass in `tests/signalmap-news-collector.test.mjs`,
  including 5 new sliding-window cases:
  - barren tick preserves prior events
  - events past the window are pruned
  - same-id refresh wins on collision
  - previous-events read failure tolerated
  - TTL expands to cover the configured window

### Operational notes

- The Docker volumes (`signalmap-redis-data`, `signalmap-lancedb`,
  `signalmap-models`) hold all runtime state. A full reset is
  `docker compose down -v && docker compose up -d`.
- `SIGNALMAP_BACKEND_MODE` defaults to `fixture`. Set to `live` to
  enable real LLM calls; `OPENROUTER_API_KEY` and `PERPLEXITY_API_KEY`
  are required in live mode.
- `SIGNALMAP_DAILY_LLM_BUDGET_USD` (default 2.00) caps total daily
  spend across both LLM providers.
- The collector embedding model first run downloads ~150 MB into the
  `signalmap-models` volume. Subsequent boots reuse the cached files.

[4.0.0]: https://github.com/malindarathnayake/SignalMap/releases/tag/v4.0.0
