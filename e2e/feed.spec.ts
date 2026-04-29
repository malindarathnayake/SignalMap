import { expect, test } from '@playwright/test';

test.describe('SignalMap LiveFeed (unit 4d)', () => {
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

  test('renders feed with all 8 seeded events when all categories active', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-feed')).toBeVisible();
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('8');
  });

  test('event titles appear in feed cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-feed-card-title-rdr-iq-01'))
      .toContainText('Regional internet disruption reported in southern Iraq');
    await expect(page.getByTestId('signalmap-feed-card-title-prv-cf-01'))
      .toContainText('Cloudflare Status reports degraded Workers performance');
  });

  test('deactivating internet category removes its events from feed', async ({ page }) => {
    await page.goto('/');
    // 4 internet events in seed; with internet on => 8, with internet off => 4
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('8');
    await page.getByTestId('signalmap-rail-category-internet').click();
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('4');
    // None of the rdr-* IDs should be visible
    await expect(page.getByTestId('signalmap-feed-card-rdr-iq-01')).toHaveCount(0);
  });

  test('feed cards are sorted by startedAt descending (most recent first)', async ({ page }) => {
    await page.goto('/');
    // rdr-uk-01 (36 min ago) should appear before rdr-sd-01 (1380 min ago)
    const ids = await page.getByTestId(/signalmap-feed-card-/).evaluateAll(els =>
      els.map(el => (el as HTMLElement).dataset.testid)
    );
    const ukIdx = ids.findIndex(t => t === 'signalmap-feed-card-rdr-uk-01');
    const sdIdx = ids.findIndex(t => t === 'signalmap-feed-card-rdr-sd-01');
    expect(ukIdx).toBeGreaterThanOrEqual(0);
    expect(sdIdx).toBeGreaterThanOrEqual(0);
    expect(ukIdx).toBeLessThan(sdIdx);
  });
});
