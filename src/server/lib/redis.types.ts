/**
 * Redis adapter contract for SignalMap.
 *
 * This file defines the TypeScript interface that all Redis-dependent code in the
 * SignalMap server layer types against. It is contract-only — no imports from
 * `ioredis` or any other client library appear here.
 *
 * Implementation: Phase 2 unit 2a, `src/server/lib/redis.ts`.
 * That file will export a concrete `RedisAdapter` backed by `ioredis`, constructed
 * from the `REDIS_URL` environment variable with auto-reconnect and a 5-second
 * command timeout.
 *
 * Phase 3 unit 3d extends this interface with sorted-set operations
 * (`ZADD` / `ZRANGEBYSCORE` / `ZREMRANGEBYRANK` / `ZCARD`) for the SSE replay ring.
 * Those methods are now landed in this file.
 */

/**
 * A disposer handle returned by `RedisAdapter.subscribe`.
 *
 * Callers must call `dispose()` when they no longer need the subscription
 * (e.g. on SSE connection close) so the underlying pub/sub listener is
 * released and the ioredis subscriber connection can be cleaned up.
 *
 * Open interface — Phase 3 may add cleanup metadata (e.g. `channel` or
 * `subscribedAt`) without breaking existing callers.
 */
export interface Disposer {
  /**
   * Release the subscription acquired by `RedisAdapter.subscribe`.
   * Idempotent — calling more than once must be safe.
   */
  dispose(): void;
}

/**
 * The Redis adapter contract for SignalMap.
 *
 * All methods throw on connection or protocol errors so callers can decide
 * their own retry strategy. Methods that express logical absence (cache miss,
 * lock not acquired) return `null` or `false` rather than throwing — see the
 * "Error semantics" section in `docs/SignalMap/_discovery/redis-adapter.md`
 * for the full contract.
 *
 * Extended in Phase 3 unit 3d with sorted-set ops (`zadd`, `zrangeByScore`,
 * `zremRangeByRank`, `zcard`) for the SSE replay ring.
 */
export interface RedisAdapter {
  /**
   * Wraps Redis `GET` + `JSON.parse`.
   *
   * Returns the deserialized value on a cache hit, or `null` on a cache miss
   * (key absent or value stored as JSON `null`). Throws on connection/protocol
   * errors so the caller can decide whether to fall back to an upstream fetch
   * or propagate the error.
   *
   * Example use site: brief cron reads `signalmap:brief:global` to check
   * whether a fresh brief already exists before invoking the LLM pipeline.
   * Source-health cache reads (`signalmap:source:health:*`) also go through
   * `getJson`.
   *
   * @param key   Redis key (e.g. `"signalmap:brief:global"`).
   * @returns     Deserialized `T` on hit; `null` on miss.
   * @throws      On Redis connection or protocol error.
   */
  getJson<T>(key: string): Promise<T | null>;

  /**
   * Wraps Redis `SET` (no expiry) + `JSON.stringify`.
   *
   * Overwrites the key in place with no TTL — the value persists until
   * explicitly deleted or overwritten. Use `setJsonEx` when a TTL is needed.
   *
   * Example use site: brief cron writes the completed global brief to
   * `signalmap:brief:global` after the LLM pipeline finishes. The key is
   * intentionally persistent so SSE handlers can always read the latest brief
   * without racing against expiry.
   *
   * @param key   Redis key.
   * @param value Value to serialize and store.
   * @throws      On Redis connection or protocol error.
   */
  setJson<T>(key: string, value: T): Promise<void>;

  /**
   * Wraps Redis `SETEX` (SET with EXpiry) + `JSON.stringify`.
   *
   * Writes the serialized value and sets an expiry of `ttlSeconds`. Callers
   * that need a persistent key should use `setJson` instead.
   *
   * Example use sites: short-lived source-health caches (e.g. 60-second TTL
   * after an upstream probe), per-event brief caches that must expire once the
   * event window closes, and rate-limit window state.
   *
   * @param key        Redis key.
   * @param value      Value to serialize and store.
   * @param ttlSeconds Time-to-live in seconds (must be > 0).
   * @throws           On Redis connection or protocol error.
   */
  setJsonEx<T>(key: string, value: T, ttlSeconds: number): Promise<void>;

