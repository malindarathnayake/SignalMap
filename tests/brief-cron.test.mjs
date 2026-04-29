/**
 * Integration tests for brief-cron.mjs runOnce().
 *
 * Requires a Redis 7 server at REDIS_URL. Suite is skipped when unset.
 * Run:
 *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/brief-cron.test.mjs
 */

import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRedisAdapter } from '../src/server/lib/redis.ts';
import {
  runOnce,
  startCron,
  BRIEF_GLOBAL_KEY,
  BRIEF_UPDATED_CHANNEL,
  DEFAULT_DOMAIN_ALLOWLIST,
} from '../scripts/brief-cron.mjs';
import { getSpendKey, readDailySpend } from '../src/server/lib/spend-reservation.ts';

const REDIS_URL = process.env.REDIS_URL;
let skip = !REDIS_URL;

if (!REDIS_URL) {
  console.warn('[brief-cron.test] REDIS_URL not set — skipping suite');
}

// Unique key prefix per test suite run to avoid collisions with parallel test suites
const SUITE_ID = randomUUID().slice(0, 8);
const TEST_BRIEF_KEY = `signalmap:test:brief:${SUITE_ID}`;

/** Minimal valid PerplexityResponse fixture */
function makePerplexityFixture(citations = ['https://reuters.com/article/x']) {
  return {
    id: 'test-pplx-001',
    model: 'sonar-pro',
    created: Math.floor(Date.now() / 1000),
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Global tensions rose this week according to multiple sources.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
    citations,
    search_results: citations.map((url) => ({ url })),
  };
}

/** Minimal valid OpenRouter fetch stub that returns a BriefSchema-conforming JSON */
function makeOpenRouterFetchStub(bullets = ['Global tensions rose today.', 'Markets fell sharply.']) {
  return async (_url, _opts) => {
    const responseBody = {
      id: 'or-test-001',
      model: 'anthropic/claude-sonnet-4.6',
      created: Math.floor(Date.now() / 1000),
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              bullets,
              sources: [{ label: 'Reuters', url: 'https://reuters.com/article/x' }],
            }),
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
    };
    return {
      ok: true,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    };
  };
}

