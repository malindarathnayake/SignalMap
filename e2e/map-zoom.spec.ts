import { expect, test } from '@playwright/test';

test.describe('SignalMap Phase 5b — d3-zoom transform group (5b gate)', () => {
  test('zoom group wraps base group inside the SVG', async ({ page }) => {
    await page.goto('/');
    const zoomGroup = page.getByTestId('signalmap-worldmap-zoom');
    const baseGroup = page.getByTestId('signalmap-worldmap-base');
    await expect(zoomGroup).toBeAttached();
    await expect(baseGroup).toBeAttached();
    // base must be a descendant of zoom
    const isDescendant = await zoomGroup.evaluate((zoom, baseId) => {
      return zoom.querySelector(`[data-testid="${baseId}"]`) !== null;
    }, 'signalmap-worldmap-base');
    expect(isDescendant).toBe(true);
  });

  test('initial transform is identity (or omitted)', async ({ page }) => {
    await page.goto('/');
    const zoomGroup = page.getByTestId('signalmap-worldmap-zoom');
    await expect(zoomGroup).toBeAttached();
    const transform = await zoomGroup.getAttribute('transform');
    if (transform !== null) {
      // Accept either no attribute or an identity transform.
      expect(transform).toMatch(/(^$|translate\(\s*0\s*[,\s]\s*0\s*\)\s*scale\(\s*1\s*\))/);
    }
  });

  test('mouse wheel zoom-in scales the inner group above 1', async ({ page }) => {
    await page.goto('/');
    const svg = page.getByTestId('signalmap-worldmap');
    await expect(svg).toBeVisible();
    // wait for paths to render so d3-zoom is attached
    await expect.poll(async () =>
      page.locator('[data-testid="signalmap-worldmap-base"] > path').count(),
      { timeout: 15000 }
    ).toBeGreaterThan(100);
    const box = await svg.boundingBox();
    if (!box) throw new Error('svg has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // emit several wheel events to overcome any wheel-delta thresholding
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -100);
    }
    const zoomGroup = page.getByTestId('signalmap-worldmap-zoom');
    await expect.poll(async () => {
      const t = await zoomGroup.getAttribute('transform');
      if (!t) return 1;
      const m = t.match(/scale\(\s*([\d.]+)\s*\)/);
      return m ? Number(m[1]) : 1;
    }, { timeout: 5000 }).toBeGreaterThan(1.05);
  });

  test('drag pans the inner group (transform translate becomes non-zero)', async ({ page }) => {
    await page.goto('/');
    const svg = page.getByTestId('signalmap-worldmap');
    await expect.poll(async () =>
      page.locator('[data-testid="signalmap-worldmap-base"] > path').count(),
      { timeout: 15000 }
    ).toBeGreaterThan(100);
    const box = await svg.boundingBox();
    if (!box) throw new Error('svg has no bounding box');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 40, { steps: 10 });
    await page.mouse.up();
    const zoomGroup = page.getByTestId('signalmap-worldmap-zoom');
    await expect.poll(async () => {
      const t = await zoomGroup.getAttribute('transform');
      if (!t) return { tx: 0, ty: 0 };
      const m = t.match(/translate\(\s*(-?[\d.]+)\s*[,\s]\s*(-?[\d.]+)\s*\)/);
      return m ? { tx: Math.abs(Number(m[1])), ty: Math.abs(Number(m[2])) } : { tx: 0, ty: 0 };
    }, { timeout: 5000 }).toMatchObject({ tx: expect.any(Number) });
    const t = await zoomGroup.getAttribute('transform');
    const m = t?.match(/translate\(\s*(-?[\d.]+)\s*[,\s]\s*(-?[\d.]+)\s*\)/);
    expect(m).not.toBeNull();
    const tx = Math.abs(Number(m![1]));
    const ty = Math.abs(Number(m![2]));
    expect(tx + ty).toBeGreaterThan(5); // non-trivial pan; viewBox-unit scaled
  });

  test('zoom is capped at scale 8 (max scaleExtent)', async ({ page }) => {
    await page.goto('/');
    const svg = page.getByTestId('signalmap-worldmap');
    await expect.poll(async () =>
      page.locator('[data-testid="signalmap-worldmap-base"] > path').count(),
      { timeout: 15000 }
    ).toBeGreaterThan(100);
    const box = await svg.boundingBox();
    if (!box) throw new Error('svg has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // many strong scrolls; d3-zoom should cap at 8
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, -200);
    }
    const zoomGroup = page.getByTestId('signalmap-worldmap-zoom');
    await expect.poll(async () => {
      const t = await zoomGroup.getAttribute('transform');
      const m = t?.match(/scale\(\s*([\d.]+)\s*\)/);
      return m ? Number(m[1]) : 1;
    }, { timeout: 5000 }).toBeGreaterThan(2);
    const t = await zoomGroup.getAttribute('transform');
    const m = t?.match(/scale\(\s*([\d.]+)\s*\)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(8.0001);
  });
});
