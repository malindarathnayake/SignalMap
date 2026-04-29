import type { AuthSession } from './auth-state';

export enum PanelGateReason {
  NONE = 'none',
  ANONYMOUS = 'anonymous',
  FREE_TIER = 'free_tier',
}

/**
 * Product-tier panel gating is disabled for the public SignalMap frontend.
 * Keep this export for existing callers while treating every user as allowed
 * to render panels; unavailable sources should surface as data errors instead.
 */
export function hasPremiumAccess(_authState?: AuthSession): boolean {
  return true;
}

/**
 * Panel product gates now resolve to public/no-gate.
 */
export function getPanelGateReason(
  _authState: AuthSession,
  _isPremium: boolean,
): PanelGateReason {
  return PanelGateReason.NONE;
}
