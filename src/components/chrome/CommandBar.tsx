import { useSignal } from '@preact/signals';
import { query, timeRange, TIME_RANGES } from '../../state/filters.ts';

type SourceStatus = 'ok' | 'degraded' | 'stale';
type SourceHealth = { id: string; label: string; tier: 1 | 2; status: SourceStatus; latencyMs: number };

const MOCK_SOURCES: readonly SourceHealth[] = [
  { id: 'radar', label: 'Cloudflare Radar', tier: 1, status: 'ok', latencyMs: 42 },
  { id: 'cf-status', label: 'Cloudflare Status', tier: 1, status: 'ok', latencyMs: 88 },
  { id: 'okta-status', label: 'Okta Status RSS', tier: 1, status: 'ok', latencyMs: 121 },
  { id: 'm365-health', label: 'Microsoft Service Health', tier: 1, status: 'degraded', latencyMs: 612 },
  { id: 'azure-status', label: 'Azure Status RSS', tier: 1, status: 'ok', latencyMs: 198 },
  { id: 'gdelt', label: 'GDELT', tier: 2, status: 'ok', latencyMs: 410 },
  { id: 'rss-tier2', label: 'RSS / Tier-2 News', tier: 2, status: 'stale', latencyMs: 2400 },
];

function statusLabel(status: SourceStatus): string {
  if (status === 'ok') return 'healthy';
  if (status === 'degraded') return 'degraded';
  return 'stale';
}

function dotClass(status: SourceStatus): string {
  if (status === 'ok') return 'ok';
  if (status === 'degraded') return 'warn';
  return 'stale';
}

export function CommandBar() {
  const popOpen = useSignal(false);

  const ok = MOCK_SOURCES.filter(s => s.status === 'ok').length;
  const total = MOCK_SOURCES.length;
  const issues = MOCK_SOURCES.filter(s => s.status !== 'ok').length;

  return (
    <header className="sm-cmdbar" data-testid="signalmap-cmdbar">
      {/* Brand mark */}
      <div className="sm-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10.5" stroke="var(--accent)" strokeWidth="1" opacity="0.5" />
          <circle cx="12" cy="12" r="6.5" stroke="var(--accent)" strokeWidth="1" opacity="0.7" />
          <circle cx="12" cy="12" r="2.5" fill="var(--accent)" />
          <circle cx="19" cy="6" r="1.5" fill="var(--sev-major)" />
        </svg>
        <div className="sm-brand-name">SIGNALMAP</div>
        <div className="sm-brand-build mono">v0.4 · LIVE</div>
      </div>

      {/* Search input */}
      <div className="sm-cmdbar-search">
        <input
          data-testid="signalmap-search"
          value={query.value}
          onInput={(e) => { query.value = (e.currentTarget as HTMLInputElement).value; }}
          placeholder="Search signals, regions, providers, ASNs…"
        />
        <kbd className="sm-kbd mono">⌘K</kbd>
      </div>

      <div className="sm-cmdbar-right">
        {/* Time range segmented control */}
        <div className="sm-seg" data-testid="signalmap-time-range">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              className={`sm-seg-btn ${timeRange.value === r ? 'active' : ''}`}
              aria-pressed={timeRange.value === r}
              data-testid={`signalmap-time-range-${r}`}
              onClick={() => { timeRange.value = r; }}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Source health pill */}
        <button
          className="sm-pill"
          data-testid="signalmap-source-pill"
          onClick={() => { popOpen.value = !popOpen.value; }}
        >
          <span className={`sm-dot ${issues > 0 ? 'warn' : 'ok'}`} />
          <span className="mono tnum">{ok}/{total}</span>
          <span className="sm-pill-label">sources</span>
        </button>

        {/* Source health popover */}
        {popOpen.value && (
          <>
            <div className="sm-pop-scrim" onClick={() => { popOpen.value = false; }} />
            <div className="sm-pop sm-pop-sources" data-testid="signalmap-source-popover">
              <div className="sm-pop-head">
                <span className="eyebrow">Source health</span>
                <button onClick={() => { popOpen.value = false; }}>×</button>
              </div>
              <div className="sm-pop-body">
                {MOCK_SOURCES.map((s) => (
                  <div key={s.id} className="sm-source-row" data-testid="signalmap-source-row">
                    <span className={`sm-dot ${dotClass(s.status)}`} />
                    <div className="sm-source-name">
                      {s.label}
                      <span className="sm-tier">T{s.tier}</span>
                    </div>
                    <div className="sm-source-meta mono tnum">{s.latencyMs}ms</div>
                    <div className="sm-source-status">{statusLabel(s.status)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
