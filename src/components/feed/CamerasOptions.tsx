import { useState } from 'preact/hooks';
import {
  CAMERA_CATALOG,
  cameraPrefs,
  ALL_CAMERA_REGIONS,
  REGION_LABEL,
  DEFAULT_CAMERA_PREFS,
  type CameraLayout,
  type CameraRegion,
} from '../../state/cameras.ts';

type Props = {
  onClose: () => void;
};

const LAYOUT_OPTIONS: CameraLayout[] = [1, 2, 4, 6];

export function CamerasOptions({ onClose }: Props) {
  const prefs = cameraPrefs.value;
  const [regionFilter, setRegionFilter] = useState<CameraRegion | 'all'>('all');

  const filtered = regionFilter === 'all'
    ? CAMERA_CATALOG
    : CAMERA_CATALOG.filter(f => f.region === regionFilter);

  function setLayout(layout: CameraLayout) {
    // When shrinking, keep the first N cells. When growing, pad with nulls.
    const cells = [...prefs.cells];
    while (cells.length < layout) cells.push(null);
    cameraPrefs.value = { ...prefs, layout, cells };
  }

  function setCell(idx: number, id: string | null) {
    const cells = [...prefs.cells];
    while (cells.length <= idx) cells.push(null);
    cells[idx] = id;
    cameraPrefs.value = { ...prefs, cells };
  }

  function reset() {
    cameraPrefs.value = DEFAULT_CAMERA_PREFS;
  }

  return (
    <div
      className="sm-watchpoint-options-backdrop"
      data-testid="signalmap-cameras-options-backdrop"
      onClick={onClose}
    >
      <div
        className="sm-watchpoint-options sm-cameras-options"
        role="dialog"
        aria-label="Configure cameras"
        data-testid="signalmap-cameras-options-dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="sm-watchpoint-options-head">
          <span className="eyebrow">Live cameras</span>
          <button
            type="button"
            className="sm-icon-btn"
            data-testid="signalmap-cameras-options-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="sm-cameras-layout-row">
          <span className="sm-cameras-options-label">Layout</span>
          {LAYOUT_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              className={`sm-feed-action${prefs.layout === opt ? ' active' : ''}`}
              data-testid={`signalmap-cameras-layout-${opt}`}
              aria-pressed={prefs.layout === opt}
              onClick={() => setLayout(opt)}
            >
              {opt} {opt === 1 ? 'cell' : 'cells'}
            </button>
          ))}
        </div>

        <div className="sm-cameras-region-row">
          <button
            type="button"
            className={`sm-feed-action${regionFilter === 'all' ? ' active' : ''}`}
            onClick={() => setRegionFilter('all')}
          >
            All
          </button>
          {ALL_CAMERA_REGIONS.map(r => (
            <button
              key={r}
              type="button"
              className={`sm-feed-action${regionFilter === r ? ' active' : ''}`}
              onClick={() => setRegionFilter(r)}
            >
              {REGION_LABEL[r]}
            </button>
          ))}
        </div>

        <div className="sm-cameras-options-grid">
          {Array.from({ length: prefs.layout }).map((_, idx) => {
            const currentId = prefs.cells[idx] ?? null;
            return (
              <div key={idx} className="sm-cameras-options-cell">
                <span className="sm-cameras-options-cell-label">Cell {idx + 1}</span>
                <select
                  className="sm-cameras-options-select"
                  data-testid={`signalmap-cameras-cell-select-${idx}`}
                  value={currentId ?? ''}
                  onChange={e => {
                    const v = (e.currentTarget as HTMLSelectElement).value;
                    setCell(idx, v === '' ? null : v);
                  }}
                >
                  <option value="">— empty —</option>
                  {filtered.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.city} ({f.country})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="sm-watchpoint-options-actions">
          <button
            type="button"
            className="sm-btn ghost"
            data-testid="signalmap-cameras-options-reset"
            onClick={reset}
          >
            Reset to defaults
          </button>
          <button
            type="button"
            className="sm-btn primary"
            data-testid="signalmap-cameras-options-done"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
