import { expect, test } from '@playwright/test';

test.describe('SignalMap Phase 5a — Map skeleton (5a gate)', () => {
  test('topojson asset served at /topojson/world-110m.json with Topology shape', async ({ request }) => {
    const res = await request.get('/topojson/world-110m.json');
    expect(res.status()).toBe(200);
    const body = await res.json() as { type: string; objects: { countries?: unknown } };
    expect(body.type).toBe('Topology');
    expect(body.objects.countries).toBeDefined();
  });

  test('WorldMap renders SVG with expected viewBox', async ({ page }) => {
    await page.goto('/');
    const svg = page.getByTestId('signalmap-worldmap');
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute('viewBox', '0 0 960 480');
    await expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
  });

  test('country paths render after topojson loads (>100 features)', async ({ page }) => {
    await page.goto('/');
    const paths = page.locator('[data-testid="signalmap-worldmap-base"] > path');
    await expect.poll(async () => paths.count(), { timeout: 15000 }).toBeGreaterThan(100);
    // First path must have a non-empty d attribute starting with M.
    const firstD = await paths.first().getAttribute('d');
    expect(firstD).not.toBeNull();
    expect(firstD!.startsWith('M')).toBe(true);
  });
});
