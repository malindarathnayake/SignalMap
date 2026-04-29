import { expect, test } from '@playwright/test';

test.describe('SignalMap status strips (unit 4b)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Default watchlist providers exercised by tests; override per test as needed.
      localStorage.removeItem('signalmap-watchlist-providers');
      localStorage.removeItem('signalmap-filters-query');
      localStorage.removeItem('signalmap-filters-timerange');
      localStorage.removeItem('signalmap-filters-categories');
    });
  });

  test('renders both strips with seeded counts', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-radar-strip')).toBeVisible();
    await expect(page.getByTestId('signalmap-provider-strip')).toBeVisible();
    await expect(page.getByTestId('radar-strip-outages')).toHaveText('2');
    await expect(page.getByTestId('radar-strip-anomalies')).toHaveText('2');
  });

  test('ProviderStrip splits watched vs global by watchlist.providers', async ({ page }) => {
    // Default watchlist persists ['cloudflare', 'm365'] on first hydrate
    await page.goto('/');
    // 4 provider events seeded (cloudflare, okta, azure, m365). cf+m365 in watchlist => 2 watched, 2 global.
    await expect(page.getByTestId('provider-strip-watched')).toHaveText('2');
    await expect(page.getByTestId('provider-strip-global')).toHaveText('2');
  });

  test('ProviderStrip recomputes when watchlist localStorage is pre-populated', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('signalmap-watchlist-providers', JSON.stringify(['cloudflare']));
    });
    await page.goto('/');
    // Only cloudflare is watched => 1 watched, 3 global (okta, azure, m365)
    await expect(page.getByTestId('provider-strip-watched')).toHaveText('1');
    await expect(page.getByTestId('provider-strip-global')).toHaveText('3');
  });
});
