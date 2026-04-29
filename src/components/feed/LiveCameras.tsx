import { useState } from 'preact/hooks';
import {
  CAMERA_CATALOG,
  cameraPrefs,
  type CameraFeed,
} from '../../state/cameras.ts';
import { CamerasOptions } from './CamerasOptions.tsx';

function feedById(id: string | null): CameraFeed | null {
  if (!id) return null;
  return CAMERA_CATALOG.find(f => f.id === id) ?? null;
}

function buildEmbedUrl(videoId: string, muted: boolean): string {
  // Mute is required for autoplay across modern browsers.
  const muteFlag = muted ? '1' : '0';
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${muteFlag}&controls=1&modestbranding=1&playsinline=1&rel=0`;
}

export function LiveCameras() {
  const prefs = cameraPrefs.value;
  const [optionsOpen, setOptionsOpen] = useState(false);

  const cellsToShow = prefs.cells.slice(0, prefs.layout);
  const populated = cellsToShow.filter(id => id !== null).length;

  return (
    <div className="sm-cameras" data-testid="signalmap-cameras">
      <div className="sm-cameras-toolbar">
        <span className="sm-cameras-meta mono">
          {populated}/{prefs.layout} cells · {prefs.muted ? 'muted' : 'audio on'}
        </span>
        <button
          type="button"
          className="sm-feed-action"
          data-testid="signalmap-cameras-mute"
          aria-pressed={prefs.muted}
          onClick={() => { cameraPrefs.value = { ...prefs, muted: !prefs.muted }; }}
        >
          {prefs.muted ? '🔇 Muted' : '🔊 Audio'}
        </button>
        <button
          type="button"
          className="sm-feed-action active"
          data-testid="signalmap-cameras-options"
          aria-label="Configure cameras"
          onClick={() => setOptionsOpen(true)}
        >
          ⚙ Configure
        </button>
      </div>

      <div
        className={`sm-cameras-grid layout-${prefs.layout}`}
        data-testid="signalmap-cameras-grid"
      >
        {cellsToShow.map((id, idx) => {
          const feed = feedById(id);
          if (!feed) {
            return (
              <div
                key={`empty-${idx}`}
                className="sm-camera-cell empty"
                data-testid={`signalmap-camera-cell-${idx}`}
              >
                <button
                  type="button"
                  className="sm-camera-cell-pick"
                  onClick={() => setOptionsOpen(true)}
                >
                  + Pick a camera
                </button>
              </div>
            );
          }
          return (
            <div
              key={`${idx}-${feed.id}`}
              className="sm-camera-cell"
              data-testid={`signalmap-camera-cell-${idx}`}
            >
              <iframe
                className="sm-camera-iframe"
                src={buildEmbedUrl(feed.videoId, prefs.muted)}
                title={`${feed.city} live camera`}
                allow="autoplay; encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                loading="lazy"
                allowFullscreen
              />
              <div className="sm-camera-overlay">
                <span className="sm-camera-city">{feed.city}</span>
                <span className="sm-camera-country mono">{feed.country}</span>
              </div>
            </div>
          );
        })}
      </div>

      {optionsOpen && <CamerasOptions onClose={() => setOptionsOpen(false)} />}
    </div>
  );
}
