'use client';

import { useContinuationSentinel } from '../hooks/use-continuation-sentinel';
import { DISCOVER_COPY } from '../model/discover-copy';

interface DiscoverContinuationProps {
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
}

/**
 * End-of-feed continuation: sentinel, pending state, failure with an explicit
 * retry, and the end-of-feed line (UI02 `Loading Continuation`).
 *
 * There is no page number and no total count anywhere here — the feed is a
 * keyset sequence, and the server never tells the client how many products
 * exist. Automatic loading stops while a request is in flight and after a
 * failure, so a sentinel that stays in view cannot replay a failed cursor; only
 * the visitor's "Thử lại" does that, and it sends the exact cursor that failed.
 */
export function DiscoverContinuation({
  hasMore,
  isLoading,
  hasError,
  onLoadMore,
  onRetry,
}: DiscoverContinuationProps) {
  const { ref, needsManualControl } = useContinuationSentinel(
    hasMore && !isLoading && !hasError,
    onLoadMore,
  );

  return (
    <div className="discover__continuation" aria-busy={isLoading}>
      <div ref={ref} className="discover__sentinel" aria-hidden="true" />

      {isLoading ? (
        <p className="discover__continuation-status" role="status" aria-live="polite">
          {DISCOVER_COPY.continuation.loading}
        </p>
      ) : null}

      {hasError ? (
        <div className="discover__continuation-error" role="alert">
          <p className="discover__continuation-message">{DISCOVER_COPY.continuation.error}</p>
          <button type="button" className="discover__action" onClick={onRetry}>
            {DISCOVER_COPY.continuation.retry}
          </button>
        </div>
      ) : null}

      {/*
        The manual control appears only where IntersectionObserver is missing —
        scroll-driven continuation would otherwise be unreachable, and a feed the
        visitor cannot advance is worse than a visible button.
      */}
      {hasMore && !isLoading && !hasError && needsManualControl ? (
        <button type="button" className="discover__action" onClick={onLoadMore}>
          {DISCOVER_COPY.continuation.loadMore}
        </button>
      ) : null}

      {!hasMore && !isLoading ? (
        <p className="discover__continuation-end">{DISCOVER_COPY.continuation.end}</p>
      ) : null}
    </div>
  );
}
