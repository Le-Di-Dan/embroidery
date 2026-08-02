'use client';

import { useEffect, useRef, useState } from 'react';

interface ContinuationSentinel {
  /** Attach to the element that marks the end of the rendered feed. */
  readonly ref: React.RefObject<HTMLDivElement | null>;
  /**
   * True when `IntersectionObserver` is unavailable, so the feed must offer a
   * visible "Tải thêm tác phẩm" button instead of scroll-driven continuation.
   */
  readonly needsManualControl: boolean;
}

/**
 * One bounded IntersectionObserver over the end-of-feed sentinel.
 *
 * `onIntersect` is held in a ref so the observer is created once per enablement
 * rather than being torn down and rebuilt on every render — a rebuilt observer
 * re-fires immediately for an element already in view, which is how a sentinel
 * turns into a request loop.
 *
 * The observer is disconnected whenever continuation is disabled (no next page,
 * a request in flight, or a failure awaiting explicit retry), so nothing can
 * fire while the feed is not ready to ask.
 */
export function useContinuationSentinel(
  enabled: boolean,
  onIntersect: () => void,
): ContinuationSentinel {
  const ref = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onIntersect);
  const [needsManualControl, setNeedsManualControl] = useState(false);

  useEffect(() => {
    callbackRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setNeedsManualControl(true);
      return;
    }
    const element = ref.current;
    if (!enabled || element === null) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) callbackRef.current();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, needsManualControl };
}
