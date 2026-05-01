import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

import {
  DEFAULT_SIGNALMAP_EMBEDDING_DIM,
  DEFAULT_SIGNALMAP_EMBEDDING_MODEL,
  resolveSignalMapEmbeddingConfig,
} from './embedding-model';

export const DEFAULT_SIGNALMAP_LANCEDB_URI = '/data/signalmap/lancedb';
export const DEFAULT_SIGNALMAP_VECTOR_TABLE = 'signalmap_events';
export const DEFAULT_SIGNALMAP_VECTOR_RETENTION_DAYS = 30;
export const DEFAULT_SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS = 3000;
export const DEFAULT_SIGNALMAP_VECTOR_TOP_K = 8;
export const DEFAULT_SIGNALMAP_VECTOR_MIN_SCORE = 0.72;

const TITLE_MAX_CHARS = 280;
const SUMMARY_MAX_CHARS = 1000;
const EVIDENCE_MAX_CHARS = 300;
const TAG_MAX_COUNT = 16;
const LOCATION_MAX_COUNT = 16;
const COUNTRY_ISO2_MAX_COUNT = 16;
const SCHEMA_MISSING_FIELD_MAX_COUNT = 20;
const REQUIRED_SIGNALMAP_VECTOR_FIELDS = [
  'id',
  'eventId',
  'canonicalUrl',
  'sourceName',
  'title',
  'summary',
  'category',
  'tags',
  'severity',
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
];

function cleanString(value: any): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boundedString(value: any, maxChars: number): string | undefined {
  const cleaned = cleanString(value);
  if (!cleaned) return undefined;
  return cleaned.replace(/\s+/g, ' ').slice(0, maxChars);
}

function parsePositiveInteger(value: any, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseNonNegativeNumber(value: any, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(value: any, fallback = true): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  return fallback;
}

function hashValue(value: any): string {
  return createHash('sha256').update(String(value ?? '')).digest('hex');
}

function isoDate(value: any, fallback = new Date()): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback.toISOString();
}

