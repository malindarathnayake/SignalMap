import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRouter } from '../server/api/router.ts';

// ---------------------------------------------------------------------------
// Minimal mock helpers
// ---------------------------------------------------------------------------

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(k: string, v: string): void;
  end(b?: string): void;
}

function makeMockReq(method: string, url: string): IncomingMessage {
  return { method, url, headers: {} } as unknown as IncomingMessage;
}

function makeMockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v;
    },
    end(b?) {
      res.body = b ?? '';
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Test 1: exact match — handler invoked, params is empty object {}
// ---------------------------------------------------------------------------

test('exact match — handler invoked, params is {}', async () => {
  const router = createRouter();
  let invoked = 0;
  let capturedParams: unknown;

  router.get('/api/health', (req) => {
    invoked++;
    capturedParams = (req as Record<string, unknown>)['params'];
  });

  const req = makeMockReq('GET', '/api/health');
  const res = makeMockRes();
  await router.route(req, res as unknown as ServerResponse);

  assert.equal(invoked, 1, 'handler must be called exactly once');
  assert.deepEqual(capturedParams, {}, 'params must be an empty object');
});

// ---------------------------------------------------------------------------
// Test 2: param match — params.id is populated
// ---------------------------------------------------------------------------

test('param match — params.id === "abc-123"', async () => {
  const router = createRouter();
  let invoked = 0;
  let capturedParams: unknown;

  router.get('/api/foo/{id}', (req) => {
    invoked++;
    capturedParams = (req as Record<string, unknown>)['params'];
  });

  const req = makeMockReq('GET', '/api/foo/abc-123');
  const res = makeMockRes();
  await router.route(req, res as unknown as ServerResponse);

  assert.equal(invoked, 1, 'handler must be called exactly once');
  assert.deepEqual(capturedParams, { id: 'abc-123' });
});

// ---------------------------------------------------------------------------
// Test 3: method mismatch → 405, Allow header, handler NOT invoked
// ---------------------------------------------------------------------------

test('method mismatch → 405 with Allow header, handler not invoked', async () => {
  const router = createRouter();
  let invoked = 0;

  router.get('/api/foo', () => {
    invoked++;
  });

  const req = makeMockReq('POST', '/api/foo');
  const res = makeMockRes();
  await router.route(req, res as unknown as ServerResponse);

  assert.equal(invoked, 0, 'handler must NOT be invoked');
  assert.equal(res.statusCode, 405);
  assert.deepEqual(JSON.parse(res.body), { error: { code: 'method_not_allowed' } });
  assert.equal(res.headers['allow'], 'GET', 'Allow header must list GET');
});

// ---------------------------------------------------------------------------
// Test 4: no path match → 404, handler NOT invoked
// ---------------------------------------------------------------------------

test('no path match → 404, handler not invoked', async () => {
  const router = createRouter();
  let invoked = 0;

  router.get('/api/foo', () => {
    invoked++;
  });

  const req = makeMockReq('GET', '/api/missing');
  const res = makeMockRes();
  await router.route(req, res as unknown as ServerResponse);

  assert.equal(invoked, 0, 'handler must NOT be invoked');
  assert.equal(res.statusCode, 404);
  assert.deepEqual(JSON.parse(res.body), { error: { code: 'not_found' } });
});

// ---------------------------------------------------------------------------
// Test 5: multi-param — params.x and params.y both populated
// ---------------------------------------------------------------------------

test('multi-param — params.x === "1", params.y === "2"', async () => {
  const router = createRouter();
  let capturedParams: unknown;

  router.get('/a/{x}/b/{y}', (req) => {
    capturedParams = (req as Record<string, unknown>)['params'];
  });

  const req = makeMockReq('GET', '/a/1/b/2');
  const res = makeMockRes();
  await router.route(req, res as unknown as ServerResponse);

  assert.deepEqual(capturedParams, { x: '1', y: '2' });
});

// ---------------------------------------------------------------------------
// Test 6: header injection blocked — path-derived params overwrite injected value
// ---------------------------------------------------------------------------

test('header injection blocked — path-derived value overwrites pre-populated params', async () => {
  const router = createRouter();
  let capturedParams: unknown;

  router.get('/api/foo/{id}', (req) => {
    capturedParams = (req as Record<string, unknown>)['params'];
  });

  const req = makeMockReq('GET', '/api/foo/safe-value');
  // Simulate attacker pre-populating params before route() is called
  (req as Record<string, unknown>)['params'] = { id: 'evil-injected' };

  const res = makeMockRes();
  await router.route(req, res as unknown as ServerResponse);

  const params = capturedParams as Record<string, string>;
  assert.equal(params['id'], 'safe-value', 'must use path-derived value, not injected');
});
