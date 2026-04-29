import { createRedisAdapter } from '../../src/server/lib/redis';
import { unwrapEnvelope } from './seed-envelope';

// ioredis command timeout matches the adapter's commandTimeout: 5000
const REDIS_OP_TIMEOUT_MS = 5_000;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'TimeoutError' ||
      err.name === 'AbortError' ||
      err.name === 'CommandTimeoutError')
  );
}

/**
 * Environment-based key prefix to avoid collisions when multiple deployments
 * share the same Redis instance (M-6 fix).
 */
function getKeyPrefix(): string {
  const env = process.env.VERCEL_ENV; // 'production' | 'preview' | 'development'
  if (!env || env === 'production') return '';
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'dev';
  return `${env}:${sha}:`;
}

let cachedPrefix: string | undefined;
function prefixKey(key: string): string {
  if (cachedPrefix === undefined) cachedPrefix = getKeyPrefix();
  if (!cachedPrefix) return key;
  return `${cachedPrefix}${key}`;
}

// Test-only: invalidate the memoized key prefix so a test that mutates
// process.env.VERCEL_ENV / VERCEL_GIT_COMMIT_SHA sees the new value on the
// next read. No production caller should ever invoke this.
export function __resetKeyPrefixCacheForTests(): void {
  cachedPrefix = undefined;
}

// Lazy adapter singleton (created on first use).
let _adapter: ReturnType<typeof createRedisAdapter> | null = null;
function getAdapter() {
  if (_adapter) return _adapter;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    _adapter = createRedisAdapter({ url });
  } catch {
    return null;
  }
  return _adapter;
}

// Lazy raw ioredis client for getCachedRawString (raw GET with no JSON.parse).
let _rawClient: import('ioredis').default | null = null;
async function getRawClient() {
  if (_rawClient) return _rawClient;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const { default: Redis } = await import('ioredis');
  _rawClient = new Redis(url, {
    lazyConnect: false,
    enableAutoPipelining: false,
    commandTimeout: 5000,
  });
  return _rawClient;
}

/**
 * Like getCachedJson but throws on Redis/network failures instead of returning null.
 * Always uses the raw (unprefixed) key — callers that write via seed scripts (which bypass
 * the prefix system) must use this to read the same key they wrote.
 */
export async function getRawJson(key: string): Promise<unknown | null> {
  if (process.env.LOCAL_API_MODE === 'tauri-sidecar') {
    const { sidecarCacheGet } = await import('./sidecar-cache');
    return sidecarCacheGet(key);
  }
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not set');
  const adapter = getAdapter();
  if (!adapter) throw new Error('REDIS_URL is not set');
  const result = await adapter.getJson<unknown>(key);
  if (result === null) return null;
  // Envelope-aware: contract-mode canonical keys are stored as {_seed, data}.
  // unwrapEnvelope is a no-op on legacy (non-envelope) shapes.
  return unwrapEnvelope(result as Record<string, unknown>).data;
}

/**
 * Read a key's value as a raw string — no JSON.parse, no envelope unwrap.
 * Use when a seeder stores a bare scalar (e.g., a snapshot_id pointer) via
 * `['SET', key, bareString]` without JSON.stringify. getCachedJson() on these
 * keys silently returns null because JSON.parse throws on unquoted strings,
 * and the try/catch swallows the error.
 *
 * Always uses the raw (unprefixed) key — matches the seed-script write path
 * (seeders don't know about the Vercel env-prefix scheme).
 */
