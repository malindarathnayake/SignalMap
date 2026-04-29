import { useState } from 'preact/hooks';
import { watchpoints, DEFAULT_WATCHPOINTS, type Watchpoint } from '../../state/watchlist.ts';

type Props = {
  onClose: () => void;
};

function makeId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `wp-${Date.now()}`;
}

export function WatchpointsOptions({ onClose }: Props) {
  const [draftLabel, setDraftLabel] = useState('');
  const [draftMatch, setDraftMatch] = useState('');

  function add() {
    const label = draftLabel.trim();
    if (!label) return;
    const match = (draftMatch.trim() || label).toLowerCase();
    const id = makeId(label);
    const existing = watchpoints.value;
    if (existing.some(wp => wp.id === id)) return; // skip duplicates by id
    const next: Watchpoint = { id, label, match };
    watchpoints.value = [...existing, next];
    setDraftLabel('');
    setDraftMatch('');
  }

  function remove(id: string) {
    watchpoints.value = watchpoints.value.filter(wp => wp.id !== id);
  }

  function reset() {
    watchpoints.value = DEFAULT_WATCHPOINTS;
  }

  return (
    <div
      className="sm-watchpoint-options-backdrop"
      data-testid="signalmap-watchpoints-options-backdrop"
      onClick={onClose}
    >
      <div
        className="sm-watchpoint-options"
        role="dialog"
        aria-label="Configure watchpoints"
        data-testid="signalmap-watchpoints-options-dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="sm-watchpoint-options-head">
          <span className="eyebrow">Watchpoints</span>
          <button
            type="button"
            className="sm-icon-btn"
            data-testid="signalmap-watchpoints-options-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <ul className="sm-watchpoint-options-list">
          {watchpoints.value.map(wp => (
            <li key={wp.id} className="sm-watchpoint-options-row">
              <span className="sm-watchpoint-options-label">{wp.label}</span>
              <span className="sm-watchpoint-options-match mono">
                matches: <code>{wp.match}</code>
              </span>
              <button
                type="button"
                className="sm-watchpoint-options-remove"
                data-testid={`signalmap-watchpoints-options-remove-${wp.id}`}
                aria-label={`Remove ${wp.label}`}
                onClick={() => remove(wp.id)}
              >
                Remove
              </button>
            </li>
          ))}
          {watchpoints.value.length === 0 && (
            <li className="sm-watchpoint-options-empty">No watchpoints. Add one below.</li>
          )}
        </ul>

        <form
          className="sm-watchpoint-options-add"
          data-testid="signalmap-watchpoints-options-add-form"
          onSubmit={e => { e.preventDefault(); add(); }}
        >
          <label className="sm-watchpoint-options-field">
            <span>Label</span>
            <input
              type="text"
              value={draftLabel}
              data-testid="signalmap-watchpoints-options-label-input"
              placeholder="e.g. Berlin"
              onInput={e => setDraftLabel((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label className="sm-watchpoint-options-field">
            <span>Match (optional)</span>
            <input
              type="text"
              value={draftMatch}
              data-testid="signalmap-watchpoints-options-match-input"
              placeholder="defaults to label"
              onInput={e => setDraftMatch((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <div className="sm-watchpoint-options-actions">
            <button
              type="button"
              className="sm-btn ghost"
              data-testid="signalmap-watchpoints-options-reset"
              onClick={reset}
            >
              Reset to defaults
            </button>
            <button
              type="submit"
              className="sm-btn primary"
              data-testid="signalmap-watchpoints-options-add"
              disabled={draftLabel.trim().length === 0}
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
