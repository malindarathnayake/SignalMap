import './styles/tokens.css';
import './styles/components.css';
import { CommandBar } from './components/chrome/CommandBar.tsx';
import { RadarStrip } from './components/chrome/RadarStrip.tsx';
import { ProviderStrip } from './components/chrome/ProviderStrip.tsx';
import { LeftRail } from './components/rail/LeftRail.tsx';
import { BriefStrip } from './components/chrome/BriefStrip.tsx';
import { BottomPanel } from './components/feed/BottomPanel.tsx';
import { FeedExpandButton } from './components/feed/FeedResizer.tsx';
import { Inspector } from './components/inspector/Inspector.tsx';
import { WorldMap } from './components/map/WorldMap.tsx';
import { MapOverlays } from './components/map/MapOverlays.tsx';
import { SourceHealthDetails } from './components/pages/SourceHealthDetails.tsx';
import { feedHeight, feedCollapsed } from './state/watchlist.ts';

export function App() {
  // Lightweight pathname route guard — no router dependency. New full-page
  // routes added under /source-health-details (and any future /<page>) get
  // dispatched here. The default app shell renders for everything else.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path === '/source-health-details' || path.startsWith('/source-health-details/')) {
    return <SourceHealthDetails />;
  }

  const collapsed = feedCollapsed.value;
  const h = feedHeight.value;
  const centerStyle = {
    // CSS variable consumed by .sm-center grid-template-rows
    '--sm-feed-height': collapsed ? '0px' : `${h}px`,
  } as Record<string, string>;

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
        <div
          className={`sm-center${collapsed ? ' feed-collapsed' : ''}`}
          style={centerStyle}
        >
          <div className="sm-map-wrap" aria-label="World map">
            <WorldMap />
            <MapOverlays />
            {collapsed && <FeedExpandButton />}
          </div>
          {!collapsed && <BottomPanel />}
        </div>
        <Inspector />
      </div>
    </div>
  );
}
