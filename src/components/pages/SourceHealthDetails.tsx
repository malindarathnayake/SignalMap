import { useEffect, useState } from 'preact/hooks';

// Detailed source-health page rendered at /source-health-details. Surfaces
// EVERYTHING the api knows about each upstream feed so an operator can
// diagnose silent failures (e.g. NewsAPI returning 0 events while showing
// status:ok) without curl-ing endpoints by hand. Polls every 5s.

// SPA mirror of the schema served by /api/signalmap/source-health-details.
// Same shape so the LLM-friendly curl response and this page stay in sync.

type Status = 'ok' | 'degraded' | 'down' | 'stale' | 'disabled' | 'unknown' | string;
type Domain = 'radar' | 'status' | 'news' | 'umbrella' | 'other';

interface ParsedCounts {
  fetched: number | null;
  accepted: number | null;
  rejected: number | null;
  reasons: string[];
}

interface RejectionBreakdownEntry {
  reason: string;
  count: number;
  avgConfidence?: number;
  maxConfidence?: number;
  threshold?: number;
  explanation: string;
}

interface DetailedSource {
  id: string;
  label: string;
  domain: Domain;
  status: Status;
  upstreamUrl: string | null;
  requiresEnvKey: string | null;
  fetchedAt: number;
  fetchedAtIso: string | null;
  ageSeconds: number | null;
  eventCount: number;
  tier: number;
  latencyMs: number;
  detail: string;
  counts: ParsedCounts;
  rejections: RejectionBreakdownEntry[];
  flags: { isQuiet: boolean; isDisabled: boolean; hasError: boolean };
}

interface CollectorProgressSource {
  name: string;
  fetched: number;
  processed: number;
  accepted: number;
  rejected: number;
}

interface CollectorProgress {
  stage: string;
  currentSource: string;
  articlesProcessed: number;
  articlesTotal: number;
  articlesAccepted: number;
  updatedAt: string;
  sources?: CollectorProgressSource[];
}

interface ApiResp {
  generatedAt: string;
  fetchedAt: number;
  summary: { total: number; ok: number; degraded: number; down: number; disabled: number; quiet: number };
  progress: CollectorProgress | null;
  sources: DetailedSource[];
}

function relativeAgo(ms: number | undefined | null): string {
  if (typeof ms !== 'number' || ms <= 0) return 'never';
  const ageS = Math.floor((Date.now() - ms) / 1000);
  if (ageS < 5) return 'just now';
  if (ageS < 60) return `${ageS}s ago`;
  if (ageS < 3600) return `${Math.floor(ageS / 60)}m ago`;
  if (ageS < 86400) return `${Math.floor(ageS / 3600)}h ago`;
  return `${Math.floor(ageS / 86400)}d ago`;
}

function statusDot(s: Status): 'ok' | 'warn' | 'err' | 'stale' {
  if (s === 'ok') return 'ok';
  if (s === 'degraded') return 'warn';
  if (s === 'down') return 'err';
  return 'stale';
}