function uniqueStrings(values: any, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of Array.isArray(values) ? values : []) {
    const cleaned = boundedString(value, 120);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeCountryIso2(value: any): string | undefined {
  const cleaned = cleanString(value);
  if (!cleaned) return undefined;
  const normalized = cleaned.toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

function uniqueCountryIso2(values: any, limit = COUNTRY_ISO2_MAX_COUNT): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeCountryIso2(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeLocations(locations: any): any[] {
  if (!Array.isArray(locations)) return [];
  const normalized: any[] = [];
  for (const location of locations) {
    if (!location || typeof location !== 'object' || Array.isArray(location)) continue;
    const name = boundedString(location.name, 160);
    if (!name) continue;
    const countryIso2 = normalizeCountryIso2(location.countryIso2);
    normalized.push({
      name,
      ...(countryIso2 ? { countryIso2 } : {}),
      ...(boundedString(location.scope, 40) ? { scope: boundedString(location.scope, 40) } : {}),
      ...(Number.isFinite(Number(location.confidence))
        ? { confidence: Number(location.confidence) }
        : {}),
      ...(boundedString(location.evidence, EVIDENCE_MAX_CHARS)
        ? { evidence: boundedString(location.evidence, EVIDENCE_MAX_CHARS) }
        : {}),
    });
    if (normalized.length >= LOCATION_MAX_COUNT) break;
  }
  return normalized;
}

function normalizeVector(vector: any): number[] {
  if (Array.isArray(vector)) return vector.map(Number);
  if (ArrayBuffer.isView(vector)) return Array.from(vector as any, Number);
  return [];
}

function vectorFailure(reason: string, message: string): Error & { reason?: string; errorClass?: string } {
    const error = new Error(message) as Error & { reason?: string; errorClass?: string };
  error.reason = reason;
  error.errorClass = reason;
  return error;
}

function validateVectorDim(vector: any, dim: number): { ok: boolean; reason?: string; errorClass?: string; expectedDim?: number; actualDim?: number; vector?: number[] } {
  const normalized = normalizeVector(vector);
  if (normalized.length !== dim || !normalized.every(Number.isFinite)) {
    return {
      ok: false,
      reason: 'vector_dimension_mismatch',
      errorClass: 'vector_dimension_mismatch',
      expectedDim: dim,
      actualDim: normalized.length,
    };
  }
  return { ok: true, vector: normalized };
}

function isNotFoundError(error: any): boolean {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return text.includes('not found') || text.includes('does not exist') || text.includes('notfound');
}

function maybeLocalPath(uri: string): boolean {
  return typeof uri === 'string' && uri.trim() && !/^[a-z][a-z0-9+.-]*:\/\//i.test(uri);
}

function redactUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  return maybeLocalPath(uri) ? '[configured]' : '[remote-configured]';
}

function degradedVectorStore(config: any, reason: string, extra = {}): any {
  return {
    status: 'degraded',
    enabled: true,
    tableName: config.tableName,
    uri: redactUri(config.uri),
    errorClass: reason,
    lastVectorErrorClass: reason,
    config,
    ...extra,
  };
}

function schemaFieldNames(schema: any): Set<string> | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const fields = Array.isArray(schema.fields) ? schema.fields : undefined;
  if (!fields) return undefined;
  return new Set(fields.map((field) => field?.name).filter((name) => typeof name === 'string' && name));
}

async function validateExistingTableSchema(table: any): Promise<{ ok: boolean; unavailable?: boolean; reason?: string; missingFields?: string[]; missingFieldCount?: number }> {
  if (!table || typeof table !== 'object') return { ok: true, unavailable: true };

  let schema;
  if (typeof table.schema === 'function') {
    schema = await table.schema();
  } else if (table.schema && typeof table.schema === 'object') {
    schema = table.schema;
  } else {
    return { ok: true, unavailable: true };
  }

  const fieldNames = schemaFieldNames(schema);
  if (!fieldNames) return { ok: true, unavailable: true };

  const missingFields = REQUIRED_SIGNALMAP_VECTOR_FIELDS.filter(
    (fieldName) => !fieldNames.has(fieldName),
  );
  if (missingFields.length === 0) return { ok: true };

  return {
    ok: false,
    reason: 'vector_table_schema_mismatch',
    missingFields: missingFields.slice(0, SCHEMA_MISSING_FIELD_MAX_COUNT),
    missingFieldCount: missingFields.length,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function resultScore(result: any): number | undefined {
  if (Number.isFinite(Number(result?.score))) return Number(result.score);
  if (Number.isFinite(Number(result?._score))) return Number(result._score);
  if (Number.isFinite(Number(result?._distance))) {
    const distance = Number(result._distance);
    return 1 / (1 + Math.max(0, distance));
  }
  return undefined;
}

function publicRelatedRecord(result: any): any {
  const score = resultScore(result);
  return {
    id: result.id,
    eventId: result.eventId,
    canonicalUrl: result.canonicalUrl,
    sourceName: result.sourceName,
    title: result.title,
    summary: result.summary,
    category: result.category,
    tags: parseStringArray(result.tags),
    severity: result.severity,
    publishedAt: result.publishedAt,
    lastObservedAt: result.lastObservedAt,
    locationsJson: result.locationsJson,
    locationNames: parseStringArray(result.locationNames),
    countryIso2: uniqueCountryIso2(parseStringArray(result.countryIso2)),
    confidence: result.confidence,
    contentHash: result.contentHash,
    sourceTextHash: result.sourceTextHash,
    embeddingModel: result.embeddingModel,
    embeddingDim: result.embeddingDim,
    ...(score === undefined ? {} : { score }),
  };
}

function parseStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function serializeVectorRecordForLanceDb(record: any): any {
  const serialized = {
    ...record,
    tags: JSON.stringify(parseStringArray(record.tags)),
    locationNames: JSON.stringify(parseStringArray(record.locationNames)),
    countryIso2: JSON.stringify(uniqueCountryIso2(parseStringArray(record.countryIso2))),
    canonicalUrl: record.canonicalUrl ?? '',
    sourceName: record.sourceName ?? '',
    category: record.category ?? '',
    severity: record.severity ?? '',
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : 0,
  };

  return Object.fromEntries(
    Object.entries(serialized).filter(([, value]) => value !== undefined),
  );
}

export function resolveSignalMapVectorStoreConfig(env: NodeJS.ProcessEnv = process.env): any {
  const embedding = resolveSignalMapEmbeddingConfig(env);
  return {
    enabled: parseBoolean(env?.SIGNALMAP_VECTOR_ENABLED, true),
    uri: cleanString(env?.SIGNALMAP_LANCEDB_URI) ?? DEFAULT_SIGNALMAP_LANCEDB_URI,
    tableName: cleanString(env?.SIGNALMAP_VECTOR_TABLE) ?? DEFAULT_SIGNALMAP_VECTOR_TABLE,
    retentionDays: parsePositiveInteger(
      env?.SIGNALMAP_VECTOR_RETENTION_DAYS,
      DEFAULT_SIGNALMAP_VECTOR_RETENTION_DAYS,
    ),
    searchTimeoutMs: parsePositiveInteger(
      env?.SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS,
      DEFAULT_SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS,
    ),
    topK: parsePositiveInteger(env?.SIGNALMAP_VECTOR_TOP_K, DEFAULT_SIGNALMAP_VECTOR_TOP_K),
    minScore: parseNonNegativeNumber(
      env?.SIGNALMAP_VECTOR_MIN_SCORE,
      DEFAULT_SIGNALMAP_VECTOR_MIN_SCORE,
    ),
    embeddingModel: embedding.model,
    embeddingDim: embedding.dim,
  };
}

export function createSignalMapVectorRecord(event: any, vector: any, options: any = {}): any {
  const config = {
    ...resolveSignalMapVectorStoreConfig(options.env ?? process.env),
    ...(options.embeddingModel ? { embeddingModel: options.embeddingModel } : {}),
    ...(options.embeddingDim ? { embeddingDim: options.embeddingDim } : {}),
  };
  const vectorCheck = validateVectorDim(vector, config.embeddingDim);
  if (!vectorCheck.ok) {
    throw vectorFailure(
      vectorCheck.reason as string,
      `Expected vector length ${vectorCheck.expectedDim}, got ${vectorCheck.actualDim}`,
    );
  }

  const title =
    boundedString(event?.canonicalTitle, TITLE_MAX_CHARS) ??
    boundedString(event?.title, TITLE_MAX_CHARS) ??
    'Untitled SignalMap event';
  const summary = boundedString(event?.summary, SUMMARY_MAX_CHARS) ?? '';
  const locations = normalizeLocations(event?.locations);
  const locationNames = uniqueStrings(
    locations.map((location) => location.name),
    LOCATION_MAX_COUNT,
  );
  const countryIso2 = uniqueCountryIso2([
    event?.countryIso2,
    ...locations.map((location) => location.countryIso2),
  ]);
  const tags = uniqueStrings(event?.tags, TAG_MAX_COUNT);
  const canonicalUrl = boundedString(event?.canonicalUrl ?? event?.url, 1000);
  const sourceName = boundedString(event?.sourceName ?? event?.source, 160);
  const publishedAt = isoDate(event?.publishedAt ?? event?.eventTime ?? event?.date);
  const lastObservedAt = isoDate(event?.lastObservedAt ?? event?.observedAt, new Date(publishedAt));
  const contentHash =
    cleanString(event?.contentHash) ??
    hashValue([title, summary, canonicalUrl, publishedAt].join('
'));
  const sourceTextHash =
    cleanString(event?.sourceTextHash) ??
    hashValue([canonicalUrl, sourceName, title, summary].join('
'));
  const eventId =
    cleanString(event?.eventId) ??
    cleanString(event?.id) ??
    hashValue(`${canonicalUrl}
${title}`).slice(0, 24);

  return {
    id: cleanString(event?.id) ?? eventId,
    eventId,
    canonicalUrl: canonicalUrl ?? '',
    sourceName: sourceName ?? '',
    title,
    summary,
    category: boundedString(event?.category, 80) ?? '',
    tags,
    severity: boundedString(event?.severity, 40) ?? '',
    publishedAt,
    lastObservedAt,
    locationsJson: JSON.stringify(locations),
    locationNames,
    countryIso2,
    confidence: Number.isFinite(Number(event?.confidence)) ? Number(event.confidence) : 0,
    contentHash,
    sourceTextHash,
    evidenceSnippetsJson: JSON.stringify(
      locations.map((location) => location.evidence).filter(Boolean),
    ),
    embeddingModel: config.embeddingModel ?? DEFAULT_SIGNALMAP_EMBEDDING_MODEL,
    embeddingDim: config.embeddingDim ?? DEFAULT_SIGNALMAP_EMBEDDING_DIM,
    vector: vectorCheck.vector,
  };
}

async function resolveLanceDbModule(options: any): Promise<any> {
  if (options.lancedbModule) return options.lancedbModule;
  if (options.connectImpl) return { connect: options.connectImpl };
  return import('@lancedb/lancedb');
}

async function openExistingTable(db: any, tableName: string): Promise<any | null> {
  try {
    return await db.openTable(tableName);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function openVectorStore(options: any = {}): Promise<any> {
  const config = {
    ...resolveSignalMapVectorStoreConfig(options.env ?? process.env),
    ...(options.uri ? { uri: options.uri } : {}),
    ...(options.tableName ? { tableName: options.tableName } : {}),
    ...(options.enabled !== undefined ? { enabled: options.enabled } : {}),
  };

  if (!config.enabled) {
    return {
      status: 'degraded',
      enabled: false,
      disabled: true,
      tableName: config.tableName,
      uri: redactUri(config.uri),
      errorClass: 'vector_store_disabled',
      lastVectorErrorClass: 'vector_store_disabled',
    };
  }

  if (options.table) {
    let schemaCheck;
    try {
      schemaCheck = await validateExistingTableSchema(options.table);
    } catch {
      return degradedVectorStore(config, 'vector_table_schema_inspection_failed', {
        error: 'LanceDB table schema inspection failed',
      });
    }
    if (!schemaCheck.ok) {
      return degradedVectorStore(config, schemaCheck.reason as string, {
        missingFields: schemaCheck.missingFields,
        missingFieldCount: schemaCheck.missingFieldCount,
        error: `LanceDB table schema mismatch: missing fields ${schemaCheck.missingFields?.join(
          ', ',
        )}`,
      });
    }
    return {
      status: 'ready',
      enabled: true,
      db: options.db,
      table: options.table,
      tableName: config.tableName,
      uri: redactUri(config.uri),
      config,
    };
  }

  if (!cleanString(config.uri)) {
    return {
      status: 'degraded',
      enabled: true,
      tableName: config.tableName,
      uri: undefined,
      errorClass: 'missing_lancedb_uri',
      lastVectorErrorClass: 'missing_lancedb_uri',
      config,
    };
  }

  try {
    if (maybeLocalPath(config.uri)) {
      await mkdir(config.uri, { recursive: true });
    }
    const lancedb = await resolveLanceDbModule(options);
    const connect = options.connectImpl ?? lancedb.connect;
    if (typeof connect !== 'function') {
      throw new Error('LanceDB connect function is unavailable');
    }
    const db = await connect(config.uri);
    const table = await openExistingTable(db, config.tableName);
    if (table) {
      let schemaCheck;
      try {
        schemaCheck = await validateExistingTableSchema(table);
      } catch {
        return degradedVectorStore(config, 'vector_table_schema_inspection_failed', {
          error: 'LanceDB table schema inspection failed',
        });
      }
      if (!schemaCheck.ok) {
        return degradedVectorStore(config, schemaCheck.reason as string, {
          missingFields: schemaCheck.missingFields,
          missingFieldCount: schemaCheck.missingFieldCount,
          error: `LanceDB table schema mismatch: missing fields ${schemaCheck.missingFields?.join(
            ', ',
          )}`,
        });
      }
    }
    return {
      status: 'ready',
      enabled: true,
      db,
      table,
      tableName: config.tableName,
      uri: redactUri(config.uri),
      pendingCreate: !table,
      config,
    };
  } catch (error: any) {
    return {
      status: 'degraded',
      enabled: true,
      tableName: config.tableName,
      uri: redactUri(config.uri),
      errorClass: error?.name ?? 'SignalMapVectorStoreOpenError',
      lastVectorErrorClass: error?.name ?? 'SignalMapVectorStoreOpenError',
      error: error?.message ?? String(error),
      config,
    };
  }
}

async function ensureWritableTable(store: any, record: any): Promise<any | null> {
  if (store?.table) return store.table;
  if (!store?.db || typeof store.db.createTable !== 'function') return null;
  const table = await store.db.createTable(store.tableName, [
    serializeVectorRecordForLanceDb(record),
  ]);
  store.table = table;
  store.pendingCreate = false;
  store.createdWithFirstRecord = true;
  return table;
}

export async function upsertStoryVector(
  store: any,
  recordOrEvent: any,
  vector: any,
  options: any = {},
): Promise<any> {
  if (!store || store.status !== 'ready' || store.enabled === false) {
    return { status: 'skipped', reason: store?.errorClass ?? 'vector_store_degraded' };
  }

  const dim =
    options.embeddingDim ?? store.config?.embeddingDim ?? DEFAULT_SIGNALMAP_EMBEDDING_DIM;
  const incomingVector = vector ?? recordOrEvent?.vector;
  const vectorCheck = validateVectorDim(incomingVector, dim);
  if (!vectorCheck.ok) {
    store.lastVectorErrorClass = vectorCheck.errorClass;
    return {
      status: 'failed',
      ...vectorCheck,
    };
  }

  const record =
    recordOrEvent?.embeddingDim && recordOrEvent?.vector
      ? { ...recordOrEvent, vector: vectorCheck.vector }
      : createSignalMapVectorRecord(recordOrEvent, vectorCheck.vector, {
          env: options.env,
          embeddingDim: dim,
          embeddingModel: options.embeddingModel ?? store.config?.embeddingModel,
        });

  try {
    const table = await ensureWritableTable(store, record);
    if (store.createdWithFirstRecord) {
      return { status: 'upserted', count: 1, createdTable: true, record };
    }
    if (!table || typeof table.add !== 'function') {
      return { status: 'skipped', reason: 'vector_table_unavailable' };
    }
    await table.add([serializeVectorRecordForLanceDb(record)]);
    return { status: 'upserted', count: 1, record };
  } catch (error: any) {
    store.lastVectorErrorClass = error?.name ?? 'SignalMapVectorUpsertError';
    return {
      status: 'failed',
      reason: 'vector_upsert_error',
      errorClass: store.lastVectorErrorClass,
      error: error?.message ?? String(error),
    };
  }
}

export async function findRelatedStories(
  store: any,
  vector: any,
  options: any = {},
): Promise<any[]> {
  if (!store || store.status !== 'ready' || store.enabled === false || !store.table) return [];

  const config = {
    ...resolveSignalMapVectorStoreConfig(options.env ?? process.env),
    ...(store.config ?? {}),
    ...options,
  };
  const vectorCheck = validateVectorDim(vector, config.embeddingDim);
  if (!vectorCheck.ok || typeof store.table.vectorSearch !== 'function') {
    store.lastVectorErrorClass = vectorCheck.errorClass ?? 'vector_search_unavailable';
    return [];
  }

  const searchPromise = (async () => {
    const query = store.table.vectorSearch(vectorCheck.vector);
    const limited = typeof query?.limit === 'function' ? query.limit(config.topK) : query;
    const rows = typeof limited?.toArray === 'function' ? await limited.toArray() : [];
    return rows
      .map(publicRelatedRecord)
      .filter((row: any) => row.score === undefined || row.score >= config.minScore)
      .sort((left: any, right: any) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, config.topK);
  })();

  try {
    return await withTimeout(searchPromise, config.searchTimeoutMs, []);
  } catch (error: any) {
    store.lastVectorErrorClass = error?.name ?? 'SignalMapVectorSearchError';
    return [];
  }
}

export async function pruneOldVectors(store: any, options: any = {}): Promise<any> {
  if (!store || store.status !== 'ready' || store.enabled === false || !store.table) {
    return { status: 'skipped', reason: store?.errorClass ?? 'vector_store_degraded' };
  }

  if (typeof store.table.delete !== 'function') {
    return { status: 'skipped', reason: 'delete_unavailable' };
  }

  const retentionDays = parsePositiveInteger(
    options.retentionDays ?? store.config?.retentionDays,
    DEFAULT_SIGNALMAP_VECTOR_RETENTION_DAYS,
  );
  const nowMs = options.now ? Date.parse(options.now) : Date.now();
  const cutoff = new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const where = `lastObservedAt < '${cutoff}'`;

  try {
    await store.table.delete(where);
    return { status: 'pruned', cutoff, where };
  } catch (error: any) {
    store.lastVectorErrorClass = error?.name ?? 'SignalMapVectorPruneError';
    return {
      status: 'failed',
      reason: 'vector_prune_error',
      errorClass: store.lastVectorErrorClass,
      error: error?.message ?? String(error),
      cutoff,
      where,
    };
  }
}

async function resolveRecordCount(table: any): Promise<number | undefined> {
  if (!table) return undefined;
  for (const methodName of ['countRows', 'count', 'numRows']) {
    if (typeof table[methodName] === 'function') {
      const value = await table[methodName]();
      return Number.isFinite(Number(value)) ? Number(value) : undefined;
    }
  }
  return undefined;
}

export async function getVectorStoreHealth(storeOrOptions: any = {}): Promise<any> {
  const store = storeOrOptions?.status ? storeOrOptions : await openVectorStore(storeOrOptions);
  let recordCount;
  let countErrorClass;
  try {
    recordCount = await resolveRecordCount(store?.table);
  } catch (error: any) {
    countErrorClass = error?.name ?? 'SignalMapVectorCountError';
    if (store && typeof store === 'object') store.lastVectorErrorClass = countErrorClass;
  }
  return {
    status: countErrorClass ? 'degraded' : store?.status ?? 'degraded',
    enabled: store?.enabled !== false,
    disabled: store?.disabled === true,
    tableName: store?.tableName,
    uriConfigured: Boolean(store?.uri),
    writable: store?.status === 'ready' && Boolean(store?.table || store?.db),
    open: store?.status === 'ready',
    recordCount: recordCount === undefined ? null : recordCount,
    ...(store?.pendingCreate ? { pendingCreate: true } : {}),
    ...(store?.errorClass || countErrorClass
      ? { errorClass: store?.errorClass ?? countErrorClass }
      : {}),
    lastVectorErrorClass: store?.lastVectorErrorClass ?? countErrorClass ?? null,
  };
}
