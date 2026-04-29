import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRedisAdapter } from '../../../src/server/lib/redis.js';
import type { BriefResult } from '../../../src/server/lib/brief-pipeline.js';
import { emitMetric, METRICS } from '../../../src/server/lib/metrics.js';

const GLOBAL_BRIEF_KEY = 'signalmap:brief:global';

export async function handleSignalMapBriefGlobal(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  emitMetric(METRICS.BRIEF_CALLS, 1, { flavor: 'global' });
  const redis = getRedisAdapter();
  let brief: BriefResult | null;
  try {
    brief = await redis.getJson<BriefResult>(GLOBAL_BRIEF_KEY);
  } catch (err) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'store_unavailable', message: 'Redis is unavailable' } }));
    return;
  }
  if (!brief) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Cache', 'MISS');
    res.end(JSON.stringify({ bullets: [], sources: [], generatedAt: null, model: null, warnings: ['no_brief_yet'], degraded: true }));
    return;
  }
  emitMetric(METRICS.BRIEF_CACHE_HITS, 1, { flavor: 'global' });
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Cache', 'HIT');
  res.end(JSON.stringify(brief));
}
