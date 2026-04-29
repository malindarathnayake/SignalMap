/**
 * Unit tests for src/services/premium-fetch.ts.
 *
 * In this fork premiumFetch is a compatibility pass-through. It must not inject
 * Clerk tokens, API keys, tester keys, or retry with alternate credentials.
 */

import assert from 'node:assert/strict';
import { describe, it, before, after, mock } from 'node:test';
import { premiumFetch, _setTestProviders } from '@/services/premium-fetch';

function fakeRes(status: number) {
  return new Response('{}', { status, headers: { 'Content-Type': 'application/json' } });
}

type FetchMock = ReturnType<typeof mock.method<typeof globalThis, 'fetch'>>;
let fetchMock: FetchMock;

function sentHeaders(callIndex = 0): Headers {
  const call = fetchMock.mock.calls[callIndex];
  return new Headers((call.arguments[1] as RequestInit | undefined)?.headers);
}

const TARGET = 'https://api.worldmonitor.app/api/some-feature-rpc';

describe('premiumFetch', () => {
  before(() => {
    fetchMock = mock.method(globalThis, 'fetch', () => Promise.resolve(fakeRes(200)));
  });

  after(() => {
    fetchMock.mock.restore();
    _setTestProviders(null);
  });

  function setup(fetchImpl: () => Promise<Response> = () => Promise.resolve(fakeRes(200))) {
    _setTestProviders({
      getTesterKeys: () => ['tester-key-should-not-be-used'],
      getClerkToken: async () => 'clerk-token-should-not-be-used',
    });
    fetchMock.mock.resetCalls();
    fetchMock.mock.mockImplementation(fetchImpl);
  }

  it('forwards caller headers unchanged', async () => {
    setup();
    await premiumFetch(TARGET, { headers: { Authorization: 'Bearer existing-token' } });

    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(sentHeaders().get('Authorization'), 'Bearer existing-token');
    assert.equal(sentHeaders().get('X-WorldMonitor-Key'), null);
  });

  it('does not inject tester keys or Clerk tokens', async () => {
    setup();
    const res = await premiumFetch(TARGET);

    assert.equal(res.status, 200);
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(sentHeaders().get('Authorization'), null);
    assert.equal(sentHeaders().get('X-WorldMonitor-Key'), null);
  });

  it('does not retry 401 responses with alternate credentials', async () => {
    setup(() => Promise.resolve(fakeRes(401)));
    const res = await premiumFetch(TARGET);

    assert.equal(res.status, 401);
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(sentHeaders().get('Authorization'), null);
    assert.equal(sentHeaders().get('X-WorldMonitor-Key'), null);
  });

  it('returns 5xx responses without retrying', async () => {
    setup(() => Promise.resolve(fakeRes(503)));
    const res = await premiumFetch(TARGET);

    assert.equal(res.status, 503);
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  it('propagates fetch errors', async () => {
    const abortErr = new DOMException('The operation was aborted.', 'AbortError');
    setup(() => Promise.reject(abortErr));

    await assert.rejects(
      () => premiumFetch(TARGET),
      (err: unknown) => {
        assert.ok(err instanceof DOMException);
        assert.equal(err.name, 'AbortError');
        return true;
      },
    );
  });
});
