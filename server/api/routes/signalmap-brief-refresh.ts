import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { BriefResult } from '../../../src/server/lib/brief-pipeline.js';

async function defaultRunOnce(): Promise<BriefResult> {
  // @ts-expect-error — brief-cron.mjs has no declaration file; resolved at runtime via tsx loader
  const { runOnce } = await import('../../../scripts/brief-cron.mjs');
  return runOnce() as Promise<BriefResult>;
}

let runOnce: () => Promise<BriefResult> = defaultRunOnce;

export function setRunOnce(fn: () => Promise<BriefResult>): void {
  runOnce = fn;
}

export async function handleSignalMapBriefRefresh(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const adminToken = process.env.SIGNALMAP_ADMIN_TOKEN;

  if (!adminToken) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'admin_token_not_configured' } }));
    return;
  }

  const rawHeader = req.headers['x-signalmap-admin-token'];
  const provided = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (!provided) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'unauthorized' } }));
    return;
  }

  const expected = Buffer.from(adminToken, 'utf8');
  const actual = Buffer.from(provided, 'utf8');

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'unauthorized' } }));
    return;
  }

  let brief: BriefResult;
  try {
    brief = await runOnce();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'refresh_failed', message } }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(brief));
}
