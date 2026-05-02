/**
 * Brief cron — runs every SIGNALMAP_BRIEF_REFRESH_MINUTES (default 30) minutes.
 * Sole writer of signalmap:brief:global. Also publishes signalmap:brief:updated
 * for SSE broadcast on each successful write.
 *
 * Can be imported as a module (runOnce / startCron exports) or run as a CLI.
 */

// @ts-check

import { getRedisAdapter } from '../src/server/lib/redis.js';
import { callPerplexity } from '../src/server/lib/perplexity.js';
import { runBriefPipeline } from '../src/server/lib/brief-pipeline.js';
import { reserveSpend, refundDifference } from '../src/server/lib/spend-reservation.js';
import { emitMetric, METRICS } from '../src/server/lib/metrics.js';

export const BRIEF_GLOBAL_KEY = 'signalmap:brief:global';
export const BRIEF_UPDATED_CHANNEL = 'signalmap:brief:updated';
const PERPLEXITY_LASTCALL_KEY = 'signalmap:llm:lastcall:perplexity';
const PERPLEXITY_LASTCALL_TTL_SEC = 24 * 3600;

/**
 * Record the most recent Perplexity call for the api's health route to read.
 * Fire-and-forget; never blocks the brief pipeline. Reuses an injected
 * Redis adapter if the caller already opened one (avoids a second TCP
 * handshake per tick). Falls back to opening a fresh adapter via
 * getRedisAdapter() and quitting it after the SETEX, but tolerates
 * REDIS_URL absent (test/fixture mode).
 */
async function recordPerplexityLastCall(redis, payload) {
  const blob = JSON.stringify({ ...payload, calledAt: new Date().toISOString() });
  if (redis && typeof redis.setJsonEx === 'function') {
    try {
      await redis.setJsonEx(PERPLEXITY_LASTCALL_KEY, JSON.parse(blob), PERPLEXITY_LASTCALL_TTL_SEC);
    } catch {
      // tolerate; observability shouldn't block briefs
    }
    return;
  }
  let adapter;
  try {
    adapter = getRedisAdapter();
  } catch {
    return; // no Redis (fixture/test mode)
  }
  try {
    await adapter.setJsonEx(PERPLEXITY_LASTCALL_KEY, JSON.parse(blob), PERPLEXITY_LASTCALL_TTL_SEC);
  } catch {
    // tolerate
  }
}

export const DEFAULT_DOMAIN_ALLOWLIST = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'theguardian.com',
  'ft.com',
  'bloomberg.com',
  'wsj.com',
  'nytimes.com',
  'axios.com',
  'aljazeera.com',
];

/**
 * Performs one brief-generation pass.
 *
 * @param {object} [opts]
 * @param {string} [opts.signalSummary] - Pre-built signal summary text. Defaults to a placeholder.
 * @param {import('../src/server/lib/perplexity.js').PerplexityResponse} [opts.perplexityResp] - Pre-fetched Perplexity response (skips real API call).
 * @param {string[]} [opts.allowlist] - Domain allowlist override.
 * @param {Parameters<typeof import('../src/server/lib/openrouter.js').chat>[2]} [opts.openrouterOpts] - Options forwarded to runBriefPipeline (e.g. fetchImpl for tests).
 * @param {string} [opts._testBriefKey] - Override the Redis key used to store the brief. Use only in tests to avoid cross-suite key collisions.
 * @param {typeof callPerplexity} [opts._callPerplexity] - Injectable Perplexity caller for tests. Defaults to callPerplexity.
 * @param {AbortSignal} [opts.signal] - AbortSignal to cancel in-flight calls.
 * @returns {Promise<import('../src/server/lib/brief-pipeline.js').BriefResult>}
 */
