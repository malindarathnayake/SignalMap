import { mapControls } from '../../state/watchlist.ts';
import type { MapControlsState } from '../../state/watchlist.ts';

function set<K extends keyof MapControlsState>(
  key: K,
  value: MapControlsState[K],
): void {
  mapControls.value = { ...mapControls.value, [key]: value };
}

export function MapControls() {
  const mc = mapControls.value;

  return (
    <div className="sm-rail-section" data-testid="signalmap-rail-map-controls">
      <div className="sm-rail-head">
        <span className="eyebrow">Map controls</span>
      </div>
      <div className="sm-controls">
        <label className="sm-control-row">
          <span>Confidence</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={mc.minConfidence}
            data-testid="signalmap-rail-confidence"
            onInput={e => set('minConfidence', Number((e.currentTarget as HTMLInputElement).value))}
          />
          <span className="mono tnum" data-testid="signalmap-rail-confidence-value">
            {Math.round(mc.minConfidence * 100)}%
          </span>
        </label>

        <label className="sm-control-toggle">
          <input
            type="checkbox"
            checked={mc.showCables}
            data-testid="signalmap-rail-cables"
            onChange={e => set('showCables', (e.currentTarget as HTMLInputElement).checked)}
          />
          <span>Subsea cables</span>
          <span className="sm-control-hint">on incident</span>
        </label>

        <label className="sm-control-toggle">
          <input
            type="checkbox"
            checked={mc.showDatacenters}
            data-testid="signalmap-rail-datacenters"
            onChange={e => set('showDatacenters', (e.currentTarget as HTMLInputElement).checked)}
          />
          <span>Datacenters</span>
          <span className="sm-control-hint">on incident</span>
        </label>

        <label className="sm-control-toggle">
          <input
            type="checkbox"
            checked={mc.cluster}
            data-testid="signalmap-rail-cluster"
            onChange={e => set('cluster', (e.currentTarget as HTMLInputElement).checked)}
          />
          <span>Cluster nearby</span>
        </label>
      </div>
    </div>
  );
}
