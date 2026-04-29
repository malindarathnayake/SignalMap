import { providers as watchedProviders } from '../../state/watchlist.ts';

type ProviderMeta = { id: string; label: string };

const PROVIDER_META: readonly ProviderMeta[] = [
  { id: 'cloudflare', label: 'Cloudflare' },
  { id: 'okta',       label: 'Okta' },
  { id: 'm365',       label: 'Microsoft 365' },
  { id: 'azure',      label: 'Azure' },
  { id: 'wasabi',     label: 'Wasabi' },
];

function toggleProvider(id: string): void {
  const cur = watchedProviders.value;
  watchedProviders.value = cur.includes(id) ? cur.filter(p => p !== id) : [...cur, id];
}

export function ProviderPicker() {
  const watched = watchedProviders.value;

  return (
    <div className="sm-rail-section" data-testid="signalmap-rail-providers">
      <div className="sm-rail-head">
        <span className="eyebrow">My providers</span>
        <span className="sm-rail-meta mono tnum" data-testid="signalmap-rail-providers-count">{watched.length}</span>
      </div>
      <div className="sm-chips">
        {PROVIDER_META.map(p => (
          <button
            key={p.id}
            type="button"
            className={`sm-chip ${watched.includes(p.id) ? 'on' : ''}`}
            aria-pressed={watched.includes(p.id)}
            data-testid={`signalmap-rail-provider-${p.id}`}
            onClick={() => toggleProvider(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
