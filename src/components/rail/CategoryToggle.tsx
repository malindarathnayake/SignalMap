import { categories as activeCategories } from '../../state/filters.ts';
import { signals } from '../../state/signals.ts';

type CategoryMeta = { id: string; label: string; color: string };

const CATEGORY_META: readonly CategoryMeta[] = [
  { id: 'internet',    label: 'Internet Health', color: 'var(--cat-internet)' },
  { id: 'provider',    label: 'Provider Status', color: 'var(--cat-provider)' },
  { id: 'geopolitics', label: 'GeoPolitics',     color: 'var(--cat-geopolitics)' },
  { id: 'conflict',    label: 'Conflict',        color: 'var(--cat-conflict)' },
  { id: 'finance',     label: 'Finance',         color: 'var(--cat-finance)' },
  { id: 'technology',  label: 'Technology',      color: 'var(--cat-technology)' },
  { id: 'cyber',       label: 'Cyber',           color: 'var(--cat-cyber)' },
  { id: 'climate',     label: 'Climate',         color: 'var(--cat-climate)' },
  { id: 'health',      label: 'Health',          color: 'var(--cat-health)' },
  { id: 'energy',      label: 'Energy',          color: 'var(--cat-energy)' },
  { id: 'supply',      label: 'Supply Chain',    color: 'var(--cat-supply)' },
  { id: 'infra',       label: 'Infrastructure',  color: 'var(--cat-infra)' },
];

function toggleCategory(id: string): void {
  const cur = activeCategories.value;
  activeCategories.value = cur.includes(id) ? cur.filter(c => c !== id) : [...cur, id];
}

function toggleAll(): void {
  const all = CATEGORY_META.map(c => c.id);
  activeCategories.value = activeCategories.value.length === all.length ? [] : all;
}

export function CategoryToggle() {
  const active = activeCategories.value;
  const allActive = active.length === CATEGORY_META.length;

  // Counts derived from the mocked signals Map (Phase 4b).
  const counts: Record<string, number> = {};
  for (const ev of signals.value.values()) {
    counts[ev.category] = (counts[ev.category] ?? 0) + 1;
  }

  return (
    <div className="sm-rail-section" data-testid="signalmap-rail-categories">
      <div className="sm-rail-head">
        <span className="eyebrow">Signal layers</span>
        <button
          className="sm-rail-action"
          data-testid="signalmap-rail-categories-toggle-all"
          onClick={toggleAll}
        >
          {allActive ? 'None' : 'All'}
        </button>
      </div>
      <div className="sm-cat-list">
        {CATEGORY_META.map(cat => {
          const isActive = active.includes(cat.id);
          const n = counts[cat.id] ?? 0;
          return (
            <button
              key={cat.id}
              type="button"
              className={`sm-cat-row ${isActive ? 'active' : ''} ${n === 0 ? 'empty' : ''}`}
              aria-pressed={isActive}
              data-testid={`signalmap-rail-category-${cat.id}`}
              onClick={() => toggleCategory(cat.id)}
            >
              <span className="sm-cat-swatch" style={{ background: cat.color }} />
              <span className="sm-cat-label">{cat.label}</span>
              <span className="sm-cat-count mono tnum">{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
