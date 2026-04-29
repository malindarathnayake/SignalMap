import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_SIGNALMAP_DISTILL_TIMEOUT_MS,
  SIGNALMAP_DISTILL_DESCRIPTOR_FILES,
  extractSignalMapArticleWithDistill,
  resolveSignalMapDistillBridgeConfig,
  resolveSignalMapDistillTimeoutMs,
} from '../scripts/signalmap-distill-bridge.mjs';
import {
  DEFAULT_SIGNALMAP_FULL_EXTRACTION_DOMAINS,
  DEFAULT_SIGNALMAP_RSS_POLL_MINUTES,
  SIGNALMAP_COLLECTOR_HEALTH_DOMAINS,
  SIGNALMAP_HEALTH_DOMAIN_KEYS,
  SIGNALMAP_NEWS_CACHE_KEY,
  SIGNALMAP_NEWS_META_KEY,
  canonicalizeSignalMapNewsUrl,
  collectSignalMapNews,
  hashSignalMapNewsTitle,
  loadSignalMapNewsSources,
  parseSignalMapRssItems,
  resolveSignalMapNewsCollectorConfig,
  shouldFullExtractSignalMapUrl,
} from '../scripts/signalmap-news-collector.mjs';

const baseInput = {
  url: 'https://risky.biz/news/test-story',
  title: 'RSS title',
  snippet: 'RSS snippet body',
  sourceName: 'Risky Business News',
};

test('Distill timeout defaults and invalid env values resolve to 15000ms', (t) => {
  const previousTimeout = process.env.SIGNALMAP_DISTILL_TIMEOUT_MS;
  delete process.env.SIGNALMAP_DISTILL_TIMEOUT_MS;
  t.after(() => {
    if (previousTimeout === undefined) {
      delete process.env.SIGNALMAP_DISTILL_TIMEOUT_MS;
    } else {
      process.env.SIGNALMAP_DISTILL_TIMEOUT_MS = previousTimeout;
    }
  });

  assert.equal(DEFAULT_SIGNALMAP_DISTILL_TIMEOUT_MS, 15000);
  assert.equal(resolveSignalMapDistillTimeoutMs({ env: {} }), 15000);
  assert.equal(
    resolveSignalMapDistillTimeoutMs({ env: { SIGNALMAP_DISTILL_TIMEOUT_MS: '0' } }),
    15000,
  );
  assert.equal(
    resolveSignalMapDistillTimeoutMs({ env: { SIGNALMAP_DISTILL_TIMEOUT_MS: '-1' } }),
    15000,
  );
  assert.equal(
    resolveSignalMapDistillTimeoutMs({ env: { SIGNALMAP_DISTILL_TIMEOUT_MS: 'not-a-number' } }),
    15000,
  );
  assert.equal(
    resolveSignalMapDistillTimeoutMs({
      timeoutMs: 7,
      env: { SIGNALMAP_DISTILL_TIMEOUT_MS: '15000' },
    }),
    7,
  );
});

async function makeDistillRoot() {
  const root = await mkdtemp(join(tmpdir(), 'signalmap-distill-'));
  await mkdir(join(root, 'descriptors'), { recursive: true });
  return root;
}

async function writeDescriptors(root, files = SIGNALMAP_DISTILL_DESCRIPTOR_FILES) {
  await Promise.all(
    files.map((file) => writeFile(join(root, 'descriptors', file), '{"selectors":[]}\n')),
  );
}

async function writeFakeDistill(root, source) {
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'dist', 'index.js'), source);
}

test('resolves bridge config from SIGNALMAP_DISTILL_ROOT and descriptor paths', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root);
  await writeFakeDistill(root, 'export class Distill {}\n');

  const config = resolveSignalMapDistillBridgeConfig({
    env: { SIGNALMAP_DISTILL_ROOT: root },
  });

  assert.equal(config.enabled, true);
  assert.equal(config.distillRoot, resolve(root));
  assert.equal(config.modulePath, resolve(root, 'dist', 'index.js'));
  assert.deepEqual(
    config.descriptorPaths,
    SIGNALMAP_DISTILL_DESCRIPTOR_FILES.map((file) => resolve(root, 'descriptors', file)),
  );
});

test('missing root returns RSS fallback with missing_root reason', async () => {
  const result = await extractSignalMapArticleWithDistill(baseInput, {
    env: { SIGNALMAP_DISTILL_ROOT: '' },
  });

  assert.deepEqual(result, {
    status: 'fallback',
    article: {
      title: 'RSS title',
      articleBody: 'RSS snippet body',
      canonicalUrl: 'https://risky.biz/news/test-story',
      sourceName: 'Risky Business News',
    },
    fallbackReason: 'missing_root',
  });
});

test('existing root without dist/index.js returns missing_build and does not import Distill', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root);

  const result = await extractSignalMapArticleWithDistill(baseInput, {
    distillRoot: root,
  });

  assert.equal(result.status, 'fallback');
  assert.equal(result.fallbackReason, 'missing_build');
  assert.equal(result.article.articleBody, 'RSS snippet body');
});

