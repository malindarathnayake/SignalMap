import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  handleSignalMapBriefRefreshFromUi,
  handleSignalMapBriefRefreshConfig,
  setRunOnce,
} from '../server/api/routes/signalmap-brief-refresh-from-ui.ts';
import type { BriefResult } from '../src/server/lib/brief-pipeline.js';

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(k: string, v: string): void;
  end(b?: string): void;
}

function makeMockRes(): MockRes {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b ?? ''; },
  };
}

function makeReq(headers: Record<string, string>) {
  return { headers, method: 'POST', url: '/api/signalmap/brief/refresh-from-ui' } as never;
}

// Each test must save+restore process.env.SIGNALMAP_REFRESH_FROM_UI_ENABLED + SIGNALMAP_ADMIN_TOKEN
// because process.env mutations persist across tests in the same node:test run.

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void> | void): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  return Promise.resolve().then(fn).finally(restore);
}

// Fixture BriefResult for injection via setRunOnce
const FIXTURE_BRIEF: BriefResult = {
  bullets: ['Bullet one from fixture', 'Bullet two from fixture'],
  sources: [{ label: 'Source A', url: 'https://example.com/a' }],
  generatedAt: '2026-04-30T00:00:00.000Z',
  model: 'test-model',
  warnings: [],
  degraded: false,
};

// Default no-op runOnce to restore after injection tests
const defaultRunOnceSentinel = async (): Promise<BriefResult> => {
  throw new Error('runOnce should not be called in this test');
};

test('503 refresh_from_ui_disabled when SIGNALMAP_REFRESH_FROM_UI_ENABLED is unset', async () => {
  await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: undefined, SIGNALMAP_ADMIN_TOKEN: 'tok' }, async () => {
    const req = makeReq({ host: 'localhost:3000', origin: 'http://localhost:3000' });
    const res = makeMockRes();
    await handleSignalMapBriefRefreshFromUi(req, res);
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).error.code, 'refresh_from_ui_disabled');
  });
});

test('503 admin_token_not_configured when SIGNALMAP_ADMIN_TOKEN is unset', async () => {
  await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: '1', SIGNALMAP_ADMIN_TOKEN: undefined }, async () => {
    const req = makeReq({ host: 'localhost:3000', origin: 'http://localhost:3000' });
    const res = makeMockRes();
    await handleSignalMapBriefRefreshFromUi(req, res);
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).error.code, 'admin_token_not_configured');
  });
});

test('403 cross_origin_forbidden when Origin header host does not match request host', async () => {
  await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: '1', SIGNALMAP_ADMIN_TOKEN: 'tok' }, async () => {
    const req = makeReq({ host: 'localhost:3000', origin: 'http://evil.example' });
    const res = makeMockRes();
    await handleSignalMapBriefRefreshFromUi(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(JSON.parse(res.body).error.code, 'cross_origin_forbidden');
  });
});

test('403 cross_origin_forbidden when neither Origin nor Referer is present', async () => {
  await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: '1', SIGNALMAP_ADMIN_TOKEN: 'tok' }, async () => {
    const req = makeReq({ host: 'localhost:3000' });
    const res = makeMockRes();
    await handleSignalMapBriefRefreshFromUi(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(JSON.parse(res.body).error.code, 'cross_origin_forbidden');
  });
});

test('200 BriefResult shape when same-origin Origin matches host and runOnce succeeds', async () => {
  await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: '1', SIGNALMAP_ADMIN_TOKEN: 'supersecrettoken' }, async () => {
    setRunOnce(async () => FIXTURE_BRIEF);
    try {
      const req = makeReq({ host: 'localhost:3000', origin: 'http://localhost:3000' });
      const res = makeMockRes();
      await handleSignalMapBriefRefreshFromUi(req, res);
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.bullets[0], FIXTURE_BRIEF.bullets[0]);
      // Token must not appear in response body
      assert.equal(res.body.includes('supersecrettoken'), false, 'Admin token must not appear in response body');
    } finally {
      setRunOnce(defaultRunOnceSentinel);
    }
  });
});

test('200 BriefResult when same-origin via Referer (Origin missing)', async () => {
  await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: '1', SIGNALMAP_ADMIN_TOKEN: 'tok' }, async () => {
    setRunOnce(async () => FIXTURE_BRIEF);
    try {
      const req = makeReq({ host: 'localhost:3000', referer: 'http://localhost:3000/some/path' });
      const res = makeMockRes();
      await handleSignalMapBriefRefreshFromUi(req, res);
      assert.equal(res.statusCode, 200);
    } finally {
      setRunOnce(defaultRunOnceSentinel);
    }
  });
});

test('502 refresh_failed when runOnce throws', async () => {
  await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: '1', SIGNALMAP_ADMIN_TOKEN: 'tok' }, async () => {
    setRunOnce(async () => { throw new Error('upstream-401'); });
    try {
      const req = makeReq({ host: 'localhost:3000', origin: 'http://localhost:3000' });
      const res = makeMockRes();
      await handleSignalMapBriefRefreshFromUi(req, res);
      assert.equal(res.statusCode, 502);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'refresh_failed');
      assert.ok(body.error.message.includes('upstream-401'), `Expected message to include 'upstream-401', got: ${body.error.message}`);
    } finally {
      setRunOnce(defaultRunOnceSentinel);
    }
  });
});

test('refresh-config subtests', async (t) => {
  await t.test('returns enabled=true when both env vars are set', async () => {
    await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: '1', SIGNALMAP_ADMIN_TOKEN: 'tok' }, () => {
      const req = makeReq({ host: 'localhost:3000' });
      const res = makeMockRes();
      handleSignalMapBriefRefreshConfig(req, res);
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.enabled, true);
      // Token must not appear in config response body
      assert.equal(res.body.includes('tok'), false, 'Admin token must not appear in config response body');
    });
  });

  await t.test('returns enabled=false when ENABLED env is missing', async () => {
    await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: undefined, SIGNALMAP_ADMIN_TOKEN: 'tok' }, () => {
      const req = makeReq({ host: 'localhost:3000' });
      const res = makeMockRes();
      handleSignalMapBriefRefreshConfig(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.body).enabled, false);
    });
  });

  await t.test('returns enabled=false when admin token is missing', async () => {
    await withEnv({ SIGNALMAP_REFRESH_FROM_UI_ENABLED: '1', SIGNALMAP_ADMIN_TOKEN: undefined }, () => {
      const req = makeReq({ host: 'localhost:3000' });
      const res = makeMockRes();
      handleSignalMapBriefRefreshConfig(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.body).enabled, false);
    });
  });
});
