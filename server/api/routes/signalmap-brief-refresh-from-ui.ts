import type { IncomingMessage, ServerResponse } from 'node:http';
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

function isSameOrigin(req: IncomingMessage): boolean {
  const rawHost = req.headers.host;
  if (!rawHost) return false;
  // RFC 7230 §5.4: Host is case-insensitive. URL.host normalizes to lowercase
  // but req.headers.host is passed through verbatim, so we lowercase both sides.
  const host = rawHost.toLowerCase();
  // Origin is the canonical signal; fall back to Referer if Origin missing (some browsers omit on same-origin POSTs).
  const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) ?? '';
  if (origin) {
    try {
      const u = new URL(origin);
      return u.host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  const referer = (Array.isArray(req.headers.referer) ? req.headers.referer[0] : req.headers.referer) ?? '';
  if (referer) {
    try {
      const u = new URL(referer);
      return u.host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  // No Origin and no Referer — most likely a cross-origin attacker stripped them, or a non-browser client.
  return false;
}

export function isRefreshFromUiEnabled(): boolean {
  return process.env.SIGNALMAP_REFRESH_FROM_UI_ENABLED === '1' && Boolean(process.env.SIGNALMAP_ADMIN_TOKEN);
}

export async function handleSignalMapBriefRefreshFromUi(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (process.env.SIGNALMAP_REFRESH_FROM_UI_ENABLED !== '1') {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'refresh_from_ui_disabled' } }));
    return;
  }

  if (!process.env.SIGNALMAP_ADMIN_TOKEN) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'admin_token_not_configured' } }));
    return;
  }

  if (!isSameOrigin(req)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'cross_origin_forbidden' } }));
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

export function handleSignalMapBriefRefreshConfig(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.end(JSON.stringify({ enabled: isRefreshFromUiEnabled() }));
}
