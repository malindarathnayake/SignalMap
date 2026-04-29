import { regions as watchedRegions } from '../../state/watchlist.ts';

type RegionMeta = { id: string; label: string; kind?: 'cloud' };

const REGION_META: readonly RegionMeta[] = [
  { id: 'global', label: 'Global' },
  { id: 'na',     label: 'North America' },
  { id: 'eu',     label: 'Europe' },
  { id: 'mena',   label: 'MENA' },
  { id: 'apac',   label: 'Asia-Pacific' },
  { id: 'sa',     label: 'South Asia' },
  { id: 'af',     label: 'Africa' },
  { id: 'latam',  label: 'South America' },
  { id: 'azure-eus',    label: 'Azure East US',         kind: 'cloud' },
  { id: 'azure-weu',    label: 'Azure West Europe',     kind: 'cloud' },
  { id: 'azure-jpe',    label: 'Azure Japan East',      kind: 'cloud' },
  { id: 'wasabi-euw1',  label: 'Wasabi EU-West-1',      kind: 'cloud' },
  { id: 'wasabi-apse1', label: 'Wasabi AP-Southeast-1', kind: 'cloud' },
];

function toggleRegion(id: string): void {
  const cur = watchedRegions.value;
  watchedRegions.value = cur.includes(id) ? cur.filter(r => r !== id) : [...cur, id];
}

export function RegionPicker() {
  const watched = watchedRegions.value;
  const standard = REGION_META.filter(r => !r.kind);
  const cloud = REGION_META.filter(r => r.kind === 'cloud');

  return (
    <div className="sm-rail-section" data-testid="signalmap-rail-regions">
      <div className="sm-rail-head">
        <span className="eyebrow">My regions</span>
        <span className="sm-rail-meta mono tnum" data-testid="signalmap-rail-regions-count">{watched.length}</span>
      </div>
      <div className="sm-chips">
        {standard.map(r => (
          <button
            key={r.id}
            type="button"
            className={`sm-chip ${watched.includes(r.id) ? 'on' : ''}`}
            aria-pressed={watched.includes(r.id)}
            data-testid={`signalmap-rail-region-${r.id}`}
            onClick={() => toggleRegion(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <details className="sm-cloud">
        <summary>Cloud regions</summary>
        <div className="sm-chips dense">
          {cloud.map(r => (
            <button
              key={r.id}
              type="button"
              className={`sm-chip mono ${watched.includes(r.id) ? 'on' : ''}`}
              aria-pressed={watched.includes(r.id)}
              data-testid={`signalmap-rail-region-${r.id}`}
              onClick={() => toggleRegion(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
