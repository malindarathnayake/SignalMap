import { describe, it } from 'node:test';
import type { RedisAdapter, Disposer } from '../src/server/lib/redis.types.ts';

// Type-only references so the import isn't tree-shaken.
const _typeProbe: RedisAdapter | null = null;
const _disposerProbe: Disposer | null = null;
void _typeProbe;
void _disposerProbe;

describe('RedisAdapter contract (impl lands in Phase 2 unit 2a)', () => {
  it.skip('getJson returns null when key missing', () => {});
  it.skip('getJson returns deserialized value on hit', () => {});
  it.skip('setJson writes value without TTL (overwrite-in-place)', () => {});
  it.skip('setJsonEx writes value with TTL', () => {});
  it.skip('setNx returns true on lock acquired, false on contention', () => {});
  it.skip('setNx releases automatically after ttlSeconds expires', () => {});
  it.skip('incr returns 1 on first call, increments on each subsequent', () => {});
  it.skip('incrByFloat supports negative delta for refund pattern', () => {});
  it.skip('expire sets TTL on existing key', () => {});
  it.skip('del removes key', () => {});
  it.skip('pipeline returns results in command order', () => {});
  it.skip('publish + subscribe deliver message to handler', () => {});
  it.skip('subscribe disposer releases the listener', () => {});
  // Phase 3 unit 3d: sorted-set ops (impl in Phase 2 2a extension)
  it.skip('zadd adds a member and returns new-member count', () => {});
  it.skip('zrangeByScore returns members in ascending score order', () => {});
  it.skip('zremRangeByRank removes members in the given index range', () => {});
  it.skip('zcard returns cardinality of the sorted set', () => {});
});
