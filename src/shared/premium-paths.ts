/**
 * Product-tier RPC gates are disabled for this personal SignalMap fork.
 *
 * This compatibility set intentionally stays empty so generated clients and
 * same-origin browser calls run through the normal gateway path. Endpoint-local
 * protections for upstream/admin operations, including shipping webhook
 * force-key validation, live at their endpoint handlers.
 */
export const PREMIUM_RPC_PATHS = new Set<string>();
