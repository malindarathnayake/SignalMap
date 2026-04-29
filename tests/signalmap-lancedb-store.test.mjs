import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_SIGNALMAP_EMBEDDING_DIM,
  createDeterministicMockVector,
  resolveSignalMapEmbeddingConfig,
} from '../scripts/signalmap-embedding-model.mjs';
import {
  DEFAULT_SIGNALMAP_LANCEDB_URI,
  DEFAULT_SIGNALMAP_VECTOR_MIN_SCORE,
  DEFAULT_SIGNALMAP_VECTOR_RETENTION_DAYS,
  DEFAULT_SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS,
  DEFAULT_SIGNALMAP_VECTOR_TABLE,
  DEFAULT_SIGNALMAP_VECTOR_TOP_K,
  createSignalMapVectorRecord,
  findRelatedStories,
  getVectorStoreHealth,
  openVectorStore,
  pruneOldVectors,
  resolveSignalMapVectorStoreConfig,
  upsertStoryVector,
} from '../scripts/signalmap-lancedb-store.mjs';

function sampleEvent(overrides = {}) {
  return {
    id: 'story-1',
    eventId: 'evt-1',
    canonicalUrl: 'https://example.com/story',
    sourceName: 'Example Wire',
    canonicalTitle: 'Regional internet outage disrupts provider traffic',
    summary: 'Provider traffic dropped in several cities after a backbone incident.',
    category: 'internet',
    tags: ['outage', 'backbone', 'outage'],
    severity: 'high',
    publishedAt: '2026-04-20T12:00:00Z',
    lastObservedAt: '2026-04-20T12:30:00Z',
    locations: [
      {
        name: 'London',
        countryIso2: 'GB',
        scope: 'city',
        confidence: 0.9,
        evidence: 'traffic dropped across London provider exchanges',
      },
    ],
    confidence: 0.86,
    articleBody: 'full body must not be stored',
    body: 'body must not be stored',
    content: 'content must not be stored',
    html: '<p>html must not be stored</p>',
    sourceText: 'raw source text must not be stored',
    ...overrides,
  };
}

function fakeStore({ rows = [], dim = 4, deleted = [] } = {}) {
  const table = {
    added: [],
    async add(records) {
      this.added.push(...records);
      rows.push(...records);
    },
    vectorSearch() {
      return {
        limit(n) {
          return {
            async toArray() {
              return rows.slice(0, n);
            },
          };
        },
      };
    },
    async delete(where) {
      deleted.push(where);
    },
    async countRows() {
      return rows.length;
    },
  };

  return {
    status: 'ready',
    enabled: true,
    tableName: 'fake_events',
    table,
    config: {
      embeddingDim: dim,
      embeddingModel: 'test-model',
      topK: 8,
      minScore: 0.72,
      searchTimeoutMs: 3000,
      retentionDays: 30,
    },
    deleted,
  };
}

function schemaTable(fieldNames) {
  return {
    async schema() {
      return { fields: fieldNames.map((name) => ({ name })) };
    },
    async countRows() {
      return 0;
    },
  };
}

function vectorRecordFieldNames() {
  return Object.keys(createSignalMapVectorRecord(sampleEvent(), [0.1, 0.2, 0.3, 0.4], {
    embeddingDim: 4,
    embeddingModel: 'test-model',
  }));
}

test('vector and embedding config parse defaults and env overrides', () => {
  const defaults = resolveSignalMapVectorStoreConfig({});
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.uri, DEFAULT_SIGNALMAP_LANCEDB_URI);
  assert.equal(defaults.tableName, DEFAULT_SIGNALMAP_VECTOR_TABLE);
  assert.equal(defaults.retentionDays, DEFAULT_SIGNALMAP_VECTOR_RETENTION_DAYS);
  assert.equal(defaults.searchTimeoutMs, DEFAULT_SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS);
  assert.equal(defaults.topK, DEFAULT_SIGNALMAP_VECTOR_TOP_K);
  assert.equal(defaults.minScore, DEFAULT_SIGNALMAP_VECTOR_MIN_SCORE);
  assert.equal(defaults.embeddingDim, DEFAULT_SIGNALMAP_EMBEDDING_DIM);

  const env = {
    SIGNALMAP_VECTOR_ENABLED: 'false',
    SIGNALMAP_LANCEDB_URI: '/tmp/signalmap-test',
    SIGNALMAP_VECTOR_TABLE: 'custom_events',
    SIGNALMAP_VECTOR_RETENTION_DAYS: '7',
    SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS: '50',
    SIGNALMAP_VECTOR_TOP_K: '3',
    SIGNALMAP_VECTOR_MIN_SCORE: '0.81',
    SIGNALMAP_EMBEDDING_MODEL: 'custom-model',
    SIGNALMAP_EMBEDDING_DIM: '4',
  };
  assert.deepEqual(resolveSignalMapEmbeddingConfig(env), { model: 'custom-model', dim: 4 });
  assert.deepEqual(resolveSignalMapVectorStoreConfig(env), {
    enabled: false,
    uri: '/tmp/signalmap-test',
    tableName: 'custom_events',
    retentionDays: 7,
    searchTimeoutMs: 50,
    topK: 3,
    minScore: 0.81,
    embeddingModel: 'custom-model',
    embeddingDim: 4,
  });
});

