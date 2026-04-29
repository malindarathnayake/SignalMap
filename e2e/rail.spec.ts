import { expect, test } from '@playwright/test';

test.describe('SignalMap LeftRail (unit 4c)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('signalmap-filters-categories');
      localStorage.removeItem('signalmap-filters-query');
      localStorage.removeItem('signalmap-filters-timerange');
      localStorage.removeItem('signalmap-watchlist-regions');
      localStorage.removeItem('signalmap-watchlist-providers');
      localStorage.removeItem('signalmap-watchlist-map-controls');
    });
  });

  test('renders all four rail sections', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-rail')).toBeVisible();
    await expect(page.getByTestId('signalmap-rail-categories')).toBeVisible();
    await expect(page.getByTestId('signalmap-rail-regions')).toBeVisible();
    await expect(page.getByTestId('signalmap-rail-providers')).toBeVisible();
    await expect(page.getByTestId('signalmap-rail-map-controls')).toBeVisible();
  });

  test('CategoryToggle reflects filters.categories default (all 12 active) and toggles individual categories', async ({ page }) => {
    await page.goto('/');
    // All 12 categories are active by default (from filters.ts default)
    await expect(page.getByTestId('signalmap-rail-category-internet')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('signalmap-rail-category-cyber')).toHaveAttribute('aria-pressed', 'true');
    // Toggle off internet
    await page.getByTestId('signalmap-rail-category-internet').click();
    await expect(page.getByTestId('signalmap-rail-category-internet')).toHaveAttribute('aria-pressed', 'false');
    const stored = await page.evaluate(() => localStorage.getItem('signalmap-filters-categories'));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).not.toContain('internet');
  });

  test('All/None toggle empties then restores all categories', async ({ page }) => {
    await page.goto('/');
    // Default: all 12 active => button reads "None"
    const toggle = page.getByTestId('signalmap-rail-categories-toggle-all');
    await expect(toggle).toHaveText('None');
    await toggle.click();
    await expect(toggle).toHaveText('All');
    // No category should be aria-pressed=true now
    await expect(page.getByTestId('signalmap-rail-category-internet')).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveText('None');
    await expect(page.getByTestId('signalmap-rail-category-internet')).toHaveAttribute('aria-pressed', 'true');
  });

  test('RegionPicker writes to watchlist.regions and persists', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-rail-regions-count')).toHaveText('0');
    await page.getByTestId('signalmap-rail-region-eu').click();
    await page.getByTestId('signalmap-rail-region-mena').click();
    await expect(page.getByTestId('signalmap-rail-regions-count')).toHaveText('2');
    const stored = await page.evaluate(() => localStorage.getItem('signalmap-watchlist-regions'));
    expect(JSON.parse(stored!)).toEqual(['eu', 'mena']);
  });

  test('ProviderPicker click recomputes ProviderStrip watched/global counts', async ({ page }) => {
    await page.goto('/');
    // Default watchlist: ['cloudflare', 'm365'] (4b default) => 2 watched, 2 global
    await expect(page.getByTestId('provider-strip-watched')).toHaveText('2');
    await expect(page.getByTestId('provider-strip-global')).toHaveText('2');
    // Add Azure to the watchlist
    await page.getByTestId('signalmap-rail-provider-azure').click();
    await expect(page.getByTestId('provider-strip-watched')).toHaveText('3');
    await expect(page.getByTestId('provider-strip-global')).toHaveText('1');
  });

  test('MapControls confidence slider updates display + persists', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-rail-confidence-value')).toHaveText('50%');
    await page.getByTestId('signalmap-rail-confidence').fill('0.8');
    await expect(page.getByTestId('signalmap-rail-confidence-value')).toHaveText('80%');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('signalmap-watchlist-map-controls')!));
    expect(stored.minConfidence).toBeCloseTo(0.8, 5);
  });

  test('MapControls cables/datacenters segments + cluster toggle persist', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('signalmap-rail-cables-all').click();
    await page.getByTestId('signalmap-rail-datacenters-main').click();
    await page.getByTestId('signalmap-rail-cluster').uncheck();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('signalmap-watchlist-map-controls')!));
    expect(stored.showCables).toBe('all');
    expect(stored.showDatacenters).toBe('main');
    expect(stored.cluster).toBe(false);
  });
});
