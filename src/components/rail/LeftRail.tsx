import { CategoryToggle } from './CategoryToggle.tsx';
import { RegionPicker } from './RegionPicker.tsx';
import { ProviderPicker } from './ProviderPicker.tsx';
import { MapControls } from './MapControls.tsx';

export function LeftRail() {
  return (
    <aside className="sm-rail" data-testid="signalmap-rail" aria-label="Filters and controls">
      <CategoryToggle />
      <RegionPicker />
      <ProviderPicker />
      <MapControls />
    </aside>
  );
}
