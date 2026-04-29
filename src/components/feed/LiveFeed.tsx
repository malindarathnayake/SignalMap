import { signals } from '../../state/signals.ts';
import { categories as activeCategories, feedSeverityFilter } from '../../state/filters.ts';
import { FeedCard } from './FeedCard.tsx';

const MAIN_SEVERITIES = new Set(['critical', 'major']);

export function LiveFeed() {
  const active = activeCategories.value;
  const sevFilter = feedSeverityFilter.value;

  const all = [...signals.value.values()]
    .filter(ev => active.includes(ev.category))
    .sort((a, b) => b.startedAt - a.startedAt);

  const visible = sevFilter === 'main'
    ? all.filter(ev => MAIN_SEVERITIES.has(ev.severity))
    : all;

  const mainCount = all.filter(ev => MAIN_SEVERITIES.has(ev.severity)).length;

  return (
    <section className="sm-feed" data-testid="signalmap-feed" aria-label="Live feed">
      <div className="sm-feed-head">
        <span className="eyebrow">Live feed</span>
        <span className="sm-feed-count mono tnum" data-testid="signalmap-feed-count">{visible.length}</span>
        <div className="sm-feed-actions">
          <button
            type="button"
            className={`sm-feed-action${sevFilter === 'all' ? ' active' : ''}`}
            data-testid="signalmap-feed-action-all"
            aria-pressed={sevFilter === 'all'}
            onClick={() => { feedSeverityFilter.value = 'all'; }}
          >
            All {all.length}
          </button>
          <button
            type="button"
            className={`sm-feed-action${sevFilter === 'main' ? ' active' : ''}`}
            data-testid="signalmap-feed-action-main"
            aria-pressed={sevFilter === 'main'}
            onClick={() => { feedSeverityFilter.value = 'main'; }}
          >
            Main {mainCount}
          </button>
        </div>
      </div>
      <div className="sm-feed-list" data-testid="signalmap-feed-list">
        {visible.length === 0 ? (
          <div className="sm-feed-empty" data-testid="signalmap-feed-empty">
            {sevFilter === 'main' && all.length > 0
              ? 'No critical or major signals right now.'
              : 'No active signals match your filters.'}
          </div>
        ) : (
          visible.map(ev => <FeedCard key={ev.id} event={ev} />)
        )}
      </div>
    </section>
  );
}