test('missing descriptor returns missing_descriptor fallback', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root, ['the-hacker-news.json']);
  await writeFakeDistill(
    root,
    'throw new Error("fake distill should not be imported when descriptors are missing");\n',
  );

  const result = await extractSignalMapArticleWithDistill(baseInput, {
    distillRoot: root,
    importCacheKey: crypto.randomUUID(),
  });

  assert.equal(result.status, 'fallback');
  assert.equal(result.fallbackReason, 'missing_descriptor');
  assert.equal(result.article.articleBody, 'RSS snippet body');
});

test('missing unrelated descriptor does not block source-specific extraction', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root, ['risky-business-news.json']);
  await writeFakeDistill(
    root,
    `
const stateKey = 'signalmapDistillUnrelatedDescriptor';
globalThis[stateKey] = { constructedWith: undefined };
export class Distill {
  constructor(config) {
    globalThis[stateKey].constructedWith = config;
  }
  async extract() {
    return {
      title: 'Distilled title',
      articleBody: 'Distilled article body',
      canonicalUrl: 'https://risky.biz/news/canonical-story',
      sourceName: 'Risky Business News'
    };
  }
}
`,
  );

  const result = await extractSignalMapArticleWithDistill(baseInput, {
    distillRoot: root,
    importCacheKey: crypto.randomUUID(),
  });

  assert.equal(result.status, 'distilled');
  assert.deepEqual(globalThis.signalmapDistillUnrelatedDescriptor.constructedWith, {
    descriptors: [resolve(root, 'descriptors', 'risky-business-news.json')],
  });
});

test('success path imports Distill, passes descriptors, extracts, and normalizes output', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root);
  await writeFakeDistill(
    root,
    `
const stateKey = 'signalmapDistillSuccess';
globalThis[stateKey] = { constructedWith: undefined, extractedUrl: undefined };
export class Distill {
  constructor(config) {
    globalThis[stateKey].constructedWith = config;
  }
  async extract(url) {
    globalThis[stateKey].extractedUrl = url;
    return {
      title: 'Distilled title',
      dek: 'Distilled dek',
      author: 'Reporter',
      publishedAt: '2026-04-25T12:00:00Z',
      updatedAt: '2026-04-25T13:00:00Z',
      articleBody: 'Distilled article body',
      tags: ['cyber', '', 'risk'],
      canonicalUrl: 'https://risky.biz/news/canonical-story',
      sourceName: 'Risky Business News'
    };
  }
}
`,
  );

  const result = await extractSignalMapArticleWithDistill(baseInput, {
    distillRoot: root,
    importCacheKey: crypto.randomUUID(),
  });

  assert.equal(result.status, 'distilled');
  assert.deepEqual(result.article, {
    title: 'Distilled title',
    dek: 'Distilled dek',
    author: 'Reporter',
    publishedAt: '2026-04-25T12:00:00Z',
    updatedAt: '2026-04-25T13:00:00Z',
    articleBody: 'Distilled article body',
    tags: ['cyber', 'risk'],
    canonicalUrl: 'https://risky.biz/news/canonical-story',
    sourceName: 'Risky Business News',
  });
  assert.deepEqual(globalThis.signalmapDistillSuccess.constructedWith, {
    descriptors: [resolve(root, 'descriptors', 'risky-business-news.json')],
  });
  assert.equal(globalThis.signalmapDistillSuccess.extractedUrl, baseInput.url);
});

test('unsupported source returns fallback without trying distill', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root);
  await writeFakeDistill(root, 'throw new Error("unsupported source should not import distill");\n');

  const result = await extractSignalMapArticleWithDistill(
    {
      url: 'https://example.com/news/story',
      title: '',
      snippet: 'Example snippet',
      sourceName: 'Example Security Blog',
    },
    {
      distillRoot: root,
      importCacheKey: crypto.randomUUID(),
    },
  );

  assert.deepEqual(result, {
    status: 'fallback',
    article: {
      title: 'https://example.com/news/story',
      articleBody: 'Example snippet',
      canonicalUrl: 'https://example.com/news/story',
      sourceName: 'Example Security Blog',
    },
    fallbackReason: 'unsupported_source',
  });
});

test('timeout returns fallback and clears bridge timer', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root);
  await writeFakeDistill(
    root,
    `
export class Distill {
  async extract() {
    return new Promise(() => {});
  }
}
`,
  );

  const result = await extractSignalMapArticleWithDistill(baseInput, {
    distillRoot: root,
    timeoutMs: 5,
    importCacheKey: crypto.randomUUID(),
  });

  assert.equal(result.status, 'fallback');
  assert.equal(result.fallbackReason, 'timeout');
  assert.equal(result.article.articleBody, 'RSS snippet body');
  assert.match(result.error, /timed out/);
});

test('SIGNALMAP_DISTILL_TIMEOUT_MS env controls extraction timeout', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root);
  await writeFakeDistill(
    root,
    `
export class Distill {
  async extract() {
    return new Promise(() => {});
  }
}
`,
  );

  const result = await extractSignalMapArticleWithDistill(baseInput, {
    distillRoot: root,
    env: { SIGNALMAP_DISTILL_TIMEOUT_MS: '5' },
    importCacheKey: crypto.randomUUID(),
  });

  assert.equal(result.status, 'fallback');
  assert.equal(result.fallbackReason, 'timeout');
  assert.match(result.error, /5ms/);
});

