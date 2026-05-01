import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { globalBrief, globalBriefLoading, globalBriefError, fetchGlobalBrief, subscribeBriefUpdates } from '../../state/brief.ts';
import { regions as watchedRegions, providers as watchedProviders } from '../../state/watchlist.ts';
import { persist } from '../../state/persist.ts';

const briefCollapsed = persist(signal<boolean>(false), 'signalmap-brief-collapsed');

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Render brief sources as clickable chips. Show first 5 inline; collapse the
// rest into a single "+N more" chip whose title attribute lists them all
// (cheap progressive disclosure without an extra render-path/state machine).
const SOURCE_CHIP_LIMIT = 5;
function BriefSourceChips({ sources }: { sources: ReadonlyArray<{ label: string; url: string }> }) {
  const visible = sources.slice(0, SOURCE_CHIP_LIMIT);
  const overflow = sources.slice(SOURCE_CHIP_LIMIT);
  return (
    <span className="sm-brief-sources" data-testid="signalmap-brief-sources">
      <span className="sm-brief-sources-label">Sources:</span>
      <span className="sm-brief-sources-chips">
        {visible.map((s, i) => (
          <a
            key={`${s.url}-${i}`}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="sm-brief-source-chip"
            data-testid={`signalmap-brief-source-${i}`}
            title={s.url}
          >
            {s.label}
          </a>
        ))}
        {overflow.length > 0 && (
          <span
            className="sm-brief-source-chip sm-brief-source-chip-more"
            data-testid="signalmap-brief-source-more"
            title={overflow.map((s) => `${s.label} ${s.url}`).join('\n')}
          >
            +{overflow.length} more
          </span>
        )}
      </span>
    </span>
  );
}

function emphasizeBullet(text: string, watched: string[]): preact.ComponentChildren {
  if (watched.length === 0) return text;
  const lower = text.toLowerCase();
  for (const term of watched) {
    if (!term) continue;
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1) {
      return (
        <>
          {text.slice(0, idx)}
          <strong>{text.slice(idx, idx + term.length)}</strong>
          {text.slice(idx + term.length)}
        </>
      );
    }
  }
  return text;
}

export function BriefStrip() {
  const [refreshStatus, setRefreshStatus] = useState<string>('');
  // Note: same-tab localStorage.setItem doesn't fire the 'storage' event natively;
  // only cross-tab writes do. For same-tab paste flows a manual dispatchEvent is needed.
  const [adminToken, setAdminToken] = useState<string | null>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('signalmap_admin_token') : null
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'signalmap_admin_token' || e.key === null) {
        setAdminToken(localStorage.getItem('signalmap_admin_token'));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    void fetchGlobalBrief();
    const teardown = subscribeBriefUpdates();
    return teardown;
  }, []);

  const brief = globalBrief.value;
  const loading = globalBriefLoading.value;
  const error = globalBriefError.value;
  const collapsed = briefCollapsed.value;

  const watchedTerms = [
    ...(watchedRegions.value ?? []),
    ...(watchedProviders.value ?? []),
  ];

  async function onRefresh() {
    if (!adminToken) return;
    setRefreshStatus('Refreshing…');
    try {
      const res = await fetch('/api/signalmap/brief/refresh', {
        method: 'POST',
        headers: { 'X-SignalMap-Admin-Token': adminToken },
      });
      if (res.ok) {
        await fetchGlobalBrief();
        setRefreshStatus('Refreshed.');
      } else {
        setRefreshStatus(`Error: HTTP ${res.status}`);
      }
    } catch (err) {
      setRefreshStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function toggleCollapse() {
    briefCollapsed.value = !briefCollapsed.value;
  }

  const bulletCount = brief?.bullets.length ?? 0;
  const updatedLabel = brief?.generatedAt ? relativeTime(brief.generatedAt) : '';

  return (
    <section
      className={`sm-brief-strip${collapsed ? ' collapsed' : ''}`}
      data-testid="signalmap-brief-strip"
      aria-label="Brief strip"
    >
      <div className="sm-brief-head">
        <span className="eyebrow">Briefing</span>
        {collapsed && bulletCount > 0 && (
          <span className="sm-brief-summary mono">
            {bulletCount} {bulletCount === 1 ? 'bullet' : 'bullets'}
            {updatedLabel ? ` · updated ${updatedLabel}` : ''}
          </span>
        )}
        <button
          type="button"
          className="sm-brief-toggle"
          data-testid="signalmap-brief-toggle"
          aria-expanded={!collapsed}
          aria-controls="signalmap-brief-body"
          onClick={toggleCollapse}
          title={collapsed ? 'Expand briefing' : 'Collapse briefing'}
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </div>

      {!collapsed && (
        <div id="signalmap-brief-body" className="sm-brief-body">
          {loading && !brief && (
            <span className="sm-brief-strip-loading mono" data-testid="signalmap-brief-strip-loading">
              Loading…
            </span>
          )}

          {error && !brief && (
            <span data-testid="signalmap-brief-strip-error" className="mono sm-brief-error">
              Brief unavailable: {error}
            </span>
          )}

          {brief && brief.bullets.length === 0 && (
            <span data-testid="signalmap-brief-strip-empty" className="mono">
              No brief yet — first cron run pending.
            </span>
          )}

          {brief && brief.bullets.length > 0 && (
            <ul className="sm-brief-bullets">
              {brief.bullets.map((bullet, i) => (
                <li key={i}>
                  <span data-testid="signalmap-brief-bullet">
                    {emphasizeBullet(bullet, watchedTerms)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {brief && (
            <div className="sm-brief-meta">
              {brief.generatedAt && (
                <span className="sm-brief-updated">Updated {relativeTime(brief.generatedAt)}</span>
              )}
              {brief.sources.length > 0 && (
                <BriefSourceChips sources={brief.sources} />
              )}
            </div>
          )}

          {adminToken && (
            <div className="sm-brief-actions">
              <button
                type="button"
                className="sm-btn"
                data-testid="signalmap-brief-refresh"
                onClick={() => void onRefresh()}
              >
                Refresh now
              </button>
              {refreshStatus && (
                <span
                  data-testid="signalmap-brief-refresh-status"
                  aria-live="polite"
                  className="sm-brief-refresh-status"
                >
                  {refreshStatus}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
