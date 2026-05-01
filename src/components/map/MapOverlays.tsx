import { mappableEvents } from '../../state/signals.ts';
import {
  ALL_MAP_KINDS,
  mapKinds,
  type MapKind,
} from '../../state/filters.ts';

const LEGEND_ITEMS: ReadonlyArray<{ kind: MapKind; label: string; shapeClass: string }> = [
  { kind: 'outage',   label: 'Outage',   shapeClass: 'outage' },
  { kind: 'anomaly',  label: 'Anomaly',  shapeClass: 'anomaly' },
  { kind: 'provider', label: 'Provider', shapeClass: 'diamond' },
  { kind: 'event',    label: 'Event',    shapeClass: 'circle' },
];

function toggleKind(kind: MapKind): void {
  const cur = mapKinds.value;
  mapKinds.value = cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind];
}

function resetKinds(): void {
  mapKinds.value = [...ALL_MAP_KINDS];
}

export function MapOverlays() {
  const N = mappableEvents.value.length;
  const active = mapKinds.value;
  const allActive = active.length === ALL_MAP_KINDS.length;

  return (
    <div className="sm-map-overlays" data-testid="signalmap-map-overlays" aria-hidden="false">
      <div className="sm-map-corner tl" data-testid="signalmap-map-corner-tl">
        <div className="eyebrow">Active</div>
        <div className="sm-map-stats mono tnum" data-testid="signalmap-map-active-count">{N} signals</div>
      </div>
      <div className="sm-map-corner bl" data-testid="signalmap-map-corner-bl">
        <div className="sm-legend-head">
          <span className="eyebrow">Legend</span>
          {!allActive && (
            <button
              type="button"
              className="sm-legend-reset"
              data-testid="signalmap-legend-reset"
              onClick={resetKinds}
              aria-label="Show all marker kinds"
            >
              Show all
            </button>
          )}
        </div>
        {LEGEND_ITEMS.map(({ kind, label, shapeClass }) => {
          const isActive = active.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              className={`sm-legend-item ${isActive ? 'active' : 'muted'}`}
              data-testid={`signalmap-legend-${kind}`}
              aria-pressed={isActive}
              onClick={() => toggleKind(kind)}
              title={isActive ? `Hide ${label.toLowerCase()} markers` : `Show ${label.toLowerCase()} markers`}
            >
              <span className={`sm-legend-shape ${shapeClass}`} />
              <span className="sm-legend-label">{label}</span>
              <span className="sm-legend-hint" />
            </button>
          );
        })}
      </div>
      <div className="sm-map-corner br" data-testid="signalmap-map-corner-br">
        <span className="sm-map-live" data-testid="signalmap-map-live"><span className="sm-map-live-dot" aria-hidden="true" /> LIVE</span>
      </div>
    </div>
  );
}
