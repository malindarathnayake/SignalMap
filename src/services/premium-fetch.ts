/**
 * Compatibility wrapper for older callers.
 *
 * Product-tier RPC gates are disabled in this fork, so this wrapper must stay
 * a transparent fetch pass-through. It intentionally does not inject Clerk
 * tokens, API keys, tester keys, or retry with alternate credentials.
 */
import * as Sentry from '@sentry/browser';

export function _setTestProviders(
  _p: {
    getTesterKey?: () => string;
    getTesterKeys?: () => string[];
    getClerkToken?: () => Promise<string | null>;
  } | null,
): void {
  // Compatibility no-op for tests and stale imports.
}

function reportServerError(res: Response, input: RequestInfo | URL): void {
  if (res.status < 500) return;
  try {
    const href = input instanceof Request ? input.url : String(input);
    const path = new URL(href, globalThis.location?.href ?? 'https://worldmonitor.app').pathname;
    Sentry.captureMessage(`API ${res.status}: ${path}`, {
      level: 'error',
      tags: { kind: 'api_5xx' },
      extra: { path, status: res.status },
    });
  } catch { /* ignore URL parse errors */ }
}

export async function premiumFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await globalThis.fetch(input, init);
  reportServerError(res, input);
  return res;
}
