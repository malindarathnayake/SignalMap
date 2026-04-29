import { useState } from 'preact/hooks';
import { newsChannels } from '../../state/news-channels.ts';
import { NewsChannelPlayer } from './NewsChannelPlayer.tsx';
import { NewsChannelsOptions } from './NewsChannelsOptions.tsx';
import { cameraPrefs } from '../../state/cameras.ts';

export function NewsChannels() {
  const channels = newsChannels.value;
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Reuse the camera mute pref so both video panels share state.
  const muted = cameraPrefs.value.muted;

  return (
    <div className="sm-news" data-testid="signalmap-news">
      <div className="sm-cameras-toolbar">
        <span className="sm-cameras-meta mono">
          {channels.length} channel{channels.length === 1 ? '' : 's'} · {muted ? 'muted' : 'audio on'}
        </span>
        <button
          type="button"
          className="sm-feed-action"
          data-testid="signalmap-news-mute"
          aria-pressed={muted}
          onClick={() => { cameraPrefs.value = { ...cameraPrefs.value, muted: !muted }; }}
        >
          {muted ? '🔇 Muted' : '🔊 Audio'}
        </button>
        <button
          type="button"
          className="sm-feed-action active"
          data-testid="signalmap-news-options"
          aria-label="Configure news channels"
          onClick={() => setOptionsOpen(true)}
        >
          ⚙ Channels
        </button>
      </div>

      <div className="sm-news-list" data-testid="signalmap-news-list">
        {channels.length === 0 ? (
          <div className="sm-news-empty" data-testid="signalmap-news-empty">
            <div className="sm-news-empty-title">No channels yet</div>
            <div className="sm-news-empty-hint">
              Click <strong>⚙ Channels</strong> to add a YouTube live URL,
              an HLS <code>.m3u8</code> stream, or a direct <code>.mp4</code>/<code>.webm</code> link.
              We'll auto-detect the type. Names default to <code>chan01</code>,
              <code>chan02</code>, etc. if you leave them blank.
            </div>
          </div>
        ) : (
          channels.map(c => (
            <div key={c.id} className="sm-news-item" data-testid={`signalmap-news-item-${c.id}`}>
              <div className="sm-news-player">
                <NewsChannelPlayer channel={c} muted={muted} />
                <div className="sm-news-overlay">
                  <span className="sm-news-name">{c.name}</span>
                  <span className="sm-news-type mono">{c.type}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {optionsOpen && <NewsChannelsOptions onClose={() => setOptionsOpen(false)} />}
    </div>
  );
}
