import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiBaseUrl, getApiBaseUrl, resolveApiBaseUrl } from '../src/client/base-url.ts';
import { generateSpec } from '../server/api/openapi.ts';

describe('API base URL contract', () => {
  const spec = generateSpec();
  const pathKeys = Object.keys(spec.paths);

  it('every OpenAPI path key starts with /api/signalmap/ and contains no /api/ws/api substring', () => {
    assert.ok(pathKeys.length >= 6, `expected at least 6 paths, got ${pathKeys.length}`);
    for (const p of pathKeys) {
      assert.ok(p.startsWith('/api/signalmap/'), `path ${p} should start with /api/signalmap/`);
      assert.ok(!p.includes('/api/ws/api'), `path ${p} contains forbidden /api/ws/api substring`);
    }
  });

  it('default getApiBaseUrl() returns "" so default-composed URLs are clean', () => {
    // With no env set, getApiBaseUrl() should return "" (browser-relative)
    assert.equal(getApiBaseUrl(), '');
    // Composing the default base with each spec path produces the path itself — no doubling.
    for (const p of pathKeys) {
      const composed = getApiBaseUrl() + p;
      assert.ok(!composed.includes('/api/ws/api'), `default composition ${composed} contains /api/ws/api`);
    }
  });

  it('normalizeApiBaseUrl behavior — collapses internal //, strips trailing /, preserves scheme', () => {
    // Empty / whitespace
    assert.equal(normalizeApiBaseUrl(''), '');
    assert.equal(normalizeApiBaseUrl('   '), '');
    // Trailing slash strip
    assert.equal(normalizeApiBaseUrl('https://example.com/'), 'https://example.com');
    assert.equal(normalizeApiBaseUrl('/api/ws/'), '/api/ws');
    // Internal // collapse
    assert.equal(normalizeApiBaseUrl('https://example.com//api'), 'https://example.com/api');
    assert.equal(normalizeApiBaseUrl('https://example.com//foo//bar/'), 'https://example.com/foo/bar');
    // No-op for clean input
    assert.equal(normalizeApiBaseUrl('https://example.com'), 'https://example.com');
    assert.equal(normalizeApiBaseUrl('https://example.com/api'), 'https://example.com/api');
    // Protocol scheme preserved verbatim
    assert.equal(normalizeApiBaseUrl('ws://example.com/'), 'ws://example.com');
    assert.equal(normalizeApiBaseUrl('wss://example.com//path'), 'wss://example.com/path');
    // Bare slash should remain a slash (length 1, don't strip)
    assert.equal(normalizeApiBaseUrl('/'), '/');
  });

  it('misconfigured /api/ws base is rejected — composed URL never contains /api/ws/api', () => {
    // Path-only input is a misconfiguration. resolveApiBaseUrl returns ''
    // (browser-relative), so composing with each spec path produces the path itself.
    // The /api/ws/api doubled prefix can never appear.
    const base = resolveApiBaseUrl('/api/ws');
    assert.equal(base, '', 'path-only base must be rejected and fall back to ""');
    for (const p of pathKeys) {
      const composed = base + p;
      assert.ok(!composed.includes('/api/ws/api'), `composition ${composed} must not contain /api/ws/api`);
    }
  });

  it('absolute URLs are accepted by resolveApiBaseUrl and normalized', () => {
    assert.equal(resolveApiBaseUrl('https://api.example.com'), 'https://api.example.com');
    assert.equal(resolveApiBaseUrl('https://api.example.com/'), 'https://api.example.com');
    assert.equal(resolveApiBaseUrl('https://api.example.com//base/'), 'https://api.example.com/base');
    assert.equal(resolveApiBaseUrl(''), '');
    assert.equal(resolveApiBaseUrl(null), '');
    assert.equal(resolveApiBaseUrl(undefined), '');
  });
});
