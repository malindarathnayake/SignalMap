import { useEffect, useState } from 'preact/hooks';

type HealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

interface ComponentHealth {
  status: HealthStatus;
  detail?: string;
  metrics?: Record<string, string | number>;
}

interface HealthResponse {
  redis: ComponentHealth;
  lancedb: ComponentHealth;
  collector: ComponentHealth;
  brief: ComponentHealth;
  openrouter: ComponentHealth;
  perplexity: ComponentHealth;
  sources: { id: string; label: string; status: HealthStatus; latencyMs: number; tier: number }[];
  generatedAt: string;
}

type Props = {
  onClose: () => void;
};

function statusDot(status: HealthStatus): string {
  if (status === 'ok') return 'ok';
  if (status === 'degraded') return 'warn';
  if (status === 'down') return 'err';
  return 'unknown';
}

export function HealthPanel({ onClose }: Props) {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/signalmap/health', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => { if (!cancelled) { setData(j as HealthResponse); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message ?? String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      className="sm-watchpoint-options-backdrop"
      data-testid="signalmap-health-backdrop"
      onClick={onClose}
    >
      <div
        className="sm-watchpoint-options sm-health-panel"
        role="dialog"
        aria-label="Health status"
        data-testid="signalmap-health-panel"
        onClick={e => e.stopPropagation()}
      >
        <div className="sm-watchpoint-options-head">
          <span className="eyebrow">System health</span>
          <button
            type="button"
            className="sm-icon-btn"
            data-testid="signalmap-health-close"
            aria-label="Close health panel"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {loading && <div className="sm-insp-empty-hint">Loading health…</div>}
        {error && (
          <div className="sm-insp-empty-hint" data-testid="signalmap-health-error">
            Couldn't load /api/signalmap/health — {error}
          </div>
        )}

        {data && (
          <>
            <div className="sm-health-grid">
              {(['redis', 'lancedb', 'collector', 'brief', 'openrouter', 'perplexity'] as const).map(key => {
                const c = data[key];
                return (
                  <div key={key} className={`sm-health-card status-${statusDot(c.status)}`} data-testid={`signalmap-health-${key}`}>
                    <div className="sm-health-card-head">
                      <span className={`sm-dot ${statusDot(c.status)}`} aria-hidden />
                      <span className="sm-health-card-name">{key.toUpperCase()}</span>
                      <span className="sm-health-card-status mono">{c.status}</span>
                    </div>
                    {c.detail && <div className="sm-health-card-detail">{c.detail}</div>}
                    {c.metrics && (
                      <ul className="sm-health-metrics">
                        {Object.entries(c.metrics).map(([k, v]) => (
                          <li key={k}>
                            <span className="sm-health-metric-key">{k}</span>
                            <span className="sm-health-metric-val mono">{v}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="sm-health-sources">
              <div className="eyebrow">Source feeds ({data.sources.length})</div>
              <ul className="sm-health-source-list">
                {data.sources.map(s => (
                  <li key={s.id} className="sm-health-source-row" data-testid={`signalmap-health-source-${s.id}`}>
                    <span className={`sm-dot ${statusDot(s.status)}`} aria-hidden />
                    <span className="sm-health-source-label">{s.label}</span>
                    <span className="sm-health-source-tier mono">T{s.tier}</span>
                    <span className="sm-health-source-latency mono">{s.latencyMs}ms</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="sm-health-footer mono">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