test('invalid distill output falls back with invalid_distill_output reason', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root);
  await writeFakeDistill(
    root,
    `
export class Distill {
  async extract() {
    return {
      title: 'No body',
      canonicalUrl: 'https://risky.biz/news/no-body',
      sourceName: 'Risky Business News'
    };
  }
}
`,
  );

  const result = await extractSignalMapArticleWithDistill(baseInput, {
    distillRoot: root,
    importCacheKey: crypto.randomUUID(),
  });

  assert.deepEqual(result, {
    status: 'fallback',
    article: {
      title: 'RSS title',
      articleBody: 'RSS snippet body',
      canonicalUrl: 'https://risky.biz/news/test-story',
      sourceName: 'Risky Business News',
    },
    fallbackReason: 'invalid_distill_output',
  });
});

test('unsupported distill output sourceName falls back with invalid_distill_output reason', async (t) => {
  const root = await makeDistillRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDescriptors(root);
  await writeFakeDistill(
    root,
    `
export class Distill {
  async extract() {
    return {
      title: 'Distilled title',
      articleBody: 'Distilled article body',
      canonicalUrl: 'https://risky.biz/news/canonical-story',
      sourceName: 'Example Security Blog'
    };
  }
}
`,
  );

  const result = await extractSignalMapArticleWithDistill(baseInput, {
    distillRoot: root,
    importCacheKey: crypto.randomUUID(),
  });

  assert.deepEqual(result, {
    status: 'fallback',
    article: {
      title: 'RSS title',
      articleBody: 'RSS snippet body',
      canonicalUrl: 'https://risky.biz/news/test-story',
      sourceName: 'Risky Business News',
    },
    fallbackReason: 'invalid_distill_output',
  });
});

function rss(items) {
  return `<?xml version="1.0"?>
<rss version="2.0"><channel>
${items
  .map(
    (item) => `<item>
  <title>${item.title}</title>
  <link>${item.link}</link>
  <description>${item.description ?? 'Snippet'}</description>
  <pubDate>${item.pubDate ?? 'Sat, 25 Apr 2026 12:00:00 GMT'}</pubDate>
</item>`,
  )
  .join('\n')}
</channel></rss>`;
}

function okXml(xml) {
  return {
    ok: true,
    status: 200,
    async text() {
      return xml;
    },
  };
}

function parsedEvent(overrides = {}) {
  return {
    status: 'parsed',
    event: {
      canonicalTitle: overrides.canonicalTitle ?? 'Canonical event',
      summary: overrides.summary ?? 'Short metadata-only summary',
      category: overrides.category ?? 'cyber',
      tags: overrides.tags ?? ['cyber'],
      severity: overrides.severity ?? 'medium',
      eventTime: overrides.eventTime ?? '2026-04-25T12:00:00Z',
      confidence: overrides.confidence ?? 0.9,
      locations: overrides.locations ?? [
        {
          name: 'London',
          countryIso2: 'GB',
          scope: 'city',
          confidence: 0.9,
          evidence: 'London',
        },
      ],
    },
  };
}

function resolvedLocations(markerEligible = true) {
  return [
    {
      name: 'London',
      countryIso2: 'GB',
      scope: 'city',
      confidence: markerEligible ? 0.9 : 0.4,
      evidence: 'London',
      lat: 51.5072,
      lon: -0.1276,
      geocodeStatus: markerEligible ? 'resolved_static' : 'unresolved_location',
      markerEligible,
    },
  ];
}

function hasForbiddenBodyKey(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if (['articleBody', 'body', 'content', 'html', 'sourceText'].includes(key)) return true;
    if (hasForbiddenBodyKey(child)) return true;
  }
  return false;
}

function assertEventSourcesContract(events) {
  for (const event of events) {
    assert.ok(Array.isArray(event.sources), 'event sources must be an array');
    for (const source of event.sources) {
      assert.equal(typeof source.id, 'string');
      assert.notEqual(source.id.trim(), '');
      assert.equal(typeof source.label, 'string');
      assert.notEqual(source.label.trim(), '');
      assert.equal(Number.isFinite(source.tier), true);
      assert.equal(hasForbiddenBodyKey(source), false);
    }
  }
}

test('news collector config defaults use canonical keys and extraction allowlist', () => {
  const config = resolveSignalMapNewsCollectorConfig({ env: {} });

  assert.equal(config.pollMinutes, DEFAULT_SIGNALMAP_RSS_POLL_MINUTES);
  assert.equal(config.cacheKey, SIGNALMAP_NEWS_CACHE_KEY);
  assert.equal(config.metaKey, SIGNALMAP_NEWS_META_KEY);
  assert.equal(config.vectorEnabled, true);
  assert.deepEqual(DEFAULT_SIGNALMAP_FULL_EXTRACTION_DOMAINS, ['risky.biz', 'thehackernews.com']);
  assert.deepEqual(config.fullExtractionDomains, ['risky.biz', 'thehackernews.com']);

  for (const disabled of ['false', '0', 'no', 'off', 'disabled']) {
    assert.equal(
      resolveSignalMapNewsCollectorConfig({ env: { SIGNALMAP_VECTOR_ENABLED: disabled } }).vectorEnabled,
      false,
    );
  }
});

