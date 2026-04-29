# Redis Adapter — Design Document

## Overview

SignalMap's server layer requires a Redis client abstraction that can be shared
across cache reads, brief writes, spend reservation, rate limiting, pub/sub
fanout, and singleflight locking. Rather than scattering raw `ioredis` calls
throughout handler code, all Redis access goes through a single `RedisAdapter`
interface defined in `src/server/lib/redis.types.ts`.

This document explains the purpose of each method, the error-handling contract
callers rely on, what is intentionally deferred to later phases, and the
implementation notes for Phase 2 unit 2a.

---

## Method Catalog

### `getJson<T>(key) → Promise<T | null>`

Used for every cache read in the SignalMap pipeline: the global brief
(`signalmap:brief:global`), per-event brief results, source-health probes, and
LLM output caches. Returns `null` on a cache miss so callers can decide whether
to fall back to an upstream fetch or serve stale data. Throws on connection
error so the caller can propagate the failure or trigger a circuit-breaker.
Wraps `GET` + `JSON.parse`.

### `setJson<T>(key, value) → Promise<void>`

Used by the brief cron (spec §Phase 1 unit 1c) to overwrite
`signalmap:brief:global` in place after each pipeline run. The key is
intentionally persistent (no TTL) so SSE handlers can always read the latest
brief without racing against expiry. If a TTL is needed use `setJsonEx`.
Wraps `SET` without `EX`.

### `setJsonEx<T>(key, value, ttlSeconds) → Promise<void>`

Used for any cache entry that must expire: short-lived source-health results
(60-second TTL), per-event brief caches (expire when the event window closes),
and rate-limit window state where `incr` + `expire` is not sufficient.
Wraps `SETEX`.

### `setNx(key, value, ttlSeconds) → Promise<boolean>`

Used by the per-event brief singleflight lock (spec §Phase 6 council §4
hardening). Before spawning an LLM pipeline for a specific event ID the handler
calls `setNx` on `signalmap:brief:lock:<eventId>`. Returns `true` if the lock
was acquired, `false` if another concurrent caller already holds it. The TTL
ensures the lock auto-releases even if the holder crashes.
Wraps `SET key value NX PX <ttlMs>`.

### `incr(key) → Promise<number>`

Used for per-IP rate-limit counters on the per-event brief endpoint (spec
§Phase 6 unit 6b). Each request increments its window counter; the returned
value is compared against the threshold. Pair with `expire` to set the window
TTL on the first increment.
Wraps `INCR`.

### `incrByFloat(key, delta) → Promise<number>`

Used for atomic LLM spend reservation (spec §Phase 6 unit 6c). Before each LLM
call the handler reserves the estimated token cost; after the call completes the
actual cost is known and the delta is refunded via a negative `delta`. This
two-phase reserve/refund prevents double-spending across concurrent requests
without a separate distributed lock.
Wraps `INCRBYFLOAT`.

### `expire(key, ttlSeconds) → Promise<void>`

Used after `incr` to arm the rate-limit window on the first increment. Because
`incr` writes a bare integer (not via `setJsonEx`), the TTL must be set in a
separate step. Implementations should call `expire` in the same pipeline as
`incr` where possible.
Wraps `EXPIRE`.

### `del(key) → Promise<void>`

Used for lock cleanup (release the singleflight lock before its TTL expires so
the next waiter can proceed immediately), test teardown, and manual cache
invalidation. No-op when the key does not exist.
Wraps `DEL`.

### `pipeline(commands) → Promise<unknown[]>`

Used by the brief cron to batch-write multiple signal keys in one network
round-trip, and by source-health polling to batch-read many probe results.
Reduces latency significantly when operating on large numbers of keys.
Results are returned in command order; callers parse them (e.g. `JSON.parse`
for `GET` results written via `setJson`).
Wraps `ioredis` `pipeline().exec()`.

### `publish(channel, message) → Promise<void>`

Used by the brief cron (spec §Phase 4 unit 4a) after writing the fresh brief to
Redis. Publishes a notification to `signalmap:brief:updated` so that SSE
handlers subscribed via `subscribe` can push updates to connected clients
without polling. Fire-and-forget: if no subscribers are listening the message is
silently dropped.
Wraps `PUBLISH`.

### `subscribe(channel, handler) → Disposer`

Used by SSE handlers (spec §Phase 4 unit 4b) to receive brief-updated events
and per-signal-event notifications. Returns a `Disposer` that must be called on
SSE connection close to release the listener and avoid memory leaks. The
implementation multiplexes all subscriptions on a single shared subscriber
connection so that many concurrent SSE connections do not open many TCP
connections to Redis.
Wraps `SUBSCRIBE` via a dedicated ioredis subscriber instance.

---

## Error Semantics

The contract distinguishes between two kinds of absence:

- **Connection / protocol errors** — the method throws. The caller decides
  whether to retry, fall back to stale data, or surface an error response. No
  method silently swallows connection failures.

- **Logical absence** — the method returns `null` (cache miss from `getJson`)
  or `false` (lock contention from `setNx`). These are not errors; they are
  part of normal operation.

Callers may rely on this distinction without inspecting error types. Phase 2
unit 2a will introduce custom error classes (`RedisConnectionError`,
`RedisCommandError`) to allow callers to distinguish connection failures from
command-level errors when needed.

---

## Out of Scope (Phase 3+)

The following operations are intentionally absent from this interface:

- **Sorted-set ops** (`ZADD`, `ZRANGEBYSCORE`, `ZREMRANGEBYSCORE`) — needed for
  the SSE replay ring (Phase 3 unit 3d). Adding them here would couple this
  contract to a feature that has not been designed yet.

- **Hash ops** (`HSET`, `HGET`, `HMGET`) — no current usage site has been
  identified.

- **Lua scripts** (`EVALSHA`) — complex atomic patterns not yet required.

Because `RedisAdapter` is an `interface` (open for extension), Phase 3 can
extend it without breaking existing callers.

---

## Implementation Notes for Phase 2 Unit 2a

**File:** `src/server/lib/redis.ts`

**ioredis method mappings:**

| Adapter method | ioredis call |
|----------------|-------------|
| `getJson<T>` | `client.get(key)` → `JSON.parse(result)` |
| `setJson<T>` | `client.set(key, JSON.stringify(value))` |
| `setJsonEx<T>` | `client.setex(key, ttlSeconds, JSON.stringify(value))` |
| `setNx` | `client.set(key, value, 'NX', 'PX', ttlSeconds * 1000)` |
| `incr` | `client.incr(key)` |
| `incrByFloat` | `client.incrbyfloat(key, delta)` |
| `expire` | `client.expire(key, ttlSeconds)` |
| `del` | `client.del(key)` |
| `pipeline` | `client.pipeline(commands).exec()` |
| `publish` | `client.publish(channel, message)` |
| `subscribe` | dedicated `subscriber` ioredis instance, `subscriber.subscribe(channel)` + `subscriber.on('message', ...)` |

**Connection config:**

- Read connection URL from `REDIS_URL` environment variable.
- Single `ioredis` connection with `lazyConnect: false` and `enableAutoPipelining: false`.
- Command timeout: 5000 ms (`commandTimeout: 5000`).
- Auto-reconnect: ioredis default exponential back-off (`retryStrategy` left at
  default so the adapter does not paper over persistent connection failures).
- Pub/sub: maintain a separate `subscriber` ioredis instance (ioredis requires a
  dedicated connection once `SUBSCRIBE` is issued). Share it across all
  `subscribe()` callers with an internal channel→handler registry.
- Export a singleton `redisAdapter` instance rather than a factory so the
  connection is reused across requests in the same process.
