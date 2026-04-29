/**
 * Product-tier feature unlocking is disabled for this personal SignalMap fork.
 *
 * Keep the exported helper so existing handlers compile, but do not validate
 * Dodo, Clerk, or API-key tier state here. Endpoint-local administrative
 * checks, rate limits, CORS, and explicit force-key validations remain in the
 * handlers/gateway that own those protections.
 */
export async function isCallerPremium(_request: Request): Promise<boolean> {
  return true;
}