test('SignalMap health domains are registered for api health and collector publishing', async () => {
  const healthSource = await readFile(resolve('api', 'health.js'), 'utf8');

  // Collector-internal health domains used by the news collector (separate
  // surface from the api/health response — kept in this guardrail because
  // both sides reference the same SIGNALMAP_HEALTH_DOMAIN_KEYS export).
  assert.deepEqual(SIGNALMAP_COLLECTOR_HEALTH_DOMAINS, ['llm', 'distill', 'lancedb', 'embeddings']);

  // The Phase 2e api/health.js exposes a SignalMap-specific shape over three
  // data sources: cloudflare_radar (critical), provider_status, news.
  // Source-grep guardrails verify the contract surface without overspecifying
  // implementation. The full response shape is verified at runtime by the
  // Phase 2 checkpoint command (curl http://localhost:3000/api/health | jq).
  for (const expectedKey of [
    'seed-meta:signalmap:radar',
    'seed-meta:signalmap:providers',
    'seed-meta:signalmap:news',
  ]) {
    assert.ok(
      healthSource.includes(`'${expectedKey}'`),
      `${expectedKey} missing from api/health.js`,
    );
  }

  // Source identifiers used in the response payload's `sources` map.
  for (const expectedSourceName of ['cloudflare_radar', 'provider_status', 'news']) {
    assert.ok(
      healthSource.includes(`${expectedSourceName}:`),
      `${expectedSourceName} missing as sources entry in api/health.js`,
    );
  }

  // The critical-source flag for cloudflare_radar (per handoff pitfall:
  // "only cloudflare_radar is critical in v1").
  assert.match(
    healthSource,
    /cloudflare_radar:\s*\{\s*critical:\s*true\b/,
    'cloudflare_radar must be marked critical: true',
  );
  assert.match(
    healthSource,
    /provider_status:\s*\{\s*critical:\s*false\b/,
    'provider_status must be marked critical: false (degraded ≠ down per spec)',
  );

  // SSE replay ring is read for sseReplayRingSize field
  assert.ok(
    healthSource.includes('signalmap:sse:ring'),
    'api/health.js should query the signalmap:sse:ring sorted set for sseReplayRingSize',
  );

  // Sanity: ioredis is the transport (no Upstash REST residue).
  assert.ok(
    healthSource.includes("from 'ioredis'"),
    'api/health.js should import ioredis directly',
  );
  assert.doesNotMatch(
    healthSource,
    /UPSTASH_REDIS_REST/,
    'api/health.js must not reference UPSTASH_REDIS_REST_* env vars (Phase 2c removed them)',
  );
});

test('full extraction gate only allows Risky Biz and The Hacker News domains', () => {
  assert.equal(shouldFullExtractSignalMapUrl('https://risky.biz/news/story'), true);
  assert.equal(shouldFullExtractSignalMapUrl('https://www.thehackernews.com/2026/04/story.html'), true);
  assert.equal(shouldFullExtractSignalMapUrl('https://example.com/security/story'), false);
});

test('RSS parser reads item fields and applies source tier config', () => {
  const source = loadSignalMapNewsSources({
    feeds: [{ name: 'Reuters World', url: 'https://feeds.example.test/reuters.xml' }],
  })[0];
  const [item] = parseSignalMapRssItems(
    rss([
      {
        title: 'Reuters headline',
        link: 'https://www.reuters.com/world/story/?utm_source=rss#section',
        description: '<p>Reuters snippet</p>',
      },
    ]),
    source,
  );

  assert.equal(item.title, 'Reuters headline');
  assert.equal(item.url, 'https://www.reuters.com/world/story/?utm_source=rss#section');
  assert.equal(item.canonicalUrl, 'https://www.reuters.com/world/story');
  assert.equal(item.snippet, 'Reuters snippet');
  assert.equal(item.sourceName, 'Reuters World');
  assert.equal(item.sourceTier, 1);
  assert.equal(item.publishedAt, '2026-04-25T12:00:00.000Z');
});

test('collector uses RSS snippet fallback and does not call Distill for non-allowlisted sources', async () => {
  let distillCalls = 0;
  let parsedArticle;
  const published = [];

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'false' },
    feeds: [{ name: 'Example Security Blog', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(
        rss([
          {
            title: 'Example outage',
            link: 'https://example.com/news/outage',
            description: 'RSS-only snippet',
          },
        ]),
      ),
    extractArticleImpl: async () => {
      distillCalls += 1;
      throw new Error('Distill should not be called');
    },
    parseArticleImpl: async (article) => {
      parsedArticle = article;
      return parsedEvent({ canonicalTitle: 'Example outage' });
    },
    resolveLocationsImpl: async () => resolvedLocations(true),
    publishImpl: async (payload) => {
      published.push(payload);
      return { status: 'published' };
    },
  });

  assert.equal(distillCalls, 0);
  assert.equal(parsedArticle.summary, 'RSS-only snippet');
  assert.equal(parsedArticle.snippet, 'RSS-only snippet');
  assert.equal(result.events.length, 1);
  assert.equal(published.length, 1);
});

test('collector degrades source health when full extraction falls back and still publishes RSS fallback', async () => {
  let parsedArticle;
  let publishedPayload;

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'false' },
    feeds: [{ name: 'Risky Business News', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(
        rss([
          {
            title: 'Risky fallback story',
            link: 'https://risky.biz/news/fallback-story',
            description: 'RSS snippet fallback',
          },
        ]),
      ),
    extractArticleImpl: async (item) => ({
      status: 'fallback',
      fallbackReason: 'missing_root',
      article: {
        title: item.title,
        articleBody: item.snippet,
        canonicalUrl: item.canonicalUrl,
        sourceName: item.sourceName,
      },
    }),
    parseArticleImpl: async (article) => {
      parsedArticle = article;
      return parsedEvent({ canonicalTitle: article.title });
    },
    resolveLocationsImpl: async () => resolvedLocations(true),
    publishImpl: async (payload) => {
      publishedPayload = payload;
      return { status: 'published' };
    },
  });

  assert.equal(result.events.length, 1);
  assert.equal(publishedPayload.data.events.length, 1);
  assert.equal(parsedArticle.title, 'Risky fallback story');
  assert.equal(parsedArticle.articleBody, 'RSS snippet fallback');
  assert.equal(result.health.status, 'degraded');
  assert.equal(result.health.sources[0].status, 'degraded');
  assert.equal(result.health.sources[0].distillDegraded, true);
  assert.equal(result.health.sources[0].lastDistillReason, 'missing_root');
  assert.equal(result.health.sources[0].accepted, 1);
  assert.equal(
    result.health.diagnostics.some(
      (item) => item.stage === 'extract' && item.reason === 'missing_root',
    ),
    true,
  );
});

