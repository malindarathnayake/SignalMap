import { expect, test } from '@playwright/test';

// Tablet viewport for touch tap; matches Playwright's iPad-ish profile.
test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

const POLL = { timeout: 15000 };

async function waitForMap(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByTestId('signalmap-worldmap')).toBeVisible();
  await expect.poll(
    async () => page.locator('[data-testid="signalmap-worldmap-base"] > path').count(),
    POLL,
  ).toBeGreaterThan(100);
  // markers should also have rendered for fixture events with lon/lat
  await expect.poll(
    async () => page.locator('[data-testid="signalmap-worldmap-markers"] > g').count(),
    POLL,
  ).toBeGreaterThanOrEqual(8);
}

test.describe('SignalMap Phase 5c — markers, halos, overlays (5c gate)', () => {
  test('all 8 fixture events render as marker groups', async ({ page }) => {
    await waitForMap(page);
    await expect(page.getByTestId('signalmap-map-marker-rdr-iq-01')).toBeAttached();
    await expect(page.getByTestId('signalmap-map-marker-prv-cf-01')).toBeAttached();
  });

  test('each marker has a 44x44 transparent hit rect as its last child', async ({ page }) => {
    await waitForMap(page);
    const hit = page.getByTestId('signalmap-map-marker-hit-rdr-uk-01');
    await expect(hit).toBeAttached();
    const dims = await hit.evaluate((el) => ({
      w: Number(el.getAttribute('width')),
      h: Number(el.getAttribute('height')),
      fill: (el as SVGRectElement).getAttribute('fill'),
      pe: (el as SVGRectElement).getAttribute('pointerEvents') ?? (el as SVGRectElement).getAttribute('pointer-events'),
    }));
    expect(dims.w).toBe(44);
    expect(dims.h).toBe(44);
    expect(dims.fill).toBe('transparent');
    expect(dims.pe).toBe('all');
  });

  test('marker categories surface on the marker group as data attributes', async ({ page }) => {
    await waitForMap(page);
    const internet = page.getByTestId('signalmap-map-marker-rdr-iq-01');
    await expect(internet).toHaveAttribute('data-category', 'internet');
    await expect(internet).toHaveAttribute('data-severity', 'critical');
    const provider = page.getByTestId('signalmap-map-marker-prv-cf-01');
    await expect(provider).toHaveAttribute('data-category', 'provider');
  });

  test('tapping a marker (44px hit area) opens the inspector', async ({ page }) => {
    await waitForMap(page);
    // Inspector starts in empty state
    await expect(page.getByTestId('signalmap-inspector-empty')).toBeVisible();
    await page.getByTestId('signalmap-map-marker-hit-rdr-pk-01').tap();
    await expect(page.getByTestId('signalmap-inspector-title')).toBeVisible();
    await expect(page.getByTestId('signalmap-inspector-title')).toContainText('Pakistan');
  });

  test('selection ring shows on the chosen marker', async ({ page }) => {
    await waitForMap(page);
    await page.getByTestId('signalmap-map-marker-hit-rdr-iq-01').tap();
    const sel = page.locator('[data-testid="signalmap-map-marker-rdr-iq-01"] [data-testid="signalmap-map-marker-selected"]');
    await expect(sel).toBeAttached();
  });

  test('corner overlays render in all four positions with active count', async ({ page }) => {
    await waitForMap(page);
    await expect(page.getByTestId('signalmap-map-corner-tl')).toBeVisible();
    await expect(page.getByTestId('signalmap-map-corner-tr')).toBeVisible();
    await expect(page.getByTestId('signalmap-map-corner-bl')).toBeVisible();
    await expect(page.getByTestId('signalmap-map-corner-br')).toBeVisible();
    await expect(page.getByTestId('signalmap-map-active-count')).toHaveText(/8\s+signals/);
    await expect(page.getByTestId('signalmap-map-live')).toBeVisible();
  });

  test('toggling a region in the rail renders a watchlist halo with stroke', async ({ page }) => {
    await waitForMap(page);
    // EU is in the standard region list
    await page.getByTestId('signalmap-rail-region-eu').click();
    const halo = page.getByTestId('signalmap-worldmap-halo-eu');
    await expect(halo).toBeAttached();
    await expect(halo).toHaveAttribute('stroke', 'var(--watchlist)');
  });
});
