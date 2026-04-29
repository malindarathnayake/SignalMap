import { useState } from 'preact/hooks';
import { signals, selectedEventId } from '../../state/signals.ts';
import { watchpoints, type Watchpoint } from '../../state/watchlist.ts';
import { WatchpointsOptions } from './WatchpointsOptions.tsx';

function matchEvents(wp: Watchpoint) {
  const needle = wp.match.toLowerCase();
  return [...signals.value.values()]
    .filter(ev => {
      const locName = ev.locations[0]?.name?.toLowerCase() ?? '';
      return locName.includes(needle);
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function WatchpointsView() {
  const wps = watchpoints.value;
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allMatches = wps.map(wp => ({ wp, matches: matchEvents(wp) }));
  const totalMatches = allMatches.reduce((acc, { matches }) => acc + matches.length, 0);

  return (
    <div className="sm-watchpoints" data-testid="signalmap-watchpoints">
      <div className="sm-insp-head">
        <div className="sm-insp-cat">
          <span className="eyebrow">Watchpoints</span>
          <span className="sm-sev-pill mono tnum" data-testid="signalmap-watchpoints-total">
            {totalMatches}
          </span>
        </div>
        <button
          type="button"
          className="sm-icon-btn"
          data-testid="signalmap-watchpoints-options"
          aria-label="Configure watchpoints"
          title="Configure watchpoints"
          onClick={() => setOptionsOpen(true)}
        >
          ⚙
        </button>
      </div>

      {wps.length === 0 ? (
        <div className="sm-insp-empty">
          <div className="sm-insp-empty-title">No watchpoints configured</div>
          <div className="sm-insp-empty-hint">
            Click the gear icon to add cities or regions you want to monitor.
          </div>
        </div>
      ) : (
        <ul className="sm-watchpoints-list" data-testid="signalmap-watchpoints-list">
          {allMatches.map(({ wp, matches }) => {
            const isExpanded = expandedId === wp.id;
            return (
              <li key={wp.id} className="sm-watchpoint-item">
                <button
                  type="button"
                  className={`sm-watchpoint-row${matches.length > 0 ? ' has-events' : ''}${isExpanded ? ' expanded' : ''}`}
                  data-testid={`signalmap-watchpoint-${wp.id}`}
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : wp.id)}
                >
                  <span className="sm-watchpoint-label">{wp.label}</span>
                  <span
                    className="sm-watchpoint-count mono tnum"
                    data-testid={`signalmap-watchpoint-${wp.id}-count`}
                  >
                    {matches.length}
                  </span>
                  <span className="sm-watchpoint-chevron" aria-hidden>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </button>
                {isExpanded && matches.length > 0 && (
                  <ul className="sm-watchpoint-events">
                    {matches.map(ev => (
                      <li key={ev.id}>
                        <button
                          type="button"
                          className="sm-watchpoint-event"
                          data-testid={`signalmap-watchpoint-event-${ev.id}`}
                          onClick={() => { selectedEventId.value = ev.id; }}
                        >
                          <span
                            className="sm-cat-swatch"
                            style={{ background: `var(--cat-${ev.category})` }}
                          />
                          <span className="sm-watchpoint-event-title">{ev.title}</span>
                          <span className="sm-watchpoint-event-sev mono">{ev.severity}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {isExpanded && matches.length === 0 && (
                  <div className="sm-watchpoint-empty">
                    No active signals near {wp.label}.
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {optionsOpen && <WatchpointsOptions onClose={() => setOptionsOpen(false)} />}
    </div>
  );
}
