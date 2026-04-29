/**
 * Unit tests for src/server/lib/metrics.ts (emitMetric, METRICS).
 * No Redis required.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emitMetric, METRICS } from '../src/server/lib/metrics.ts';

describe('emitMetric', () => {
  it('1. writes a single JSON line to stdout with expected shape', (t) => {
    const lines = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      lines.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      return true;
    };
    t.after(() => {
      process.stdout.write = originalWrite;
    });

    // Ensure metrics are not disabled
    const savedDisabled = process.env.SIGNALMAP_METRICS_DISABLED;
    delete process.env.SIGNALMAP_METRICS_DISABLED;
    const savedLevel = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    t.after(() => {
      if (savedDisabled === undefined) delete process.env.SIGNALMAP_METRICS_DISABLED;
      else process.env.SIGNALMAP_METRICS_DISABLED = savedDisabled;
      if (savedLevel === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = savedLevel;
    });

    emitMetric('signalmap.test.metric', 42, { flavor: 'unit' });

    assert.equal(lines.length, 1, `Expected 1 stdout line, got ${lines.length}`);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.metric, 'signalmap.test.metric');
    assert.equal(parsed.value, 42);
    assert.equal(parsed.level, 'info');
    assert.equal(parsed.flavor, 'unit');
    assert.equal(typeof parsed.time, 'number');
  });

  it('2. skips when SIGNALMAP_METRICS_DISABLED=1', (t) => {
    const lines = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      lines.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      return true;
    };
    t.after(() => {
      process.stdout.write = originalWrite;
    });

    const saved = process.env.SIGNALMAP_METRICS_DISABLED;
    process.env.SIGNALMAP_METRICS_DISABLED = '1';
    t.after(() => {
      if (saved === undefined) delete process.env.SIGNALMAP_METRICS_DISABLED;
      else process.env.SIGNALMAP_METRICS_DISABLED = saved;
    });

    emitMetric('signalmap.test.disabled', 1);
    assert.equal(lines.length, 0, 'Expected no stdout output when metrics disabled');
  });

  it('3. respects LOG_LEVEL: info metric dropped when LOG_LEVEL=warn', (t) => {
    const lines = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      lines.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      return true;
    };
    t.after(() => {
      process.stdout.write = originalWrite;
    });

    const savedDisabled = process.env.SIGNALMAP_METRICS_DISABLED;
    delete process.env.SIGNALMAP_METRICS_DISABLED;
    const savedLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'warn';
    t.after(() => {
      if (savedDisabled === undefined) delete process.env.SIGNALMAP_METRICS_DISABLED;
      else process.env.SIGNALMAP_METRICS_DISABLED = savedDisabled;
      if (savedLevel === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = savedLevel;
    });

    emitMetric('signalmap.test.info', 1, {}, 'info');
    assert.equal(lines.length, 0, 'Expected info metric dropped when LOG_LEVEL=warn');
  });

  it('4. METRICS const exposes the 8 required metric names', () => {
    assert.equal(METRICS.BRIEF_CALLS, 'signalmap.brief.calls');
    assert.equal(METRICS.BRIEF_CACHE_HITS, 'signalmap.brief.cache_hits');
    assert.equal(METRICS.BRIEF_LOCK_CONTENTION, 'signalmap.brief.lock_contention');
    assert.equal(METRICS.BRIEF_BUDGET_REFUSALS, 'signalmap.brief.budget_refusals');
    assert.equal(METRICS.BRIEF_CITATIONS_DROPPED, 'signalmap.brief.citations_dropped');
    assert.equal(METRICS.BRIEF_TOKENS_INPUT, 'signalmap.brief.tokens_input');
    assert.equal(METRICS.BRIEF_TOKENS_OUTPUT, 'signalmap.brief.tokens_output');
    assert.equal(METRICS.BRIEF_COST_USD, 'signalmap.brief.cost_usd');
  });
});
