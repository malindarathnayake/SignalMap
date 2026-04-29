import { useEffect, useRef } from 'preact/hooks';
import { feedHeight, feedCollapsed } from '../../state/watchlist.ts';

const MIN_HEIGHT = 80;
const MAX_HEIGHT_FRAC = 0.7; // up to 70% of viewport height

export function FeedResizer() {
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const delta = startYRef.current - e.clientY;
      const max = Math.floor(window.innerHeight * MAX_HEIGHT_FRAC);
      const next = Math.max(MIN_HEIGHT, Math.min(max, startHeightRef.current + delta));
      feedHeight.value = next;
    }
    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  function onMouseDown(e: MouseEvent) {
    draggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = feedHeight.value;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function onCollapse() {
    feedCollapsed.value = true;
  }

  return (
    <div className="sm-feed-resizer" data-testid="signalmap-feed-resizer">
      <button
        type="button"
        className="sm-feed-resizer-handle"
        data-testid="signalmap-feed-resize-handle"
        aria-label="Drag to resize live feed"
        title="Drag to resize"
        onMouseDown={onMouseDown}
      >
        <span className="sm-feed-resizer-grip" aria-hidden />
      </button>
      <button
        type="button"
        className="sm-feed-collapse-btn"
        data-testid="signalmap-feed-collapse"
        aria-label="Hide live feed"
        title="Hide"
        onClick={onCollapse}
      >
        ▾
      </button>
    </div>
  );
}

export function FeedExpandButton() {
  function onClick() {
    feedCollapsed.value = false;
  }
  return (
    <button
      type="button"
      className="sm-feed-expand-btn"
      data-testid="signalmap-feed-expand"
      aria-label="Show live feed"
      title="Show live feed"
      onClick={onClick}
    >
      <span className="sm-feed-expand-arrow" aria-hidden>▴</span>
      <span className="sm-feed-expand-label">Live feed</span>
    </button>
  );
}
