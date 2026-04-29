import Redis from 'ioredis';
import { jsonResponse } from './_json-response.js';

// Sources to probe for freshness. Each entry carries the Redis meta-key written
// by the corresponding seed collector and the maximum acceptable age in seconds.
//
// Note on news metaKey: SIGNALMAP_NEWS_META_KEY is exported from
// scripts/signalmap-news-collector.mjs, but that script transitively imports
// src/server/lib/redis.ts which is NOT present in the SignalMap runtime image.
// Hard-coding the literal here avoids an import-time crash.
const SOURCES = {
  cloudflare_radar: { critical: true,  metaKey: 'seed-meta:signalmap:radar',     maxAgeSeconds: 600  }, // 10 min
  provider_status:  { critical: false, metaKey: 'seed-meta:signalmap:providers', maxAgeSeconds: 600  }, // 10 min
  news:             { critical: false, metaKey: 'seed-meta:signalmap:news',      maxAgeSeconds: 1800 }, // 30 min
};

// Lazily-constructed ioredis client — module is hot-imported by local-api-server
// and we must not open a TCP connection on every import.
let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  _client = new Redis(url, {
    lazyConnect: false,
    enableAutoPipelining: false,
    commandTimeout: 5000,
  });
  return _client;
}

export default async function handler(req) {
  const checkedAt = new Date().toISOString();
  const now = Date.now();
  const client = getClient();

  let redis = 'down';
  let sseReplayRingSize = 0;
  const sources = {};
  let newestFetchedAtMs = 0;

  // --- Redis liveness probe ---
  if (client) {
    try {
      await client.ping();
      redis = 'ok';
    } catch {
      redis = 'down';
    }
  }

  if (redis === 'ok') {
    // SSE replay ring size (Phase 3d populates signalmap:sse:ring as a sorted set)
    try {
      sseReplayRingSize = Number(await client.zcard('signalmap:sse:ring')) || 0;
    } catch { /* keep 0 */ }

    // Fetch all seed-meta keys in one parallel batch
    const metaKeys = Object.values(SOURCES).map((s) => s.metaKey);
    let metaResults = [];
    try {
      metaResults = await Promise.all(metaKeys.map((k) => client.get(k)));
    } catch { /* leave empty -> all sources become 'unknown' */ }

    const entries = Object.entries(SOURCES);
    for (let i = 0; i < entries.length; i++) {
      const [name, cfg] = entries[i];
      const raw = metaResults[i];
      let fetchedAtMs = 0;

      if (typeof raw === 'string' && raw.length > 0) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const f = parsed.fetchedAt;
            // fetchedAt is stored as a JS epoch milliseconds number
            if (typeof f === 'number' && Number.isFinite(f)) fetchedAtMs = f;
          }
        } catch { /* malformed payload -> treat as unknown */ }
      }

      const ageSeconds = fetchedAtMs ? Math.floor((now - fetchedAtMs) / 1000) : null;
      const status = !fetchedAtMs
        ? 'unknown'
        : (ageSeconds > cfg.maxAgeSeconds ? 'stale' : 'ok');

      sources[name] = {
        status,
        critical: cfg.critical,
        fetchedAt: fetchedAtMs ? new Date(fetchedAtMs).toISOString() : null,
        ageSeconds,
      };

      if (fetchedAtMs > newestFetchedAtMs) newestFetchedAtMs = fetchedAtMs;
    }
  } else {
    // Redis is down — mark all sources unknown (we can't read meta keys)
    for (const [name, cfg] of Object.entries(SOURCES)) {
      sources[name] = { status: 'unknown', critical: cfg.critical, fetchedAt: null, ageSeconds: null };
    }
  }

  // ok=false only when redis is down OR a critical source is 'stale'.
  // 'unknown' (cold-start grace) does NOT count as stale — a fresh stack must
  // pass its first healthcheck before any collector has run.
  const criticalStale = Object.values(sources).some((s) => s.critical && s.status === 'stale');
  const ok = redis === 'ok' && !criticalStale;
  const lastEventAt = newestFetchedAtMs ? new Date(newestFetchedAtMs).toISOString() : null;

  return jsonResponse(
    { ok, sources, lastEventAt, redis, sseReplayRingSize, checkedAt },
    ok ? 200 : 503,
  );
}
