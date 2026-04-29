import { expect, test } from '@playwright/test';

test.describe('SignalMap Inspector + BriefStrip placeholders (unit 4d)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('signalmap-filters-categories');
      localStorage.removeItem('signalmap-filters-query');
      localStorage.removeItem('signalmap-filters-timerange');
      localStorage.removeItem('signalmap-watchlist-providers');
      localStorage.removeItem('signalmap-watchlist-regions');
      localStorage.removeItem('signalmap-watchlist-map-controls');
    });
  });

  test('Inspector shows empty state on initial load', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-inspector')).toBeVisible();
    await expect(page.getByTestId('signalmap-inspector-empty')).toBeVisible();
    await expect(page.getByTestId('signalmap-inspector-empty')).toContainText('Select a signal');
    await expect(page.getByTestId('signalmap-inspector-title')).toHaveCount(0);
  });

  test('clicking a feed card opens inspector with that event detail', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('signalmap-feed-card-prv-cf-01').click();
    await expect(page.getByTestId('signalmap-inspector-title'))
      .toContainText('Cloudflare Status reports degraded Workers performance');
    await expect(page.getByTestId('signalmap-inspector-severity')).toContainText('MAJOR');
    await expect(page.getByTestId('signalmap-inspector-location')).toContainText('Global (multi-colo)');
    // Empty state is gone
    await expect(page.getByTestId('signalmap-inspector-empty')).toHaveCount(0);
  });

  test('clicking close button returns inspector to empty state', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('signalmap-feed-card-prv-cf-01').click();
    await expect(page.getByTestId('signalmap-inspector-title')).toBeVisible();
    await page.getByTestId('signalmap-inspector-close').click();
    await expect(page.getByTestId('signalmap-inspector-empty')).toBeVisible();
  });

  test('WhyItMattersTab Generate button is visible and clickable (no-op)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('signalmap-feed-card-rdr-iq-01').click();
    const btn = page.getByTestId('signalmap-inspector-why-button');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Generate');
    await btn.click(); // should not throw, no network request made
  });

  test('BriefStrip shows Loading placeholder', async ({ page }) => {
    // Phase 6e wired BriefStrip to actually fetch the brief on mount; the
    // loading state is only visible during the request. Intercept and delay
    // the response so the assertion has time to observe it.
    await page.route('**/api/signalmap/brief/global', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByTestId('signalmap-brief-strip')).toBeVisible();
    await expect(page.getByTestId('signalmap-brief-strip-loading')).toContainText('Loading');
  });
});
