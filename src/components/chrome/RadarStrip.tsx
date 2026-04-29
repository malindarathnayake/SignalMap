import { signals } from '../../state/signals.ts';

export function RadarStrip() {
  const all = [...signals.value.values()].filter(s => s.category === 'internet');
  const outages = all.filter(s => s.radarKind === 'outage').length;
  const anomalies = all.filter(s => s.radarKind === 'anomaly').length;
  const has = outages + anomalies > 0;
  const topNames = [...new Set(all.slice(0, 3).map(s => s.locations[0]?.name).filter((n): n is string => !!n))];

  return (
    <section className={`sm-strip ${has ? 'has' : 'calm'}`} data-testid="signalmap-radar-strip">
      <div className="sm-strip-icon">
        {has ? '!' : '✓'}
      </div>
      <div className="sm-strip-main">
        <div className="sm-strip-eyebrow">
          <span className="eyebrow">Cloudflare Radar</span>
          <span className={`sm-mini-status ${has ? 'warn' : 'ok'}`}>
            <span className="sm-dot" />
            {has ? 'Disruptions detected' : 'No active disruptions'}
          </span>
        </div>
        <div className="sm-strip-stats">
          <div className="sm-stat">
            <span className="sm-stat-num mono tnum" data-testid="radar-strip-outages">{outages}</span>
            <span className="sm-stat-label">outages</span>
          </div>
          <div className="sm-stat">
            <span className="sm-stat-num mono tnum" data-testid="radar-strip-anomalies">{anomalies}</span>
            <span className="sm-stat-label">anomalies</span>
          </div>
          {has && topNames.length > 0 && (
            <div className="sm-stat affected">
              <span className="sm-stat-label">Most affected</span>
              <span className="sm-stat-list">{topNames.join(' · ')}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