export function SourceHealthDetails() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const r = await fetch('/api/signalmap/source-health-details', { cache: 'no-store' });
        if (!r.ok) {
          if (!cancelled) {
            setError(`HTTP ${r.status}`);
            setLoading(false);
          }
        } else {
          const j = (await r.json()) as ApiResp;
          if (!cancelled) {
            setData(j);
            setError(null);
            setLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const rows = data?.sources ?? [];
  const summary = data?.summary;
  const groupByDomain = (d: Domain) => rows.filter((r) => r.domain === d);

  return (
    <div className="sm-shd-page" data-testid="signalmap-source-health-details">
      <header className="sm-shd-head">
        <a href="/" className="sm-shd-back" aria-label="Back to map">← SignalMap</a>
        <h1>Source Health · Details</h1>
        <div className="sm-shd-summary">
          {summary && (
            <span className="mono">
              {summary.ok} ok · {summary.degraded} degraded · {summary.down} down ·
              {' '}{summary.disabled} disabled · {summary.quiet} quiet
            </span>
          )}
          <span className="mono sm-shd-summary-fetched">
            api fetched {relativeAgo(data?.fetchedAt)}
          </span>
          <a
            href="/api/signalmap/source-health-details"
            target="_blank"
            rel="noopener noreferrer"
            className="sm-shd-json-link mono"
            title="Same data as JSON for curl/LLM consumption"
          >view JSON ↗</a>
        </div>
      </header>

      {loading && !data && <div className="sm-shd-state">Loading…</div>}
      {error && <div className="sm-shd-state sm-shd-error">Couldn't load /api/signalmap/source-health — {error}</div>}

      {data?.progress && (
        <section className="sm-shd-progress" data-testid="signalmap-shd-progress">
          <div className="sm-shd-progress-head">
            <span className="sm-shd-progress-spinner" aria-hidden />
            <strong>Live ingest in progress</strong>
            <span className="mono">
              {data.progress.currentSource || 'INGESTING'} · {data.progress.articlesProcessed}
              {data.progress.articlesTotal > 0 ? `/${data.progress.articlesTotal}` : ''} articles ·
              {' '}{data.progress.articlesAccepted} accepted · stage={data.progress.stage}
            </span>
          </div>
          {data.progress.articlesTotal > 0 && (
            <div className="sm-shd-progress-bar" aria-hidden>
              <span
                className="sm-shd-progress-fill"
                style={{ width: `${Math.min(100, Math.round(100 * data.progress.articlesProcessed / data.progress.articlesTotal))}%` }}
              />
            </div>
          )}
          {Array.isArray(data.progress.sources) && data.progress.sources.length > 0 && (
            <div className="sm-shd-progress-sources" data-testid="signalmap-shd-progress-sources">
              {data.progress.sources.map((src) => {
                const total = src.fetched > 0 ? src.fetched : 0;
                const pct = total > 0 ? Math.min(100, Math.round((100 * src.processed) / total)) : 0;
                const isCurrent = src.name === data.progress?.currentSource;
                return (
                  <div
                    key={src.name}
                    className={`sm-shd-progress-source ${isCurrent ? 'is-current' : ''}`}
                    data-testid={`signalmap-shd-progress-source-${src.name}`}
                  >
                    <div className="sm-shd-progress-source-head">
                      <span className="sm-shd-progress-source-name">{src.name}</span>
                      <span className="mono sm-shd-progress-source-counts">
                        {src.processed}/{total > 0 ? total : '?'} ·{' '}
                        <span className="pos">✓{src.accepted}</span> ·{' '}
                        <span className={src.rejected > 0 ? 'warn' : 'neut'}>✗{src.rejected}</span>
                      </span>
                    </div>
                    {total > 0 && (
                      <div className="sm-shd-progress-bar sm-shd-progress-bar-sm" aria-hidden>
                        <span className="sm-shd-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {data && rows.length === 0 && (
        <div className="sm-shd-state">No upstream sources reported by collector.</div>
      )}

      {(['radar', 'status', 'news', 'other'] as const).map((domain) => {
        const drows = groupByDomain(domain);
        if (drows.length === 0) return null;
        const title =
          domain === 'radar' ? 'Network Radar'
          : domain === 'status' ? 'Provider Status'
          : domain === 'news' ? 'News Feeds'
          : 'Other';
        return (
          <section key={domain} className="sm-shd-group">
            <h2>{title}</h2>
            <div className="sm-shd-cards">
              {drows.map((row) => {
                const dot = statusDot(row.status);
                return (
                  <article
                    key={row.id}
                    className={`sm-shd-card status-${dot} ${row.flags.isQuiet ? 'quiet' : ''}`}
                    data-testid={`signalmap-shd-card-${row.id}`}
                  >
                    <header className="sm-shd-card-head">
                      <span className={`sm-dot ${dot}`} aria-hidden />
                      <h3>{row.label}</h3>
                      <span className="sm-shd-card-id mono">{row.id}</span>
                      {row.tier && <span className="sm-shd-card-tier mono">T{row.tier}</span>}
                      {row.requiresEnvKey && (
                        <span className="sm-shd-card-key mono" title={`Requires env ${row.requiresEnvKey}`}>
                          🔑 {row.requiresEnvKey}
                        </span>
                      )}
                      {row.flags.isDisabled && (
                        <span className="sm-shd-card-badge mono">DISABLED</span>
                      )}
                      {row.flags.isQuiet && (
                        <span className="sm-shd-card-badge sm-shd-card-badge-quiet mono" title="Fetch ok but 0 accepted in current window">
                          0 accepted
                        </span>
                      )}
                    </header>

                    {row.upstreamUrl && (
                      <div className="sm-shd-card-url">
                        <span className="sm-shd-card-url-label">Upstream:</span>{' '}
                        <a href={row.upstreamUrl} target="_blank" rel="noopener noreferrer" className="mono">
                          {row.upstreamUrl}
                        </a>
                      </div>
                    )}

                    <div className="sm-shd-card-grid">
                      <div className="sm-shd-card-stat">
                        <div className="sm-shd-card-stat-label">Status</div>
                        <div className="sm-shd-card-stat-val">{row.status}</div>
                      </div>
                      <div className="sm-shd-card-stat">
                        <div className="sm-shd-card-stat-label">Last fetched</div>
                        <div className="sm-shd-card-stat-val mono">{relativeAgo(row.fetchedAt)}</div>
                      </div>
                      <div className="sm-shd-card-stat">
                        <div className="sm-shd-card-stat-label">Events</div>
                        <div className="sm-shd-card-stat-val mono">{row.eventCount}</div>
                      </div>
                      {row.counts.fetched !== null && (
                        <div className="sm-shd-card-stat">
                          <div className="sm-shd-card-stat-label">Fetched</div>
                          <div className="sm-shd-card-stat-val mono">{row.counts.fetched}</div>
                        </div>
                      )}
                      {row.counts.accepted !== null && (
                        <div className="sm-shd-card-stat">
                          <div className="sm-shd-card-stat-label">Accepted</div>
                          <div className={`sm-shd-card-stat-val mono ${row.counts.accepted > 0 ? 'pos' : 'neut'}`}>
                            {row.counts.accepted}
                          </div>
                        </div>
                      )}
                      {row.counts.rejected !== null && (
                        <div className="sm-shd-card-stat">
                          <div className="sm-shd-card-stat-label">Rejected</div>
                          <div className={`sm-shd-card-stat-val mono ${row.counts.rejected > 0 ? 'warn' : 'neut'}`}>
                            {row.counts.rejected}
                          </div>
                        </div>
                      )}
                    </div>

                    {row.detail && (
                      <div className="sm-shd-card-detail">
                        <div className="sm-shd-card-detail-label">Detail</div>
                        <div className={`sm-shd-card-detail-text ${row.flags.hasError ? 'err' : ''}`}>
                          {row.detail}
                        </div>
                      </div>
                    )}

                    {row.counts.reasons.length > 0 && (
                      <div className="sm-shd-card-reasons">
                        {row.counts.reasons.map((r, i) => (
                          <span key={i} className="sm-shd-card-reason mono">{r}</span>
                        ))}
                      </div>
                    )}

                    {row.rejections && row.rejections.length > 0 && (
                      <div className="sm-shd-card-rejections" data-testid={`signalmap-shd-rejections-${row.id}`}>
                        <div className="sm-shd-card-rejections-label">Why articles were skipped</div>
                        <div className="sm-shd-card-rejections-list">
                          {row.rejections.map((rej) => {
                            const isLowSig = rej.reason === 'low_signal_confidence';
                            const stats = isLowSig && typeof rej.maxConfidence === 'number' && typeof rej.threshold === 'number'
                              ? `max ${rej.maxConfidence.toFixed(2)} < threshold ${rej.threshold.toFixed(2)} · avg ${rej.avgConfidence?.toFixed(2) ?? '?'}`
                              : null;
                            return (
                              <div
                                key={rej.reason}
                                className={`sm-shd-rejection ${isLowSig ? 'sm-shd-rejection-lowsig' : ''}`}
                                title={rej.explanation}
                              >
                                <span className="sm-shd-rejection-count mono">{rej.count}×</span>
                                <span className="sm-shd-rejection-reason mono">{rej.reason}</span>
                                <span className="sm-shd-rejection-explanation">{rej.explanation}</span>
                                {stats && (
                                  <span className="sm-shd-rejection-stats mono">{stats}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