  /**
   * Wraps Redis `SET key value NX PX <ms>` (SET if Not eXists with expiry).
   *
   * Returns `true` if the lock was acquired (key did not previously exist),
   * or `false` if the key was already present (lock contended). The TTL
   * ensures the lock auto-releases if the holder crashes before calling `del`.
   *
   * Example use site: per-event brief singleflight lock. Before spawning an
   * LLM pipeline for a specific event ID, the handler calls `setNx` on
   * `signalmap:brief:lock:<eventId>`. Only the first concurrent caller
   * acquires the lock; others fall through to a cache read (council §4
   * hardening).
   *
   * @param key        Redis key used as the lock name.
   * @param value      Lock holder identifier (e.g. request ID or hostname).
   * @param ttlSeconds Lock auto-release timeout in seconds.
   * @returns          `true` if acquired, `false` if contended.
   * @throws           On Redis connection or protocol error.
   */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Wraps Redis `INCR`.
   *
   * Atomically increments the integer stored at `key` by 1 and returns the
   * new value. If the key does not exist, it is initialized to 0 before the
   * increment (so the first call returns 1).
   *
   * Example use site: per-IP rate-limit counters on the per-event brief
   * endpoint. Each request increments the counter for its IP window key; the
   * returned value is compared against the rate-limit threshold. Pair with
   * `expire` to set the window TTL on the first increment.
   *
   * @param key   Redis key (must store an integer string or not exist).
   * @returns     New counter value after increment.
   * @throws      On Redis connection or protocol error, or if the stored value
   *              is not an integer.
   */
  incr(key: string): Promise<number>;

  /**
   * Wraps Redis `INCRBYFLOAT`.
   *
   * Atomically increments (or decrements, when `delta` is negative) the
   * floating-point number stored at `key` by `delta` and returns the new
   * value. If the key does not exist it is initialized to 0.
   *
   * Example use site: atomic LLM spend reservation. Before each LLM call the
   * handler adds the estimated token cost to `signalmap:spend:<userId>:<window>`.
   * After the call completes, the actual cost is known and the difference is
   * refunded via a negative delta (e.g. `incrByFloat(key, actualCost - estimate)`).
   * This two-phase reserve/refund pattern prevents double-spending across
   * concurrent requests without a distributed lock.
   *
   * @param key   Redis key (must store a float string or not exist).
   * @param delta Amount to add (negative for refund/decrement).
   * @returns     New float value after increment.
   * @throws      On Redis connection or protocol error, or if the stored value
   *              is not a float.
   */
  incrByFloat(key: string, delta: number): Promise<number>;

  /**
   * Wraps Redis `EXPIRE`.
   *
   * Sets a TTL on an existing key. Has no effect if the key does not exist.
   * Use after `incr` to set the rate-limit window duration on the first
   * increment (where `setJsonEx` is not applicable because the value was
   * written by `incr`, not `setJson`).
   *
   * Example use site: after `incr` creates a rate-limit counter key for the
   * first time, `expire` arms the window so the counter auto-resets after
   * (e.g.) 60 seconds.
   *
   * @param key        Redis key to expire.
   * @param ttlSeconds Seconds until the key is deleted.
   * @throws           On Redis connection or protocol error.
   */
  expire(key: string, ttlSeconds: number): Promise<void>;

  /**
   * Wraps Redis `DEL`.
   *
   * Deletes the key. No-op if the key does not exist.
   *
   * Example use sites: lock cleanup after a singleflight holder finishes
   * (releases the lock before the TTL expires so the next waiter can proceed
   * immediately); test teardown; manual cache invalidation.
   *
   * @param key   Redis key to delete.
   * @throws      On Redis connection or protocol error.
   */
  del(key: string): Promise<void>;

  /**
   * Wraps Redis pipelining (`ioredis` `pipeline().exec()`).
   *
   * Sends multiple commands in a single network round-trip and returns their
   * results in the same order as the input commands array. Each command is an
   * array whose first element is the Redis command name (e.g. `"GET"`,
   * `"SET"`, `"INCR"`) followed by its arguments.
   *
   * Results are returned as-is from the Redis server (strings, numbers, or
   * `null` for absent keys). Callers are responsible for parsing the results
   * (e.g. `JSON.parse` for `GET` results that were written via `setJson`).
   *
   * Example use site: brief cron batch-writes multiple signal keys in one
   * round-trip to reduce latency. Source-health batch reads also use a
   * pipeline to fetch many keys simultaneously.
   *
   * @param commands  Array of Redis commands, each as `[commandName, ...args]`.
   * @returns         Array of raw Redis results in command order.
   * @throws          On Redis connection or protocol error. Individual command
   *                  errors are surfaced as error objects within the results
   *                  array (ioredis pipeline semantics).
   */
  pipeline(commands: Array<[string, ...unknown[]]>): Promise<unknown[]>;

