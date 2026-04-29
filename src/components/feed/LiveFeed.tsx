import { signals } from '../../state/signals.ts';
import { categories as activeCategories } from '../../state/filters.ts';
import { FeedCard } from './FeedCard.tsx';

export function LiveFeed() {
  const active = activeCategories.value;
  const visible = [...signals.value.values()]
    .filter(ev => active.includes(ev.category))
    .sort((a, b) => b.startedAt - a.startedAt);

  return (
    <section className="sm-feed" data-testid="signalmap-feed" aria-label="Live feed">
      <div className="sm-feed-head">
        <span className="eyebrow">Live feed</span>
        <span className="sm-feed-count mono tnum" data-testid="signalmap-feed-count">{visible.length}</span>
      </div>
      <div className="sm-feed-list" data-testid="signalmap-feed-list">
        {visible.length === 0 ? (
          <div className="sm-feed-empty" data-testid="signalmap-feed-empty">No active signals match your filters.</div>
        ) : (
          visible.map(ev => <FeedCard key={ev.id} event={ev} />)
        )}
      </div>
    </section>
  );
}
