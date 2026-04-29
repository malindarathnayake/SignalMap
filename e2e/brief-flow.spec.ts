import { expect, test } from '@playwright/test';
import { GLOBAL_BRIEF_FIXTURE, EVENT_BRIEF_FIXTURE, LIST_EVENTS_FIXTURE, buildEventBrief } from '../src/fixtures/signalmap.ts';

test.describe('BriefStrip + WhyItMattersTab (unit 6e gate)', () => {
  test.beforeEach(async ({ page, request }) => {
    // Reset fixture state before each test
    await request.get('/__test/signalmap/fixture/reset');
    await page.addInitScript(() => {
      [
        'signalmap-filters-query',
        'signalmap-filters-timerange',
        'signalmap-filters-categories',
        'signalmap-watchlist-providers',
        'signalmap-watchlist-regions',
        'signalmap-watchlist-map-controls',
        'signalmap_admin_token',
      ].forEach((k) => localStorage.removeItem(k));
    });
  });

  // ---- Test 1: BriefStrip mounts and shows fixture brief on first load ----
  test('BriefStrip shows fixture brief content on first load', async ({ page }) => {
    await page.goto('/');
    const strip = page.getByTestId('signalmap-brief-strip');
    await expect(strip).toBeVisible();

    // Wait for first bullet to appear
    await expect(page.getByTestId('signalmap-brief-bullet').first())
      .toContainText(GLOBAL_BRIEF_FIXTURE.bullets[0].slice(0, 30), { timeout: 5000 });

    // Sources line
    await expect(strip).toContainText('Sources: Reuters, Cloudflare Status');
  });

  // ---- Test 2: BriefStrip subscribes to SSE brief-updated and swaps content ----
  test('BriefStrip reflects updated fixture bullets after SSE brief-updated', async ({ page, request }) => {
    await page.goto('/');

    // Verify initial content
    await expect(page.getByTestId('signalmap-brief-bullet').first())
      .toContainText('Major regional internet disruption', { timeout: 5000 });

    // Update fixture bullets
    await request.get('/__test/signalmap/fixture/set?bullets=Updated%20bullet%20from%20SSE');

    // The SSE stream emits brief-updated after 200ms, triggering a refetch.
    // After refetch the new bullet should appear.
    await expect(page.getByTestId('signalmap-brief-bullet').first())
      .toHaveText('Updated bullet from SSE', { timeout: 8000 });
  });

  // ---- Test 3: Manual refresh button hidden when no admin token ----
  test('Refresh button is hidden when no admin token in localStorage', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-brief-refresh')).toHaveCount(0);
  });

  // ---- Test 4: Manual refresh button visible with admin token; click triggers refresh ----
  test('Refresh button visible and functional when admin token is set', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('signalmap_admin_token', 'test-token');
    });
    await page.goto('/');

    // Brief content should load
    await expect(page.getByTestId('signalmap-brief-bullet').first())
      .toBeVisible({ timeout: 5000 });

    const btn = page.getByTestId('signalmap-brief-refresh');
    await expect(btn).toBeVisible();
    await btn.click();

    // Status message should appear
    await expect(page.getByTestId('signalmap-brief-refresh-status'))
      .toBeVisible({ timeout: 5000 });

    // Brief is still showing content
    await expect(page.getByTestId('signalmap-brief-bullet').first()).toBeVisible();
  });

  // ---- Test 5: WhyItMattersTab generates per-event brief on click ----
  test('WhyItMattersTab fetches and renders event brief on Generate click', async ({ page }) => {
    await page.goto('/');

    // Open inspector for an event
    await page.getByTestId('signalmap-feed-card-rdr-iq-01').click();
    await expect(page.getByTestId('signalmap-inspector-title')).toBeVisible();

    const btn = page.getByTestId('signalmap-inspector-why-button');
    await expect(btn).toBeVisible();
    await btn.click();

    // Text should appear with the per-event brief's first bullet —
    // buildEventBrief generates content from the event's own fields,
    // so we recompute the expected text here for the same eventId.
    const expectedEvent = LIST_EVENTS_FIXTURE.events.find(e => e.id === 'rdr-iq-01');
    const expectedBrief = buildEventBrief(expectedEvent, 'rdr-iq-01');
    const whyText = page.getByTestId('signalmap-inspector-why-text');
    await expect(whyText).toBeVisible({ timeout: 5000 });
    await expect(whyText).toContainText(expectedBrief.bullets[0].slice(0, 30));
    // Reference to EVENT_BRIEF_FIXTURE preserved for the fallback path test elsewhere.
    void EVENT_BRIEF_FIXTURE;

    // Button hides after success
    await expect(page.getByTestId('signalmap-inspector-why-button')).toHaveCount(0);
  });

  // ---- Test 5b: Refresh button appears after admin token written via storage event ----
  test('Refresh button appears after admin token written via storage event', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signalmap-brief-refresh')).toHaveCount(0);

    await page.evaluate(() => {
      localStorage.setItem('signalmap_admin_token', 'live-token');
      // Manually fire a StorageEvent — same-tab writes don't fire it natively
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'signalmap_admin_token',
        newValue: 'live-token',
        oldValue: null,
      }));
    });

    await expect(page.getByTestId('signalmap-brief-refresh')).toBeVisible({ timeout: 3000 });
  });

  // ---- Test 6: Per-event endpoint response stability under parallel load ----
  test('Per-event endpoint returns stable generatedAt across 10 parallel calls', async ({ request }) => {
    await request.get('/__test/signalmap/fixture/reset');

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request.post('/api/signalmap/brief/event/parallel-evt'),
      ),
    );

    const bodies = await Promise.all(responses.map((r) => r.json() as Promise<{ generatedAt: string }>));
    const uniqueDates = new Set(bodies.map((b) => b.generatedAt));

    // All 10 responses share the same generatedAt — fixture returns stable value
    expect(uniqueDates.size).toBe(1);
    // All requests returned 200
    for (const r of responses) {
      expect(r.status()).toBe(200);
    }
  });
});