test('vectors are enabled by default when SIGNALMAP_VECTOR_ENABLED is omitted', async () => {
  const calls = [];
  const upserted = [];

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: {},
    feeds: [{ name: 'Example Security Blog', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(rss([{ title: 'Default vector story', link: 'https://example.com/default-vector' }])),
    parseArticleImpl: async (article) => parsedEvent({ canonicalTitle: article.title }),
    resolveLocationsImpl: async () => resolvedLocations(true),
    openVectorStoreImpl: async () => {
      calls.push('open');
      return { status: 'ready', enabled: true };
    },
    getVectorStoreHealthImpl: async () => ({ status: 'ready', enabled: true }),
    embedStoryImpl: async () => {
      calls.push('embed');
      return { status: 'embedded', vector: [0.1, 0.2], embeddingDim: 2, embeddingModel: 'test' };
    },
    findRelatedStoriesImpl: async () => {
      calls.push('find');
      return [];
    },
    upsertStoryVectorImpl: async (_store, event) => {
      calls.push('upsert');
      upserted.push(event);
      return { status: 'upserted' };
    },
    pruneOldVectorsImpl: async () => {
      calls.push('prune');
      return { status: 'skipped' };
    },
    publishImpl: async () => ({ status: 'published' }),
  });

  assert.deepEqual(calls, ['open', 'embed', 'find', 'upsert', 'prune']);
  assert.equal(upserted.length, 1);
  assert.equal(result.health.vector.enabled, true);
  assertEventSourcesContract(result.events);
  assertEventSourcesContract(upserted);
});

test('canonical URL and title-hash dedupe happen before LLM and vector work', async () => {
  let parseCalls = 0;
  let embedCalls = 0;
  const xml = rss([
    {
      title: 'First story',
      link: 'https://example.com/a?utm_source=rss',
    },
    {
      title: 'Different title',
      link: 'https://example.com/a',
    },
    {
      title: 'First   Story',
      link: 'https://example.com/b',
    },
  ]);

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'true' },
    feeds: [{ name: 'Example Security Blog', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () => okXml(xml),
    parseArticleImpl: async () => {
      parseCalls += 1;
      return parsedEvent({ canonicalTitle: 'First story' });
    },
    resolveLocationsImpl: async () => resolvedLocations(true),
    openVectorStoreImpl: async () => ({ status: 'ready', enabled: true }),
    getVectorStoreHealthImpl: async () => ({ status: 'ready', enabled: true }),
    embedStoryImpl: async () => {
      embedCalls += 1;
      return { status: 'embedded', vector: [0.1, 0.2], embeddingDim: 2, embeddingModel: 'test' };
    },
    findRelatedStoriesImpl: async () => [],
    upsertStoryVectorImpl: async () => ({ status: 'upserted' }),
    pruneOldVectorsImpl: async () => ({ status: 'skipped' }),
    publishImpl: async () => ({ status: 'published' }),
  });

  assert.equal(parseCalls, 1);
  assert.equal(embedCalls, 1);
  assert.equal(result.events.length, 1);
  assert.equal(canonicalizeSignalMapNewsUrl('https://example.com/a?utm_source=rss'), 'https://example.com/a');
  assert.equal(hashSignalMapNewsTitle('First story'), hashSignalMapNewsTitle('First   Story'));
});

