import { mappableEvents } from '../../state/signals.ts';

export function MapOverlays() {
  const N = mappableEvents.value.length;

  return (
    <div className="sm-map-overlays" data-testid="signalmap-map-overlays" aria-hidden="false">
      <div className="sm-map-corner tl" data-testid="signalmap-map-corner-tl">
        <div className="eyebrow">Active</div>
        <div className="sm-map-stats mono tnum" data-testid="signalmap-map-active-count">{N} signals</div>
      </div>
      <div className="sm-map-corner tr" data-testid="signalmap-map-corner-tr">
        <div className="eyebrow">Projection</div>
        <div className="sm-map-coords">Equirectangular · 960×480</div>
      </div>
      <div className="sm-map-corner bl" data-testid="signalmap-map-corner-bl">
        <div className="eyebrow">Legend</div>
        <div className="sm-legend-item"><span className="sm-legend-shape outage" />Outage<span className="sm-legend-hint" /></div>
        <div className="sm-legend-item"><span className="sm-legend-shape anomaly" />Anomaly<span className="sm-legend-hint" /></div>
        <div className="sm-legend-item"><span className="sm-legend-shape diamond" />Provider<span className="sm-legend-hint" /></div>
        <div className="sm-legend-item"><span className="sm-legend-shape circle" />Event<span className="sm-legend-hint" /></div>
      </div>
      <div className="sm-map-corner br" data-testid="signalmap-map-corner-br">
        <span className="sm-map-live" data-testid="signalmap-map-live"><span className="sm-map-live-dot" aria-hidden="true" /> LIVE</span>
      </div>
    </div>
  );
}
