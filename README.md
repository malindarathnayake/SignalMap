<p align="center">
  <img src=".github/Banner.jpg" alt="SignalMap — operational signal intelligence" />
</p>

<p align="center">
  <a href="https://github.com/malindarathnayake/SignalMap/releases/latest"><img src="https://img.shields.io/github/v/release/malindarathnayake/SignalMap?display_name=tag&sort=semver" alt="Latest release"></a>
  <a href="https://github.com/malindarathnayake/SignalMap/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/malindarathnayake/SignalMap/release.yml?label=release" alt="Release workflow"></a>
  <a href="https://github.com/malindarathnayake/SignalMap/pkgs/container/signalmap-node"><img src="https://img.shields.io/badge/ghcr.io-signalmap--node-2496ED?logo=docker&logoColor=white" alt="GHCR signalmap-node"></a>
  <a href="https://github.com/malindarathnayake/SignalMap/pkgs/container/signalmap-ui"><img src="https://img.shields.io/badge/ghcr.io-signalmap--ui-2496ED?logo=docker&logoColor=white" alt="GHCR signalmap-ui"></a>
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL v3"></a>
  <img src="https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white" alt="Node 22">
  <img src="https://img.shields.io/badge/typescript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.7">
  <a href="https://github.com/malindarathnayake/SignalMap/commits/main"><img src="https://img.shields.io/github/last-commit/malindarathnayake/SignalMap" alt="Last commit"></a>
</p>

<p align="center">
  <a href="./CHANGELOG.md"><strong>Changelog</strong></a> &middot;
  <a href="./deploy/README.md"><strong>Deploy guide</strong></a> &middot;
  <a href="./docs/SignalMap"><strong>Architecture docs</strong></a> &middot;
  <a href="https://github.com/malindarathnayake/SignalMap/issues"><strong>Issues</strong></a>
</p>

---

## What it does

SignalMap watches the public internet for **operational, security, geopolitical, and infrastructure events** — provider outages, network anomalies, cybersecurity incidents, supply-chain attacks — and surfaces them as a unified, geo-located, severity-ranked feed. It runs entirely on infrastructure you control.

- **Live map + feed** — every signal pinned to its geography, with category and severity colour-coding, server-sent updates as new events land.
- **Source-health visibility** — `/source-health-details` shows per-source fetch / accept / reject counts, last-fetched age, and a "why articles were skipped" panel that aggregates LLM confidence stats and dedupe reasons.
- **AI-classified news** — RSS items go through Distill (vendored) for clean article extraction, then through OpenRouter for structured event extraction with a confidence floor. Off-topic items (sports, lifestyle, marketing) are filtered out before the geocoder runs.
- **Sliding-window cache** — accepted events stay visible for 24h (configurable) even if the next collector tick rejects everything; a barren tick can no longer wipe the feed.
- **Vector dedupe** — LanceDB stores embeddings of accepted stories so semantically duplicate articles from different sources collapse into a single signal.
- **Brief generation** — periodic AI brief over the last 30 minutes of activity, with per-event drill-down.
- **Provider status** — Cloudflare, OpenAI, Anthropic, Azure, Okta, AWS Lambda / RDS / S3 surfaced from their public status feeds.
- **Cloudflare Radar** — real-time outage incidents geocoded down to the datacenter (IATA-aware) instead of country centroid.

---

## Quick start (Docker Compose)

The fastest way to run SignalMap is with the published images from GitHub Container Registry. No local build, no source checkout required for the deploy host.

```bash
# On the deploy host (any Docker-capable Linux box, ~2 GB RAM):
mkdir -p /opt/signalmap && cd /opt/signalmap

# Grab the deploy folder (replace with raw URLs or sparse-clone if you prefer)
git clone --depth 1 https://github.com/malindarathnayake/SignalMap.git tmp \
  && mv tmp/deploy/* . && rm -rf tmp

# Configure
cp .env.example .env
# edit .env — at minimum set REDIS_PASSWORD; for live mode also set
# OPENROUTER_API_KEY, PERPLEXITY_API_KEY, optionally NEWSAPI_API_KEY.

# Generate the admin token Docker secret
mkdir -p secrets
openssl rand -hex 32 > secrets/SIGNALMAP_ADMIN_TOKEN
chmod 600 secrets/SIGNALMAP_ADMIN_TOKEN

# Pull and start
docker compose pull
docker compose up -d

# Verify
docker compose ps
curl -fsS http://localhost:8080/api/signalmap/health
```

Open `http://<host>:8080`. The collector takes ~30-90 seconds to do its first tick; the feed populates after that.

Full deployment guide (TLS, reverse proxy, version pinning, ops runbook):
**[`deploy/README.md`](./deploy/README.md)**

---

## Architecture

