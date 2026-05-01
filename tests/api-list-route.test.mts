import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { RedisAdapter, Disposer } from '../src/server/lib/redis.types.ts';
import {
  getList,
  filterEvents,
  parseListQuery,
  type ListQuery,
} from '../server/api/routes/signalmap-list.ts';

// ---------------------------------------------------------------------------
// Minimal mock Redis
// ---------------------------------------------------------------------------

type GetJsonFn = (key: string) => Promise<unknown>;

function makeMockRedis(getJsonImpl: GetJsonFn): RedisAdapter {
  return {
    getJson: getJsonImpl as RedisAdapter['getJson'],
    setJson: async () => undefined,
    setJsonEx: async () => undefined,
    setNx: async () => false,
    incr: async () => 0,
    incrByFloat: async () => 0,
    expire: async () => undefined,
    del: async () => undefined,
    pipeline: async () => [],
    publish: async () => undefined,
    subscribe: (_ch: string, _h: (m: string) => void): Disposer => ({ dispose: () => undefined }),
    zadd: async () => 0,
    zrangeByScore: async () => [],
    zremRangeByRank: async () => 0,
    zcard: async () => 0,
    eval: async () => null,
  };
}

// ---------------------------------------------------------------------------
// Test event factories
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<{
  id: string;
  category: string;
  watchlistMatch: boolean;
  lastObservedAt: string;
  locations: Array<{ name: string; countryIso2?: string; scope: string; confidence: number }>;
  provider: string | undefined;
}> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'evt-1',
    category: overrides.category ?? 'cyber',
    severity: 'medium',
    title: 'Test event',
    summary: 'Test summary',
    tags: [],
    lastObservedAt: overrides.lastObservedAt ?? new Date(200).toISOString(),
    locations: overrides.locations ?? [{ name: 'Global', scope: 'unknown', confidence: 1 }],
    sources: [],
    confidence: 0.8,
    kind: 'story',
    watchlistMatch: overrides.watchlistMatch ?? false,
    markerEligible: false,
    ...(overrides.provider !== undefined ? { provider: overrides.provider } : {}),
  };
}

function makeNewsPayload(events: unknown[], health?: unknown): unknown {
  return {
    fetchedAt: new Date().toISOString(),
    pollMinutes: 30,
    events,
    ...(health !== undefined ? { health } : {}),
  };
}

function makeSeedMeta(fetchedAtMs: number, recordCount: number): unknown {
  return {
    fetchedAt: fetchedAtMs,
    recordCount,
    sourceVersion: '1',
    pollMinutes: 30,
  };
}

// Empty meta for all 3 sources (returns null so sources are unavailable)
function emptyMeta(_key: string): Promise<null> {
  return Promise.resolve(null);
}

// ---------------------------------------------------------------------------
// Test 1: happy-path — 3 events, no filters
// ---------------------------------------------------------------------------

test('happy-path: 3 events, all sources, upstreamUnavailable false', async () => {
  const events = [
    makeEvent({ id: 'a', category: 'cyber' }),
    makeEvent({ id: 'b', category: 'conflict' }),
    makeEvent({ id: 'c', category: 'finance' }),
  ];

  const redis = makeMockRedis(async (key) => {
    if (key === 'signalmap:news:v1') return makeNewsPayload(events);
    return null; // radar + providers absent, meta absent
  });

  const query: ListQuery = {
    categories: [],
    watchRegions: [],
    watchProviders: [],
    watchlistOnly: false,
  };

  const result = await getList(redis, query);

  assert.equal(result.events.length, 3, 'should return all 3 events');
  assert.equal(result.sourceHealth.length, 3, 'sourceHealth should have 3 entries');
  assert.equal(result.upstreamUnavailable, false, 'upstreamUnavailable should be false');
});