  /**
   * Wraps Redis `PUBLISH`.
   *
   * Publishes `message` to `channel`. Returns when the message has been
   * delivered to the Redis server (does not wait for subscribers to receive
   * it). If no subscribers are listening the message is silently dropped —
   * pub/sub in Redis is fire-and-forget.
   *
   * Example use site: brief cron publishes `"updated"` (or a JSON summary)
   * to `signalmap:brief:updated` after writing the new brief to Redis so that
   * SSE handlers subscribed via `subscribe` can push the update to connected
   * clients without polling.
   *
   * @param channel   Redis pub/sub channel name.
   * @param message   String message payload to publish.
   * @throws          On Redis connection or protocol error.
   */
  publish(channel: string, message: string): Promise<void>;

  /**
   * Wraps Redis `SUBSCRIBE` via a dedicated subscriber connection.
   *
   * Registers `handler` to be called with the message string whenever a
   * message is published to `channel`. Returns a `Disposer` that the caller
   * must invoke when done (e.g. on SSE connection close) to release the
   * underlying listener and avoid memory/connection leaks.
   *
   * The implementation (Phase 2 unit 2a) will maintain a single shared
   * ioredis subscriber connection and multiplex channels on it so that
   * subscribing to many channels does not open many TCP connections.
   *
   * Example use site: the SSE handler subscribes to `signalmap:brief:updated`
   * on connection open and pushes `data:` events to the client as messages
   * arrive. It also subscribes to per-signal-event channels so clients receive
   * live updates without polling. The disposer is called in the SSE
   * `close`/`cancel` handler.
   *
   * Note: this method is intentionally synchronous-returning (not `async`)
   * because the subscription is set up immediately and the disposer must be
   * available before the first message arrives.
   *
   * @param channel   Redis pub/sub channel to subscribe to.
   * @param handler   Callback invoked with the raw message string on each publish.
   * @returns         A `Disposer` to release the subscription.
   * @throws          Never — SUBSCRIBE failures are logged via console.warn and
   *                  surface on the underlying ioredis connection's 'error'
   *                  event. Callers needing strict failure semantics should
   *                  attach their own listener via the connection accessor (TBD)
   *                  or wait for a future PR that introduces an async
   *                  subscribeAsync(channel, handler) variant.
   */
  subscribe(channel: string, handler: (message: string) => void): Disposer;

  /**
   * Wraps Redis `ZADD`. Adds (or updates) a member's score in the sorted set.
   *
   * @param key     Sorted-set key.
   * @param score   Numeric score for ordering.
   * @param member  Member string to add/update.
   * @returns       Number of new members added (0 if member already existed and only score changed).
   * @throws        On connection/protocol error.
   */
  zadd(key: string, score: number, member: string): Promise<number>;

  /**
   * Wraps Redis `ZRANGEBYSCORE`. Returns members whose score falls in [min, max].
   *
   * Min/max may use ioredis range syntax: a number, "-inf"/"+inf", or
   * exclusive bounds prefixed with "(" (e.g. "(100" means score > 100).
   *
   * @param key   Sorted-set key.
   * @param min   Lower bound (inclusive unless prefixed with "(").
   * @param max   Upper bound (inclusive unless prefixed with "(").
   * @returns     Members in ascending score order.
   * @throws      On connection/protocol error.
   */
  zrangeByScore(key: string, min: number | string, max: number | string): Promise<string[]>;

  /**
   * Wraps Redis `ZREMRANGEBYRANK`. Removes members in the given index range.
   *
   * Indices are 0-based; -1 is the last element. Use `(0, -<size>-1)` to keep
   * only the last `size` elements (cap a ring).
   *
   * @param key   Sorted-set key.
   * @param start Start index (inclusive).
   * @param stop  Stop index (inclusive).
   * @returns     Number of members removed.
   * @throws      On connection/protocol error.
   */
  zremRangeByRank(key: string, start: number, stop: number): Promise<number>;

  /**
   * Wraps Redis `ZCARD`. Returns the number of members in the sorted set.
   *
   * @param key   Sorted-set key.
   * @returns     Cardinality (0 if key absent).
   * @throws      On connection/protocol error.
   */
  zcard(key: string): Promise<number>;

  /**
   * Wraps Redis EVAL — runs a Lua script atomically against keys + args.
   * Returns the raw script result.
   *
   * Example use site: singleflight CAS release — only delete the lock key
   * if its current value matches the holder ID.
   */
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}
