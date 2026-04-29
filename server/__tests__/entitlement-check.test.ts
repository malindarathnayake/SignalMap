// @vitest-environment node

/**
 * Unit tests for gateway entitlement compatibility helpers.
 *
 * Product-tier route checks are disabled for this fork, but entitlement
 * snapshots remain readable for UI/status endpoints.
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("../_shared/redis", () => ({
  getCachedJson: vi.fn().mockResolvedValue(null),
  setCachedJson: vi.fn().mockResolvedValue(undefined),
}));

import { getCachedJson } from "../_shared/redis";
import {
  getRequiredTier,
  checkEntitlement,
  getEntitlements,
} from "../_shared/entitlement-check";

const FUTURE = Date.now() + 86400000 * 30;

function makeRequest(
  pathname: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://worldmonitor.app${pathname}`, { headers });
}

function makeEntitlements(tier: number, planKey = "free") {
  return {
    planKey,
    features: {
      tier,
      apiAccess: tier >= 2,
      apiRateLimit: tier >= 2 ? 60 : 0,
      maxDashboards: tier >= 1 ? 10 : 3,
      prioritySupport: tier >= 2,
      exportFormats: tier >= 2 ? ["csv", "pdf", "json"] : ["csv"],
    },
    validUntil: FUTURE,
  };
}

describe("gateway entitlement check", () => {
  test("getRequiredTier returns null for former gated endpoints", () => {
    expect(getRequiredTier("/api/market/v1/analyze-stock")).toBeNull();
  });

  test("checkEntitlement returns null for former gated endpoints without userId", async () => {
    const req = makeRequest("/api/market/v1/analyze-stock");
    const result = await checkEntitlement(req, "/api/market/v1/analyze-stock", {});
    expect(result).toBeNull();
  });

  test("checkEntitlement does not consult cached entitlements for route access", async () => {
    vi.mocked(getCachedJson).mockResolvedValueOnce(null);

    const req = makeRequest("/api/market/v1/analyze-stock", { "x-user-id": "test-user" });
    const result = await checkEntitlement(req, "/api/market/v1/analyze-stock", {});

    expect(result).toBeNull();
    expect(getCachedJson).not.toHaveBeenCalled();
  });

  test("getEntitlements still uses CONVEX_SITE_URL for HTTP fallback", async () => {
    vi.mocked(getCachedJson).mockResolvedValueOnce(null);

    const originalSiteUrl = process.env.CONVEX_SITE_URL;
    const originalSecret = process.env.CONVEX_SERVER_SHARED_SECRET;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeEntitlements(2, "api_starter")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    process.env.CONVEX_SITE_URL = "https://example-deployment.convex.site";
    process.env.CONVEX_SERVER_SHARED_SECRET = "test-secret";
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await getEntitlements("test-user");
      expect(result?.features.tier).toBe(2);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://example-deployment.convex.site/api/internal-entitlements",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-convex-shared-secret": "test-secret",
          }),
        }),
      );
    } finally {
      if (originalSiteUrl === undefined) {
        delete process.env.CONVEX_SITE_URL;
      } else {
        process.env.CONVEX_SITE_URL = originalSiteUrl;
      }
      if (originalSecret === undefined) {
        delete process.env.CONVEX_SERVER_SHARED_SECRET;
      } else {
        process.env.CONVEX_SERVER_SHARED_SECRET = originalSecret;
      }
      vi.unstubAllGlobals();
    }
  });
});
