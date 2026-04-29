import type { SignalEvent } from '../../state/signals.ts';
import { selectedEventId } from '../../state/signals.ts';

interface MapMarkerProps {
  event: SignalEvent;
  cx: number;
  cy: number;
}

const sevColor = (sev: SignalEvent['severity']) => `var(--sev-${sev})`;
const catColor = (cat: SignalEvent['category']) => `var(--cat-${cat})`;

export function MapMarker({ event, cx, cy }: MapMarkerProps) {
  // Subscribe to selectedEventId so the marker re-renders when selection changes.
  const isSelected = selectedEventId.value === event.id;

  const handleClick = (e: Event) => {
    e.stopPropagation();
    selectedEventId.value = event.id;
  };

  let r: number;
  let ring: string;
  let shape: preact.JSX.Element;

  if (event.category === 'internet' && event.radarKind === 'outage') {
    r = 5.5;
    ring = sevColor(event.severity);
    shape = (
      <rect
        x={-r}
        y={-r}
        width={r * 2}
        height={r * 2}
        fill={ring}
        stroke="var(--bg-map)"
        strokeWidth={1}
        pointerEvents="none"
      />
    );
  } else if (event.category === 'internet' && event.radarKind === 'anomaly') {
    r = 5.5;
    ring = sevColor(event.severity);
    shape = (
      <>
        <circle r={r} fill="var(--bg-map)" stroke={ring} strokeWidth={1.5} pointerEvents="none" />
        <line x1={0} y1={-(r * 0.6)} x2={0} y2={r * 0.6} stroke={ring} strokeWidth={1.5} pointerEvents="none" />
        <line x1={-(r * 0.6)} y1={0} x2={r * 0.6} y2={0} stroke={ring} strokeWidth={1.5} pointerEvents="none" />
      </>
    );
  } else if (event.category === 'provider') {
    r = 5;
    ring = catColor(event.category);
    shape = (
      <g transform="rotate(45)" pointerEvents="none">
        <rect
          x={-(r * 0.85)}
          y={-(r * 0.85)}
          width={r * 1.7}
          height={r * 1.7}
          fill={ring}
          stroke="var(--bg-map)"
          strokeWidth={0.8}
        />
      </g>
    );
  } else {
    r = 4;
    ring = catColor(event.category);
    shape = (
      <circle r={r} fill={ring} stroke="var(--bg-map)" strokeWidth={0.8} pointerEvents="none" />
    );
  }

  return (
    <g
      transform={`translate(${cx} ${cy})`}
      data-testid={`signalmap-map-marker-${event.id}`}
      data-category={event.category}
      data-severity={event.severity}
    >
      {/* Passive outer glow — rendered BEFORE visible shape (sits behind) */}
      <circle r={r + 2} fill={ring} opacity={0.2} pointerEvents="none" />

      {/* Visible shape */}
      {shape}

      {/* Selection ring — only when this event is selected */}
      {isSelected && (
        <circle
          r={r + 5}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
          pointerEvents="none"
          data-testid="signalmap-map-marker-selected"
        />
      )}

      {/* 44×44 transparent hit rect — MUST be last child (topmost, captures clicks) */}
      <rect
        x={-22}
        y={-22}
        width={44}
        height={44}
        fill="transparent"
        pointerEvents="all"
        data-testid={`signalmap-map-marker-hit-${event.id}`}
        role="button"
        aria-label={event.title}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e);
          }
        }}
      />
    </g>
  );
}
