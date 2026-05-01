/**
 * Phase 9a Security-Property Test — Admin token never appears in browser-visible surfaces.
 *
 * OPERATOR PREREQUISITES (not handled by this test):
 *   1. Run `npm run dev` (or the full stack) with SIGNALMAP_ADMIN_TOKEN set.
 *   2. Optionally set SIGNALMAP_REFRESH_FROM_UI_ENABLED=1 to also exercise the Refresh button path.
 *   3. Set RUN_PHASE_9A_BROWSER_CHECK=1 in your shell, then run:
 *        RUN_PHASE_9A_BROWSER_CHECK=1 SIGNALMAP_ADMIN_TOKEN=<token> npx tsx --test tests/admin-token-not-in-browser.test.mts
 *
 * This test NEVER:
 *   - Starts vite or any server process.
 *   - Embeds credentials.
 *   - Reads from localStorage/sessionStorage outside of the browser context.
 *
 * Gate: set RUN_PHASE_9A_BROWSER_CHECK=1 to opt in.
 * Without the env var the test reports as skipped (exit 0).
 *
 * Chromium is ONLY launched inside the gated branch. The import statement at the
 * top of the file is metadata-only and does not spawn any process.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';

// ---------------------------------------------------------------------------
// Gate + config
// ---------------------------------------------------------------------------

const GATE = process.env['RUN_PHASE_9A_BROWSER_CHECK'] === '1';
const BASE_URL = process.env['SIGNALMAP_BASE_URL'] ?? 'http://localhost:5173';
const TOKEN = process.env['SIGNALMAP_ADMIN_TOKEN'] ?? '';

// ---------------------------------------------------------------------------
// Test — operator-driven browser security check
// ---------------------------------------------------------------------------

test('admin token never appears in browser-visible surfaces', async (t) => {
  if (!GATE) {
    t.skip(
      'set RUN_PHASE_9A_BROWSER_CHECK=1 to run; requires running stack with SIGNALMAP_ADMIN_TOKEN set',
    );
    return;
  }

  // Token must be present when gate is on
  if (TOKEN === '') {
    assert.fail('SIGNALMAP_ADMIN_TOKEN must be set when RUN_PHASE_9A_BROWSER_CHECK=1');
  }

  // Token must be long enough that substring matches are meaningful
  assert.ok(
    TOKEN.length >= 16,
    `SIGNALMAP_ADMIN_TOKEN must be at least 16 characters (got ${TOKEN.length}) — shorter values are too common to reliably detect leaks`,
  );

  // -------------------------------------------------------------------------
  // Launch browser
  // -------------------------------------------------------------------------
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // -----------------------------------------------------------------------
    // Set up network capture BEFORE navigation
    // -----------------------------------------------------------------------
    const requests: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      postData: string | null;
    }> = [];

    const responses: Array<{
      url: string;
      status: number;
      headers: Record<string, string>;
      body: string;
    }> = [];

    page.on('request', (req) => {
      requests.push({
        url: req.url(),
        method: req.method(),
        headers: req.headers() as Record<string, string>,
        postData: req.postData(),
      });
    });

    page.on('response', async (resp) => {
      try {
        const body = await resp.text();
        responses.push({
          url: resp.url(),
          status: resp.status(),
          headers: resp.headers() as Record<string, string>,
          body,
        });
      } catch {
        // Binary or unreadable responses — ignore
      }
    });

    // -----------------------------------------------------------------------
    // Navigate and wait for idle
    // -----------------------------------------------------------------------
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // -----------------------------------------------------------------------
    // Wait for the brief strip to be visible
    // -----------------------------------------------------------------------
    await page.getByTestId('signalmap-brief-strip').waitFor({ state: 'visible', timeout: 10_000 });

    // -----------------------------------------------------------------------
    // Optionally click the Refresh button if it's present
    // -----------------------------------------------------------------------
    const btn = page.getByTestId('signalmap-brief-refresh');
    const present = (await btn.count()) > 0;

    if (present) {
      await btn.click();
      await page
        .getByTestId('signalmap-brief-refresh-status')
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => undefined);
    }

    // Allow a brief settling window for any async writes
    await page.waitForTimeout(500);

    // -----------------------------------------------------------------------
    // Capture browser-visible storage state
    // -----------------------------------------------------------------------
    const ls = await page.evaluate(() =>
      Object.entries(localStorage).map(([k, v]) => ({ k, v: String(v) })),
    );

    const ss = await page.evaluate(() =>
      Object.entries(sessionStorage).map(([k, v]) => ({ k, v: String(v) })),
    );

    const cookies = await context.cookies();

    // -----------------------------------------------------------------------
    // Assertions
    // -----------------------------------------------------------------------

    // localStorage — no entry value contains the token
    for (const entry of ls) {
      assert.ok(
        !entry.v.includes(TOKEN),
        `localStorage entry '${entry.k}' contained the admin token value`,
      );
    }

    // localStorage — legacy key must not exist
    assert.ok(
      !ls.some((e) => e.k === 'signalmap_admin_token'),
      'legacy signalmap_admin_token key must not be in localStorage',
    );

    // sessionStorage — no entry value contains the token
    for (const entry of ss) {
      assert.ok(
        !entry.v.includes(TOKEN),
        `sessionStorage entry '${entry.k}' contained the admin token value`,
      );
    }

    // cookies — no cookie value contains the token
    assert.ok(
      !cookies.some((c) => c.value.includes(TOKEN)),
      'cookie value contained the admin token',
    );

    // request URLs
    for (const r of requests) {
      assert.ok(
        !r.url.includes(TOKEN),
        `request URL '${r.url}' contained the admin token`,
      );
    }

    // request headers
    for (const r of requests) {
      for (const [hk, hv] of Object.entries(r.headers)) {
        assert.ok(
          !hv.includes(TOKEN),
          `request header '${hk}' on '${r.url}' contained the admin token`,
        );
      }
    }

    // request bodies (postData)
    for (const r of requests) {
      if (r.postData) {
        assert.ok(
          !r.postData.includes(TOKEN),
          `request body to '${r.url}' contained the admin token`,
        );
      }
    }

    // response bodies
    for (const r of responses) {
      assert.ok(
        !r.body.includes(TOKEN),
        `response body from '${r.url}' contained the admin token`,
      );
    }

    // response headers
    for (const r of responses) {
      for (const [hk, hv] of Object.entries(r.headers)) {
        assert.ok(
          !hv.includes(TOKEN),
          `response header '${hk}' from '${r.url}' contained the admin token`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // Summary trail for operator-driven runs
    // -----------------------------------------------------------------------
    console.log(
      `[token-leak-check] requests=${requests.length} responses=${responses.length} ls=${ls.length} ss=${ss.length} cookies=${cookies.length} button-clicked=${present}`,
    );
  } finally {
    await browser.close();
  }
});