```
                    ┌─────────────────┐
                    │  Browser / SPA  │
                    └────────┬────────┘
                             │ HTTP + SSE
                    ┌────────▼────────┐
                    │  signalmap-ui   │  nginx + Vite static bundle
                    │   (port 8080)   │  proxies /api/* to api
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  signalmap-api  │  Node 22, TS 5.7
                    │                 │  Routes: list, stream, brief, health
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐    ┌───────▼───────┐    ┌──────▼──────┐
│ signalmap-    │    │ signalmap-    │    │   redis     │
│  collector    │    │    cron       │    │             │
│               │    │               │    │  cache,     │
│ RSS / Radar / │    │  Brief gen    │    │  pubsub,    │
│ status / LLM  │    │  every 30m    │    │  leases     │
│ classify      │    │               │    │             │
└───────┬───────┘    └───────────────┘    └─────────────┘
        │
┌───────▼───────┐
│   LanceDB     │  Vector store for semantic dedupe
└───────────────┘
```

Five containers, one host port, durable Docker volumes for Redis state, LanceDB vectors, and the embedding model cache. Worker leases coordinate collector / cron tick ownership through Redis.

---

## Tech stack

| Layer | What's in it |
| --- | --- |
| **Frontend** | Preact 10 + Vite 6, d3-geo / d3-zoom for the map, `@preact/signals` for state, SSE for live updates |
| **API** | Node 22, TypeScript 5.7, ioredis 5, Zod schemas with OpenAPI generation |
| **Workers** | Lease-coordinated collector + cron loops, AbortSignal-aware tick bodies |
| **AI / LLM** | OpenRouter for classification + brief generation, Perplexity for grounded news, configurable model fallback chain |
| **Article extraction** | Vendored Distill (`vendor/distill/`) with per-source descriptors |
| **Vector dedupe** | LanceDB with locally-cached embedding model |
| **Cache / control plane** | Redis 7 (cache, lease, pubsub, lock store, daily spend window) |
| **Edge** | nginx serving the static bundle + reverse-proxying `/api/*` to the api worker |
| **Deploy** | Docker Compose, GHCR-published images, Docker secrets bridge for the admin token |

---

## Tunables worth knowing

| Env | Default | What it does |
| --- | --- | --- |
| `SIGNALMAP_BACKEND_MODE` | `fixture` | `fixture` (free, no LLM) or `live` (real LLM calls) |
| `SIGNALMAP_NEWS_WINDOW_HOURS` | `24` | Sliding window for the news cache |
| `SIGNALMAP_EVENT_CONFIDENCE_MIN` | `0.7` | LLM confidence floor; below this, articles are dropped as `low_signal_confidence` |
| `SIGNALMAP_DAILY_LLM_BUDGET_USD` | `2.00` | Hard cap on combined provider spend per UTC day |
| `SIGNALMAP_RSS_POLL_MINUTES` | `15` | Collector tick cadence |
| `SIGNALMAP_BRIEF_REFRESH_MINUTES` | `30` | Cron tick cadence |
| `SIGNALMAP_VECTOR_ENABLED` | `true` | Disable to skip LanceDB + embedding model (saves ~150 MB download, ~1 GB RAM) |

Full list with comments: [`deploy/.env.example`](./deploy/.env.example).

---

## Releases

Versioned releases publish two images to GitHub Container Registry:

```
ghcr.io/malindarathnayake/signalmap-node:<version>   # api / collector / cron (role via CMD)
ghcr.io/malindarathnayake/signalmap-ui:<version>     # nginx + static bundle
```

Both also tagged `latest`. The release workflow runs on every `vX.Y.Z` git tag push — see [`.github/workflows/release.yml`](./.github/workflows/release.yml).

To upgrade a deployment:

```bash
# in deploy/.env, set SIGNALMAP_VERSION=4.0.1 (or leave as `latest`)
docker compose pull
docker compose up -d
```

---

## Development

For source builds (rather than running pre-built images):

```bash
git clone https://github.com/malindarathnayake/SignalMap.git
cd SignalMap

# Frontend dev server (Vite, port 5173)
npm install
npm run dev

# Or run the full stack from source via the root compose file
cp docker/signalmap-shared.env.example .env
# edit .env
docker compose up -d --build
```

Tests:

```bash
npm run test:data        # unit + integration tests
npm run typecheck:all    # TS type-check (ui + api)
npm run lint             # biome lint
```

---

## License

**AGPL-3.0**. See [LICENSE](./LICENSE).

| Use case | Allowed |
| --- | --- |
| Personal / research / educational | Yes |
| Self-hosted (non-commercial) | Yes, with attribution |
| Fork and modify (non-commercial) | Yes, share source under AGPL-3.0 |
| Commercial use / SaaS / rebranding | Requires a commercial license — open an issue |

---

<p align="center">
  <sub>Built by <a href="https://github.com/malindarathnayake">@malindarathnayake</a> · operational signal intelligence, open source.</sub>
</p>