export async function runOnce(opts) {
  const redis = getRedisAdapter();
  const briefKey = opts?._testBriefKey ?? BRIEF_GLOBAL_KEY;

  const signalSummary = opts?.signalSummary ?? '(no live signals available)';

  const domainEnv = process.env.SIGNALMAP_NEWS_DOMAIN_ALLOWLIST;
  const allowlist =
    opts?.allowlist ??
    (domainEnv
      ? domainEnv
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
          .slice(0, 20)
      : DEFAULT_DOMAIN_ALLOWLIST);

  const _callPerplexityFn = opts?._callPerplexity ?? callPerplexity;

  let perplexityWarnings = [];
  let perplexityResp = opts?.perplexityResp;

  if (!perplexityResp) {
    try {
      perplexityResp = await _callPerplexityFn(
        {
          messages: [
            {
              role: 'user',
              content: `Summarise the most significant global news events from the past 24 hours relevant to geopolitics, economics, security, and humanitarian issues. Focus on signal-level events. Current signal summary:\n${signalSummary}`,
            },
          ],
          searchDomainFilter: allowlist,
          searchRecencyFilter: 'day',
          searchContextSize: 'medium',
          maxTokens: 800,
        },
        opts?.signal ? { signal: opts.signal } : undefined,
      );
      // Observability: record successful Perplexity call so /api/signalmap/health
      // can surface live status. Best-effort, never blocks the brief pipeline.
      void recordPerplexityLastCall(opts?._redis, {
        outcome: 'success',
        model: perplexityResp?.model ?? 'sonar-pro',
      });
    } catch (err) {
      console.warn(`[brief-cron] Perplexity unavailable: ${err.message}. Falling back to local-signals-only.`);
      perplexityWarnings.push('External context unavailable');
      void recordPerplexityLastCall(opts?._redis, {
        outcome: 'fail',
        model: 'sonar-pro',
        errorClass: err?.name ?? 'PerplexityError',
        error: (err?.message ?? String(err)).slice(0, 80),
      });
      perplexityResp = {
        id: 'fallback-no-perplexity',
        model: 'sonar-pro',
        created: Math.floor(Date.now() / 1000),
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        citations: [],
        search_results: [],
      };
    }
  }

  const estCost = Number(process.env.SIGNALMAP_BRIEF_GLOBAL_EST_COST_USD ?? 0.05);
  const budget = Number(process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD ?? 5.0);

  const reserveResult = await reserveSpend(redis, estCost, budget);
  if (!reserveResult.ok) {
    console.warn(
      `[brief-cron] budget exhausted (running: $${reserveResult.runningTotalUsd.toFixed(4)}, limit: $${reserveResult.budgetUsd}). Skipping brief generation.`,
    );
    throw new Error(`budget_exhausted: resets at ${reserveResult.resetsAt}`);
  }

  const model = process.env.SIGNALMAP_BRIEF_MODEL ?? 'anthropic/claude-sonnet-4.6';

  let brief;
  try {
    brief = await runBriefPipeline({
      perplexityResponse: perplexityResp,
      allowlist,
      currentSignalSummary: signalSummary,
      model,
      openrouterOpts: {
        ...opts?.openrouterOpts,
        ...(opts?.signal ? { signal: opts.signal } : {}),
      },
    });
  } catch (err) {
    await refundDifference(redis, estCost, 0);
    throw err;
  }

  if (perplexityWarnings.length > 0) {
    brief.warnings = [...perplexityWarnings, ...brief.warnings];
  }

  if (typeof brief.costUsd === 'number' && isFinite(brief.costUsd)) {
    await refundDifference(redis, estCost, brief.costUsd);
  }

  emitMetric(METRICS.BRIEF_TOKENS_INPUT, brief.tokensInput ?? 0, { model: brief.model });
  emitMetric(METRICS.BRIEF_TOKENS_OUTPUT, brief.tokensOutput ?? 0, { model: brief.model });
  if (typeof brief.costUsd === 'number') {
    emitMetric(METRICS.BRIEF_COST_USD, brief.costUsd, { model: brief.model });
  }

  await redis.setJson(briefKey, brief);
  await redis.publish(BRIEF_UPDATED_CHANNEL, 'updated');

  console.log(`[brief-cron] brief written at ${brief.generatedAt} model=${brief.model}`);
  return brief;
}

/**
 * Starts the cron loop: runs runOnce immediately, then on a recurring interval.
 *
 * @param {Parameters<typeof runOnce>[0]} [opts]
 * @returns {{ stop: () => void }}
 */
export function startCron(opts) {
  const intervalMs =
    Number(process.env.SIGNALMAP_BRIEF_REFRESH_MINUTES ?? 30) * 60 * 1000;

  let stopped = false;
  let timer = null;
  let currentController = null;

  async function tick() {
    const controller = new AbortController();
    currentController = controller;
    try {
      await runOnce({ ...opts, signal: controller.signal });
    } catch (err) {
      console.error('[brief-cron] runOnce error:', err instanceof Error ? err.message : err);
    } finally {
      if (currentController === controller) {
        currentController = null;
      }
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
      if (typeof timer.unref === 'function') timer.unref();
    }
  }

  // Run immediately on start
  tick();

  return {
    stop() {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (currentController !== null) {
        currentController.abort();
        currentController = null;
      }
    },
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const cron = startCron();

  function shutdown(signal) {
    console.log(`[brief-cron] received ${signal}, shutting down`);
    cron.stop();
    process.exit(0);
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
