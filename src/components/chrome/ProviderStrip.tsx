import { signals } from '../../state/signals.ts';
import { providers as watchedProviders } from '../../state/watchlist.ts';

export function ProviderStrip() {
  const provs = [...signals.value.values()].filter(s => s.category === 'provider' && !!s.provider);
  const watched = provs.filter(s => watchedProviders.value.includes(s.provider!));
  const watchedCount = watched.length;
  const globalCount = provs.length - watchedCount;
  const count = provs.length;
  const distinctProviders = [...new Set(provs.map(s => s.provider!))];

  return (
    <section className={`sm-strip ${count > 0 ? 'has' : 'calm'}`} data-testid="signalmap-provider-strip">
      <div className="sm-strip-icon">
        {count > 0 ? '⚠' : '✓'}
      </div>
      <div className="sm-strip-main">
        <div className="sm-strip-eyebrow">
          <span className="eyebrow">Provider Status</span>
          <span className={`sm-mini-status ${count ? 'warn' : 'ok'}`}>
            <span className="sm-dot" />
            {count ? `${count} active incident${count > 1 ? 's' : ''}` : 'All providers healthy'}
          </span>
        </div>
        <div className="sm-strip-stats">
          <div className="sm-stat">
            <span className="sm-stat-num mono tnum" data-testid="provider-strip-watched">{watchedCount}</span>
            <span className="sm-stat-label">in watchlist</span>
          </div>
          <div className="sm-stat">
            <span className="sm-stat-num mono tnum" data-testid="provider-strip-global">{globalCount}</span>
            <span className="sm-stat-label">global</span>
          </div>
          {count > 0 && (
            <div className="sm-stat affected">
              <span className="sm-stat-label">Affected</span>
              <span className="sm-stat-list">{distinctProviders.join(' · ')}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
