import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRedisAdapter } from '../../../src/server/lib/redis.js';
import { getSignalMapSourceHealth } from './signalmap-source-health-core.ts';

// ---------------------------------------------------------------------------
// Core logic (injectable for testing)
// ---------------------------------------------------------------------------

export const getSourceHealth = getSignalMapSourceHealth;

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

interface CollectorProgressSource {
  name: string;
  fetched: number;
  processed: number;
  accepted: number;
  rejected: number;
}

interface CollectorProgress {
  stage: string;
  currentSource: string;
  articlesProcessed: number;
  articlesTotal: number;
  articlesAccepted: number;
  updatedAt: string;
  sources?: CollectorProgressSource[];
}

export async function handleSignalMapSourceHealth(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let redis;
  try {
    redis = getRedisAdapter();
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'store_unavailable', message: 'Redis is unavailable' } }));
    return;
  }

  const now = Date.now();
  const sourceHealth = await getSourceHealth(redis, now);

  // Live-progress blob written by the news collector during the tick.
  // Surfaced when the blob is fresh (<60s) AND the stage isn't 'done' /
  // 'idle' — UI renders an "ingesting" indicator so users get feedback
  // during the 3-7 minute news pass instead of staring at stale counts.
  let progress: CollectorProgress | null = null;
  try {
    const raw = await redis.getJson<CollectorProgress>('signalmap:collector:progress:v1');
    if (raw && typeof raw === 'object') {
      const updatedAtMs = Date.parse(String(raw.updatedAt ?? ''));
      const ageMs = Number.isFinite(updatedAtMs) ? now - updatedAtMs : Infinity;
      const isFresh = ageMs < 60_000;
      const isActive = raw.stage !== 'done' && raw.stage !== 'idle';
      if (isFresh && isActive) {
        progress = raw;
      }
    }
  } catch {
    // tolerate; progress is informational, never fail the response
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ sourceHealth, progress, fetchedAt: now }));
}