test('sourceHealth includes news sub-sources from collector payload', async () => {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  const events = [makeEvent({ id: 'a', category: 'cyber' })];
  const redis = makeMockRedis(async (key) => {
    if (key === 'signalmap:news:v1') {
      return makeNewsPayload(events, {
        sources: [
          { name: 'NewsAPI Everything', fetched: 8, accepted: 2, skipped: 6, errors: 0 },
        ],
      });
    }
    if (key === 'seed-meta:signalmap:news') return makeSeedMeta(oneMinuteAgo, 1);
    if (key === 'seed-meta:signalmap:radar') return makeSeedMeta(oneMinuteAgo, 0);
    if (key === 'seed-meta:signalmap:providers') return makeSeedMeta(oneMinuteAgo, 0);
    return null;
  });

  const query: ListQuery = {
    categories: [],
    watchRegions: [],
    watchProviders: [],
    watchlistOnly: false,
  };

  const result = await getList(redis, query);
  const newsApi = result.sourceHealth.find((entry) => entry.label === 'NewsAPI Everything');
  assert.ok(newsApi !== undefined, 'NewsAPI sub-source should be present');
  assert.equal(newsApi.status, 'ok');
  assert.equal(newsApi.eventCount, 2);
  assert.match(newsApi.detail, /fetched 8/);
});

// ---------------------------------------------------------------------------
// Test 2: filter by categories
// ---------------------------------------------------------------------------

test('filter by categories: only cyber events returned', async () => {
  const events = [
    makeEvent({ id: 'a', category: 'cyber' }),
    makeEvent({ id: 'b', category: 'conflict' }),
    makeEvent({ id: 'c', category: 'finance' }),
  ];

  const redis = makeMockRedis(async (key) => {
    if (key === 'signalmap:news:v1') return makeNewsPayload(events);
    return null;
  });

  const query: ListQuery = {
    categories: ['cyber'],
    watchRegions: [],
    watchProviders: [],
    watchlistOnly: false,
  };

  const result = await getList(redis, query);
  assert.equal(result.events.length, 1, 'should return only 1 cyber event');
  assert.equal((result.events[0] as Record<string, unknown>)['id'], 'a');
});

// ---------------------------------------------------------------------------
// Test 3: filter by watchlist_only
// ---------------------------------------------------------------------------

test('filter by watchlist_only: returns only watchlistMatch===true events', async () => {
  const events = [
    makeEvent({ id: 'a', watchlistMatch: true }),
    makeEvent({ id: 'b', watchlistMatch: true }),
    makeEvent({ id: 'c', watchlistMatch: false }),
  ];

  const redis = makeMockRedis(async (key) => {
    if (key === 'signalmap:news:v1') return makeNewsPayload(events);
    return null;
  });

  const query: ListQuery = {
    categories: [],
    watchRegions: [],
    watchProviders: [],
    watchlistOnly: true,
  };

  const result = await getList(redis, query);
  assert.equal(result.events.length, 2, 'should return 2 watchlisted events');
});

// ---------------------------------------------------------------------------
// Test 4: filter by time range
// ---------------------------------------------------------------------------

test('filter by time range: only the 200ms event is within 150–250ms bounds', async () => {
  const events = [
    makeEvent({ id: 'early', lastObservedAt: new Date(100).toISOString() }),
    makeEvent({ id: 'mid',   lastObservedAt: new Date(200).toISOString() }),
    makeEvent({ id: 'late',  lastObservedAt: new Date(300).toISOString() }),
  ];

  const redis = makeMockRedis(async (key) => {
    if (key === 'signalmap:news:v1') return makeNewsPayload(events);
    return null;
  });

  const query: ListQuery = {
    startMs: 150,
    endMs: 250,
    categories: [],
    watchRegions: [],
    watchProviders: [],
    watchlistOnly: false,
  };

  const result = await getList(redis, query);
  assert.equal(result.events.length, 1, 'should return only the 200ms event');
  assert.equal((result.events[0] as Record<string, unknown>)['id'], 'mid');
});

// ---------------------------------------------------------------------------
// Test 5: filter by watch_regions
// ---------------------------------------------------------------------------

test('filter by watch_regions: only US-located events', async () => {
  const events = [
    makeEvent({
      id: 'us',
      locations: [{ name: 'New York', countryIso2: 'US', scope: 'city', confidence: 1 }],
    }),
    makeEvent({
      id: 'uk',
      locations: [{ name: 'London', countryIso2: 'GB', scope: 'city', confidence: 1 }],
    }),
    makeEvent({
      id: 'no-iso',
      locations: [{ name: 'Unknown', scope: 'unknown', confidence: 0.5 }],
    }),
  ];

  const redis = makeMockRedis(async (key) => {
    if (key === 'signalmap:news:v1') return makeNewsPayload(events);
    return null;
  });

  const query: ListQuery = {
    categories: [],
    watchRegions: ['US'],
    watchProviders: [],
    watchlistOnly: false,
  };

  const result = await getList(redis, query);
  assert.equal(result.events.length, 1, 'should return only the US event');
  assert.equal((result.events[0] as Record<string, unknown>)['id'], 'us');
});