test('deterministic mock embedding has stable configured dimension and values', () => {
  const first = createDeterministicMockVector('same-seed', 8);
  const second = createDeterministicMockVector('same-seed', 8);
  const other = createDeterministicMockVector('other-seed', 8);

  assert.equal(first.length, 8);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, other);
  assert(first.every(Number.isFinite));
});

test('record creation includes required vector metadata and excludes full article fields', () => {
  const record = createSignalMapVectorRecord(sampleEvent(), [0.1, 0.2, 0.3, 0.4], {
    embeddingDim: 4,
    embeddingModel: 'test-model',
  });

  for (const field of [
    'id',
    'eventId',
    'canonicalUrl',
    'sourceName',
    'title',
    'summary',
    'category',
    'tags',
    'severity',
    'publishedAt',
    'lastObservedAt',
    'locationsJson',
    'locationNames',
    'countryIso2',
    'confidence',
    'contentHash',
    'sourceTextHash',
    'embeddingModel',
    'embeddingDim',
    'vector',
  ]) {
    assert(field in record, `${field} should be present`);
  }

  assert.equal(record.embeddingDim, 4);
  assert.equal(record.embeddingModel, 'test-model');
  assert.deepEqual(record.locationNames, ['London']);
  assert.deepEqual(record.countryIso2, ['GB']);
  assert.equal(record.tags.length, 2);
  assert.match(record.locationsJson, /traffic dropped/);
  assert.equal('articleBody' in record, false);
  assert.equal('body' in record, false);
  assert.equal('content' in record, false);
  assert.equal('html' in record, false);
  assert.equal('sourceText' in record, false);
});

test('record creation collects event and location countryIso2 as deduped arrays', () => {
  const record = createSignalMapVectorRecord(sampleEvent({
    countryIso2: ' gb ',
    locations: [
      { name: 'London', countryIso2: 'gb' },
      { name: 'New York', countryIso2: ' us ' },
      { name: 'Duplicate US', countryIso2: 'US' },
      { name: 'Invalid long code', countryIso2: 'USA' },
      { name: 'Invalid blank code', countryIso2: ' ' },
    ],
  }), [0.1, 0.2, 0.3, 0.4], {
    embeddingDim: 4,
    embeddingModel: 'test-model',
  });

  assert.deepEqual(record.countryIso2, ['GB', 'US']);
});

test('dimension mismatch is rejected before table writes', async () => {
  const store = fakeStore({ dim: 4 });
  const result = await upsertStoryVector(store, sampleEvent(), [0.1, 0.2]);

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'vector_dimension_mismatch');
  assert.equal(store.table.added.length, 0);
});

test('disabled vector mode opens degraded and makes writes/searches no-op', async () => {
  const store = await openVectorStore({
    env: {
      SIGNALMAP_VECTOR_ENABLED: 'false',
      SIGNALMAP_LANCEDB_URI: '/tmp/unused',
      SIGNALMAP_EMBEDDING_DIM: '4',
    },
  });

  assert.equal(store.status, 'degraded');
  assert.equal(store.enabled, false);
  assert.equal((await upsertStoryVector(store, sampleEvent(), [0.1, 0.2, 0.3, 0.4])).status, 'skipped');
  assert.deepEqual(await findRelatedStories(store, [0.1, 0.2, 0.3, 0.4]), []);

  const health = await getVectorStoreHealth(store);
  assert.equal(health.status, 'degraded');
  assert.equal(health.disabled, true);
});

