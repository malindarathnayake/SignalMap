import { signals, selectedEventId } from '../../state/signals.ts';
import { WhyItMattersTab } from './WhyItMattersTab.tsx';
import { WatchpointsView } from './WatchpointsView.tsx';

export function Inspector() {
  const id = selectedEventId.value;
  const event = id ? signals.value.get(id) : undefined;

  if (!event) {
    return (
      <aside className="sm-inspector empty" data-testid="signalmap-inspector" aria-label="Inspector">
        <div className="sm-insp-empty" data-testid="signalmap-inspector-empty">
          <div className="sm-insp-empty-title">Select a signal</div>
          <div className="sm-insp-empty-hint">
            Click any row in the live feed to inspect the source stack, severity, and location.
          </div>
        </div>
        <WatchpointsView />
      </aside>
    );
  }

  const sevLabel = event.severity.toUpperCase();
  const locName = event.locations[0]?.name ?? '—';

  return (
    <aside className="sm-inspector" data-testid="signalmap-inspector" aria-label="Inspector">
      <div className="sm-insp-head">
        <div className="sm-insp-cat">
          <span className="sm-cat-swatch" style={{ background: `var(--cat-${event.category})` }} />
          <span className="eyebrow">{event.category}</span>
          <span className="sm-sev-pill" data-testid="signalmap-inspector-severity">{sevLabel}</span>
        </div>
        <button
          type="button"
          className="sm-icon-btn"
          data-testid="signalmap-inspector-close"
          aria-label="Close inspector"
          onClick={() => { selectedEventId.value = null; }}
        >
          ×
        </button>
      </div>
      <h2 className="sm-insp-title" data-testid="signalmap-inspector-title">{event.title}</h2>
      <div className="sm-insp-meta">
        <span data-testid="signalmap-inspector-location">{locName}</span>
      </div>
      {event.summary && <p className="sm-insp-summary">{event.summary}</p>}
      {event.sources && event.sources.length > 0 && (
        <div className="sm-insp-event-sources" data-testid="signalmap-inspector-event-sources">
          <span className="eyebrow">Sources</span>
          <ul className="sm-insp-event-sources-list">
            {event.sources.map((s, i) => (
              <li key={`${s.url ?? s.label}-${i}`}>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sm-insp-source-link"
                    data-testid={`signalmap-inspector-event-source-${i}`}
                    title={s.url}
                  >
                    {s.label}
                    <span className="sm-insp-source-ext" aria-hidden> ↗</span>
                  </a>
                ) : (
                  <span>{s.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <WhyItMattersTab />
    </aside>
  );
}
