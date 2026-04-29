import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { createDomainGateway } from '../server/gateway.ts';

const originalKeys = process.env.WORLDMONITOR_VALID_KEYS;

afterEach(() => {
  if (originalKeys == null) delete process.env.WORLDMONITOR_VALID_KEYS;
  else process.env.WORLDMONITOR_VALID_KEYS = originalKeys;
});

function createHandler() {
  return createDomainGateway([
    {
      method: 'GET',
      path: '/api/market/v1/analyze-stock',
      handler: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    },
    {
      method: 'GET',
      path: '/api/resilience/v1/get-resilience-score',
      handler: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    },
    {
      method: 'GET',
      path: '/api/resilience/v1/get-resilience-ranking',
      handler: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    },
    {
      method: 'GET',
      path: '/api/market/v1/list-market-quotes',
      handler: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    },
  ]);
}

describe('former premium gateway feature routes', () => {
  it('allows trusted browser origins without product-tier credentials', async () => {
    const handler = createHandler();

    const stock = await handler(new Request('https://worldmonitor.app/api/market/v1/analyze-stock?symbol=AAPL', {
      headers: { Origin: 'https://worldmonitor.app' },
    }));
    assert.equal(stock.status, 200);

    const resilienceScore = await handler(new Request('https://worldmonitor.app/api/resilience/v1/get-resilience-score?countryCode=US', {
      headers: { Origin: 'https://worldmonitor.app' },
    }));
    assert.equal(resilienceScore.status, 200);

    const resilienceRanking = await handler(new Request('https://worldmonitor.app/api/resilience/v1/get-resilience-ranking', {
      headers: { Origin: 'https://worldmonitor.app' },
    }));
    assert.equal(resilienceRanking.status, 200);
  });

  it('allows same-origin Fetch Metadata without credentials', async () => {
    const handler = createHandler();
    const res = await handler(new Request('https://worldmonitor.app/api/market/v1/analyze-stock?symbol=AAPL', {
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    }));

    assert.equal(res.status, 200);
  });

  it('keeps desktop API-key enforcement', async () => {
    const handler = createHandler();
    const res = await handler(new Request('https://worldmonitor.app/api/market/v1/analyze-stock?symbol=AAPL', {
      headers: { Origin: 'tauri://localhost' },
    }));

    assert.equal(res.status, 401);
  });

  it('keeps disallowed origins blocked before route handling', async () => {
    const handler = createHandler();
    const res = await handler(new Request('https://external.example.com/api/market/v1/analyze-stock?symbol=AAPL', {
      headers: { Origin: 'https://external.example.com' },
    }));

    assert.equal(res.status, 403);
  });
});
