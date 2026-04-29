import { expect, test } from '@playwright/test';

test.describe('persist() robustness — corrupt localStorage does not crash the shell', () => {
  test('shape-mismatched array signals fall back to default', async ({ page }) => {
    // Pre-populate localStorage with values that JSON.parse cleanly but are the wrong shape:
    //  - categories expects string[]; 'null' parses to null, '{}' to object, 'true' to boolean.
    //  - mapControls expects object; '42' parses to number.
    //  - providers/regions expect string[]; '"foo"' parses to string.
    await page.addInitScript(() => {
      localStorage.setItem('signalmap-filters-categories', 'null');
      localStorage.setItem('signalmap-filters-query', '42');                 // expects string
      localStorage.setItem('signalmap-filters-timerange', '{}');             // expects string
      localStorage.setItem('signalmap-watchlist-providers', '{}');
      localStorage.setItem('signalmap-watchlist-regions', 'true');
      localStorage.setItem('signalmap-watchlist-map-controls', '42');
    });
    await page.goto('/');
    // Shell must still mount with defaults — no crash.
    await expect(page.getByTestId('signalmap-cmdbar')).toBeVisible();
    await expect(page.getByTestId('signalmap-rail')).toBeVisible();
    await expect(page.getByTestId('signalmap-feed')).toBeVisible();
    await expect(page.getByTestId('signalmap-inspector')).toBeVisible();
    // Default 8 events should be visible (corrupt categories rejected → all-12 default → all categories visible)
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('8');
    // Default time-range '24h' restored (corrupt '{}' rejected → '24h' default)
    await expect(page.getByTestId('signalmap-time-range-24h')).toHaveAttribute('aria-pressed', 'true');
  });

  test('valid-shape but unknown values are accepted (forward-compat with new categories)', async ({ page }) => {
    // Validator only checks top-level shape — array of arbitrary strings is accepted even
    // if a category ID is unknown. Ensures forward-compatibility when new categories are added.
    await page.addInitScript(() => {
      localStorage.setItem('signalmap-filters-categories', JSON.stringify(['internet', 'unknown-future-cat']));
    });
    await page.goto('/');
    // 'internet' is in the active set, so its 4 events should appear (provider's 4 dropped).
    await expect(page.getByTestId('signalmap-feed-count')).toHaveText('4');
  });
});
