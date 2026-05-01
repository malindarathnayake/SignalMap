import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { RedisAdapter, Disposer } from '../src/server/lib/redis.types.ts';
import { getSourceHealth } from '../server/api/routes/signalmap-source-health.ts';

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
// Helpers
// ---------------------------------------------------------------------------

function makeSeedMeta(fetchedAtMs: number, recordCount: number): unknown {
  return {
    fetchedAt: fetchedAtMs,
    recordCount,
    sourceVersion: '1',
    pollMinutes: 30,
  };
}

const META_KEYS = {
  news: 'seed-meta:signalmap:news',
  radar: 'seed-meta:signalmap:radar',
  providers: 'seed-meta:signalmap:providers',
};
const NEWS_KEY = 'signalmap:news:v1';
const RADAR_KEY = 'signalmap:radar:v1';
const PROVIDERS_KEY = 'signalmap:providers:v1';

// ---------------------------------------------------------------------------
// Test 1: all-fresh — all 3 sources fresh (1 minute ago)
// ---------------------------------------------------------------------------

test('all-fresh: all 3 sources are ok when freshly seeded', async () => {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  const redis = makeMockRedis(async (key) => {
    if (key === META_KEYS.news) return makeSeedMeta(oneMinuteAgo, 42);
    if (key === META_KEYS.radar) return makeSeedMeta(oneMinuteAgo, 15);
    if (key === META_KEYS.providers) return makeSeedMeta(oneMinuteAgo, 7);
    return null;
  });

  const results = await getSourceHealth(redis, now);

  assert.equal(results.length, 3, 'should return 3 source health entries');

  for (const entry of results) {
    assert.equal(entry.status, 'ok', `${entry.id} should be ok`);
  }

  const news = results.find((e) => e.id === 'news');
  assert.ok(news !== undefined, 'news entry should exist');
  assert.equal(news.eventCount, 42, 'news eventCount should match recordCount');

  const radar = results.find((e) => e.id === 'cloudflare-radar');
  assert.ok(radar !== undefined, 'radar entry should exist');
  assert.equal(radar.eventCount, 15, 'radar eventCount should match recordCount');
});

// ---------------------------------------------------------------------------
// Test 2: news stale — 1 hour old, > 1800s threshold
// ---------------------------------------------------------------------------

test('news stale: news degraded when older than 2x poll interval', async () => {
  const now = Date.now();
  const threeHoursAgo = now - 3 * 60 * 60 * 1000;

  const redis = makeMockRedis(async (key) => {
    if (key === META_KEYS.news) return makeSeedMeta(threeHoursAgo, 5);
    if (key === META_KEYS.radar) return makeSeedMeta(now - 60_000, 10); // fresh
    if (key === META_KEYS.providers) return makeSeedMeta(now - 60_000, 3); // fresh
    return null;
  });

  const results = await getSourceHealth(redis, now);

  const news = results.find((e) => e.id === 'news');
  assert.ok(news !== undefined, 'news entry should exist');
  assert.equal(news.status, 'degraded', 'news should be degraded');

  const radar = results.find((e) => e.id === 'cloudflare-radar');
  assert.ok(radar !== undefined, 'radar entry should exist');
  assert.equal(radar.status, 'ok', 'radar should be ok');
});

// ---------------------------------------------------------------------------
// Test 3: radar missing — returns unavailable
// ---------------------------------------------------------------------------

test('radar missing: radar entry is unavailable with fetchedAt 0', async () => {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  const redis = makeMockRedis(async (key) => {
    if (key === META_KEYS.news) return makeSeedMeta(oneMinuteAgo, 5);
    if (key === META_KEYS.radar) return null; // missing
    if (key === META_KEYS.providers) return makeSeedMeta(oneMinuteAgo, 2);
    return null;
  });

  const results = await getSourceHealth(redis, now);

  const radar = results.find((e) => e.id === 'cloudflare-radar');
  assert.ok(radar !== undefined, 'radar entry should exist');
  assert.equal(radar.status, 'unavailable', 'radar should be unavailable');
  assert.equal(radar.fetchedAt, 0, 'fetchedAt should be 0');
  assert.equal(radar.eventCount, 0, 'eventCount should be 0');
  assert.equal(radar.detail, 'No cached payload available.');
});

// ---------------------------------------------------------------------------
// Test 4: redis throws on all keys → all unavailable
// ---------------------------------------------------------------------------

