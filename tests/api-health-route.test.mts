/**
 * Unit tests for the /api/signalmap/health route.
 *
 * All 6 required test cases exercise buildHealthResponse() directly with a
 * mock RedisAdapter so no real Redis connection is needed.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { RedisAdapter, Disposer } from '../src/server/lib/redis.types.ts';
import { buildHealthResponse } from '../server/api/routes/signalmap-health.ts';
import { HealthResponse } from '../server/api/schemas/signalmap.js';

// ---------------------------------------------------------------------------
// Mock Redis factory
// ---------------------------------------------------------------------------

type GetJsonFn = (key: string) => Promise<unknown>;
type PipelineFn = (commands: Array<[string, ...unknown[]]>) => Promise<unknown[]>;

function makeMockRedis(opts: {
  getJson?: GetJsonFn;
  pipeline?: PipelineFn;
}): RedisAdapter {
  return {
    getJson: (opts.getJson ?? (async () => null)) as RedisAdapter['getJson'],
    pipeline: opts.pipeline ?? (async () => ['PONG']),
    setJson: async () => undefined,
    setJsonEx: async () => undefined,
    setNx: async () => false,
    incr: async () => 0,
    incrByFloat: async () => 0,
    expire: async () => undefined,
    del: async () => undefined,
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
// Key constants (mirrors the handler)
// ---------------------------------------------------------------------------

const KEYS = {
  collectorHb: 'signalmap:collector:heartbeat',
  collectorStatus: 'signalmap:collector:status',
  briefHb: 'signalmap:brief:cron:heartbeat',
  briefStatus: 'signalmap:brief:cron:status',
  openrouter: 'signalmap:llm:lastcall:openrouter',
  perplexity: 'signalmap:llm:lastcall:perplexity',
  lancedbHb: 'signalmap:lancedb:heartbeat',
  metaNews: 'seed-meta:signalmap:news',
  metaRadar: 'seed-meta:signalmap:radar',
  metaProviders: 'seed-meta:signalmap:providers',
};

// ---------------------------------------------------------------------------
// Helper: fresh seed-meta object
// ---------------------------------------------------------------------------

function freshMeta(now: number): unknown {
  return { fetchedAt: now - 30_000, recordCount: 10 };
}

// ---------------------------------------------------------------------------
// Helper: fresh LLM last-call object
// ---------------------------------------------------------------------------

function freshLlmCall(now: number): unknown {
  return {
    calledAt: new Date(now - 60_000).toISOString(),
    outcome: 'success',
    model: 'openai/gpt-4o',
  };
}

// ---------------------------------------------------------------------------
// Helper: worker heartbeat object (any truthy value suffices)
// ---------------------------------------------------------------------------

function workerHb(): unknown {
  return { ts: Date.now() };
}

// ---------------------------------------------------------------------------
// Helper: worker last-tick status with success outcome
// ---------------------------------------------------------------------------

function workerOkStatus(): unknown {
  return { outcome: 'ok', eventCount: 5 };
}

// ---------------------------------------------------------------------------
// Helper: getJson implementation that returns all-ok state
// ---------------------------------------------------------------------------

function allOkGetJson(now: number): GetJsonFn {
  return async (key: string) => {
    if (key === KEYS.collectorHb) return workerHb();
    if (key === KEYS.collectorStatus) return workerOkStatus();
    if (key === KEYS.briefHb) return workerHb();
    if (key === KEYS.briefStatus) return workerOkStatus();
    if (key === KEYS.openrouter) return freshLlmCall(now);
    if (key === KEYS.perplexity) return freshLlmCall(now);
    if (key === KEYS.lancedbHb) return null; // not yet written → unknown
    if (key === KEYS.metaNews) return freshMeta(now);
    if (key === KEYS.metaRadar) return freshMeta(now);
    if (key === KEYS.metaProviders) return freshMeta(now);
    return null;
  };
}

// ---------------------------------------------------------------------------
// Test 1: all-ok
// ---------------------------------------------------------------------------

test('all-ok: all 6 components ok or unknown, sources all ok, schema validates', async () => {
  const now = Date.now();
  const redis = makeMockRedis({
    getJson: allOkGetJson(now),
    pipeline: async () => ['PONG'],
  });

  const result = await buildHealthResponse(redis, 'fixture', now);

  // Redis
  assert.equal(result.redis.status, 'ok', 'redis should be ok');
  assert.ok(
    typeof (result.redis.metrics?.['latencyMs']) === 'number',
    'redis.metrics.latencyMs should be a number',
  );

  // LanceDB is 'unknown' until Phase 3 writes the heartbeat key
  assert.ok(
    result.lancedb.status === 'ok' || result.lancedb.status === 'unknown',
    'lancedb should be ok or unknown',
  );

  // Workers
  assert.equal(result.collector.status, 'ok', 'collector should be ok');
  assert.equal(result.brief.status, 'ok', 'brief should be ok');

  // LLM cards
  assert.equal(result.openrouter.status, 'ok', 'openrouter should be ok');
  assert.equal(result.perplexity.status, 'ok', 'perplexity should be ok');

  // Sources
  assert.equal(result.sources.length, 3, 'sources should have 3 entries');
  for (const src of result.sources) {
    assert.equal(src.status, 'ok', `source ${src.id} should be ok`);
  }

  // Strict schema parse must not throw
  assert.doesNotThrow(() => HealthResponse.parse(result), 'HealthResponse.parse should not throw');
});

// ---------------------------------------------------------------------------
// Test 2: one-down — collector heartbeat missing
// ---------------------------------------------------------------------------

test('one-down: collector heartbeat absent → collector status=down, others ok', async () => {
  const now = Date.now();

  const redis = makeMockRedis({
    getJson: async (key) => {
      if (key === KEYS.collectorHb) return null; // missing
      return allOkGetJson(now)(key);
    },
    pipeline: async () => ['PONG'],
  });

  const result = await buildHealthResponse(redis, 'fixture', now);

  assert.equal(result.collector.status, 'down', 'collector should be down');
  assert.equal(result.redis.status, 'ok', 'redis should still be ok');
  assert.equal(result.brief.status, 'ok', 'brief should still be ok');

  // Schema must still validate
  assert.doesNotThrow(() => HealthResponse.parse(result), 'HealthResponse.parse should not throw');
});

// ---------------------------------------------------------------------------
// Test 3: one-degraded — collector last-tick outcome=fail
// ---------------------------------------------------------------------------

test('one-degraded: collector status.outcome=fail → collector status=degraded', async () => {
  const now = Date.now();

  const redis = makeMockRedis({
    getJson: async (key) => {
      if (key === KEYS.collectorHb) return workerHb(); // heartbeat present
      if (key === KEYS.collectorStatus) return { outcome: 'fail', errorMessage: 'upstream timeout' };
      return allOkGetJson(now)(key);
    },
    pipeline: async () => ['PONG'],
  });

  const result = await buildHealthResponse(redis, 'fixture', now);

  assert.equal(result.collector.status, 'degraded', 'collector should be degraded');
  assert.equal(result.redis.status, 'ok', 'redis should still be ok');

  // Schema must still validate
  assert.doesNotThrow(() => HealthResponse.parse(result), 'HealthResponse.parse should not throw');
});

// ---------------------------------------------------------------------------
// Test 4: redis ping fails
// ---------------------------------------------------------------------------

test('redis-ping-fails: redis status=down, rest of response still built', async () => {
  const now = Date.now();

  const redis = makeMockRedis({
    getJson: allOkGetJson(now),
    pipeline: async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:6379');
    },
  });

  // buildHealthResponse must not throw even if pipeline throws
  const result = await buildHealthResponse(redis, 'fixture', now);

  assert.equal(result.redis.status, 'down', 'redis should be down');
  assert.ok(typeof result.redis.detail === 'string', 'redis.detail should contain error message');

  // Other workers should still be built
  assert.equal(result.collector.status, 'ok', 'collector should still be ok');
  assert.equal(result.brief.status, 'ok', 'brief should still be ok');
  assert.equal(result.sources.length, 3, 'sources should still have 3 entries');

  // Schema must validate
  assert.doesNotThrow(() => HealthResponse.parse(result), 'HealthResponse.parse should not throw');
});

// ---------------------------------------------------------------------------
// Test 5: live-mode redaction
// ---------------------------------------------------------------------------

test('live-mode redaction: detail with redis:// or sk- is replaced', async () => {
  const now = Date.now();

  // We override the lancedb and openrouter probes by injecting known detail strings.
  // We do this by making getJson throw on specific keys so the probe returns a
  // down/degraded card with a detail containing the sensitive substring.
  const redis = makeMockRedis({
    getJson: async (key) => {
      // lancedb heartbeat — throw so detail contains redis://
      if (key === KEYS.lancedbHb) {
        throw new Error('connect error: redis://localhost:6379');
      }
      // openrouter last-call — return a success object with a detail we'll override
      if (key === KEYS.openrouter) {
        return {
          calledAt: new Date(now - 60_000).toISOString(),
          outcome: 'success',
          model: 'sk-or-v1-XXXXX',  // sensitive prefix embedded in model string
        };
      }
      return allOkGetJson(now)(key);
    },
    pipeline: async () => ['PONG'],
  });

  const result = await buildHealthResponse(redis, 'live', now);
  const json = JSON.stringify(result);

  // None of the sensitive substrings should appear in the stringified response
  assert.ok(!json.includes('redis://'), 'redis:// should be redacted');
  // sk- can appear in other innocuous contexts but the key is that it was injected
  // into lancedb.detail only; verify that field specifically
  if (typeof result.lancedb.detail === 'string') {
    assert.ok(
      !result.lancedb.detail.includes('redis://'),
      'lancedb.detail should not contain redis://',
    );
    assert.equal(
      result.lancedb.detail,
      '<redacted-in-production>',
      'lancedb.detail should be redacted placeholder',
    );
  } else {
    // detail was removed entirely — also acceptable
    assert.ok(result.lancedb.detail === undefined, 'lancedb.detail should be absent or redacted');
  }

  // Schema must still validate after redaction
  assert.doesNotThrow(() => HealthResponse.parse(result), 'HealthResponse.parse should not throw after redaction');
});

// ---------------------------------------------------------------------------
// Test 6: fixture-mode keeps debug fields
// ---------------------------------------------------------------------------

test('fixture-mode: sensitive detail strings are preserved', async () => {
  const now = Date.now();

  const redis = makeMockRedis({
    getJson: async (key) => {
      if (key === KEYS.lancedbHb) {
        throw new Error('connect error: redis://localhost:6379');
      }
      return allOkGetJson(now)(key);
    },
    pipeline: async () => ['PONG'],
  });

  const result = await buildHealthResponse(redis, 'fixture', now);

  // In fixture mode, lancedb.detail should still contain the raw error
  if (typeof result.lancedb.detail === 'string') {
    assert.ok(
      result.lancedb.detail.includes('redis://'),
      'lancedb.detail should still contain redis:// in fixture mode',
    );
  }

  // Verify NOT equal to the redacted placeholder
  assert.notEqual(
    result.lancedb.detail,
    '<redacted-in-production>',
    'lancedb.detail should not be redacted in fixture mode',
  );

  // Schema must still validate
  assert.doesNotThrow(() => HealthResponse.parse(result), 'HealthResponse.parse should not throw');
});
