/**
 * Tests that generateSpec() produces a well-formed OpenAPI 3.1 document
 * covering all 6 SignalMap endpoints.
 *
 * Run with:  npx tsx --test tests/openapi-spec-generation.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSpec } from '../server/api/openapi.ts';

describe('OpenAPI spec generation', () => {
  const spec = generateSpec();

  it('emits OpenAPI 3.1 with required top-level fields', () => {
    assert.equal(spec.openapi, '3.1.0');
    assert.ok(spec.info?.title);
    assert.ok(spec.info?.version);
    assert.ok(spec.paths);
    assert.ok(spec.components?.schemas);
  });

  it('declares all 6 SignalMap endpoints', () => {
    const paths = Object.keys(spec.paths);
    assert.ok(paths.includes('/api/signalmap/list'));
    assert.ok(paths.includes('/api/signalmap/event/{id}'));
    assert.ok(paths.includes('/api/signalmap/source-health'));
    assert.ok(paths.includes('/api/signalmap/stream'));
    assert.ok(paths.includes('/api/signalmap/brief/global'));
    assert.ok(paths.includes('/api/signalmap/brief/event/{id}'));
  });

  it('list endpoint declares filter query params', () => {
    const op = spec.paths['/api/signalmap/list'].get;
    assert.ok(op.operationId);
    const paramNames = (op.parameters ?? []).map(p => p.name);
    for (const name of ['start_ms', 'end_ms', 'categories', 'watch_regions', 'watch_providers', 'watchlist_only']) {
      assert.ok(paramNames.includes(name), `missing query param: ${name}`);
    }
  });

  it('event endpoint declares id path param', () => {
    const op = spec.paths['/api/signalmap/event/{id}'].get;
    const idParam = (op.parameters ?? []).find(p => p.name === 'id' && p.in === 'path');
    assert.ok(idParam, 'missing path param: id');
    assert.equal(idParam.required, true);
  });

  it('stream endpoint advertises text/event-stream', () => {
    const op = spec.paths['/api/signalmap/stream'].get;
    const ok = op.responses['200'];
    assert.ok(ok.content?.['text/event-stream'], 'stream 200 must declare text/event-stream content');
  });

  it('every operation declares a 5XX error response', () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (typeof op !== 'object' || !op.responses) continue;
        const has5xx = ['5XX', '500', 'default'].some(k => k in op.responses);
        assert.ok(has5xx, `${method.toUpperCase()} ${path} missing 5XX/default error response`);
      }
    }
  });

  it('SignalMapEvent schema is registered as a component ref', () => {
    const schemas = spec.components.schemas;
    // zod-openapi v4 names from .openapi({ ref: 'SignalMapEvent' })
    assert.ok(schemas.SignalMapEvent, 'SignalMapEvent schema not in components');
    assert.ok(schemas.SignalMapSourceHealth, 'SignalMapSourceHealth schema not in components');
  });
});
