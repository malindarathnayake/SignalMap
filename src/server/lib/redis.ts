/**
 * SignalMap Redis adapter — ioredis implementation.
 *
 * Implements the `RedisAdapter` interface declared in `./redis.types.ts`.
 * Two ioredis connections are maintained per adapter instance:
 *   - `client`     — used for all normal commands (GET, SET, INCR, PIPELINE, PUBLISH, …)
 *   - `subscriber` — a dedicated connection kept in subscriber mode for SUBSCRIBE/UNSUBSCRIBE
 *
 * Do NOT import this module at the top level of any code that must work without
 * a Redis connection available.  Connection is established lazily by ioredis on
 * first command (lazyConnect: false actually connects eagerly when the constructor
 * is called — which only happens inside `createRedisAdapter()`).
 */

import Redis, { type Redis as RedisClient } from 'ioredis';
import type { RedisAdapter, Disposer } from './redis.types.ts';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CreateRedisAdapterOptions {
  /** Defaults to `process.env.REDIS_URL`. */
  url?: string;
}

/**
 * The concrete adapter returned by `createRedisAdapter`.
 * Extends `RedisAdapter` with a `quit()` method to close both connections.
 * `quit()` is intentionally NOT on the `RedisAdapter` interface — callers that
 * own the adapter lifecycle call it; callers that merely use it do not.
 */
export interface ManagedRedisAdapter extends RedisAdapter {
  /** Close both ioredis connections. Idempotent. */
  quit(): Promise<void>;
}

// ─── Connection options ────────────────────────────────────────────────────────

function makeConnectionOptions() {
  return {
    lazyConnect: false,
    enableAutoPipelining: false,
    commandTimeout: 5000,
  } as const;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRedisAdapter(options: CreateRedisAdapterOptions = {}): ManagedRedisAdapter {
  const url = options.url ?? process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');

  const client: RedisClient = new Redis(url, makeConnectionOptions());
  const subscriber: RedisClient = new Redis(url, makeConnectionOptions());

  // 'error' listeners prevent 'Unhandled error event' Node warnings during
  // transient connection issues. ioredis retries internally; we just log.
  client.on('error', (err: unknown) => {
    console.warn('[redis-adapter] client error:', err instanceof Error ? err.message : err);
  });
  subscriber.on('error', (err: unknown) => {
    console.warn('[redis-adapter] subscriber error:', err instanceof Error ? err.message : err);
  });

  // Internal pub/sub state: channel → set of handlers
  const handlers = new Map<string, Set<(msg: string) => void>>();

  // Single 'message' listener on the subscriber connection
  subscriber.on('message', (chan: string, msg: string) => {
    const set = handlers.get(chan);
    if (set) {
      for (const h of set) h(msg);
    }
  });

  let quitted = false;

  // ─── Adapter methods ──────────────────────────────────────────────────────

  async function getJson<T>(key: string): Promise<T | null> {
    const raw = await client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async function setJson<T>(key: string, value: T): Promise<void> {
    await client.set(key, JSON.stringify(value));
  }

  async function setJsonEx<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async function setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await client.set(key, value, 'PX', ttlSeconds * 1000, 'NX');
    return result === 'OK';
  }

  async function incr(key: string): Promise<number> {
    return client.incr(key);
  }

  async function incrByFloat(key: string, delta: number): Promise<number> {
    const raw = await client.incrbyfloat(key, delta);
    return Number(raw);
  }

  async function expire(key: string, ttlSeconds: number): Promise<void> {
    await client.expire(key, ttlSeconds);
  }

  async function del(key: string): Promise<void> {
    await client.del(key);
  }

  async function pipeline(commands: Array<[string, ...unknown[]]>): Promise<unknown[]> {
    const p = client.pipeline();
    for (const cmd of commands) {
      const [name, ...args] = cmd;
      // ioredis pipeline accepts dynamic method calls; use bracket notation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p as any)[name.toLowerCase()](...args);
    }
    const results = await p.exec();
    if (results === null) return [];
    return results.map(([err, val]) => err ?? val);
  }

  async function publish(channel: string, message: string): Promise<void> {
    await client.publish(channel, message);
  }

  function subscribe(channel: string, handler: (message: string) => void): Disposer {
    let disposed = false;

    // Get or create the handler set for this channel
    let set = handlers.get(channel);
    if (!set) {
      set = new Set();
      handlers.set(channel, set);
    }

    const wasEmpty = set.size === 0;
    set.add(handler);

    // Subscribe on the ioredis subscriber connection if this is the first handler
    if (wasEmpty) {
      subscriber.subscribe(channel).catch((err) => {
        console.warn('[redis-adapter] subscribe failed for channel', channel, '-', err instanceof Error ? err.message : err);
      });
    }

    return {
      dispose(): void {
        if (disposed) return;
        disposed = true;

        const s = handlers.get(channel);
        if (!s) return;
        s.delete(handler);

        if (s.size === 0) {
          handlers.delete(channel);
          subscriber.unsubscribe(channel).catch((err) => {
            console.warn('[redis-adapter] unsubscribe failed for channel', channel, '-', err instanceof Error ? err.message : err);
          });
        }
      },
    };
  }

  async function zadd(key: string, score: number, member: string): Promise<number> {
    const result = await client.zadd(key, score, member);
    return Number(result);
  }

  async function zrangeByScore(key: string, min: number | string, max: number | string): Promise<string[]> {
    return client.zrangebyscore(key, min, max);
  }

  async function zremRangeByRank(key: string, start: number, stop: number): Promise<number> {
    const result = await client.zremrangebyrank(key, start, stop);
    return Number(result);
  }

  async function zcard(key: string): Promise<number> {
    const result = await client.zcard(key);
    return Number(result);
  }

  async function evalCmd(script: string, keys: string[], args: string[]): Promise<unknown> {
    return client.eval(script, keys.length, ...keys, ...args);
  }

  async function quit(): Promise<void> {
    if (quitted) return;
    quitted = true;
    await Promise.all([client.quit(), subscriber.quit()]);
  }

  return {
    getJson,
    setJson,
    setJsonEx,
    setNx,
    incr,
    incrByFloat,
    expire,
    del,
    pipeline,
    publish,
    subscribe,
    zadd,
    zrangeByScore,
    zremRangeByRank,
    zcard,
    eval: evalCmd,
    quit,
  };
}

// ─── Lazy singleton ───────────────────────────────────────────────────────────

let _default: ManagedRedisAdapter | null = null;

/**
 * Returns the process-singleton adapter, creating it on first call.
 * Reads `process.env.REDIS_URL` at first-call time only.
 *
 * Use `createRedisAdapter({ url })` directly in tests so each suite gets its
 * own adapter instance and can call `adapter.quit()` in its `after()` hook.
 */
export function getRedisAdapter(): ManagedRedisAdapter {
  if (_default) return _default;
  _default = createRedisAdapter();
  return _default;
}
