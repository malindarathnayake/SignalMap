import type { RedisAdapter } from './redis.types.js';

const COUNTER_KEY = 'signalmap:sse:counter';
const RING_KEY = 'signalmap:sse:ring';
const EVENT_KEY_PREFIX = 'signalmap:sse:event:';

function getRingSize(): number {
  return Number(process.env.SSE_REPLAY_RING_SIZE ?? 1000);
}

function getRingTtlSeconds(): number {
  return Number(process.env.SSE_REPLAY_RING_TTL_SECONDS ?? 600);
}

export interface SSEEventPayload {
  /** Event type (SSE `event:` field). Defaults to `'message'` if absent. */
  event?: string;
  /** JSON-stringified payload (the SSE `data:` line). */
  data: string;
}

export interface ReplayResult {
  /** Events with score strictly > lastId, in ascending order. */
  events: Array<{ id: number; payload: SSEEventPayload }>;
  /** True iff lastId was below the oldest score still in the ring (replay lost). */
  lost: boolean;
}

/** Atomically allocates the next monotonic event ID via INCR signalmap:sse:counter. */
export async function nextEventId(redis: RedisAdapter): Promise<number> {
  return redis.incr(COUNTER_KEY);
}

/**
 * Adds an event to the ring:
 *   - SETEX signalmap:sse:event:<id> <RING_TTL_SECONDS> <payload>
 *   - ZADD signalmap:sse:ring <id> "<id>"
 *   - ZREMRANGEBYRANK signalmap:sse:ring 0 -RING_SIZE-1   (cap at RING_SIZE)
 */
export async function addEventToRing(
  redis: RedisAdapter,
  id: number,
  payload: SSEEventPayload,
): Promise<void> {
  const ringSize = getRingSize();
  const ringTtlSeconds = getRingTtlSeconds();
  const eventKey = `${EVENT_KEY_PREFIX}${id}`;
  await redis.setJsonEx(eventKey, payload, ringTtlSeconds);
  await redis.zadd(RING_KEY, id, String(id));
  // Keep only the last ringSize members: remove indices 0 through -(ringSize+1)
  await redis.zremRangeByRank(RING_KEY, 0, -(ringSize + 1));
}

/**
 * Replays events with score > lastId.
 *
 * If lastId is null, returns {events: [], lost: false} (fresh subscriber, no replay).
 * If the ring is empty, returns {events: [], lost: false}.
 * If lastId < oldest-in-ring, returns {events: [], lost: true}.
 * Otherwise returns the events strictly after lastId in ascending order.
 */
export async function replayFrom(
  redis: RedisAdapter,
  lastId: number | null,
): Promise<ReplayResult> {
  // Fresh subscriber — no replay needed
  if (lastId === null) {
    return { events: [], lost: false };
  }

  // Fetch all IDs strictly greater than lastId (exclusive lower bound)
  const idStrings = await redis.zrangeByScore(RING_KEY, `(${lastId}`, '+inf');

  if (idStrings.length === 0) {
    // Ring might be empty, or lastId is at/above newest.
    // Check if ring has any entries and if lastId is below the oldest.
    const size = await redis.zcard(RING_KEY);
    if (size === 0) {
      return { events: [], lost: false };
    }

    // Ring is not empty but nothing after lastId — check if lastId is before oldest
    const oldest = await redis.zrangeByScore(RING_KEY, '-inf', '+inf');
    if (oldest.length > 0 && Number(oldest[0]) > lastId + 1) {
      return { events: [], lost: true };
    }

    return { events: [], lost: false };
  }

  // Check for a gap between lastId and the first returned ID.
  // If the oldest ring entry is > lastId+1, events in between were evicted.
  if (Number(idStrings[0]) > lastId + 1) {
    return { events: [], lost: true };
  }

  // Fetch each event payload
  const events: Array<{ id: number; payload: SSEEventPayload }> = [];
  for (const idStr of idStrings) {
    const id = Number(idStr);
    const eventKey = `${EVENT_KEY_PREFIX}${id}`;
    const payload = await redis.getJson<SSEEventPayload>(eventKey);
    if (payload === null) {
      // Event TTL expired — the ring entry exists but payload is gone.
      // Per spec: TTL eviction past size/TTL returns lost: true.
      return { events: [], lost: true };
    }
    events.push({ id, payload });
  }

  return { events, lost: false };
}

/**
 * Canonical pub/sub channel name for SignalMap SSE events.
 * Publishers write the ring and publish here; the SSE handler only reads.
 */
export const SIGNALMAP_EVENTS_CHANNEL = 'signalmap:events';

/**
 * Wire contract for messages published on SIGNALMAP_EVENTS_CHANNEL.
 * The publisher allocates the monotonic id; the SSE handler is a fan-out
 * reader only and must NOT allocate ids or write the ring itself.
 */
export interface SignalMapStreamMessage {
  id: number;
  payload: SSEEventPayload;
}

/**
 * Canonical write path for SSE events. The future collector and any other
 * publisher MUST use this helper instead of writing the ring + publishing
 * separately. Allocates a monotonic id, writes the ring, then publishes
 * `{ id, payload }` JSON to the `signalmap:events` channel.
 *
 * The SSE handler (signalmap-stream.ts) is a fan-out READER only — it does
 * NOT write the ring. Doing so per-connection would break the monotonic-id
 * guarantee under concurrent client load.
 */
export async function publishStreamEvent(
  redis: RedisAdapter,
  payload: SSEEventPayload,
): Promise<number> {
  const id = await nextEventId(redis);
  await addEventToRing(redis, id, payload);
  await redis.publish(SIGNALMAP_EVENTS_CHANNEL, JSON.stringify({ id, payload }));
  return id;
}

/** Returns ring stats for ops visibility / health endpoint integration. */
export async function ringStats(redis: RedisAdapter): Promise<{
  size: number;
  oldestId: number | null;
  newestId: number | null;
}> {
  const size = await redis.zcard(RING_KEY);
  if (size === 0) {
    return { size: 0, oldestId: null, newestId: null };
  }

  // Fetch all members to get first and last (no LIMIT support in our contract)
  const all = await redis.zrangeByScore(RING_KEY, '-inf', '+inf');
  const oldestId = all.length > 0 ? Number(all[0]) : null;
  const newestId = all.length > 0 ? Number(all[all.length - 1]) : null;

  return { size, oldestId, newestId };
}
