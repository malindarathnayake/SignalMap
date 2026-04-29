import { render } from 'preact';
import { App } from './app.tsx';
import { signals, type SignalEvent } from './state/signals.ts';

const root = document.getElementById('root');
if (!root) {
  throw new Error('SignalMap root element not found');
}
render(<App />, root);

// Fire-and-forget: hydrate the events Map from /api/signalmap/list (vite plugin in dev,
// real backend in prod). Falls back to the fixture-seeded initial Map on failure.
void (async () => {
  try {
    const res = await fetch('/api/signalmap/list');
    if (!res.ok) return;
    const json = await res.json() as { events: readonly SignalEvent[] };
    if (!Array.isArray(json.events)) return;
    const next = new Map<string, SignalEvent>();
    for (const ev of json.events) next.set(ev.id, ev);
    signals.value = next;
  } catch {
    // network failure / shape mismatch → keep initial Map
  }
})();
