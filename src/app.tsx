import './styles/tokens.css';
import './styles/components.css';
import { CommandBar } from './components/chrome/CommandBar.tsx';
import { RadarStrip } from './components/chrome/RadarStrip.tsx';
import { ProviderStrip } from './components/chrome/ProviderStrip.tsx';
import { LeftRail } from './components/rail/LeftRail.tsx';
import { BriefStrip } from './components/chrome/BriefStrip.tsx';
import { LiveFeed } from './components/feed/LiveFeed.tsx';
import { Inspector } from './components/inspector/Inspector.tsx';
import { WorldMap } from './components/map/WorldMap.tsx';
import { MapOverlays } from './components/map/MapOverlays.tsx';

export function App() {
  return (
    <div className="sm-app">
      {/* Row 1: CommandBar (Phase 4a) */}
      <CommandBar />

      {/* Row 2: Radar / Provider status strips (Phase 4b) */}
      <div className="sm-strips" aria-label="Status strips">
        <RadarStrip />
        <ProviderStrip />
      </div>

      {/* Row 2.5: BriefStrip placeholder (Phase 4d; real fetch lands in 6e) */}
      <BriefStrip />

      {/* Rows 3-4: workspace (rail | center | inspector) */}
      <div className="sm-main">
        <LeftRail />
        <div className="sm-center">
          <div className="sm-map-wrap" aria-label="World map">
            <WorldMap />
            <MapOverlays />
          </div>
          <LiveFeed />
        </div>
        <Inspector />
      </div>
    </div>
  );
}
