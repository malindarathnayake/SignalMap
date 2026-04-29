import type { SignalEvent } from '../../state/signals.ts';
import { selectedEventId } from '../../state/signals.ts';

function fmtAgo(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return `${h}h${mm ? ` ${mm}m` : ''} ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SEV_LABEL: Record<SignalEvent['severity'], string> = {
  critical: 'CRITICAL',
  major: 'MAJOR',
  minor: 'MINOR',
  info: 'INFO',
};

export function FeedCard({ event }: { event: SignalEvent }) {
  const isSelected = selectedEventId.value === event.id;
  const locName = event.locations[0]?.name;

  return (
    <button
      type="button"
      className={`sm-feed-row ${isSelected ? 'selected' : ''}`}
      aria-pressed={isSelected}
      data-testid={`signalmap-feed-card-${event.id}`}
      onClick={() => { selectedEventId.value = event.id; }}
    >
      <div className="sm-feed-rail" style={{ background: `var(--cat-${event.category})` }} />
      <div className="sm-feed-body">
        <div className="sm-feed-meta">
          <span className="sm-feed-cat" style={{ color: `var(--cat-${event.category})` }}>
            <span className="sm-cat-swatch tiny" style={{ background: `var(--cat-${event.category})` }} />
            {event.category}
          </span>
          <span className="sm-feed-ago mono">{fmtAgo(event.startedAt)}</span>
          <span className="sm-feed-sev mono">{SEV_LABEL[event.severity]}</span>
        </div>
        <div className="sm-feed-title" data-testid={`signalmap-feed-card-title-${event.id}`}>
          {event.title}
        </div>
        {locName && (
          <div className="sm-feed-foot">
            <span className="sm-feed-loc">{locName}</span>
          </div>
        )}
      </div>
    </button>
  );
}
