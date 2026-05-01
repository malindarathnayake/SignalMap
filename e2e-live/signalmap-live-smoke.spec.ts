import { expect, test } from '@playwright/test';

const COMPONENT_KEYS = ['redis', 'lancedb', 'collector', 'brief', 'openrouter', 'perplexity'] as const;

test.describe('SignalMap live stack — shape smoke (Phase 6b)', () => {
  // Default-skipped. Set RUN_LIVE_E2E=1 to run against a live compose stack.
  test.skip(!process.env.RUN_LIVE_E2E, 'set RUN_LIVE_E2E=1 (and bring up compose stack) to run live shape smoke');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('feed mounts and shows non-zero count', async ({ page }) => {
    const feed = page.getByTestId('signalmap-feed');
    await expect(feed).toBeVisible({ timeout: 30000 });
    const count = page.getByTestId('signalmap-feed-count');
    await expect(count).toBeVisible();
    await expect(count).not.toHaveText('0', { timeout: 30000 });
  });

  test('source pill shows N/M with N > 0', async ({ page }) => {
    const pill = page.getByTestId('signalmap-source-pill');
    await expect(pill).toBeVisible({ timeout: 30000 });
    const text = (await pill.textContent()) ?? '';
    const match = text.match(/(\d+)\/(\d+)/);
    expect(match, `source pill text "${text}" must match N/M`).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  test('world map markers group has at least one child', async ({ page }) => {
    const markers = page.getByTestId('signalmap-worldmap-markers');
    await expect(markers).toBeAttached({ timeout: 30000 });
    const childCount = await markers.locator(':scope > *').count();
    expect(childCount).toBeGreaterThan(0);
  });

  test('brief strip loads with non-empty bullets', async ({ page }) => {
    const strip = page.getByTestId('signalmap-brief-strip');
    await expect(strip).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('signalmap-brief-strip-loading')).not.toBeVisible({ timeout: 30000 });
    const bullets = page.getByTestId('signalmap-brief-bullet');
    expect(await bullets.count()).toBeGreaterThan(0);
  });

  test('health panel opens with 6 component cards', async ({ page }) => {
    const pill = page.getByTestId('signalmap-health-pill');
    await expect(pill).toBeVisible({ timeout: 30000 });
    await pill.click();
    const panel = page.getByTestId('signalmap-health-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });
    for (const key of COMPONENT_KEYS) {
      await expect(page.getByTestId(`signalmap-health-${key}`)).toBeVisible({ timeout: 5000 });
    }
  });

  test('map active count badge shows non-zero signals', async ({ page }) => {
    const badge = page.getByTestId('signalmap-map-active-count');
    await expect(badge).toBeVisible({ timeout: 30000 });
    const text = (await badge.textContent()) ?? '';
    const match = text.match(/^(\d+)\s*signals/i);
    expect(match, `map active count text "${text}" must match "<N> signals"`).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });
});
