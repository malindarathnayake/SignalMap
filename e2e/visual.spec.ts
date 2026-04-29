import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'tablet-768x1024',  width: 768,  height: 1024 },
];

const POLL = { timeout: 15000 };

for (const vp of VIEWPORTS) {
  test.describe(`SignalMap Phase 5d — visual regression (${vp.name}) (5d gate)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('full app shell golden', async ({ page }) => {
      await page.goto('/');

      // Wait for map skeleton to be fully rendered.
      await expect(page.getByTestId('signalmap-worldmap')).toBeVisible();
      await expect.poll(
        async () => page.locator('[data-testid="signalmap-worldmap-base"] > path').count(),
        POLL,
      ).toBeGreaterThan(100);

      // Wait for all 8 fixture markers to render.
      await expect.poll(
        async () => page.locator('[data-testid="signalmap-worldmap-markers"] > g').count(),
        POLL,
      ).toBeGreaterThanOrEqual(8);

      // Wait for the source pill to render the count text — proves CommandBar settled.
      await expect(page.getByTestId('signalmap-source-pill')).toBeVisible();

      // Disable all CSS animations + transitions to stabilize pixels.
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation: none !important;
            animation-delay: 0s !important;
            animation-duration: 0s !important;
            transition: none !important;
            caret-color: transparent !important;
          }
        `,
      });

      // Mask the relative-time strings in the live feed — these read Date.now()
      // and shift between snapshot capture and verification runs.
      const masks = [page.locator('.sm-feed-ago')];

      await expect(page).toHaveScreenshot(`signalmap-${vp.name}.png`, {
        fullPage: false,
        animations: 'disabled',
        caret: 'hide',
        mask: masks,
        // SwiftShader + font-rendering noise. 1% diff allowance is generous but
        // tight enough to catch real regressions in panel layout / colors.
        maxDiffPixelRatio: 0.01,
      });
    });
  });
}
