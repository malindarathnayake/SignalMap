/**
 * Phase 3 unit 3a — Lease helper tests.
 *
 * Uses real Redis at redis://localhost:6379.
 * Raw ioredis client for direct ops; createRedisAdapter factory for calls under test.
 */

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import Redis from 'ioredis';
import { createRedisAdapter } from '../src/server/lib/redis.ts';
import type { ManagedRedisAdapter } from '../src/server/lib/redis.ts';
import { acquireLease, renewLease, releaseLease } from '../server/workers/lease.ts';

// ─── Shared state ─────────────────────────────────────────────────────────────

let adapter: ManagedRedisAdapter;
let raw: Redis;

/** All keys created by this suite — cleaned up in after(). */
const allKeys: string[] = [];

function uniqueKey(): string {
  const key = `signalmap:test:lease:${Math.random().toString(36).slice(2)}`;
  allKeys.push(key);
  return key;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Suite lifecycle ──────────────────────────────────────────────────────────

before(async () => {
  raw = new Redis('redis://localhost:6379', {
    connectTimeout: 3_000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  await raw.connect();

  const pong = await raw.ping();
  assert.equal(pong, 'PONG', 'Redis PING must return PONG — is Redis running?');

  adapter = createRedisAdapter({ url: 'redis://localhost:6379' });
});

after(async () => {
  if (allKeys.length > 0) {
    await raw.del(...allKeys).catch(() => { /* ignore */ });
  }
  await adapter.quit().catch(() => { /* ignore */ });
  await raw.quit().catch(() => { /* ignore */ });
});

// ─── Test cases ───────────────────────────────────────────────────────────────

test('acquire-when-free', async () => {
  const key = uniqueKey();
  try {
    const acquired = await acquireLease(adapter, key, 60, 'owner-A');
    assert.equal(acquired, true, 'acquireLease must return true when key is free');

    const stored = await raw.get(key);
    assert.equal(stored, 'owner-A', 'raw GET must return the ownerId');

    const pttl = await raw.pttl(key);
    assert.ok(pttl > 1 && pttl <= 60_000, `pttl must be between 1ms and 60_000ms, got ${pttl}`);
  } finally {
    await raw.del(key).catch(() => { /* ignore */ });
  }
});

test('acquire-when-held-fails', async () => {
  const key = uniqueKey();
  try {
    const first = await acquireLease(adapter, key, 60, 'owner-A');
    assert.equal(first, true, 'first acquire must return true');

    const second = await acquireLease(adapter, key, 60, 'owner-B');
    assert.equal(second, false, 'second acquire (different owner) must return false');

    const stored = await raw.get(key);
    assert.equal(stored, 'owner-A', 'raw GET must still return first owner');
  } finally {
    await raw.del(key).catch(() => { /* ignore */ });
  }
});

test('renew-success', async () => {
  const key = uniqueKey();
  try {
    await acquireLease(adapter, key, 60, 'owner-A');
    await wait(50);

    const renewed = await renewLease(adapter, key, 60, 'owner-A');
    assert.equal(renewed, true, 'renewLease must return true for the current owner');

    const pttl = await raw.pttl(key);
    assert.ok(pttl > 50_000, `pttl must be > 50_000ms after renew, got ${pttl}`);
  } finally {
    await raw.del(key).catch(() => { /* ignore */ });
  }
});

test('renew-by-non-owner-fails', async () => {
  const key = uniqueKey();
  try {
    await acquireLease(adapter, key, 60, 'owner-A');

    const renewed = await renewLease(adapter, key, 60, 'owner-B');
    assert.equal(renewed, false, 'renewLease must return false for a different ownerId');

    const stored = await raw.get(key);
    assert.equal(stored, 'owner-A', 'raw GET must still return owner-A after failed renew');
  } finally {
    await raw.del(key).catch(() => { /* ignore */ });
  }
});

test('release-by-non-owner-noop', async () => {
  const key = uniqueKey();
  try {
    await acquireLease(adapter, key, 60, 'owner-A');

    const released = await releaseLease(adapter, key, 'owner-B');
    assert.equal(released, false, 'releaseLease must return false for a different ownerId');

    const exists = await raw.exists(key);
    assert.equal(exists, 1, 'key must still exist after non-owner release attempt');
  } finally {
    await raw.del(key).catch(() => { /* ignore */ });
  }
});

test('release-by-owner-deletes', async () => {
  const key = uniqueKey();
  try {
    await acquireLease(adapter, key, 60, 'owner-A');

    const released = await releaseLease(adapter, key, 'owner-A');
    assert.equal(released, true, 'releaseLease must return true for the current owner');

    const exists = await raw.exists(key);
    assert.equal(exists, 0, 'key must not exist after owner releases it');
  } finally {
    await raw.del(key).catch(() => { /* ignore */ });
  }
});

test('expired-lease-acquirable', async () => {
  const key = uniqueKey();
  try {
    const firstAcquire = await acquireLease(adapter, key, 1, 'owner-A');
    assert.equal(firstAcquire, true, 'owner-A must acquire the lease initially');

    // Wait for TTL to expire (1s + 200ms buffer)
    await wait(1200);

    const secondAcquire = await acquireLease(adapter, key, 60, 'owner-B');
    assert.equal(secondAcquire, true, 'owner-B must acquire after TTL expiry');

    const stored = await raw.get(key);
    assert.equal(stored, 'owner-B', 'raw GET must return owner-B after re-acquisition');
  } finally {
    await raw.del(key).catch(() => { /* ignore */ });
  }
});
