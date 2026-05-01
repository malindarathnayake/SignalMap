/**
 * openapi-handler-parity.test.mts
 *
 * Proves that the OpenAPI schema for POST /api/signalmap/brief/refresh
 * correctly mirrors the BriefResult shape from brief-pipeline.
 *
 * Does NOT call runOnce() — no Redis or LLM keys required.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BriefSchema, type BriefResult } from '../src/server/lib/brief-pipeline.js';
import { BriefRefreshResponse } from '../server/api/schemas/signalmap.js';

// ---------------------------------------------------------------------------
// Subtest 1 — schema accepts full BriefResult fixture with all optional fields
// ---------------------------------------------------------------------------

test('schema accepts full BriefResult fixture with all optional fields', () => {
  const fixture: BriefResult = {
    bullets: [
      'Global cloud outages rose 12 % in the past 24 h driven by multi-region AWS disruptions.',
      'Three major providers simultaneously flagged elevated error rates across North American zones.',
    ],
    sources: [
      { label: 'AWS Status', url: 'https://health.aws.amazon.com/' },
      { label: 'The Register', url: 'https://www.theregister.com/cloud/' },
    ],
    generatedAt: '2026-04-30T10:00:00.000Z',
    model: 'anthropic/claude-sonnet-4-6',
    warnings: ['citations_dropped:1'],
    degraded: false,
    costUsd: 0.0042,
    tokensInput: 1800,
    tokensOutput: 320,
  };

  assert.doesNotThrow(() => BriefRefreshResponse.parse(fixture));
  const parsed = BriefRefreshResponse.parse(fixture);
  assert.equal(parsed.bullets.length, fixture.bullets.length);
});

// ---------------------------------------------------------------------------
// Subtest 2 — schema accepts BriefResult fixture without optional fields
// ---------------------------------------------------------------------------

test('schema accepts BriefResult fixture without optional fields', () => {
  const fixture: BriefResult = {
    bullets: ['Single-bullet brief for minimal fixture.'],
    sources: [],
    generatedAt: '2026-04-30T11:00:00.000Z',
    model: 'anthropic/claude-haiku-4-5',
    warnings: [],
    degraded: true,
    // costUsd, tokensInput, tokensOutput intentionally omitted
  };

  assert.doesNotThrow(() => BriefRefreshResponse.parse(fixture));
  const parsed = BriefRefreshResponse.parse(fixture);
  assert.equal(parsed.bullets.length, 1);
  assert.equal(parsed.costUsd, undefined);
  assert.equal(parsed.tokensInput, undefined);
  assert.equal(parsed.tokensOutput, undefined);
});

// ---------------------------------------------------------------------------
// Subtest 3 — schema is a superset of BriefSchema
// ---------------------------------------------------------------------------

test('schema is a superset of BriefSchema', () => {
  // Sanity: BriefSchema itself should accept minimal Brief
  assert.doesNotThrow(() =>
    BriefSchema.parse({ bullets: ['x'], sources: [] }),
  );

  // A Brief value extended with runtime fields should parse cleanly
  // through the new BriefRefreshResponse schema
  const minimalBrief = BriefSchema.parse({
    bullets: ['AI infrastructure spending accelerated across all major providers.'],
    sources: [{ label: 'Reuters', url: 'https://www.reuters.com/technology/' }],
  });

  const withRuntimeFields = {
    ...minimalBrief,
    generatedAt: '2026-04-30T12:00:00.000Z',
    model: 'openai/gpt-4o',
    warnings: [],
    degraded: false,
  };

  assert.doesNotThrow(() => BriefRefreshResponse.parse(withRuntimeFields));
});

// ---------------------------------------------------------------------------
// Subtest 4 — rejects old {ok, triggeredAt} placeholder shape
// ---------------------------------------------------------------------------

test('rejects old {ok, triggeredAt} placeholder shape', () => {
  const oldShape = { ok: true, triggeredAt: 'now' };
  const result = BriefRefreshResponse.safeParse(oldShape);
  assert.equal(result.success, false);
});