export async function getCachedRawString(key: string): Promise<string | null> {
  if (process.env.LOCAL_API_MODE === 'tauri-sidecar') {
    const { sidecarCacheGet } = await import('./sidecar-cache');
    const v = sidecarCacheGet(key);
    return typeof v === 'string' ? v : null;
  }
  if (!process.env.REDIS_URL) return null;
  try {
    const c = await getRawClient();
    if (!c) return null;
    const raw = await c.get(key);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch (err) {
    if (isTimeoutError(err)) {
      console.error(`[REDIS-TIMEOUT] getCachedRawString key=${key} timeoutMs=${REDIS_OP_TIMEOUT_MS}`);
    } else {
      console.warn('[redis] getCachedRawString failed:', errMsg(err));
    }
    return null;
  }
}

export async function getCachedJson(key: string, raw = false): Promise<unknown | null> {
  if (process.env.LOCAL_API_MODE === 'tauri-sidecar') {
    const { sidecarCacheGet } = await import('./sidecar-cache');
    return sidecarCacheGet(key);
  }

  if (!process.env.REDIS_URL) return null;
  const adapter = getAdapter();
  if (!adapter) return null;
  try {
    const finalKey = raw ? key : prefixKey(key);
    const result = await adapter.getJson<unknown>(finalKey);
    if (result === null) return null;
    // Envelope-aware by default — RPC consumers get the bare payload regardless
    // of whether the writer has migrated to contract mode. Legacy shapes pass
    // through unchanged (unwrapEnvelope returns {_seed: null, data: raw}).
    return unwrapEnvelope(result as Record<string, unknown>).data;
  } catch (err) {
    const isTimeout = isTimeoutError(err);
    if (isTimeout) {
      console.error(`[REDIS-TIMEOUT] getCachedJson key=${key} timeoutMs=${REDIS_OP_TIMEOUT_MS}`);
    } else {
      console.warn('[redis] getCachedJson failed:', errMsg(err));
    }
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number, raw = false): Promise<void> {
  if (process.env.LOCAL_API_MODE === 'tauri-sidecar') {
    const { sidecarCacheSet } = await import('./sidecar-cache');
    sidecarCacheSet(key, value, ttlSeconds);
    return;
  }

  if (!process.env.REDIS_URL) return;
  const adapter = getAdapter();
  if (!adapter) return;
  try {
    const finalKey = raw ? key : prefixKey(key);
    // Atomic SETEX — single call avoids race between SET and EXPIRE (C-3 fix)
    await adapter.setJsonEx(finalKey, value, ttlSeconds);
  } catch (err) {
    console.warn('[redis] setCachedJson failed:', errMsg(err));
  }
}

const NEG_SENTINEL = '__WM_NEG__';

/**
 * Batch GET using Redis pipeline — single round-trip for N keys.
 * Returns a Map of key → parsed JSON value (missing/failed/sentinel keys omitted).
 */
export async function getCachedJsonBatch(keys: string[]): Promise<Map<string, unknown>> {
  const result = new Map<string, unknown>();
  if (keys.length === 0) return result;

  if (!process.env.REDIS_URL) return result;
  const adapter = getAdapter();
  if (!adapter) return result;

  try {
    const pipeline: Array<[string, ...unknown[]]> = keys.map((k) => ['GET', prefixKey(k)]);
    const adapterResults = await adapter.pipeline(pipeline);
    for (let i = 0; i < keys.length; i++) {
      const raw = adapterResults[i];
      // Pipeline GET returns raw string (or null) — adapter does NOT JSON.parse for pipeline results
      if (typeof raw === 'string' && raw.length > 0) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed === NEG_SENTINEL) continue;
          // Envelope-aware: unwrap contract-mode canonical keys; legacy values pass through.
          result.set(keys[i]!, unwrapEnvelope(parsed).data);
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    console.warn('[redis] getCachedJsonBatch failed:', errMsg(err));
  }
  return result;
}

export type RedisPipelineCommand = Array<string | number>;

function normalizePipelineCommand(command: RedisPipelineCommand, raw: boolean): RedisPipelineCommand {
  if (raw || command.length < 2) return [...command];
  const [verb, key, ...rest] = command;
  if (typeof verb !== 'string' || typeof key !== 'string') return [...command];
  return [verb, prefixKey(key), ...rest];
}

export async function runRedisPipeline(
  commands: RedisPipelineCommand[],
  raw = false,
): Promise<Array<{ result?: unknown }>> {
  if (process.env.LOCAL_API_MODE === 'tauri-sidecar') return [];
  if (commands.length === 0) return [];

  if (!process.env.REDIS_URL) return [];
  const adapter = getAdapter();
  if (!adapter) return [];

  try {
    const normalized = commands.map((command) => normalizePipelineCommand(command, raw));
    const adapterResults = await adapter.pipeline(normalized as Array<[string, ...unknown[]]>);
    // Convert adapter's unknown[] to Array<{result?: unknown}>
    return adapterResults.map((r) => r instanceof Error ? { result: undefined } : { result: r });
  } catch (err) {
    console.warn('[redis] runRedisPipeline failed:', errMsg(err));
    return [];
  }
}

/**
 * In-flight request coalescing map.
 * When multiple concurrent requests hit the same cache key during a miss,
 * only the first triggers the upstream fetch — others await the same promise.
 * This eliminates duplicate upstream API calls within a single Edge Function invocation.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Check cache, then fetch with coalescing on miss.
 * Concurrent callers for the same key share a single upstream fetch + Redis write.
 * When fetcher returns null, a sentinel is cached for negativeTtlSeconds to prevent request storms.
 */
export async function cachedFetchJson<T extends object>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T | null>,
  negativeTtlSeconds = 120,
): Promise<T | null> {
  const cached = await getCachedJson(key);
  if (cached === NEG_SENTINEL) return null;
  if (cached !== null) return cached as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T | null>;

  const promise = fetcher()
    .then(async (result) => {
      if (result != null) {
        await setCachedJson(key, result, ttlSeconds);
      } else {
        await setCachedJson(key, NEG_SENTINEL, negativeTtlSeconds);
      }
      return result;
    })
    .catch((err: unknown) => {
      console.warn(`[redis] cachedFetchJson fetcher failed for "${key}":`, errMsg(err));
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * Like cachedFetchJson but reports the data source.
 * Use when callers need to distinguish cache hits from fresh fetches
 * (e.g. to set provider/cached metadata on responses).
 *
 * Returns { data, source } where source is:
 *   'cache'  — served from Redis
 *   'fresh'  — fetcher ran (leader) or joined an in-flight fetch (follower)
 */
export async function cachedFetchJsonWithMeta<T extends object>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T | null>,
  negativeTtlSeconds = 120,
): Promise<{ data: T | null; source: 'cache' | 'fresh' }> {
  const cached = await getCachedJson(key);
  if (cached === NEG_SENTINEL) return { data: null, source: 'cache' };
  if (cached !== null) return { data: cached as T, source: 'cache' };

  const existing = inflight.get(key);
  if (existing) {
    const data = (await existing) as T | null;
    return { data, source: 'fresh' };
  }

  const promise = fetcher()
    .then(async (result) => {
      if (result != null) {
        await setCachedJson(key, result, ttlSeconds);
      } else {
        await setCachedJson(key, NEG_SENTINEL, negativeTtlSeconds);
      }
      return result;
    })
    .catch((err: unknown) => {
      console.warn(`[redis] cachedFetchJsonWithMeta fetcher failed for "${key}":`, errMsg(err));
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  const data = await promise;
  return { data, source: 'fresh' };
}

export async function geoSearchByBox(
  key: string, lon: number, lat: number,
  widthKm: number, heightKm: number, count: number, raw = false,
): Promise<string[]> {
  if (!process.env.REDIS_URL) return [];
  const adapter = getAdapter();
  if (!adapter) return [];
  try {
    const finalKey = raw ? key : prefixKey(key);
    const pipeline: Array<[string, ...unknown[]]> = [
      ['GEOSEARCH', finalKey, 'FROMLONLAT', String(lon), String(lat),
       'BYBOX', String(widthKm), String(heightKm), 'km', 'ASC', 'COUNT', String(count)],
    ];
    const adapterResults = await adapter.pipeline(pipeline);
    // result[0] is the GEOSEARCH return — an array of member name strings
    const geoResult = adapterResults[0];
    if (Array.isArray(geoResult)) return geoResult as string[];
    return [];
  } catch (err) {
    console.warn('[redis] geoSearchByBox failed:', errMsg(err));
    return [];
  }
}

export async function getHashFieldsBatch(
  key: string, fields: string[], raw = false,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (fields.length === 0) return result;
  if (!process.env.REDIS_URL) return result;
  const adapter = getAdapter();
  if (!adapter) return result;
  try {
    const finalKey = raw ? key : prefixKey(key);
    const pipeline: Array<[string, ...unknown[]]> = [['HMGET', finalKey, ...fields]];
    const adapterResults = await adapter.pipeline(pipeline);
    // adapterResults[0] is the HMGET return — (string|null)[]
    const values = adapterResults[0] as (string | null)[] | null | undefined;
    if (values) {
      for (let i = 0; i < fields.length; i++) {
        if (values[i]) result.set(fields[i]!, values[i]!);
      }
    }
  } catch (err) {
    console.warn('[redis] getHashFieldsBatch failed:', errMsg(err));
  }
  return result;
}

/**
 * Deletes a single Redis key.
 *
 * @param key - The key to delete
 * @param raw - When true, skips the environment prefix (use for global keys like entitlements)
 */
export async function deleteRedisKey(key: string, raw = false): Promise<void> {
  if (!process.env.REDIS_URL) return;
  const adapter = getAdapter();
  if (!adapter) return;

  try {
    const finalKey = raw ? key : prefixKey(key);
    await adapter.del(finalKey);
  } catch (err) {
    console.warn('[redis] deleteRedisKey failed:', errMsg(err));
  }
}
