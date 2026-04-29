import { useMemo, useState } from 'preact/hooks';
import {
  newsChannels,
  detectType,
  autoName,
  makeChannelId,
  type NewsChannel,
  type NewsChannelType,
} from '../../state/news-channels.ts';

type Props = { onClose: () => void };

const TYPE_HINT: Record<NewsChannelType, string> = {
  youtube: 'YouTube live (iframe embed)',
  hls: 'HLS (.m3u8) — plays via hls.js or native',
  video: 'Direct video file (mp4/webm)',
  iframe: 'Generic iframe — works if the site allows embedding (X-Frame-Options / CSP)',
  rtmp: 'RTMP — not playable in browsers',
  unknown: "Empty or invalid — paste an https:// URL",
};

type ForceType = 'auto' | 'youtube' | 'hls' | 'video' | 'iframe';
const FORCE_OPTIONS: ForceType[] = ['auto', 'youtube', 'hls', 'video', 'iframe'];

export function NewsChannelsOptions({ onClose }: Props) {
  const [draftUrl, setDraftUrl] = useState('');
  const [draftName, setDraftName] = useState('');
  const [forceType, setForceType] = useState<ForceType>('auto');

  const detected = useMemo<NewsChannelType>(() => detectType(draftUrl), [draftUrl]);
  const effective: NewsChannelType = forceType === 'auto' ? detected : forceType;
  const canAdd = draftUrl.trim().length > 0 && effective !== 'unknown' && effective !== 'rtmp';

  function add(e: Event) {
    e.preventDefault();
    if (!canAdd) return;
    const existing = newsChannels.value;
    const name = draftName.trim() || autoName(existing);
    const next: NewsChannel = {
      id: makeChannelId(),
      name,
      url: draftUrl.trim(),
      type: effective,
    };
    newsChannels.value = [...existing, next];
    setDraftUrl('');
    setDraftName('');
    setForceType('auto');
  }

  function remove(id: string) {
    newsChannels.value = newsChannels.value.filter(c => c.id !== id);
  }

  function rename(id: string, newName: string) {
    newsChannels.value = newsChannels.value.map(c =>
      c.id === id ? { ...c, name: newName.trim() || c.name } : c,
    );
  }

  return (
    <div
      className="sm-watchpoint-options-backdrop"
      data-testid="signalmap-news-options-backdrop"
      onClick={onClose}
    >
      <div
        className="sm-watchpoint-options sm-news-options"
        role="dialog"
        aria-label="Configure news channels"
        data-testid="signalmap-news-options-dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="sm-watchpoint-options-head">
          <span className="eyebrow">News channels</span>
          <button
            type="button"
            className="sm-icon-btn"
            data-testid="signalmap-news-options-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <ul className="sm-watchpoint-options-list">
          {newsChannels.value.map(c => (
            <li key={c.id} className="sm-news-options-row">
              <input
                className="sm-news-options-name"
                type="text"
                value={c.name}
                data-testid={`signalmap-news-options-name-${c.id}`}
                aria-label={`Rename ${c.name}`}
                onInput={e => rename(c.id, (e.currentTarget as HTMLInputElement).value)}
              />
              <span className="sm-news-options-url mono" title={c.url}>{c.url}</span>
              <span className={`sm-news-options-type type-${c.type}`}>{c.type}</span>
              <button
                type="button"
                className="sm-watchpoint-options-remove"
                data-testid={`signalmap-news-options-remove-${c.id}`}
                aria-label={`Remove ${c.name}`}
                onClick={() => remove(c.id)}
              >
                Remove
              </button>
            </li>
          ))}
          {newsChannels.value.length === 0 && (
            <li className="sm-watchpoint-options-empty">No channels yet. Add one below.</li>
          )}
        </ul>

        <form
          className="sm-watchpoint-options-add"
          data-testid="signalmap-news-options-add-form"
          onSubmit={add}
        >
          <label className="sm-watchpoint-options-field">
            <span>URL (YouTube, .m3u8, .mp4)</span>
            <input
              type="text"
              value={draftUrl}
              data-testid="signalmap-news-options-url-input"
              placeholder="https://www.youtube.com/watch?v=… or https://example.com/stream.m3u8"
              onInput={e => setDraftUrl((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label className="sm-watchpoint-options-field">
            <span>Name (optional — defaults to chan01, chan02, …)</span>
            <input
              type="text"
              value={draftName}
              data-testid="signalmap-news-options-name-input"
              placeholder=""
              onInput={e => setDraftName((e.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <label className="sm-watchpoint-options-field">
            <span>
              Force type (override auto-detect — useful for HLS streams without
              a <code>.m3u8</code> extension)
            </span>
            <select
              className="sm-cameras-options-select"
              value={forceType}
              data-testid="signalmap-news-options-force-type"
              onChange={e => setForceType((e.currentTarget as HTMLSelectElement).value as ForceType)}
            >
              {FORCE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>
                  {opt === 'auto' ? `auto (detected: ${detected})` : opt}
                </option>
              ))}
            </select>
          </label>

          <div
            className={`sm-news-options-detect type-${effective}`}
            data-testid="signalmap-news-options-detected-type"
          >
            <strong>Will play as:</strong> <code>{effective}</code>
            <span className="sm-news-options-detect-hint">— {TYPE_HINT[effective]}</span>
          </div>

          <div className="sm-watchpoint-options-actions">
            <button
              type="submit"
              className="sm-btn primary"
              data-testid="signalmap-news-options-add"
              disabled={!canAdd}
            >
              Add channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
