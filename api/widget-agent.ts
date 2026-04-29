/**
 * Vercel edge proxy for the widget agent.
 *
 * Auth paths:
 *   1. Clerk JWT (Authorization: Bearer <token>) validates the session, then
 *      injects real server keys and proxies to the Railway relay.
 *   2. Browser tester key (X-WorldMonitor-Key) — validated against
 *      WORLDMONITOR_VALID_KEYS so one browser-held key can unlock feature
 *      testing paths across the app.
 *   3. Legacy tester keys (X-Widget-Key / X-Pro-Key) — validated directly here
 *      so the relay's WIDGET_AGENT_KEY / PRO_WIDGET_KEY are never exposed
 *      to the browser.
 *
 * GET  → proxy to relay /widget-agent/health
 * POST → proxy SSE stream to relay /widget-agent
 */

export const config = { runtime: 'edge' };

// @ts-expect-error — JS module, no declaration file
import { getCorsHeaders } from './_cors.js';
import { validateBearerToken } from '../server/auth-session';

const RELAY_BASE = 'https://proxy.worldmonitor.app';
const WIDGET_AGENT_KEY = process.env.WIDGET_AGENT_KEY ?? '';
const PRO_WIDGET_KEY = process.env.PRO_WIDGET_KEY ?? '';
const WORLDMONITOR_VALID_KEY_SET = new Set(
  (process.env.WORLDMONITOR_VALID_KEYS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);

function hasValidWorldMonitorKey(key: string): boolean {
  return Boolean(key) && WORLDMONITOR_VALID_KEY_SET.has(key);
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req) as Record<string, string>;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WorldMonitor-Key, X-Api-Key, X-Widget-Key, X-Pro-Key',
      },
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  let authenticated = false;

  const worldMonitorKey =
    req.headers.get('X-WorldMonitor-Key') ??
    req.headers.get('X-Api-Key') ??
    '';
  if (hasValidWorldMonitorKey(worldMonitorKey)) {
    authenticated = true;
  } else {
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const session = await validateBearerToken(authHeader.slice(7));
      if (!session.valid) {
        return json({ error: 'Invalid or expired session' }, 401, corsHeaders);
      }
      authenticated = true;
    } else {
      // Legacy relay-key path. These are explicit provider secrets.
      const widgetKey = req.headers.get('X-Widget-Key') ?? '';
      const proKey = req.headers.get('X-Pro-Key') ?? '';
      const hasWidgetKey = Boolean(WIDGET_AGENT_KEY && widgetKey === WIDGET_AGENT_KEY);
      const hasProKey = Boolean(PRO_WIDGET_KEY && proKey === PRO_WIDGET_KEY);
      if (!hasWidgetKey && !hasProKey) {
        return json({ error: 'Forbidden' }, 403, corsHeaders);
      }
      authenticated = true;
    }
  }

  if (!authenticated) {
    return json({ error: 'Forbidden' }, 403, corsHeaders);
  }

  // Mirror the relay P2 fix: allow PRO-only deployments (no basic key, but PRO key present)
  if (!WIDGET_AGENT_KEY && !PRO_WIDGET_KEY) {
    return json({ error: 'Widget agent unavailable', ok: false, widgetKeyConfigured: false }, 503, corsHeaders);
  }

  // ── Build relay headers (server-side keys, never exposed to browser) ──────
  const buildRelayHeaders = (tier: 'basic' | 'pro'): Record<string, string> => ({
    'Content-Type': 'application/json',
    'User-Agent': 'worldmonitor-widget-edge/1.0',
    ...(WIDGET_AGENT_KEY ? { 'X-Widget-Key': WIDGET_AGENT_KEY } : {}),
    ...(tier === 'pro' && PRO_WIDGET_KEY ? { 'X-Pro-Key': PRO_WIDGET_KEY } : {}),
    ...(!WIDGET_AGENT_KEY && PRO_WIDGET_KEY ? { 'X-Pro-Key': PRO_WIDGET_KEY } : {}),
  });

  // ── Health check (GET) ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const healthRes = await fetch(`${RELAY_BASE}/widget-agent/health`, {
      method: 'GET',
      headers: buildRelayHeaders(PRO_WIDGET_KEY && !WIDGET_AGENT_KEY ? 'pro' : 'basic'),
    });
    const body = await healthRes.text();
    return new Response(body, {
      status: healthRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  // ── Agent call (POST, SSE stream) ─────────────────────────────────────────
  let rawBody = await req.text();

  // Keep model selection constrained to the relay's two known tiers.
  let requestedTier: 'basic' | 'pro' = WIDGET_AGENT_KEY ? 'basic' : 'pro';
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    if (parsed.tier !== undefined && parsed.tier !== 'basic' && parsed.tier !== 'pro') {
      return json({ error: 'Invalid tier value' }, 400, corsHeaders);
    }
    requestedTier = parsed.tier === 'pro' ? 'pro' : requestedTier;
    if (parsed.tier !== requestedTier) {
      rawBody = JSON.stringify({ ...parsed, tier: requestedTier });
    }
  } catch { /* malformed body — relay will return 400 */ }

  if (requestedTier === 'pro' && !PRO_WIDGET_KEY) {
    return json({ error: 'PRO widget agent unavailable', ok: false, proKeyConfigured: false }, 503, corsHeaders);
  }

  const relayRes = await fetch(`${RELAY_BASE}/widget-agent`, {
    method: 'POST',
    headers: buildRelayHeaders(requestedTier),
    body: rawBody,
  });

  return new Response(relayRes.body, {
    status: relayRes.status,
    headers: {
      'Content-Type': relayRes.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
      ...corsHeaders,
    },
  });
}
