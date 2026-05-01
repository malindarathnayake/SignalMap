import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  collectSignalMapCloudflareRadar,
  writeSignalMapCloudflareRadar,
} from '../server/workers/cloudflare-radar-source.ts';
import {
  collectSignalMapProviderStatuses,
  writeSignalMapProviderStatuses,
} from '../server/workers/provider-status-sources.ts';

const NOW = '2026-05-01T00:00:00.000Z';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(value: string, status = 200): Response {
  return new Response(value, {
    status,
    headers: { 'content-type': 'application/xml' },
  });
}

test('provider status collector normalizes statuspage, RSS, and healthcheck sources', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url === 'https://example.test/openai.json') {
      return jsonResponse({
        incidents: [
          {
            id: 'inc-1',
            name: 'API latency degradation',
            status: 'investigating',
            impact: 'major',
            created_at: NOW,
            updated_at: NOW,
            shortlink: 'https://status.openai.com/incidents/inc-1',
          },
        ],
        scheduled_maintenances: [],
      });
    }
    if (url === 'https://example.test/aws.rss') {
      return textResponse(`
        <rss><channel><item>
          <title>Lambda availability disruption</title>
          <link>https://status.aws.amazon.com/example</link>
          <guid>aws-1</guid>
          <pubDate>Fri, 01 May 2026 00:00:00 GMT</pubDate>
          <description>Elevated errors affecting Lambda requests.</description>
        </item></channel></rss>
      `);
    }
    if (url === 'https://example.test/gdelt') {
      return textResponse('<html>ok</html>');
    }
    return textResponse('not found', 404);
  };

  const result = await collectSignalMapProviderStatuses({
    now: NOW,
    fetchImpl,
    sources: [
      {
        id: 'openai-status',
        label: 'OpenAI Status',
        provider: 'openai',
        kind: 'statuspage',
        url: 'https://example.test/openai.json',
      },
      {
        id: 'aws-lambda-use1',
        label: 'AWS Lambda us-east-1',
        provider: 'aws',
        kind: 'rss',
        url: 'https://example.test/aws.rss',
      },
      {
        id: 'gdelt',
        label: 'GDELT GKG Index',
        kind: 'healthcheck',
        url: 'https://example.test/gdelt',
      },
    ],
  });

  assert.equal(result.events.length, 2);
  assert.equal(result.sourceHealth.length, 3);
  assert.deepEqual(result.sourceHealth.map((row) => row.status), ['ok', 'ok', 'ok']);
  assert.deepEqual(result.events.map((event) => event.provider), ['openai', 'aws']);
  assert.deepEqual(result.events.map((event) => event.markerEligible), [true, true]);
  assert.equal(result.events[0]?.locations[0]?.lat, 37.7749);
  assert.equal(result.events[1]?.locations[0]?.name, 'AWS Lambda us-east-1');

  const writes: Array<{ key: string; ttlSeconds: number; value: unknown }> = [];
  await writeSignalMapProviderStatuses(
    {
      setJsonEx: async (key, value, ttlSeconds) => {
        writes.push({ key, value, ttlSeconds });
      },
    },
    result,
    { ttlSeconds: 10, metaTtlSeconds: 20 },
  );

  assert.deepEqual(writes.map((write) => write.key), [
    'signalmap:providers:v1',
    'seed-meta:signalmap:providers',
  ]);
  assert.deepEqual(writes.map((write) => write.ttlSeconds), [10, 20]);
});

test('Cloudflare Radar collector writes normalized signalmap cache and source health', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-token');
    return jsonResponse({
      result: {
        annotations: [
          {
            id: 'radar-1',
            outageType: 'REGIONAL',
            startDate: NOW,
            description: 'Regional internet outage affecting the United States.',
            locations: ['US'],
            outage: {
              outageType: 'REGIONAL',
              outageCause: 'POWER',
            },
          },
        ],
      },
    });
  };

  const result = await collectSignalMapCloudflareRadar({
    now: NOW,
    fetchImpl,
    env: { CLOUDFLARE_API_TOKEN: 'test-token' },
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.sourceHealth[0]?.id, 'cloudflare-radar');
  assert.equal(result.sourceHealth[0]?.status, 'ok');

  const writes: Array<{ key: string; ttlSeconds: number }> = [];
  await writeSignalMapCloudflareRadar(
    {
      setJsonEx: async (key, _value, ttlSeconds) => {
        writes.push({ key, ttlSeconds });
      },
    },
    result,
    { ttlSeconds: 10, metaTtlSeconds: 20 },
  );

  assert.deepEqual(writes, [
    { key: 'signalmap:radar:v1', ttlSeconds: 10 },
    { key: 'seed-meta:signalmap:radar', ttlSeconds: 20 },
  ]);
});