describe('brief-cron runOnce()', { skip }, () => {
  let adapter;

  before(async () => {
    adapter = createRedisAdapter({ url: REDIS_URL });
    try {
      await adapter.incr('signalmap:test:probe:brief-cron');
      await adapter.del('signalmap:test:probe:brief-cron');
    } catch (err) {
      skip = true;
      console.warn('[brief-cron.test] Redis unreachable:', err?.message);
    }
  });

  after(async () => {
    if (adapter) {
      await adapter.del(TEST_BRIEF_KEY);
      await adapter.quit();
    }
    try {
      const { getRedisAdapter } = await import('../src/server/lib/redis.ts');
      await getRedisAdapter().quit();
    } catch { /* singleton never initialized */ }
  });

  beforeEach(async () => {
    if (skip) return;
    await adapter.del(TEST_BRIEF_KEY);
    await adapter.del(getSpendKey());
  });

  it('1. runOnce writes signalmap:brief:global', async (t) => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD = '100';
    t.after(() => {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = savedKey;
      delete process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD;
    });

    const perplexityResp = makePerplexityFixture(['https://reuters.com/article/x']);
    const fetchImpl = makeOpenRouterFetchStub();

    await runOnce({
      signalSummary: 'Test signal summary',
      perplexityResp,
      allowlist: DEFAULT_DOMAIN_ALLOWLIST,
      openrouterOpts: { fetchImpl },
      _testBriefKey: TEST_BRIEF_KEY,
    });

    const stored = await adapter.getJson(TEST_BRIEF_KEY);
    assert.ok(stored !== null, 'Brief should be written to Redis');
    assert.ok(Array.isArray(stored.bullets), 'Brief should have bullets array');
    assert.ok(stored.bullets.length >= 1, 'Brief should have at least 1 bullet');
    assert.equal(typeof stored.generatedAt, 'string', 'Brief should have generatedAt');
    assert.equal(typeof stored.model, 'string', 'Brief should have model');
  });

  it('2. runOnce publishes signalmap:brief:updated', async (t) => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD = '100';
    t.after(() => {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = savedKey;
      delete process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD;
    });

    const perplexityResp = makePerplexityFixture(['https://reuters.com/article/x']);
    const fetchImpl = makeOpenRouterFetchStub();

    let messageReceived = null;
    const disposer = adapter.subscribe(BRIEF_UPDATED_CHANNEL, (msg) => {
      messageReceived = msg;
    });
    t.after(() => disposer.dispose());

    await runOnce({
      signalSummary: 'Pub/sub test',
      perplexityResp,
      allowlist: DEFAULT_DOMAIN_ALLOWLIST,
      openrouterOpts: { fetchImpl },
      _testBriefKey: TEST_BRIEF_KEY,
    });

    // Wait up to 1s for the message
    const deadline = Date.now() + 1000;
    while (messageReceived === null && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }

    assert.equal(messageReceived, 'updated', `Expected 'updated' message on ${BRIEF_UPDATED_CHANNEL}`);
  });

  it('3. runOnce respects budget — skips when over budget', async (t) => {
    const budget = 1.0;
    process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD = String(budget);
    t.after(() => {
      delete process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD;
    });

    // Pre-set spend to just below budget so the next reservation pushes over
    const estCost = Number(process.env.SIGNALMAP_BRIEF_GLOBAL_EST_COST_USD ?? 0.05);
    const spendKey = getSpendKey();
    await adapter.del(spendKey);
    await adapter.incrByFloat(spendKey, budget - estCost + 0.001);

    const perplexityResp = makePerplexityFixture();
    const fetchImpl = makeOpenRouterFetchStub(['budget-test-unique-bullet']);

    await assert.rejects(
      () =>
        runOnce({
          signalSummary: 'Budget test',
          perplexityResp,
          allowlist: DEFAULT_DOMAIN_ALLOWLIST,
          openrouterOpts: { fetchImpl },
          _testBriefKey: TEST_BRIEF_KEY,
        }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('budget_exhausted'));
        return true;
      },
    );

    const stored = await adapter.getJson(TEST_BRIEF_KEY);
    assert.equal(stored, null, 'Brief should NOT be written when budget is exhausted');
  });

  it('4. DEFAULT_DOMAIN_ALLOWLIST has ≤20 entries', () => {
    assert.ok(
      DEFAULT_DOMAIN_ALLOWLIST.length <= 20,
      `Expected ≤20 domains, got ${DEFAULT_DOMAIN_ALLOWLIST.length}`,
    );
  });

  it('5. runOnce falls back when Perplexity throws — brief still publishes with External context unavailable warning', async (t) => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD = '100';
    t.after(() => {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = savedKey;
      delete process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD;
    });

    const fetchImpl = makeOpenRouterFetchStub(['Fallback bullet one.', 'Fallback bullet two.', 'Fallback bullet three.']);

    const brief = await runOnce({
      signalSummary: 'Fallback test',
      allowlist: DEFAULT_DOMAIN_ALLOWLIST,
      openrouterOpts: { fetchImpl },
      _testBriefKey: TEST_BRIEF_KEY,
      _callPerplexity: async () => { throw new Error('upstream 503'); },
    });

    assert.ok(Array.isArray(brief.warnings), 'warnings should be an array');
    assert.ok(
      brief.warnings.includes('External context unavailable'),
      `Expected 'External context unavailable' in warnings, got: ${JSON.stringify(brief.warnings)}`,
    );

    const stored = await adapter.getJson(TEST_BRIEF_KEY);
    assert.ok(stored !== null, 'Brief should be written to Redis even after Perplexity failure');
  });

  it('6. runOnce refunds usage-vs-estimate delta on success', async (t) => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD = '100';
    process.env.SIGNALMAP_BRIEF_GLOBAL_EST_COST_USD = '0.05';
    t.after(() => {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = savedKey;
      delete process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD;
      delete process.env.SIGNALMAP_BRIEF_GLOBAL_EST_COST_USD;
    });

    const perplexityResp = makePerplexityFixture(['https://reuters.com/article/x']);

    // Stub that returns usage.cost = 0.012 (lower than est 0.05)
    const fetchImpl = async (_url, _opts) => {
      const responseBody = {
        id: 'or-cost-test',
        model: 'anthropic/claude-sonnet-4.6',
        created: Math.floor(Date.now() / 1000),
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                bullets: ['Cost delta bullet one.', 'Cost delta bullet two.', 'Cost delta bullet three.'],
                sources: [{ label: 'Reuters', url: 'https://reuters.com/article/x' }],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, cost: 0.012 },
      };
      return {
        ok: true,
        json: async () => responseBody,
        text: async () => JSON.stringify(responseBody),
      };
    };

    await runOnce({
      signalSummary: 'Cost refund test',
      perplexityResp,
      allowlist: DEFAULT_DOMAIN_ALLOWLIST,
      openrouterOpts: { fetchImpl },
      _testBriefKey: TEST_BRIEF_KEY,
    });

    const spend = await readDailySpend(adapter);
    assert.ok(
      Math.abs(spend - 0.012) < 0.001,
      `Expected spend ~0.012, got ${spend}`,
    );
  });

  it('7. startCron stop() aborts in-flight call', async (t) => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD = '100';
    process.env.SIGNALMAP_BRIEF_REFRESH_MINUTES = '60';
    t.after(() => {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = savedKey;
      delete process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD;
      delete process.env.SIGNALMAP_BRIEF_REFRESH_MINUTES;
    });

    let resolveAborted;
    const abortedPromise = new Promise((resolve) => { resolveAborted = resolve; });

    const cron = startCron({
      signalSummary: 'Abort test',
      allowlist: DEFAULT_DOMAIN_ALLOWLIST,
      _testBriefKey: TEST_BRIEF_KEY,
      _callPerplexity: async (_req, opts) => {
        return new Promise((_resolve, reject) => {
          if (opts?.signal) {
            opts.signal.addEventListener('abort', () => {
              resolveAborted(true);
              reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
            });
          } else {
            // No signal — resolve never fires, so we resolve abortedPromise with false
            resolveAborted(false);
          }
        });
      },
    });

    // Give the cron tick a moment to start before stopping
    await new Promise((r) => setTimeout(r, 20));
    cron.stop();

    const wasAborted = await Promise.race([
      abortedPromise,
      new Promise((r) => setTimeout(() => r('timeout'), 500)),
    ]);

    assert.notEqual(wasAborted, 'timeout', 'Expected abort signal to fire within 500ms');
    assert.equal(wasAborted, true, 'Expected Perplexity call to be aborted via signal');
  });
});
