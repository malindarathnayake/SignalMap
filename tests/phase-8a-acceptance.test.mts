/**
 * Phase 8a Acceptance Test — long-poll smoke test against a live compose stack.
 *
 * OPERATOR PREREQUISITES (not handled by this test):
 *   1. Copy docker/signalmap-shared.env.example to .env and fill in real keys.
 *   2. Bring the stack up:  docker compose up -d --build --force-recreate
 *   3. Wait for containers to be healthy (docker compose ps).
 *   4. Set RUN_PHASE_8A_ACCEPTANCE=1 in your shell, then run:
 *        npx tsx --test tests/phase-8a-acceptance.test.mts
 *
 * This test NEVER:
 *   - Calls any LLM endpoint directly.
 *   - Embeds credentials.
 *   - Runs docker compose commands.
 *   - Starts background processes.
 *
 * Timeout: 17 minutes (1_020_000 ms) — enough for one full cron interval
 * at 0.5× (spec: 30-minute smoke at 0.5× = 15 min, with 2 min headroom).
 *
 * Gate: set RUN_PHASE_8A_ACCEPTANCE=1 to opt in.
 * Without the env var the test reports as skipped (exit 0).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// ---------------------------------------------------------------------------
// Helper: poll /health until pass-condition or deadline
// ---------------------------------------------------------------------------

async function pollHealth(
  url: string,
  deadlineMs: number,
  intervalMs: number,
): Promise<{ ok: boolean; body: Record<string, unknown> | null; lastError?: string }> {
  const deadline = Date.now() + deadlineMs;
  let body: Record<string, unknown> | null = null;
  let lastError: string | undefined;

  while (Date.now() < deadline) {
    try {
      const res = await globalThis.fetch(url);
      if (res.status === 200) {
        const text = await res.text();
        body = JSON.parse(text) as Record<string, unknown>;

        // Validate the strict 8-key shape on every successful response
        const EXPECTED_KEYS = ['redis', 'lancedb', 'collector', 'brief', 'openrouter', 'perplexity', 'sources', 'generatedAt'];
        assert.deepEqual(
          Object.keys(body).sort(),
          [...EXPECTED_KEYS].sort(),
          `Health response must have exactly the 8 expected keys. Got: ${Object.keys(body).sort().join(', ')}`,
        );

        // Check pass condition: brief.status === 'ok'
        const brief = body['brief'] as Record<string, unknown> | undefined;
        if (brief?.['status'] === 'ok') {
          return { ok: true, body };
        }

        console.log(`[phase-8a] poll: brief.status=${String(brief?.['status'])} — waiting...`);
      } else {
        lastError = `HTTP ${res.status}`;
        console.log(`[phase-8a] poll: ${lastError} from ${url} — retrying...`);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.log(`[phase-8a] poll error: ${lastError} — retrying...`);
    }

    // Sleep for the interval (or remaining time, whichever is shorter)
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }

  return { ok: false, body, lastError };
}

// ---------------------------------------------------------------------------
// Acceptance test — opt-in gate
// ---------------------------------------------------------------------------

if (process.env['RUN_PHASE_8A_ACCEPTANCE'] !== '1') {
  test('phase-8a acceptance smoke (skipped — opt-in required)', (t) => {
    t.skip(
      'Phase 8a acceptance test requires opt-in: set RUN_PHASE_8A_ACCEPTANCE=1 ' +
      'with a running compose stack and real LLM keys. ' +
      'See the leading comment block in this file for setup instructions.',
    );
  });
} else {
  test(
    'phase-8a acceptance: compose stack produces brief.status=ok within 16 minutes',
    { timeout: 1_020_000 },
    async () => {
      const PORT = process.env['SIGNALMAP_PORT'] ?? '8080';
      const BASE_URL = `http://localhost:${PORT}`;
      const HEALTH_URL = `${BASE_URL}/api/signalmap/health`;

      console.log(`[phase-8a] Starting acceptance smoke against ${HEALTH_URL}`);
      console.log('[phase-8a] Polling every 15s for up to 16 minutes...');

      const POLL_INTERVAL_MS = 15_000;   // 15 seconds
      const POLL_DEADLINE_MS = 960_000;  // 16 minutes

      const result = await pollHealth(HEALTH_URL, POLL_DEADLINE_MS, POLL_INTERVAL_MS);

      if (!result.ok) {
        const diagnostic = result.body
          ? JSON.stringify(result.body, null, 2)
          : `No successful response. Last error: ${result.lastError ?? 'unknown'}`;
        assert.fail(
          `[phase-8a] brief.status did not reach 'ok' within 16 minutes.\n` +
          `Last health response:\n${diagnostic}`,
        );
      }

      // Pass condition met — run final assertions
      const body = result.body!;

      const redis = body['redis'] as Record<string, unknown>;
      assert.equal(
        redis?.['status'],
        'ok',
        `redis.status must be 'ok' when brief is ok. Got: ${String(redis?.['status'])}`,
      );

      const openrouter = body['openrouter'] as Record<string, unknown>;
      assert.equal(
        openrouter?.['status'],
        'ok',
        `openrouter.status must be 'ok' (real call recorded). Got: ${String(openrouter?.['status'])}`,
      );

      const perplexity = body['perplexity'] as Record<string, unknown>;
      assert.equal(
        perplexity?.['status'],
        'ok',
        `perplexity.status must be 'ok' (real call recorded). Got: ${String(perplexity?.['status'])}`,
      );

      const generatedAt = body['generatedAt'];
      assert.equal(
        typeof generatedAt,
        'string',
        `generatedAt must be a string. Got: ${typeof generatedAt}`,
      );
      const parsedDate = new Date(generatedAt as string);
      assert.ok(
        !isNaN(parsedDate.getTime()),
        `generatedAt must parse as a valid Date. Got: ${String(generatedAt)}`,
      );

      console.log('[phase-8a] PASS — all assertions satisfied.');
      console.log(`[phase-8a] generatedAt=${String(generatedAt)}`);
    },
  );
}
