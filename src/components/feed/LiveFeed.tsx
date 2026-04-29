import { signals } from '../../state/signals.ts';
import {
  categories as activeCategories,
  feedSeverityFilter,
  mainSeverities,
  ALL_SEVERITIES,
  type FeedSeverity,
} from '../../state/filters.ts';
import { regions as watchedRegions } from '../../state/watchlist.ts';
import { eventInRegions } from '../../state/regions.ts';
import { FeedCard } from './FeedCard.tsx';
import { FeedResizer } from './FeedResizer.tsx';

const SEVERITY_LABELS: Record<FeedSeverity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  info: 'Info',
};

function toggleSeverity(sev: FeedSeverity): void {
  const current = mainSeverities.value;
  if (current.includes(sev)) {
    const next = current.filter(s => s !== sev);
    // Always keep at least one severity in the set so "Main" is meaningful
    mainSeverities.value = next.length > 0 ? next : current;
  } else {
    mainSeverities.value = [...current, sev];
  }
}

type Props = { embedded?: boolean };

export function LiveFeed({ embedded = false }: Props = {}) {
  const active = activeCategories.value;
  const sevFilter = feedSeverityFilter.value;
  const mainSet = mainSeverities.value;

  const watchedRegionIds = watchedRegions.value;
  const all = [...signals.value.values()]
    .filter(ev => active.includes(ev.category))
    .filter(ev => eventInRegions(ev, watchedRegionIds))
    .sort((a, b) => b.startedAt - a.startedAt);

  const visible = sevFilter === 'main'
    ? all.filter(ev => mainSet.includes(ev.severity as FeedSeverity))
    : all;

  const mainCount = all.filter(ev => mainSet.includes(ev.severity as FeedSeverity)).length;

  return (
    <section className="sm-feed" data-testid="signalmap-feed" aria-label="Live feed">
      {!embedded && <FeedResizer />}
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

      {sevFilter === 'main' && (
        <div className="sm-feed-sev-row" data-testid="signalmap-feed-sev-row">
          {ALL_SEVERITIES.map(sev => {
            const checked = mainSet.includes(sev);
            return (
              <label key={sev} className={`sm-feed-sev-chip${checked ? ' active' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  data-testid={`signalmap-feed-sev-${sev}`}
                  onChange={() => toggleSeverity(sev)}
                />
                <span>{SEVERITY_LABELS[sev]}</span>
              </label>
            );
          })}
        </div>
      )}

      <div className="sm-feed-list" data-testid="signalmap-feed-list">
        {visible.length === 0 ? (
          <div className="sm-feed-empty" data-testid="signalmap-feed-empty">
            {sevFilter === 'main' && all.length > 0
              ? 'No signals match the selected severities.'
              : 'No active signals match your filters.'}
          </div>
        ) : (
          visible.map(ev => <FeedCard key={ev.id} event={ev} />)
        )}
      </div>
    </section>
  );
}
