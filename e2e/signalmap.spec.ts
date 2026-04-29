import { expect, test } from '@playwright/test';

test.describe('SignalMap Phase 4 acceptance (unit 4e gate)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Reset all v2 SignalMap localStorage keys for deterministic state.
      [
        'signalmap-filters-query',
        'signalmap-filters-timerange',
        'signalmap-filters-categories',
        'signalmap-watchlist-providers',
        'signalmap-watchlist-regions',
        'signalmap-watchlist-map-controls',
      ].forEach((k) => localStorage.removeItem(k));
    });
  });

  test('fixture endpoint /api/signalmap/list serves deterministic JSON', async ({ request }) => {
    const res = await request.get('/api/signalmap/list');
    expect(res.status()).toBe(200);
    const body = await res.json() as { events: Array<{ id: string }> };
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBe(8);
    const ids = body.events.map((e) => e.id);
    expect(ids).toContain('rdr-iq-01');
    expect(ids).toContain('prv-cf-01');
  });

  test('fixture endpoint /api/signalmap/source-health serves deterministic JSON', async ({ request }) => {
    const res = await request.get('/api/signalmap/source-health');
    expect(res.status()).toBe(200);
    const body = await res.json() as { sources: Array<{ id: string }> };
    expect(body.sources.length).toBe(7);
    expect(body.sources.map((s) => s.id)).toContain('radar');
  });

  test('fixture endpoint /api/bootstrap serves deterministic JSON', async ({ request }) => {
    const res = await request.get('/api/bootstrap');
    expect(res.status()).toBe(200);
    const body = await res.json() as { filters: { timeRange: string; categories: string[] }; signalCount24h: number };
    expect(body.filters.timeRange).toBe('24h');
    expect(body.signalCount24h).toBe(8);
  });

  test('shell mounts: every top-level region renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-cmdbar')).toBeVisible();
    await expect(page.getByTestId('signalmap-radar-strip')).toBeVisible();
    await expect(page.getByTestId('signalmap-provider-strip')).toBeVisible();
    await expect(page.getByTestId('signalmap-brief-strip')).toBeVisible();
    await expect(page.getByTestId('signalmap-rail')).toBeVisible();
    await expect(page.getByTestId('signalmap-feed')).toBeVisible();
    await expect(page.getByTestId('signalmap-inspector')).toBeVisible();
  });

  test('signals load: feed shows fixture events end-to-end', async ({ page }) => {
    await page.goto('/');
    // Initial seed = fixture contents = 8 events. After main.tsx hydrate fetch resolves, still 8.
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('8');
    await expect(page.getByTestId('signalmap-feed-card-title-rdr-iq-01'))
      .toContainText('Regional internet disruption reported in southern Iraq');
    await expect(page.getByTestId('signalmap-feed-card-title-prv-cf-01'))
      .toContainText('Cloudflare Status reports degraded Workers performance');
  });

  test('filters reactive: deactivating a category drops its events from the feed', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('8');
    await page.getByTestId('signalmap-rail-category-internet').click();
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('4');
    await page.getByTestId('signalmap-rail-category-provider').click();
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('0');
    await expect(page.getByTestId('signalmap-feed-empty')).toBeVisible();
  });

  test('inspector opens: clicking a feed row shows event detail', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-inspector-empty')).toBeVisible();
    await page.getByTestId('signalmap-feed-card-prv-cf-01').click();
    await expect(page.getByTestId('signalmap-inspector-title'))
      .toContainText('Cloudflare Status reports degraded Workers performance');
    await expect(page.getByTestId('signalmap-inspector-severity')).toContainText('MAJOR');
    // Closing returns to empty
    await page.getByTestId('signalmap-inspector-close').click();
    await expect(page.getByTestId('signalmap-inspector-empty')).toBeVisible();
  });

  test('rail watchlist mutation flows through to ProviderStrip counts', async ({ page }) => {
    await page.goto('/');
    // Default watchlist (cloudflare + m365) => 2 watched, 2 global
    await expect(page.getByTestId('provider-strip-watched')).toHaveText('2');
    await expect(page.getByTestId('provider-strip-global')).toHaveText('2');
    // Adding okta + azure makes all 4 watched
    await page.getByTestId('signalmap-rail-provider-okta').click();
    await page.getByTestId('signalmap-rail-provider-azure').click();
    await expect(page.getByTestId('provider-strip-watched')).toHaveText('4');
    await expect(page.getByTestId('provider-strip-global')).toHaveText('0');
  });

  test('signals load: feed reflects /api/signalmap/list payload, not just the static seed (proves fetch wiring is alive)', async ({ page }) => {
    // Override the vite fixture middleware with a test-specific payload BEFORE navigation.
    // If main.tsx fetch is broken or the fixture middleware is removed, this test fails
    // because feed-count would stay at 8 (the static seed value), not 2 (the override).
    await page.route('**/api/signalmap/list', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            {
              id: 'test-override-1',
              category: 'cyber',
              severity: 'critical',
              title: 'Test-override event A',
              startedAt: Date.now() - 60_000,
              locations: [{ name: 'Test region A' }],
            },
            {
              id: 'test-override-2',
              category: 'finance',
              severity: 'major',
              title: 'Test-override event B',
              startedAt: Date.now() - 120_000,
              locations: [{ name: 'Test region B' }],
            },
          ],
        }),
      });
    });
    await page.goto('/');
    // After main.tsx hydrate resolves, the seeded 8-event Map is replaced with the 2-event override.
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('2');
    await expect(page.getByTestId('signalmap-feed-card-title-test-override-1')).toContainText('Test-override event A');
    await expect(page.getByTestId('signalmap-feed-card-title-test-override-2')).toContainText('Test-override event B');
    // The original seed events should NOT be in the feed after override.
    await expect(page.getByTestId('signalmap-feed-card-prv-cf-01')).toHaveCount(0);
    await expect(page.getByTestId('signalmap-feed-card-rdr-iq-01')).toHaveCount(0);
  });
});
