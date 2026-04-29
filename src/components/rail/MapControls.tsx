import {
  mapControls,
  readOverlayLevel,
  OVERLAY_LEVELS,
  OVERLAY_LEVEL_LABELS,
  type MapControlsState,
  type MapOverlayLevel,
} from '../../state/watchlist.ts';

function set<K extends keyof MapControlsState>(
  key: K,
  value: MapControlsState[K],
): void {
  mapControls.value = { ...mapControls.value, [key]: value };
}

function OverlayLevelControl({
  testIdPrefix,
  value,
  onChange,
}: {
  testIdPrefix: string;
  value: MapOverlayLevel;
  onChange: (next: MapOverlayLevel) => void;
}) {
  return (
    <div className="sm-segment" role="group" data-testid={`${testIdPrefix}-segment`}>
      {OVERLAY_LEVELS.map(lvl => (
        <button
          key={lvl}
          type="button"
          className={`sm-segment-btn${value === lvl ? ' active' : ''}`}
          data-testid={`${testIdPrefix}-${lvl}`}
          aria-pressed={value === lvl}
          onClick={() => onChange(lvl)}
        >
          {OVERLAY_LEVEL_LABELS[lvl]}
        </button>
      ))}
    </div>
  );
}

export function MapControls() {
  const mc = mapControls.value;
  const cablesLevel = readOverlayLevel(mc.showCables);
  const dcLevel = readOverlayLevel(mc.showDatacenters);

  return (
    <div className="sm-rail-section" data-testid="signalmap-rail-map-controls">
      <div className="sm-rail-head">
        <span className="eyebrow">Map controls</span>
      </div>
      <div className="sm-controls">
        <label className="sm-control-row">
          <span>Brightness</span>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.05}
            value={mc.brightness ?? 1}
            data-testid="signalmap-rail-brightness"
            onInput={e => set('brightness', Number((e.currentTarget as HTMLInputElement).value))}
          />
          <span className="mono tnum" data-testid="signalmap-rail-brightness-value">
            {Math.round((mc.brightness ?? 1) * 100)}%
          </span>
        </label>

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

        <div className="sm-control-block" data-testid="signalmap-rail-cables-block">
          <span className="sm-control-block-label">Subsea cables</span>
          <OverlayLevelControl
            testIdPrefix="signalmap-rail-cables"
            value={cablesLevel}
            onChange={(next) => set('showCables', next)}
          />
          {cablesLevel !== 'off' && (
            <label className="sm-control-row sm-control-row-inline">
              <span>Thickness</span>
              <input
                type="range"
                min={0.05}
                max={1.5}
                step={0.05}
                value={mc.cableThickness ?? 0.1}
                data-testid="signalmap-rail-cable-thickness"
                onInput={e => set('cableThickness', Number((e.currentTarget as HTMLInputElement).value))}
              />
              <span className="mono tnum" data-testid="signalmap-rail-cable-thickness-value">
                {((mc.cableThickness ?? 0.1).toFixed(2))}
              </span>
            </label>
          )}
        </div>

        <div className="sm-control-block" data-testid="signalmap-rail-datacenters-block">
          <span className="sm-control-block-label">Datacenters</span>
          <OverlayLevelControl
            testIdPrefix="signalmap-rail-datacenters"
            value={dcLevel}
            onChange={(next) => set('showDatacenters', next)}
          />
        </div>

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
