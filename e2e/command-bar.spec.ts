import { expect, test } from '@playwright/test';

test.describe('SignalMap CommandBar (unit 4a)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('signalmap-filters-query');
      localStorage.removeItem('signalmap-filters-timerange');
      localStorage.removeItem('signalmap-filters-categories');
    });
  });

  test('renders brand, search, time range buttons, and source pill', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-cmdbar')).toBeVisible();
    await expect(page.getByTestId('signalmap-search')).toBeVisible();
    await expect(page.getByTestId('signalmap-time-range')).toBeVisible();
    for (const r of ['1h', '6h', '24h', '7d']) {
      await expect(page.getByTestId(`signalmap-time-range-${r}`)).toBeVisible();
    }
    await expect(page.getByTestId('signalmap-source-pill')).toBeVisible();
  });

  test('time range buttons toggle and persist to localStorage', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-time-range-24h')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('signalmap-time-range-6h').click();
    await expect(page.getByTestId('signalmap-time-range-6h')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('signalmap-time-range-24h')).toHaveAttribute('aria-pressed', 'false');
    const stored = await page.evaluate(() => localStorage.getItem('signalmap-filters-timerange'));
    expect(stored).toBe(JSON.stringify('6h'));
  });

  test('search input updates the query signal and persists', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('signalmap-search').fill('cloudflare');
    await expect.poll(async () =>
      page.evaluate(() => localStorage.getItem('signalmap-filters-query'))
    ).toBe(JSON.stringify('cloudflare'));
  });

  test('source pill opens popover listing each source with a status indicator', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('signalmap-source-pill').click();
    const pop = page.getByTestId('signalmap-source-popover');
    await expect(pop).toBeVisible();
    await expect(pop.getByTestId('signalmap-source-row')).toHaveCount(7);
    await expect(pop).toContainText('Cloudflare Radar');
    await expect(pop).toContainText('Microsoft Service Health');
  });
});
