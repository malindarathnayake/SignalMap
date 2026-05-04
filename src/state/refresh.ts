import { signal } from '@preact/signals';
import { normalizeSignalEvent, signals as eventSignals } from './signals.ts';
import type { RawSignalEvent, SignalEvent } from './signals.ts';

// User-tunable interval. Default matches SIGNALMAP_RSS_POLL_MINUTES=15
// in docker-compose, scaled down to 60s for the dev fixture demo.
export const refreshIntervalSec = signal(60);

// Timestamps of the last completed refresh (success OR failure) and the
// last successful response. Initial value = startup time so the first
// countdown begins from page load.
export const lastRefreshAt = signal<number>(Date.now());
export const refreshing = signal(false);
export const lastRefreshError = signal<string | null>(null);

export function nextRefreshAt(): number {
  return lastRefreshAt.value + refreshIntervalSec.value * 1000;
}

export async function forceRefresh(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  lastRefreshError.value = null;
  try {
    const res = await fetch('/api/signalmap/list', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { events: RawSignalEvent[] };
    if (Array.isArray(data.events)) {
      const next = new Map<string, SignalEvent>();
      for (const ev of data.events) {
        const normalized = normalizeSignalEvent(ev);
        if (normalized) next.set(normalized.id, normalized);
      }
      eventSignals.value = next;
    }
  } catch (err) {
    lastRefreshError.value = err instanceof Error ? err.message : String(err);
  } finally {
    lastRefreshAt.value = Date.now();
    refreshing.value = false;
  }
}
