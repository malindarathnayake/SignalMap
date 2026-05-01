import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRedisAdapter } from '../../../src/server/lib/redis.js';
import type { RedisAdapter } from '../../../src/server/lib/redis.types.ts';
import type { z } from 'zod';
import { SignalMapEvent, SignalMapSourceHealth } from '../schemas/common.js';
import { getSignalMapSourceHealth } from './signalmap-source-health-core.ts';

// ---------------------------------------------------------------------------
// Type aliases from zod schemas
// ---------------------------------------------------------------------------

type SignalMapEventT = z.infer<typeof SignalMapEvent>;
type SignalMapSourceHealthT = z.infer<typeof SignalMapSourceHealth>;

// ---------------------------------------------------------------------------
// Core list logic (injectable for testing)
// ---------------------------------------------------------------------------

export function filterEvents(events: SignalMapEventT[], query: ListQuery): SignalMapEventT[] {
  return events.filter((ev) => {
    // watchlist_only
    if (query.watchlistOnly && !ev.watchlistMatch) return false;

    // categories
    if (query.categories.length > 0 && !query.categories.includes(ev.category)) return false;

    // watch_providers
    if (query.watchProviders.length > 0) {
      if (ev.provider === undefined || !query.watchProviders.includes(ev.provider)) return false;
    }

    // watch_regions
    if (query.watchRegions.length > 0) {
      const hasRegion = ev.locations.some(
        (loc) => loc.countryIso2 !== undefined && query.watchRegions.includes(loc.countryIso2),
      );
      if (!hasRegion) return false;
    }

    // time range — use lastObservedAt parsed as ms, fallback to startedAt
    if (query.startMs !== undefined || query.endMs !== undefined) {
      const ts = Date.parse(ev.lastObservedAt);
      const timestamp = Number.isNaN(ts)
        ? ev.startedAt !== undefined ? Date.parse(ev.startedAt) : NaN
        : ts;

      if (Number.isNaN(timestamp)) return false;
      if (query.startMs !== undefined && timestamp < query.startMs) return false;
      if (query.endMs !== undefined && timestamp > query.endMs) return false;
    }

    return true;
  });
}



// Source-blob cache keys — written by the collector worker. The collector
// stores all events for a given source in a single JSON blob keyed by
// `${SOURCE_PREFIX}:v1`. Per-event keys (`signalmap:event:<id>`) and the
// index set are written by a different (newer) ingestion path that may
// not be active. We read both and merge so the API works regardless of
// which writer ran most recently.
const SOURCE_BLOB_KEYS = [
  'signalmap:news:v1',
  'signalmap:radar:v1',
  'signalmap:providers:v1',
] as const;

interface CachePayload {
  events?: unknown[];
}

export async function getList(redis: RedisAdapter, query: ListQuery): Promise<ListResult> {
  let upstreamUnavailable = false;
  const allEvents: SignalMapEventT[] = [];
  const seenIds = new Set<string>();

  // Read 1 — per-event keys (newer ingestion path)
  try {
    const eventIds = await redis.smembers('signalmap:events:index');
    if (eventIds.length > 0) {
      const results = await redis.pipeline(
        eventIds.map((id) => ['get', `signalmap:event:${id}`]),
      );
      for (const result of results) {
        if (result !== null && typeof result === 'string') {
          try {
            const ev = JSON.parse(result) as SignalMapEventT;
            if (typeof ev?.id === 'string' && !seenIds.has(ev.id)) {
              seenIds.add(ev.id);
              allEvents.push(ev);
            }
          } catch {
            // ignore parse errors for now
          }
        }
      }
    }
  } catch {
    upstreamUnavailable = true;
  }

  // Read 2 — source-blob caches (current collector writer). We always read
  // these too: the per-event index is only populated by a newer ingestion
  // path, but the collector writes the blobs. Without this, real ingested
  // events get filtered to empty in the live stack.
  for (const key of SOURCE_BLOB_KEYS) {
    try {
      const payload = await redis.getJson<CachePayload>(key);
      if (!payload || !Array.isArray(payload.events)) continue;
      for (const raw of payload.events) {
        const ev = raw as SignalMapEventT;
        if (typeof ev?.id !== 'string') continue;
        if (seenIds.has(ev.id)) continue;
        seenIds.add(ev.id);
        allEvents.push(ev);
      }
    } catch {
      upstreamUnavailable = true;
    }
  }

  const filtered = filterEvents(allEvents, query);
  const sourceHealth = await getSignalMapSourceHealth(redis, Date.now());

  return {
    events: filtered,
    sourceHealth,
    fetchedAt: Date.now(),
    upstreamUnavailable,
  };
}

function parseMultiParam(params: URLSearchParams, key: string): string[] {
  const values = params.getAll(key);
  const expanded: string[] = [];
  for (const v of values) {
    for (const part of v.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length > 0) expanded.push(trimmed);
    }
  }
  // dedupe preserving order
  return [...new Set(expanded)];
}

export function parseListQuery(url: string): ListQuery {
  const questionMark = url.indexOf('?');
  const search = questionMark >= 0 ? url.slice(questionMark) : '';
  const params = new URLSearchParams(search);

  const startMsRaw = params.get('start_ms');
  const endMsRaw = params.get('end_ms');
  const watchlistOnlyRaw = params.get('watchlist_only');

  const startMs = startMsRaw !== null ? Number(startMsRaw) : undefined;
  const endMs = endMsRaw !== null ? Number(endMsRaw) : undefined;

  return {
    startMs: startMs !== undefined && Number.isFinite(startMs) ? startMs : undefined,
    endMs: endMs !== undefined && Number.isFinite(endMs) ? endMs : undefined,
    categories: parseMultiParam(params, 'categories'),
    watchRegions: parseMultiParam(params, 'watch_regions'),
    watchProviders: parseMultiParam(params, 'watch_providers'),
    watchlistOnly: watchlistOnlyRaw === 'true' || watchlistOnlyRaw === '1',
  };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export async function handleSignalMapList(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  let redis;
  try {
    redis = getRedisAdapter();
  } catch {
    // REDIS_URL not set — return graceful empty response (fixture / test mode)
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        events: [],
        sourceHealth: [],
        fetchedAt: Date.now(),
        upstreamUnavailable: true,
      }),
    );
    return;
  }

  const query = parseListQuery(req.url ?? '');
  const result = await getList(redis, query);

  res.statusCode = 200;
  res.end(JSON.stringify(result));
}