test('redis-throws: all entries are unavailable when getJson throws', async () => {
  const redis = makeMockRedis(async (_key) => {
    throw new Error('Redis connection error');
  });

  const results = await getSourceHealth(redis, Date.now());

  assert.equal(results.length, 3, 'should still return 3 entries');
  for (const entry of results) {
    assert.equal(entry.status, 'unavailable', `${entry.id} should be unavailable`);
    assert.equal(entry.fetchedAt, 0, `${entry.id} fetchedAt should be 0`);
    assert.equal(entry.eventCount, 0, `${entry.id} eventCount should be 0`);
  }
});

test('news collector sub-sources are appended when present in the news payload', async () => {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  const redis = makeMockRedis(async (key) => {
    if (key === META_KEYS.news) return makeSeedMeta(oneMinuteAgo, 3);
    if (key === META_KEYS.radar) return makeSeedMeta(oneMinuteAgo, 10);
    if (key === META_KEYS.providers) return makeSeedMeta(oneMinuteAgo, 2);
    if (key === NEWS_KEY) {
      return {
        fetchedAt: new Date(oneMinuteAgo).toISOString(),
        events: [],
        health: {
          sources: [
            { name: 'NewsAPI Everything', fetched: 19, accepted: 3, skipped: 16, errors: 0 },
            {
              name: 'Risky Business News',
              fetched: 1,
              accepted: 0,
              skipped: 1,
              errors: 0,
              llmUnavailable: true,
              lastLlmReason: 'missing_api_key',
            },
          ],
        },
      };
    }
    return null;
  });

  const results = await getSourceHealth(redis, now);

  const newsApi = results.find((entry) => entry.label === 'NewsAPI Everything');
  assert.ok(newsApi !== undefined, 'NewsAPI sub-source should be present');
  assert.equal(newsApi.status, 'ok');
  assert.equal(newsApi.eventCount, 3);
  assert.match(newsApi.detail, /fetched 19/);

  const risky = results.find((entry) => entry.label === 'Risky Business News');
  assert.ok(risky !== undefined, 'RSS sub-source should be present');
  assert.equal(risky.status, 'degraded');
  assert.match(risky.detail, /llm missing_api_key/);
});

test('Radar cached source health overrides fresh aggregate metadata when upstream is unavailable', async () => {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  const redis = makeMockRedis(async (key) => {
    if (key === META_KEYS.news) return makeSeedMeta(oneMinuteAgo, 3);
    if (key === META_KEYS.radar) return makeSeedMeta(oneMinuteAgo, 10);
    if (key === META_KEYS.providers) return makeSeedMeta(oneMinuteAgo, 2);
    if (key === RADAR_KEY) {
      return {
        fetchedAt: new Date(oneMinuteAgo).toISOString(),
        events: [],
        sourceHealth: [
          {
            id: 'cloudflare-radar',
            label: 'Cloudflare Radar',
            status: 'unavailable',
            fetchedAt: oneMinuteAgo,
            eventCount: 0,
            detail: 'HTTP 403 from Cloudflare Radar.',
          },
        ],
      };
    }
    return null;
  });

  const results = await getSourceHealth(redis, now);
  const radar = results.find((entry) => entry.id === 'cloudflare-radar');

  assert.ok(radar !== undefined, 'Radar source should be present');
  assert.equal(radar.status, 'unavailable');
  assert.equal(radar.eventCount, 0);
  assert.equal(radar.detail, 'HTTP 403 from Cloudflare Radar.');
});

test('provider cached source health appends individual provider rows', async () => {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  const redis = makeMockRedis(async (key) => {
    if (key === META_KEYS.news) return makeSeedMeta(oneMinuteAgo, 3);
    if (key === META_KEYS.radar) return makeSeedMeta(oneMinuteAgo, 0);
    if (key === META_KEYS.providers) return makeSeedMeta(oneMinuteAgo, 1);
    if (key === PROVIDERS_KEY) {
      return {
        fetchedAt: new Date(oneMinuteAgo).toISOString(),
        events: [],
        sourceHealth: [
          {
            id: 'provider-status:openai-status',
            label: 'OpenAI Status',
            status: 'ok',
            fetchedAt: oneMinuteAgo,
            eventCount: 0,
            detail: 'Fetched https://status.openai.com/api/v2/summary.json.',
          },
        ],
      };
    }
    return null;
  });

  const results = await getSourceHealth(redis, now);
  const openai = results.find((entry) => entry.id === 'provider-status:openai-status');

  assert.ok(openai !== undefined, 'OpenAI provider row should be present');
  assert.equal(openai.status, 'ok');
  assert.equal(openai.label, 'OpenAI Status');
});

// ---------------------------------------------------------------------------
// Test 5 (optional): hermetic HTTP server end-to-end
// Skipped because getRedisAdapter() singleton cannot be injected without
// modifying the handler — the per-function tests cover the same logic.
// ---------------------------------------------------------------------------
