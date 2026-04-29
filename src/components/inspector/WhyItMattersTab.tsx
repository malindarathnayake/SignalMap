import { useEffect, useRef, useState } from 'preact/hooks';
import { selectedEventId } from '../../state/signals.ts';
import type { EventBrief } from '../../state/brief.ts';

type State = 'idle' | 'loading' | 'loaded' | 'error';

export function WhyItMattersTab() {
  const eventId = selectedEventId.value;
  const cacheRef = useRef<Map<string, EventBrief>>(new Map());

  const [state, setState] = useState<State>('idle');
  const [result, setResult] = useState<EventBrief | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Reset state when the selected event changes; rehydrate from cache
  // if we've already generated a brief for this event in this session.
  useEffect(() => {
    if (!eventId) {
      setState('idle');
      setResult(null);
      setErrorMsg('');
      return;
    }
    const cached = cacheRef.current.get(eventId);
    if (cached) {
      setState('loaded');
      setResult(cached);
      setErrorMsg('');
    } else {
      setState('idle');
      setResult(null);
      setErrorMsg('');
    }
  }, [eventId]);

  async function onGenerate() {
    if (!eventId) return;
    const requestEventId = eventId;
    setState('loading');
    setErrorMsg('');
    try {
      const res = await fetch(
        `/api/signalmap/brief/event/${encodeURIComponent(requestEventId)}`,
        { method: 'POST' },
      );
      // Ignore stale responses if the user switched events while waiting.
      if (selectedEventId.value !== requestEventId) return;
      if (!res.ok) {
        setErrorMsg(`HTTP ${res.status}`);
        setState('error');
        return;
      }
      const data = await res.json() as EventBrief;
      if (selectedEventId.value !== requestEventId) return;
      cacheRef.current.set(requestEventId, data);
      setResult(data);
      setState('loaded');
    } catch (err) {
      if (selectedEventId.value !== requestEventId) return;
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
            <p className="sm-insp-sources" data-testid="signalmap-inspector-sources">
              <span className="sm-insp-sources-label">Sources:</span>{' '}
              {result.sources.map((s, i) => (
                <span key={`${s.url}-${i}`}>
                  {i > 0 && <span aria-hidden> · </span>}
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sm-insp-source-link"
                      data-testid={`signalmap-inspector-source-${i}`}
                      title={s.url}
                    >
                      {s.label}
                      <span className="sm-insp-source-ext" aria-hidden> ↗</span>
                    </a>
                  ) : (
                    <span>{s.label}</span>
                  )}
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
