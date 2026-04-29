/**
 * Entitlement helpers for the Vercel API gateway.
 *
 * Product-tier route access is disabled for this personal SignalMap fork. The exported
 * names stay in place for compatibility and for callers that still need to read
 * entitlement snapshots, but gateway route checks are no-op.
 */

import { getCachedJson, setCachedJson } from './redis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CachedEntitlements {
  planKey: string;
  features: {
    tier: number;
    apiAccess: boolean;
    apiRateLimit: number;
    maxDashboards: number;
    prioritySupport: boolean;
    exportFormats: string[];
  };
  validUntil: number;
}

// ---------------------------------------------------------------------------
// Product-tier route gates
// ---------------------------------------------------------------------------

/**
 * No feature RPC path requires a product tier in this fork. Administrative
 * force-key checks live on their endpoint handlers instead of this map.
 */
const CONVEX_INTERNAL_ENTITLEMENTS_PATH = '/api/internal-entitlements';
let _didWarnMissingConvexSharedSecret = false;

function getConvexSharedSecret(): string {
  const secret = process.env.CONVEX_SERVER_SHARED_SECRET ?? '';
  if (!secret && !_didWarnMissingConvexSharedSecret) {
    _didWarnMissingConvexSharedSecret = true;
    console.warn('[entitlement-check] CONVEX_SERVER_SHARED_SECRET not set; Convex fallback disabled');
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Request coalescing (P1-6: Cache stampede mitigation)
// ---------------------------------------------------------------------------

const _inFlight = new Map<string, Promise<CachedEntitlements | null>>();

// ---------------------------------------------------------------------------
// Environment-aware Redis key prefix (P2-3)
// ---------------------------------------------------------------------------

const ENV_PREFIX = process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode' ? 'live' : 'test';

// Cache TTL: 15 min — short enough that subscription expiry is reflected promptly (P2-5)
const ENTITLEMENT_CACHE_TTL_SECONDS = 900;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the minimum tier required for a given endpoint pathname.
 * Product-tier RPC gates are disabled in this personal SignalMap fork, so this is always null.
 */
export function getRequiredTier(pathname: string): number | null {
  void pathname;
  return null;
}

/**
 * Fetches entitlements for a user. Tries Redis cache first (raw key),
 * then falls back to ConvexHttpClient query on cache miss.
 *
 * Returns null on any failure. Route access no longer depends on this value.
 *
 * Uses request coalescing to prevent cache stampede: concurrent requests for
 * the same userId share a single in-flight promise.
 */
export async function getEntitlements(userId: string): Promise<CachedEntitlements | null> {
  const existing = _inFlight.get(userId);
  if (existing) return existing;

  const promise = _getEntitlementsImpl(userId);
  _inFlight.set(userId, promise);
  try {
    return await promise;
  } finally {
    _inFlight.delete(userId);
  }
}

async function _getEntitlementsImpl(userId: string): Promise<CachedEntitlements | null> {
  try {
    // Redis cache check (raw=true: entitlements use user-scoped keys, no deployment prefix)
    const cached = await getCachedJson(`entitlements:${ENV_PREFIX}:${userId}`, true);

    if (cached && typeof cached === 'object') {
      const ent = cached as CachedEntitlements;
      // Only use cached data if it hasn't expired
      if (ent.validUntil >= Date.now()) {
        return ent;
      }
      // Expired -- fall through to Convex
    }

    // Convex fallback on cache miss or expired cache
    const convexSiteUrl = process.env.CONVEX_SITE_URL;
    const convexSharedSecret = getConvexSharedSecret();
    if (!convexSiteUrl || !convexSharedSecret) return null;

    const response = await fetch(`${convexSiteUrl}${CONVEX_INTERNAL_ENTITLEMENTS_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'worldmonitor-gateway/1.0',
        'x-convex-shared-secret': convexSharedSecret,
      },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) return null;
    const result = await response.json() as CachedEntitlements | null;

    if (result) {
      // Populate Redis cache for subsequent requests (15-min TTL, raw key)
      await setCachedJson(`entitlements:${ENV_PREFIX}:${userId}`, result, ENTITLEMENT_CACHE_TTL_SECONDS, true);
      return result as CachedEntitlements;
    }

    return null;
  } catch (err) {
    // Entitlement snapshots are best-effort; route access no longer depends on them.
    console.warn('[entitlement-check] getEntitlements failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Preserves the historical gateway signature without blocking feature RPCs.
 * Product-tier route gates are disabled in this personal SignalMap fork, so this always returns null.
 */
export async function checkEntitlement(
  request: Request,
  pathname: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  void request;
  void pathname;
  void corsHeaders;
  return null;
}