test('semantic dedupe checks related stories after basic dedupe and before upsert', async () => {
  const calls = [];
  const upserted = [];

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'true', SIGNALMAP_VECTOR_MIN_SCORE: '0.72' },
    feeds: [{ name: 'Example Security Blog', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(
        rss([
          { title: 'Story one', link: 'https://example.com/one' },
          { title: 'Story two', link: 'https://example.com/two' },
        ]),
      ),
    parseArticleImpl: async (article) => parsedEvent({ canonicalTitle: article.title }),
    resolveLocationsImpl: async () => resolvedLocations(true),
    openVectorStoreImpl: async () => ({ status: 'ready', enabled: true }),
    getVectorStoreHealthImpl: async () => ({ status: 'ready', enabled: true }),
    embedStoryImpl: async (event) => {
      calls.push(`embed:${event.title}`);
      return { status: 'embedded', vector: [0.1, 0.2], embeddingDim: 2, embeddingModel: 'test' };
    },
    findRelatedStoriesImpl: async (_store, _vector, options) => {
      calls.push('find');
      return calls.filter((call) => call === 'find').length === 2
        ? [{ id: 'existing', title: 'Older same story', score: options.minScore }]
        : [];
    },
    upsertStoryVectorImpl: async (_store, event) => {
      calls.push(`upsert:${event.title}`);
      upserted.push(event);
      return { status: 'upserted' };
    },
    pruneOldVectorsImpl: async () => ({ status: 'skipped' }),
    publishImpl: async () => ({ status: 'published' }),
  });

  assert.deepEqual(calls, ['embed:Story one', 'find', 'upsert:Story one', 'embed:Story two', 'find']);
  assert.equal(upserted.length, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.health.diagnostics.some((item) => item.reason === 'semantic_duplicate'), true);
});

test('marker-eligible and feed-only accepted events are both upserted when vectors are enabled', async () => {
  const upserted = [];

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'true' },
    feeds: [{ name: 'Example Security Blog', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(
        rss([
          { title: 'Marker story', link: 'https://example.com/marker' },
          { title: 'Feed only story', link: 'https://example.com/feed-only' },
        ]),
      ),
    parseArticleImpl: async (article) =>
      parsedEvent({
        canonicalTitle: article.title,
        confidence: article.title.includes('Feed only') ? 0.5 : 0.9,
      }),
    resolveLocationsImpl: async (_locations, _options) =>
      resolvedLocations(_locations[0]?.name !== 'Feed only story'),
    openVectorStoreImpl: async () => ({ status: 'ready', enabled: true }),
    getVectorStoreHealthImpl: async () => ({ status: 'ready', enabled: true }),
    embedStoryImpl: async () => ({
      status: 'embedded',
      vector: [0.1, 0.2],
      embeddingDim: 2,
      embeddingModel: 'test',
    }),
    findRelatedStoriesImpl: async () => [],
    upsertStoryVectorImpl: async (_store, event) => {
      upserted.push(event);
      return { status: 'upserted' };
    },
    pruneOldVectorsImpl: async () => ({ status: 'skipped' }),
    publishImpl: async () => ({ status: 'published' }),
  });

  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].markerEligible, true);
  assert.equal(result.events[1].markerEligible, false);
  assert.deepEqual(
    upserted.map((event) => [event.title, event.markerEligible]),
    [
      ['Marker story', true],
      ['Feed only story', false],
    ],
  );
});

test('parser skipped for missing API key emits no event and reports LLM unavailable health', async () => {
  let publishedPayload;

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'false' },
    feeds: [{ name: 'Example Security Blog', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(rss([{ title: 'Needs parser', link: 'https://example.com/needs-parser' }])),
    parseArticleImpl: async () => ({ status: 'skipped', reason: 'missing_api_key' }),
    resolveLocationsImpl: async () => {
      throw new Error('geocoder should not run');
    },
    publishImpl: async (payload) => {
      publishedPayload = payload;
      return { status: 'published' };
    },
  });

  assert.equal(result.events.length, 0);
  assert.equal(result.health.llmUnavailable, true);
  assert.equal(result.health.sources[0].llmUnavailable, true);
  assert.equal(publishedPayload.data.events.length, 0);
});

test('collector exposes independent health domains without leaking paths or secrets', async () => {
  let publishedPayload;

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: {
      SIGNALMAP_VECTOR_ENABLED: 'true',
      SIGNALMAP_LANCEDB_URI: 'C:\\secret\\signalmap\\lancedb',
      OPENROUTER_API_KEY: 'sk-test-secret',
    },
    feeds: [{ name: 'Risky Business News', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(rss([{ title: 'Health domain story', link: 'https://risky.biz/news/health-domain' }])),
    extractArticleImpl: async (item) => ({
      status: 'fallback',
      fallbackReason: 'missing_root',
      article: {
        title: item.title,
        canonicalUrl: item.canonicalUrl,
        sourceName: item.sourceName,
      },
    }),
    parseArticleImpl: async (article) => parsedEvent({ canonicalTitle: article.title }),
    resolveLocationsImpl: async () => resolvedLocations(true),
    openVectorStoreImpl: async () => ({ status: 'ready', enabled: true }),
    getVectorStoreHealthImpl: async () => ({
      status: 'ready',
      enabled: true,
      open: true,
      writable: true,
      tableName: 'signalmap_events_test',
      recordCount: 7,
      uri: 'C:\\secret\\signalmap\\lancedb',
      uriConfigured: true,
      lastVectorErrorClass: 'SignalMapVectorTimeout',
    }),
    embedStoryImpl: async () => ({
      status: 'failed',
      reason: 'embedding_model_unavailable',
      errorClass: 'EmbeddingLoadFailure',
    }),
    findRelatedStoriesImpl: async () => {
      throw new Error('search should not run without an embedding');
    },
    upsertStoryVectorImpl: async () => {
      throw new Error('upsert should not run without an embedding');
    },
    pruneOldVectorsImpl: async () => ({ status: 'skipped' }),
    publishImpl: async (payload) => {
      publishedPayload = payload;
      return { status: 'published', keys: payload.keys };
    },
  });

  const { domains } = result.health;
  assert.equal(result.health.status, 'degraded');
  assert.equal(domains.distill.status, 'degraded');
  assert.equal(domains.distill.metrics.fallback, 1);
  assert.equal(domains.llm.status, 'ok');
  assert.equal(domains.lancedb.status, 'ready');
  assert.equal(domains.lancedb.open, true);
  assert.equal(domains.lancedb.writable, true);
  assert.equal(domains.lancedb.tableName, 'signalmap_events_test');
  assert.equal(domains.lancedb.recordCount, 7);
  assert.equal(domains.lancedb.lastVectorErrorClass, 'SignalMapVectorTimeout');
  assert.equal('uri' in domains.lancedb, false);
  assert.equal(domains.embeddings.status, 'degraded');
  assert.equal(domains.embeddings.metrics.skipped, 1);

  for (const domain of SIGNALMAP_COLLECTOR_HEALTH_DOMAINS) {
    assert.equal(publishedPayload.healthDomains[domain].cacheKey, SIGNALMAP_HEALTH_DOMAIN_KEYS[domain].cacheKey);
    assert.equal(publishedPayload.healthDomains[domain].metaKey, SIGNALMAP_HEALTH_DOMAIN_KEYS[domain].metaKey);
  }
  assert.equal(publishedPayload.healthDomains.llm.meta.recordCount, 1);
  assert.equal(publishedPayload.healthDomains.distill.meta.recordCount, 0);
  assert.equal(publishedPayload.healthDomains.lancedb.meta.recordCount, 7);
  assert.equal(publishedPayload.healthDomains.embeddings.meta.recordCount, 0);
  const serializedDomains = JSON.stringify(domains);
  assert.doesNotMatch(serializedDomains, /C:\\secret/i);
  assert.doesNotMatch(serializedDomains, /sk-test-secret/i);
});

