import { useEffect, useState } from 'preact/hooks';
import {
  lastRefreshAt,
  refreshing,
  refreshIntervalSec,
  lastRefreshError,
  nextRefreshAt,
  forceRefresh,
} from '../../state/refresh.ts';

function fmtSeconds(s: number): string {
  if (s <= 0) return '0s';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

export function RefreshControl() {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-trigger refresh when countdown hits zero.
  useEffect(() => {
    if (nowMs >= nextRefreshAt() && !refreshing.value) {
      void forceRefresh();
    }
  }, [nowMs]);

  const remaining = Math.max(0, Math.ceil((nextRefreshAt() - nowMs) / 1000));
  const ageSec = Math.max(0, Math.floor((nowMs - lastRefreshAt.value) / 1000));
  const isRefreshing = refreshing.value;
  const errMsg = lastRefreshError.value;

  return (
    <div className="sm-refresh" data-testid="signalmap-refresh">
      <div className="sm-refresh-meta mono" data-testid="signalmap-refresh-meta">
        <span className="sm-refresh-label">Refreshed</span>{' '}
        <span className="sm-refresh-age" data-testid="signalmap-refresh-age">{fmtSeconds(ageSec)} ago</span>
        {' · '}
        <span className="sm-refresh-label">Next</span>{' '}
        <span
          className="sm-refresh-next"
          data-testid="signalmap-refresh-next"
          title={`Auto-refresh every ${refreshIntervalSec.value}s`}
        >
          {fmtSeconds(remaining)}
        </span>
      </div>
      <button
        type="button"
        className={`sm-refresh-btn${isRefreshing ? ' spinning' : ''}`}
        data-testid="signalmap-refresh-button"
        aria-label="Force refresh now"
        title={errMsg ? `Last refresh error: ${errMsg}` : 'Force refresh now'}
        disabled={isRefreshing}
        onClick={() => { void forceRefresh(); }}
      >
        ↻
      </button>
    </div>
  );
}