test('connect failure returns degraded health and no-op write/search behavior', async () => {
  const store = await openVectorStore({
    env: {
      SIGNALMAP_LANCEDB_URI: '/tmp/signalmap-connect-fails',
      SIGNALMAP_EMBEDDING_DIM: '4',
    },
    connectImpl: async () => {
      throw Object.assign(new Error('connect failed'), { name: 'ConnectFailure' });
    },
  });

  assert.equal(store.status, 'degraded');
  assert.equal(store.errorClass, 'ConnectFailure');
  assert.equal((await upsertStoryVector(store, sampleEvent(), [0.1, 0.2, 0.3, 0.4])).status, 'skipped');
  assert.deepEqual(await findRelatedStories(store, [0.1, 0.2, 0.3, 0.4]), []);

  const health = await getVectorStoreHealth(store);
  assert.equal(health.status, 'degraded');
  assert.equal(health.errorClass, 'ConnectFailure');
});

test('existing LanceDB table with complete SignalMap schema opens ready', async () => {
  const table = schemaTable(vectorRecordFieldNames());
  const store = await openVectorStore({
    env: {
      SIGNALMAP_LANCEDB_URI: 'memory://signalmap-schema-complete',
      SIGNALMAP_VECTOR_TABLE: 'signalmap_events_test',
      SIGNALMAP_EMBEDDING_DIM: '4',
    },
    connectImpl: async () => ({
      async openTable() {
        return table;
      },
    }),
  });

  assert.equal(store.status, 'ready');
  assert.equal(store.table, table);
  assert.equal(store.pendingCreate, false);
});

test('existing LanceDB table missing required fields degrades without throwing', async () => {
  const fieldNames = vectorRecordFieldNames().filter((fieldName) => !['canonicalUrl', 'vector'].includes(fieldName));
  const store = await openVectorStore({
    env: {
      SIGNALMAP_LANCEDB_URI: 'memory://signalmap-schema-mismatch',
      SIGNALMAP_VECTOR_TABLE: 'signalmap_events_test',
      SIGNALMAP_EMBEDDING_DIM: '4',
    },
    connectImpl: async () => ({
      async openTable() {
        return schemaTable(fieldNames);
      },
    }),
  });

  assert.equal(store.status, 'degraded');
  assert.equal(store.errorClass, 'vector_table_schema_mismatch');
  assert.equal(store.lastVectorErrorClass, 'vector_table_schema_mismatch');
  assert.deepEqual(store.missingFields, ['canonicalUrl', 'vector']);
  assert.equal((await upsertStoryVector(store, sampleEvent(), [0.1, 0.2, 0.3, 0.4])).status, 'skipped');

  const health = await getVectorStoreHealth(store);
  assert.equal(health.status, 'degraded');
  assert.equal(health.errorClass, 'vector_table_schema_mismatch');
});

test('existing LanceDB table schema inspection failure degrades without throwing', async () => {
  const store = await openVectorStore({
    env: {
      SIGNALMAP_LANCEDB_URI: 'memory://signalmap-schema-throws',
      SIGNALMAP_VECTOR_TABLE: 'signalmap_events_test',
      SIGNALMAP_EMBEDDING_DIM: '4',
    },
    connectImpl: async () => ({
      async openTable() {
        return {
          async schema() {
            throw Object.assign(new Error('schema failed at C:\\secret\\signalmap'), { name: 'SchemaFailure' });
          },
        };
      },
    }),
  });

  assert.equal(store.status, 'degraded');
  assert.equal(store.errorClass, 'vector_table_schema_inspection_failed');
  assert.equal(store.lastVectorErrorClass, 'vector_table_schema_inspection_failed');
  assert.equal(store.error, 'LanceDB table schema inspection failed');

  const health = await getVectorStoreHealth(store);
  assert.equal(health.status, 'degraded');
  assert.equal(health.errorClass, 'vector_table_schema_inspection_failed');
});

test('health degrades instead of throwing when table row count fails', async () => {
  const store = fakeStore({ dim: 4 });
  store.table.countRows = async () => {
    throw Object.assign(new Error('count failed'), { name: 'CountFailure' });
  };

  const health = await getVectorStoreHealth(store);
  assert.equal(health.status, 'degraded');
  assert.equal(health.errorClass, 'CountFailure');
  assert.equal(health.lastVectorErrorClass, 'CountFailure');
});

