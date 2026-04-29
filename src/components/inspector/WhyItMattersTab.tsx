import { useState } from 'preact/hooks';
import { selectedEventId } from '../../state/signals.ts';
import type { EventBrief } from '../../state/brief.ts';

type State = 'idle' | 'loading' | 'loaded' | 'error';

export function WhyItMattersTab() {
  const [state, setState] = useState<State>('idle');
  const [result, setResult] = useState<EventBrief | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const eventId = selectedEventId.value;

  async function onGenerate() {
    if (!eventId) return;
    setState('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/signalmap/brief/event/${encodeURIComponent(eventId)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        setErrorMsg(`HTTP ${res.status}`);
        setState('error');
        return;
      }
      const data = await res.json() as EventBrief;
      setResult(data);
      setState('loaded');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  return (
    <div className="sm-insp-section" data-testid="signalmap-inspector-why">
      <div className="eyebrow">Why this matters</div>

      {state === 'idle' && (
        <p className="sm-insp-summary">
          Generate a contextual brief for this signal.
        </p>
      )}

      {state !== 'loaded' && (
        <button
          type="button"
          className="sm-btn"
          data-testid="signalmap-inspector-why-button"
          disabled={state === 'loading'}
          onClick={() => void onGenerate()}
        >
          {state === 'loading' ? 'Generating…' : 'Generate'}
        </button>
      )}

      {state === 'error' && (
        <p data-testid="signalmap-inspector-why-error" className="sm-insp-error">
          {errorMsg}
        </p>
      )}

      {state === 'loaded' && result && (
        <div data-testid="signalmap-inspector-why-text" className="sm-insp-why-text">
          <p>{result.bullets[0]}</p>
          {result.sources.length > 0 && (
            <p className="sm-insp-sources">
              Sources: {result.sources.map((s) => s.label).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
