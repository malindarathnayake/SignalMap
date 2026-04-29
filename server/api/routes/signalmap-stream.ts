import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomInt } from 'node:crypto';
import { getRedisAdapter } from '../../../src/server/lib/redis.js';
import {
  SIGNALMAP_EVENTS_CHANNEL,
  replayFrom,
  type SignalMapStreamMessage,
  type SSEEventPayload,
} from '../../../src/server/lib/sse-replay-ring.js';

const SIGNALMAP_BRIEF_UPDATED_CHANNEL = 'signalmap:brief:updated';

function getHeartbeatSeconds(): number {
  return Number(process.env.SSE_HEARTBEAT_SECONDS ?? 20);
}

function getRetryMinMs(): number {
  return Number(process.env.SSE_RECONNECT_RETRY_MIN_MS ?? 5000);
}

function getRetryMaxMs(): number {
  return Number(process.env.SSE_RECONNECT_RETRY_MAX_MS ?? 15000);
}

interface Connection {
  res: ServerResponse;
  cleanup: () => void;
}

const connections = new Set<Connection>();

function jitteredRetryMs(): number {
  return randomInt(getRetryMinMs(), getRetryMaxMs() + 1);
}

function writeSSEEvent(res: ServerResponse, id: number, payload: SSEEventPayload): void {
  res.write(`id: ${id}\n`);
  if (payload.event) res.write(`event: ${payload.event}\n`);
  res.write(`data: ${payload.data}\n\n`);
}

export async function handleSignalMapStream(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const redis = getRedisAdapter();

  // Parse Last-Event-ID (header or ?lastEventId query)
  const headerId = req.headers['last-event-id'];
  const url = new URL(req.url ?? '/', 'http://localhost');
  const queryId = url.searchParams.get('lastEventId');
  const rawLastId = (Array.isArray(headerId) ? headerId[0] : headerId) ?? queryId;
  const lastId = rawLastId != null && rawLastId !== '' ? Number(rawLastId) : null;
  const validLastId = lastId !== null && Number.isFinite(lastId) ? lastId : null;

  // Replay — wrap in try/catch so Redis-down returns 503 (spec: store_unavailable)
  let replay: Awaited<ReturnType<typeof replayFrom>>;
  try {
    replay = await replayFrom(redis, validLastId);
  } catch (err) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'store_unavailable', message: 'Redis is unavailable' } }));
    return;
  }
  if (replay.lost) {
    res.statusCode = 204;
    res.setHeader('X-Replay-Lost', 'true');
    res.end();
    return;
  }

  // Open SSE
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

  // Send replayed events
  for (const { id, payload } of replay.events) {
    writeSSEEvent(res, id, payload);
  }

  // Subscribe to live channel — fan-out READER only; ring writes are done by the publisher
  const subscription = redis.subscribe(SIGNALMAP_EVENTS_CHANNEL, (raw) => {
    try {
      const msg: SignalMapStreamMessage = JSON.parse(raw);
      if (typeof msg.id !== 'number' || !msg.payload) {
        console.warn('[signalmap-stream] malformed pub/sub message (wrong shape), skipping');
        return;
      }
      writeSSEEvent(res, msg.id, msg.payload);
    } catch (err) {
      // Malformed message: log and continue, do not kill the connection
      console.warn('[signalmap-stream] failed to handle pub/sub message', err);
    }
  });

  const briefSubscription = redis.subscribe(SIGNALMAP_BRIEF_UPDATED_CHANNEL, () => {
    try {
      res.write(`event: brief-updated\ndata: {}\n\n`);
    } catch {
      // connection already closed; cleanup handles it
    }
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(`: hb\n\n`);
  }, getHeartbeatSeconds() * 1000);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  // Connection registry
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try { subscription.dispose(); } catch { /* ignore */ }
    try { briefSubscription.dispose(); } catch { /* ignore */ }
    connections.delete(connection);
    try { res.end(); } catch { /* already ended */ }
  };
  const connection: Connection = { res, cleanup };
  connections.add(connection);
  req.on('close', cleanup);
  req.on('error', cleanup);
}

/**
 * Broadcasts a `shutdown` SSE frame to all connected clients and cleans up
 * each connection. Safe to call from tests directly — no signal needed.
 */
export function broadcastShutdown(): void {
  for (const conn of connections) {
    try {
      const retry = jitteredRetryMs();
      conn.res.write(`event: shutdown\nretry: ${retry}\n\n`);
    } catch { /* ignore */ }
    conn.cleanup();
  }
}

let shutdownInstalled = false;
export function setupSignalMapStreamShutdown(): void {
  if (shutdownInstalled) return;
  shutdownInstalled = true;
  process.once('SIGTERM', broadcastShutdown);
  process.once('SIGINT', broadcastShutdown);
}

/** @internal Test-only accessor for connection count. */
export function _connectionCount(): number {
  return connections.size;
}

/** @internal Test-only accessor for jittered retry value generator. */
export function _jitteredRetryMs(): number {
  return jitteredRetryMs();
}