// ---------------------------------------------------------------------------
// Test 6: redis throws → upstreamUnavailable true, events empty, status 200
// ---------------------------------------------------------------------------

test('redis throws on news key → upstreamUnavailable true, empty events', async () => {
  const redis = makeMockRedis(async (key) => {
    if (key === 'signalmap:news:v1') throw new Error('Redis connection refused');
    if (key === 'signalmap:radar:v1') throw new Error('Redis connection refused');
    if (key === 'signalmap:providers:v1') throw new Error('Redis connection refused');
    return null; // meta keys return null fine
  });

  const query: ListQuery = {
    categories: [],
    watchRegions: [],
    watchProviders: [],
    watchlistOnly: false,
  };

  const result = await getList(redis, query);
  assert.equal(result.events.length, 0, 'events should be empty');
  assert.equal(result.upstreamUnavailable, true, 'upstreamUnavailable should be true');
  // no exception thrown → would have been 200 from handler
});

// ---------------------------------------------------------------------------
// Test 7: parseListQuery handles repeat + comma forms
// ---------------------------------------------------------------------------

test('parseListQuery: repeat params form', () => {
  const q = parseListQuery('/api/signalmap/list?categories=a&categories=b');
  assert.deepEqual(q.categories, ['a', 'b'], 'repeat params should produce array');
});

test('parseListQuery: comma-separated form', () => {
  const q = parseListQuery('/api/signalmap/list?categories=a,b');
  assert.deepEqual(q.categories, ['a', 'b'], 'comma-separated should produce array');
});

test('parseListQuery: deduplicates values', () => {
  const q = parseListQuery('/api/signalmap/list?categories=a&categories=a&categories=b');
  assert.deepEqual(q.categories, ['a', 'b'], 'should deduplicate');
});

test('parseListQuery: watchlist_only=true', () => {
  const q = parseListQuery('/api/signalmap/list?watchlist_only=true');
  assert.equal(q.watchlistOnly, true);
});

test('parseListQuery: watchlist_only=1', () => {
  const q = parseListQuery('/api/signalmap/list?watchlist_only=1');
  assert.equal(q.watchlistOnly, true);
});

test('parseListQuery: watchlist_only absent → false', () => {
  const q = parseListQuery('/api/signalmap/list');
  assert.equal(q.watchlistOnly, false);
});

test('parseListQuery: invalid start_ms → undefined', () => {
  const q = parseListQuery('/api/signalmap/list?start_ms=not-a-number');
  assert.equal(q.startMs, undefined);
});

test('parseListQuery: valid start_ms and end_ms', () => {
  const q = parseListQuery('/api/signalmap/list?start_ms=1000&end_ms=2000');
  assert.equal(q.startMs, 1000);
  assert.equal(q.endMs, 2000);
});

// ---------------------------------------------------------------------------
// Test: filterEvents directly (pure function)
// ---------------------------------------------------------------------------

test('filterEvents: empty query passes all events', () => {
  const events = [
    makeEvent({ id: 'a' }),
    makeEvent({ id: 'b' }),
  ];
  const query: ListQuery = { categories: [], watchRegions: [], watchProviders: [], watchlistOnly: false };
  // Use type cast via unknown to satisfy strict types since makeEvent returns Record<string,unknown>
  const filtered = filterEvents(events as Parameters<typeof filterEvents>[0], query);
  assert.equal(filtered.length, 2);
});

test('filterEvents: watch_providers filter drops events without provider', () => {
  const eventsWithProvider = [
    makeEvent({ id: 'has-provider', provider: 'aws' }),
    makeEvent({ id: 'no-provider' }), // no provider field
  ];
  const query: ListQuery = {
    categories: [],
    watchRegions: [],
    watchProviders: ['aws'],
    watchlistOnly: false,
  };
  const filtered = filterEvents(eventsWithProvider as Parameters<typeof filterEvents>[0], query);
  assert.equal(filtered.length, 1);
  assert.equal((filtered[0] as Record<string, unknown>)['id'], 'has-provider');
});

// Unused export reference to suppress lint warnings in test-only context
void emptyMeta;