test('LanceDB degraded and failing vector functions do not block publication', async () => {
  let published = false;

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'true' },
    feeds: [{ name: 'Example Security Blog', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(rss([{ title: 'Vector degraded story', link: 'https://example.com/vector' }])),
    parseArticleImpl: async (article) => parsedEvent({ canonicalTitle: article.title }),
    resolveLocationsImpl: async () => resolvedLocations(true),
    openVectorStoreImpl: async () => {
      throw Object.assign(new Error('LanceDB unavailable'), { name: 'LanceUnavailable' });
    },
    getVectorStoreHealthImpl: async () => ({ status: 'degraded', enabled: true }),
    embedStoryImpl: async () => ({
      status: 'embedded',
      vector: [0.1, 0.2],
      embeddingDim: 2,
      embeddingModel: 'test',
    }),
    findRelatedStoriesImpl: async () => {
      throw new Error('search failed');
    },
    upsertStoryVectorImpl: async () => {
      throw new Error('upsert failed');
    },
    pruneOldVectorsImpl: async () => {
      throw new Error('prune failed');
    },
    publishImpl: async () => {
      published = true;
      return { status: 'published' };
    },
  });

  assert.equal(published, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.health.diagnostics.some((item) => item.reason === 'vector_lookup_error'), true);
  assert.equal(result.health.diagnostics.some((item) => item.reason === 'vector_upsert_error'), true);
  assert.equal(result.health.diagnostics.some((item) => item.reason === 'vector_prune_error'), true);
});

test('published payload and vector upsert event do not contain full article body fields', async () => {
  let publishedPayload;
  let upsertedEvent;

  const result = await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'true' },
    feeds: [{ name: 'Risky Business News', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(rss([{ title: 'Risky story', link: 'https://risky.biz/news/body-story' }])),
    extractArticleImpl: async () => ({
      status: 'distilled',
      article: {
        title: 'Risky story',
        articleBody: 'Full article body that must not be stored',
        canonicalUrl: 'https://risky.biz/news/body-story',
        sourceName: 'Risky Business News',
      },
    }),
    parseArticleImpl: async () => parsedEvent({ canonicalTitle: 'Risky story' }),
    resolveLocationsImpl: async () => resolvedLocations(true),
    openVectorStoreImpl: async () => ({ status: 'ready', enabled: true }),
    getVectorStoreHealthImpl: async () => ({ status: 'ready', enabled: true }),
    embedStoryImpl: async () => ({
      status: 'embedded',
      vector: [0.1, 0.2],
      embeddingDim: 2,
      embeddingModel: 'test',
    }),
    findRelatedStoriesImpl: async () => [],
    upsertStoryVectorImpl: async (_store, event) => {
      upsertedEvent = event;
      return { status: 'upserted' };
    },
    pruneOldVectorsImpl: async () => ({ status: 'skipped' }),
    publishImpl: async (payload) => {
      publishedPayload = payload;
      return { status: 'published' };
    },
  });

  assert.equal(result.events.length, 1);
  assertEventSourcesContract(result.events);
  assert.equal(hasForbiddenBodyKey(publishedPayload.data), false);
  assert.equal(hasForbiddenBodyKey(upsertedEvent), false);
  assertEventSourcesContract(publishedPayload.data.events);
  assertEventSourcesContract([upsertedEvent]);
  assert.doesNotMatch(JSON.stringify(publishedPayload.data), /Full article body/);
  assert.doesNotMatch(JSON.stringify(upsertedEvent), /Full article body/);
});

