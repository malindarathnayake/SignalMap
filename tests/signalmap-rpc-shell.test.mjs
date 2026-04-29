import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSignalMapEventsCacheKey,
  listSignalMapEvents,
} from '../server/worldmonitor/signalmap/v1/list-signals.ts';

const root = join(import.meta.dirname, '..');

describe('SignalMap proto RPC shell', () => {
  const proto = readFileSync(
    join(root, 'proto', 'worldmonitor', 'signalmap', 'v1', 'service.proto'),
    'utf-8',
  );

  it('declares ListSignalMapEvents response with events and source health', () => {
    assert.ok(proto.includes('rpc ListSignalMapEvents'));
    assert.ok(proto.includes('message ListSignalMapEventsResponse'));
    assert.ok(proto.includes('repeated SignalMapEvent events'));
    assert.ok(proto.includes('repeated SignalMapSourceHealth source_health'));
  });

  it('declares expected query annotations and int32 source tier', () => {
    for (const field of [
      'start_ms',
      'end_ms',
      'categories',
      'watch_regions',
      'watch_providers',
      'watchlist_only',
    ]) {
      assert.match(proto, new RegExp(`\\(sebuf\\.http\\.query\\)\\s*=\\s*\\{name:\\s*"${field}"\\}`));
    }

    assert.match(proto, /int32\s+tier\s*=\s*4/);
  });
});

describe('SignalMap server shell', () => {
  const src = readFileSync(
    join(root, 'server', 'worldmonitor', 'signalmap', 'v1', 'list-signals.ts'),
    'utf-8',
  );

  it('reads only from raw Redis cache for the computed key', () => {
    assert.ok(src.includes('getCachedJson(cacheKey, true)'));
    assert.ok(!src.includes('cachedFetchJson'));
    assert.ok(!src.includes('fetch('));
  });

  it('builds order-invariant cache keys including time and watchlist filters', () => {
    const first = buildSignalMapEventsCacheKey({
      startMs: 100,
      endMs: 200,
      categories: [' cyber ', 'internet', 'cyber', ''],
      watchRegions: ['US', 'JP'],
      watchProviders: ['okta', 'cloudflare'],
      watchlistOnly: true,
    });
    const second = buildSignalMapEventsCacheKey({
      startMs: 100,
      endMs: 200,
      categories: ['internet', 'cyber'],
      watchRegions: ['JP', 'US', 'US'],
      watchProviders: ['cloudflare', 'okta'],
      watchlistOnly: true,
    });

    assert.equal(first, second);
    assert.ok(first.includes('start=100'));
    assert.ok(first.includes('end=200'));
    assert.ok(first.includes('categories=cyber,internet'));
    assert.ok(first.includes('watch_regions=JP,US'));
    assert.ok(first.includes('watch_providers=cloudflare,okta'));
    assert.ok(first.includes('watchlist_only=1'));
  });

  it('returns degraded empty response when Redis is not configured', async () => {
    const oldUrl = process.env.UPSTASH_REDIS_REST_URL;
    const oldToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
      const response = await listSignalMapEvents({}, {});
      assert.deepEqual(response.events, []);
      assert.ok(response.sourceHealth.length > 0);
      assert.equal(response.upstreamUnavailable, true);
      assert.equal(typeof response.fetchedAt, 'number');
    } finally {
      if (oldUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = oldUrl;
      if (oldToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = oldToken;
    }
  });
});

describe('SignalMap gateway cache tier', () => {
  it('has an explicit fast tier for the list SignalMap events RPC', () => {
    const gateway = readFileSync(join(root, 'server', 'gateway.ts'), 'utf-8');
    assert.ok(gateway.includes("'/api/signalmap/v1/list-signal-map-events': 'fast'"));
  });
});
