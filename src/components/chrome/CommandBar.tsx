import { useSignal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { query, timeRange, TIME_RANGES } from '../../state/filters.ts';
import { RefreshControl } from './RefreshControl.tsx';
import { HealthPanel } from './HealthPanel.tsx';

// Live-progress poller — surfaces a small "INGESTING" badge on the HEALTH
// pill while the collector is mid-tick so users get feedback during the
// 3-7 minute news pass instead of staring at static UI. Polls every 5s
// session-wide (cheap; api just reads one Redis key).
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

// Tight per-source label used in the header ingest pill — keeps width
// bounded so the pill doesn't push the rest of the chrome offscreen.
function shortSourceName(name: string): string {
  if (!name) return '';
  if (/^the hacker news$/i.test(name)) return 'HN';
  if (/^dark reading$/i.test(name)) return 'DR';
  if (/^newsapi$/i.test(name)) return 'NewsAPI';
  return name.length > 12 ? name.slice(0, 11) + '…' : name;
}

// Live source-health row from /api/signalmap/source-health. Replaces the
// fixture MOCK_SOURCES so the popover reflects what the collector actually
// reaches. Sources without a real upstream are simply omitted (better than
// claiming "healthy 178ms" for a 401 endpoint).
interface LiveSource {
  id: string;
  label: string;
  status: 'ok' | 'degraded' | 'down' | 'stale' | 'disabled' | string;
  fetchedAt?: number;
  eventCount?: number;
  detail?: string;
  tier?: 1 | 2 | number;
  latencyMs?: number;
}

function liveSourceStatus(s: LiveSource): SourceStatus {
  if (s.status === 'ok') return 'ok';
  if (s.status === 'degraded') return 'degraded';
  return 'stale';
}

// Categorize a leaf-source id into a domain so the popover can group rows.
// 'news:foo' → news, 'provider-status:foo' → status, 'cloudflare-radar' → radar.
function sourceDomain(id: string): 'news' | 'status' | 'radar' | 'other' {
  if (id.startsWith('news:')) return 'news';
  if (id.startsWith('provider-status:') || id.endsWith('-status')) return 'status';
  if (id === 'cloudflare-radar' || id.startsWith('radar:')) return 'radar';
  return 'other';
}

// Parse the detail string ("fetched 100; accepted 5; skipped 1; ...") that
// the collector writes for news sources, so the popover can render counts
// in their own columns instead of jamming everything into a long string.
interface DetailCounts {
  fetched: number | null;
  accepted: number | null;
  skipped: number | null;
  reasons: string;
}
function parseDetailCounts(detail: string | undefined): DetailCounts {
  const result: DetailCounts = { fetched: null, accepted: null, skipped: null, reasons: '' };
  if (!detail) return result;
  const fetched = /fetched\s+(\d+)/i.exec(detail);
  const accepted = /accepted\s+(\d+)/i.exec(detail);
  const skipped = /skipped\s+(\d+)/i.exec(detail);
  if (fetched?.[1]) result.fetched = Number(fetched[1]);
  if (accepted?.[1]) result.accepted = Number(accepted[1]);
  if (skipped?.[1]) result.skipped = Number(skipped[1]);
  // Anything after the last numeric clause is the reason tail.
  const tail = detail.replace(/^[^;]*;?\s*/, '').replace(/(fetched|accepted|skipped)\s+\d+;?\s*/gi, '').trim();
  result.reasons = tail.replace(/^[.;,\s]+|[.;,\s]+$/g, '');
  return result;
}

// Sources that REQUIRE an env key to function. The popover surfaces a
// "🔑 needs key" badge when the env var isn't visible to the api/collector
// (we can't read process.env from the SPA, so this is a conservative
// "the source is wired but might be silent if your env is missing"
// indicator — operator should check the collector container env).
const KEY_REQUIRED_SOURCES: Record<string, string> = {
  'news:newsapi': 'NEWSAPI_API_KEY',
  // OpenRouter / Perplexity are server-side only — not in this list.
};

type SourceStatus = 'ok' | 'degraded' | 'stale';
type SourceHealth = { id: string; label: string; tier: 1 | 2; status: SourceStatus; latencyMs: number };

const MOCK_SOURCES: readonly SourceHealth[] = [
  { id: 'radar', label: 'Cloudflare Radar', tier: 1, status: 'ok', latencyMs: 42 },
  { id: 'cf-status', label: 'Cloudflare Status', tier: 1, status: 'ok', latencyMs: 88 },
  { id: 'okta-status', label: 'Okta Status RSS', tier: 1, status: 'ok', latencyMs: 121 },
  { id: 'm365-health', label: 'Microsoft Service Health', tier: 1, status: 'degraded', latencyMs: 612 },
  { id: 'azure-status', label: 'Azure Status RSS', tier: 1, status: 'ok', latencyMs: 198 },
  { id: 'openai-status', label: 'OpenAI Status', tier: 1, status: 'ok', latencyMs: 165 },
  { id: 'claude-status', label: 'Anthropic Status', tier: 1, status: 'ok', latencyMs: 142 },
  { id: 'aws-lambda-use1', label: 'AWS Lambda — us-east-1', tier: 1, status: 'ok', latencyMs: 178 },
  { id: 'aws-lambda-use2', label: 'AWS Lambda — us-east-2', tier: 1, status: 'ok', latencyMs: 184 },
  { id: 'aws-rds-use1', label: 'AWS RDS — us-east-1', tier: 1, status: 'ok', latencyMs: 192 },
  { id: 'aws-s3-use1', label: 'AWS S3 — us-east-1', tier: 1, status: 'ok', latencyMs: 156 },
  { id: 'gdelt', label: 'GDELT', tier: 2, status: 'ok', latencyMs: 410 },
  { id: 'rss-tier2', label: 'RSS / Tier-2 News', tier: 2, status: 'stale', latencyMs: 2400 },
];

function statusLabel(status: SourceStatus): string {
  if (status === 'ok') return 'healthy';
  if (status === 'degraded') return 'degraded';
  return 'stale';
}

function relativeMsAgo(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function dotClass(status: SourceStatus): string {
  if (status === 'ok') return 'ok';
  if (status === 'degraded') return 'warn';
  return 'stale';
}

export function CommandBar() {
  const popOpen = useSignal(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [progress, setProgress] = useState<CollectorProgress | null>(null);
  const [liveSources, setLiveSources] = useState<LiveSource[] | null>(null);

  // Single poller does double duty: pulls progress (ingestion indicator) AND
  // sourceHealth rows (popover content) from /api/signalmap/source-health.
  // Falls back to MOCK_SOURCES only if the api never responds (build-only
  // / fixture mode). Real cold start = live rows within 5s of compose up.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const r = await fetch('/api/signalmap/source-health', { cache: 'no-store' });
        if (!r.ok) {
          if (!cancelled) {
            setProgress(null);
            // Don't blank out the cached source rows on a transient error.
          }
        } else {
          const j = (await r.json()) as {
            progress?: CollectorProgress | null;
            sourceHealth?: unknown[];
          };
          if (!cancelled) {
            setProgress(j.progress ?? null);
            // Filter to leaf-level rows (skip the umbrella `news` and
            // `provider-status` aggregates) so the popover lists actual
            // upstream feeds.
            const leaves = (j.sourceHealth ?? [])
              .filter((s): s is LiveSource =>
                s !== null &&
                typeof s === 'object' &&
                typeof (s as { id?: unknown }).id === 'string' &&
                ((s as { id: string }).id.includes(':')
                  || (s as { id: string }).id === 'cloudflare-radar'),
              );
            setLiveSources(leaves);
          }
        }
      } catch {
        if (!cancelled) setProgress(null);
      }
      if (!cancelled) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Display rows: prefer live, fall back to MOCK_SOURCES only if the api
  // never responded (e.g. fixture/static-image-only mode).
  const displayRows: Array<{ id: string; label: string; status: SourceStatus; tier: 1 | 2; latencyMs: number; detail?: string }> =
    liveSources !== null
      ? liveSources.map(s => ({
          id: s.id,
          label: s.label,
          status: liveSourceStatus(s),
          tier: (s.tier === 2 ? 2 : 1) as 1 | 2,
          latencyMs: typeof s.latencyMs === 'number' ? s.latencyMs : 0,
          detail: s.detail,
        }))
      : MOCK_SOURCES.map(s => ({ ...s }));

  const ok = displayRows.filter(s => s.status === 'ok').length;
  const total = displayRows.length;
  const issues = displayRows.filter(s => s.status !== 'ok').length;

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
        <div className="sm-brand-build mono">v4.1.1 · LIVE</div>
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

        {/* Refresh countdown + force-refresh button */}
        <RefreshControl />

        {/* Live-ingesting indicator — visible only while collector is mid-tick.
            When the collector reports per-source counts (>=2 sources seen),
            shows a compact breakdown like "HN 8/12 · DR 4/9 · NewsAPI 2/5"
            so users see ALL active sources at once, not just whichever is
            currently being parsed. Falls back to the global counts when only
            one source is in flight. */}
        {progress && (() => {
          const allSources = Array.isArray(progress.sources) ? progress.sources : [];
          const activeSources = allSources.filter(
            (s) => s.fetched > 0 || s.processed > 0 || s.accepted > 0,
          );
          const showBreakdown = activeSources.length >= 2;
          const titleLines = activeSources.length > 0
            ? activeSources.map((s) =>
                `${s.name}: ${s.processed}/${s.fetched > 0 ? s.fetched : '?'} processed, ${s.accepted} accepted, ${s.rejected} rejected`,
              ).join('\n')
            : `Ingesting${progress.currentSource ? ' from ' + progress.currentSource : ''} · stage=${progress.stage}`;
          return (
            <div
              className="sm-ingest-pill"
              data-testid="signalmap-ingest-pill"
              role="status"
              aria-live="polite"
              title={titleLines}
            >
              <span className="sm-ingest-spinner" aria-hidden />
              {showBreakdown ? (
                <span className="sm-ingest-stats mono">
                  {activeSources.slice(0, 4).map((s, idx) => {
                    const total = s.fetched > 0 ? s.fetched : 0;
                    const isCurrent = s.name === progress.currentSource;
                    return (
                      <span
                        key={s.name}
                        className={`sm-ingest-src ${isCurrent ? 'is-current' : ''}`}
                        data-testid={`signalmap-ingest-src-${s.name}`}
                      >
                        {idx > 0 ? <span className="sm-ingest-sep"> · </span> : null}
                        {shortSourceName(s.name)} {s.processed}
                        {total > 0 ? `/${total}` : ''}
                        <span className="sm-ingest-ok"> ✓{s.accepted}</span>
                      </span>
                    );
                  })}
                </span>
              ) : (
                <>
                  <span className="sm-ingest-label mono">
                    {progress.currentSource || 'INGESTING'}
                  </span>
                  <span className="sm-ingest-stats mono">
                    {progress.articlesProcessed}
                    {progress.articlesTotal > 0 ? `/${progress.articlesTotal}` : ''}
                    {' · '}
                    {progress.articlesAccepted} ok
                  </span>
                </>
              )}
            </div>
          );
        })()}

        {/* Health panel button — opens a modal with Redis / LanceDB /
            collector / brief / OpenRouter / Perplexity status */}
        <button
          className="sm-pill"
          data-testid="signalmap-health-pill"
          aria-label="System health"
          title="System health"
          onClick={() => setHealthOpen(true)}
        >
          <span className="sm-dot ok" />
          <span className="sm-pill-label">health</span>
        </button>

        {healthOpen && <HealthPanel onClose={() => setHealthOpen(false)} />}

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

        {/* Source health popover — structured by domain (status / news / radar)
            so a broken feed jumps out. Each row shows status dot + label + key
            badge if the source needs an env key + counts (fetched/accepted/
            rejected) in their own columns + last-seen relative time. */}
        {popOpen.value && (
          <>
            <div className="sm-pop-scrim" onClick={() => { popOpen.value = false; }} />
            <div className="sm-pop sm-pop-sources" data-testid="signalmap-source-popover">
              <div className="sm-pop-head">
                <span className="eyebrow">Source health</span>
                <button
                  type="button"
                  className="sm-pop-close"
                  aria-label="Close"
                  onClick={() => { popOpen.value = false; }}
                >×</button>
              </div>
              <div className="sm-pop-body">
                {liveSources === null && (
                  <div className="sm-source-empty">Loading source health…</div>
                )}
                {liveSources !== null && liveSources.length === 0 && (
                  <div className="sm-source-empty">No live sources reported by the collector yet.</div>
                )}
                {liveSources !== null && liveSources.length > 0 && (
                  <>
                    {(['radar', 'status', 'news', 'other'] as const).map((domain) => {
                      const rows = liveSources.filter(s => sourceDomain(s.id) === domain);
                      if (rows.length === 0) return null;
                      const groupLabel =
                        domain === 'status' ? 'Provider status'
                        : domain === 'news' ? 'News feeds'
                        : domain === 'radar' ? 'Network radar'
                        : 'Other';
                      return (
                        <div key={domain} className="sm-source-group">
                          <div className="sm-source-group-head eyebrow">{groupLabel}</div>
                          {rows.map((s) => {
                            const counts = parseDetailCounts(s.detail);
                            const dot = liveSourceStatus(s);
                            const tier = s.tier === 2 ? 2 : 1;
                            const isDisabled = s.status === 'disabled';
                            const needsKey = Object.hasOwn(KEY_REQUIRED_SOURCES, s.id);
                            const isNoEvents =
                              dot === 'ok'
                              && counts.fetched !== null
                              && counts.fetched > 0
                              && counts.accepted === 0;
                            const hasError = /error|fail|invalid|timeout|http_\d+/i.test(s.detail ?? '');
                            const lastFetched = s.fetchedAt && s.fetchedAt > 0
                              ? relativeMsAgo(Date.now() - s.fetchedAt)
                              : '';
                            return (
                              <div
                                key={s.id}
                                className={`sm-source-row ${isDisabled ? 'disabled' : ''} ${isNoEvents ? 'no-events' : ''} ${hasError ? 'has-error' : ''}`}
                                data-testid="signalmap-source-row"
                                title={s.detail ?? ''}
                              >
                                <span className={`sm-dot ${dot === 'ok' ? 'ok' : dot === 'degraded' ? 'warn' : 'stale'}`} />
                                <div className="sm-source-name">
                                  {s.label}
                                  <span className="sm-tier">T{tier}</span>
                                  {needsKey && (
                                    <span
                                      className="sm-source-badge sm-source-badge-key"
                                      title={`Requires ${KEY_REQUIRED_SOURCES[s.id]} in collector env`}
                                    >🔑</span>
                                  )}
                                  {isDisabled && (
                                    <span className="sm-source-badge sm-source-badge-disabled">disabled</span>
                                  )}
                                  {isNoEvents && (
                                    <span className="sm-source-badge sm-source-badge-quiet" title="Fetch ok but 0 accepted in this window">quiet</span>
                                  )}
                                </div>
                                <div className="sm-source-counts mono tnum">
                                  {counts.fetched !== null && (
                                    <span title="Fetched">{counts.fetched}↓</span>
                                  )}
                                  {counts.accepted !== null && (
                                    <span title="Accepted" className={counts.accepted > 0 ? 'sm-count-ok' : 'sm-count-zero'}>
                                      {counts.accepted}✓
                                    </span>
                                  )}
                                  {counts.skipped !== null && counts.skipped > 0 && (
                                    <span title="Rejected" className="sm-count-warn">{counts.skipped}✗</span>
                                  )}
                                  {counts.fetched === null && (
                                    <span className="sm-source-events-fallback">{s.eventCount ?? 0} ev</span>
                                  )}
                                </div>
                                <div className="sm-source-meta mono">{lastFetched}</div>
                                {hasError && counts.reasons && (
                                  <div className="sm-source-reasons mono">{counts.reasons}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
              <div className="sm-pop-foot mono">
                <span>Counts: ↓ fetched · ✓ accepted · ✗ rejected</span>
                <a
                  href="/source-health-details"
                  className="sm-pop-foot-link"
                  data-testid="signalmap-source-details-link"
                >View details →</a>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