test('health exposes LanceDB readiness without leaking local URI', async () => {
  const store = fakeStore({ rows: [sampleEvent({ id: 'a' }), sampleEvent({ id: 'b' })], dim: 4 });
  store.uri = 'C:\\secret\\signalmap\\lancedb';
  store.lastVectorErrorClass = 'SignalMapVectorSearchError';

  const health = await getVectorStoreHealth(store);
  assert.equal(health.status, 'ready');
  assert.equal(health.open, true);
  assert.equal(health.writable, true);
  assert.equal(health.tableName, 'fake_events');
  assert.equal(health.recordCount, 2);
  assert.equal(health.uriConfigured, true);
  assert.equal(health.lastVectorErrorClass, 'SignalMapVectorSearchError');
  assert.equal('uri' in health, false);
  assert.doesNotMatch(JSON.stringify(health), /C:\\secret/i);
});

test('ready fake store upserts and returns bounded sorted filtered related metadata', async () => {
  const rows = [
    { ...createSignalMapVectorRecord(sampleEvent({ id: 'a', title: 'A' }), [0.1, 0.2, 0.3, 0.4], { embeddingDim: 4 }), score: 0.8 },
    {
      ...createSignalMapVectorRecord(sampleEvent({ id: 'b', title: 'B' }), [0.2, 0.2, 0.3, 0.4], { embeddingDim: 4 }),
      countryIso2: JSON.stringify(['GB', 'US']),
      _distance: 0.1,
    },
    { ...createSignalMapVectorRecord(sampleEvent({ id: 'c', title: 'C' }), [0.3, 0.2, 0.3, 0.4], { embeddingDim: 4 }), score: 0.6 },
  ];
  const store = fakeStore({ rows, dim: 4 });
  store.config = { ...store.config, topK: 2, minScore: 0.72 };

  const upsert = await upsertStoryVector(store, sampleEvent({ id: 'new' }), [0.4, 0.3, 0.2, 0.1]);
  assert.equal(upsert.status, 'upserted');
  assert.equal(store.table.added.length, 1);

  const related = await findRelatedStories(store, [0.1, 0.2, 0.3, 0.4]);
  assert.deepEqual(related.map((row) => row.id), ['b', 'a']);
  assert.equal(related.length, 2);
  assert.equal('vector' in related[0], false);
  assert(related[0].score > related[1].score);
  assert.deepEqual(related[0].countryIso2, ['GB', 'US']);
  assert.deepEqual(related[1].countryIso2, ['GB']);
});

test('pruneOldVectors calls table delete with cutoff when available', async () => {
  const store = fakeStore({ dim: 4 });
  const result = await pruneOldVectors(store, {
    retentionDays: 10,
    now: '2026-04-20T00:00:00Z',
  });

  assert.equal(result.status, 'pruned');
  assert.equal(result.cutoff, '2026-04-10T00:00:00.000Z');
  assert.equal(store.deleted.length, 1);
  assert.match(store.deleted[0], /lastObservedAt < '2026-04-10T00:00:00.000Z'/);
});

test('real temp-dir LanceDB smoke degrades cleanly or writes/searches deterministically', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'signalmap-lancedb-'));
  try {
    const store = await openVectorStore({
      env: {
        SIGNALMAP_LANCEDB_URI: dir,
        SIGNALMAP_VECTOR_TABLE: 'signalmap_events_test',
        SIGNALMAP_EMBEDDING_DIM: '4',
        SIGNALMAP_VECTOR_TOP_K: '2',
        SIGNALMAP_VECTOR_MIN_SCORE: '0',
      },
    });

    if (store.status !== 'ready') {
      assert.equal(store.status, 'degraded');
      assert.equal((await upsertStoryVector(store, sampleEvent(), [0.1, 0.2, 0.3, 0.4])).status, 'skipped');
      assert.deepEqual(await findRelatedStories(store, [0.1, 0.2, 0.3, 0.4]), []);
      return;
    }

    const write = await upsertStoryVector(store, sampleEvent(), [0.1, 0.2, 0.3, 0.4]);
    assert.equal(write.status, 'upserted');

    const related = await findRelatedStories(store, [0.1, 0.2, 0.3, 0.4], {
      embeddingDim: 4,
      topK: 1,
      minScore: 0,
      searchTimeoutMs: 3000,
    });
    assert(related.length <= 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