test('injected publisher receives both canonical data and seed meta keys', async () => {
  const writes = new Map();

  await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'false' },
    feeds: [{ name: 'Example Security Blog', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async () =>
      okXml(rss([{ title: 'Published story', link: 'https://example.com/published' }])),
    parseArticleImpl: async (article) => parsedEvent({ canonicalTitle: article.title }),
    resolveLocationsImpl: async () => resolvedLocations(true),
    publishImpl: async (payload, options) => {
      writes.set(options.cacheKey, payload.data);
      writes.set(options.metaKey, payload.meta);
      assert.equal(payload.keys[0], SIGNALMAP_NEWS_CACHE_KEY);
      assert.equal(payload.keys[1], SIGNALMAP_NEWS_META_KEY);
      for (const domain of SIGNALMAP_COLLECTOR_HEALTH_DOMAINS) {
        assert.equal(payload.keys.includes(SIGNALMAP_HEALTH_DOMAIN_KEYS[domain].cacheKey), true);
        assert.equal(payload.keys.includes(SIGNALMAP_HEALTH_DOMAIN_KEYS[domain].metaKey), true);
        assert.equal(payload.healthDomains[domain].cacheKey, SIGNALMAP_HEALTH_DOMAIN_KEYS[domain].cacheKey);
        assert.equal(payload.healthDomains[domain].metaKey, SIGNALMAP_HEALTH_DOMAIN_KEYS[domain].metaKey);
      }
      return { status: 'published', keys: payload.keys };
    },
  });

  assert.equal(writes.has(SIGNALMAP_NEWS_CACHE_KEY), true);
  assert.equal(writes.has(SIGNALMAP_NEWS_META_KEY), true);
  assert.equal(writes.get(SIGNALMAP_NEWS_CACHE_KEY).events.length, 1);
  assert.equal(writes.get(SIGNALMAP_NEWS_META_KEY).recordCount, 1);
});

test('collector publishes cache and seed-meta commands via custom publishImpl', async () => {
  const commands = [];
  const ttlSeconds = 1800;
  const metaTtlSeconds = 604800;

  const customPublishImpl = async (payload) => {
    commands.push(['SET', SIGNALMAP_NEWS_CACHE_KEY, JSON.stringify(payload.data), 'EX', ttlSeconds]);
    commands.push(['SET', SIGNALMAP_NEWS_META_KEY, JSON.stringify(payload.meta), 'EX', metaTtlSeconds]);
    const healthDomains = payload.healthDomains && typeof payload.healthDomains === 'object'
      ? Object.values(payload.healthDomains)
      : [];
    for (const domain of healthDomains) {
      if (!domain?.cacheKey || !domain?.metaKey) continue;
      commands.push(['SET', domain.cacheKey, JSON.stringify(domain.data), 'EX', metaTtlSeconds]);
      commands.push(['SET', domain.metaKey, JSON.stringify(domain.meta), 'EX', metaTtlSeconds]);
    }
    return { status: 'published', keys: commands.filter((c) => c[0] === 'SET').map((c) => c[1]) };
  };

  await collectSignalMapNews({
    now: '2026-04-25T13:00:00Z',
    env: { SIGNALMAP_VECTOR_ENABLED: 'false' },
    feeds: [{ name: 'Example Security Blog', url: 'https://feeds.example.test/rss.xml' }],
    fetchImpl: async (url) => okXml(rss([{ title: 'Redis health story', link: 'https://example.com/redis-health' }])),
    parseArticleImpl: async (article) => parsedEvent({ canonicalTitle: article.title }),
    resolveLocationsImpl: async () => resolvedLocations(true),
    publishImpl: customPublishImpl,
  });

  const setCommands = commands.filter((command) => command[0] === 'SET');
  const keys = new Set(setCommands.map((command) => command[1]));
  assert.equal(keys.has(SIGNALMAP_NEWS_CACHE_KEY), true);
  assert.equal(keys.has(SIGNALMAP_NEWS_META_KEY), true);
  for (const domain of SIGNALMAP_COLLECTOR_HEALTH_DOMAINS) {
    assert.equal(keys.has(SIGNALMAP_HEALTH_DOMAIN_KEYS[domain].cacheKey), true);
    assert.equal(keys.has(SIGNALMAP_HEALTH_DOMAIN_KEYS[domain].metaKey), true);
  }

  const lancedbDataCommand = setCommands.find(
    (command) => command[1] === SIGNALMAP_HEALTH_DOMAIN_KEYS.lancedb.cacheKey,
  );
  const lancedbMetaCommand = setCommands.find(
    (command) => command[1] === SIGNALMAP_HEALTH_DOMAIN_KEYS.lancedb.metaKey,
  );
  const lancedbData = JSON.parse(lancedbDataCommand[2]);
  const lancedbMeta = JSON.parse(lancedbMetaCommand[2]);
  assert.equal(lancedbData.open, false);
  assert.equal(lancedbData.writable, false);
  assert.equal('uri' in lancedbData, false);
  assert.equal(lancedbMeta.domain, 'lancedb');
  assert.equal(lancedbMeta.status, 'ok');
  assert.equal(lancedbMeta.recordCount, 0);
  assert.doesNotMatch(JSON.stringify(commands), /redis-secret-token/i);
});
