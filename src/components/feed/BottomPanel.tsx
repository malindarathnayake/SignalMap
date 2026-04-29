import { signals } from '../../state/signals.ts';
import {
  categories as activeCategories,
  feedSeverityFilter,
  mainSeverities,
  type FeedSeverity,
} from '../../state/filters.ts';
import { bottomPanelTab } from '../../state/cameras.ts';
import { FeedResizer } from './FeedResizer.tsx';
import { LiveFeed } from './LiveFeed.tsx';
import { LiveCameras } from './LiveCameras.tsx';

export function BottomPanel() {
  const tab = bottomPanelTab.value;

  // Counts for badges. Cheap derive at render time — small N (<=50 events).
  const all = [...signals.value.values()].filter(ev => activeCategories.value.includes(ev.category));
  const sevFilter = feedSeverityFilter.value;
  const mainSet = mainSeverities.value;
  const visibleFeed = sevFilter === 'main'
    ? all.filter(ev => mainSet.includes(ev.severity as FeedSeverity))
    : all;

  return (
    <section
      className="sm-bottom-panel"
      data-testid="signalmap-bottom-panel"
      aria-label="Bottom panel"
    >
      <FeedResizer />
      <div className="sm-bottom-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`sm-bottom-tab${tab === 'feed' ? ' active' : ''}`}
          data-testid="signalmap-bottom-tab-feed"
          aria-selected={tab === 'feed'}
          onClick={() => { bottomPanelTab.value = 'feed'; }}
        >
          <span className="eyebrow">Live feed</span>
          <span className="sm-feed-count mono tnum">{visibleFeed.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className={`sm-bottom-tab${tab === 'cameras' ? ' active' : ''}`}
          data-testid="signalmap-bottom-tab-cameras"
          aria-selected={tab === 'cameras'}
          onClick={() => { bottomPanelTab.value = 'cameras'; }}
        >
          <span className="eyebrow">Live cameras</span>
        </button>
      </div>
      <div className="sm-bottom-body">
        {tab === 'feed' ? <LiveFeed embedded /> : <LiveCameras />}
      </div>
    </section>
  );
}
