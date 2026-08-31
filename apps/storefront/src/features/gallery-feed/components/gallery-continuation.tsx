'use client';

import { GALLERY_COPY } from '../model/gallery-copy';

interface GalleryContinuationProps {
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
}

/**
 * End-of-feed continuation: an explicit control, a pending line, and a failure
 * with its own retry (UI05 `357:3`).
 *
 * **Explicit only.** There is no sentinel, no IntersectionObserver and no
 * viewport trigger anywhere in this feature: the next page is requested when the
 * visitor presses the control and at no other time. `/kham-pha` advances on
 * scroll; an editorial feed of variable-height entries is read deliberately, and
 * UI05's own loading board draws a control rather than a scroll affordance.
 *
 * **The control stays mounted while a page is in flight.** Swapping it for a
 * status line would unmount the element the visitor just activated and drop
 * focus to `<body>` — a forced focus move this checkpoint forbids. It stays put,
 * reports `aria-busy` through the wrapper, and the pending line appears beside
 * it. The hook, not the DOM, is what prevents a second request: a press while
 * one is in flight is ignored.
 *
 * **One polite announcement per append.** The live region carries the approved
 * pending string while the request runs and is empty otherwise, so a screen
 * reader hears the append once. It deliberately does not announce a completion
 * count: no approved copy exists for one, and this checkpoint forbids a total —
 * a keyset feed does not know how many entries there are, and saying so would be
 * inventing a number.
 *
 * **Nothing at the end.** When `hasMore` is false the block renders nothing at
 * all: no control, no "you have seen everything" line, no count. The feed simply
 * stops, which is what the approved board draws.
 *
 * The failure sits **below** the accumulated cards and replaces none of them.
 * "Thử lại" replays the exact cursor that failed rather than restarting the
 * sequence, and the copy carries no server message, status code or request id.
 */
export function GalleryContinuation({
  hasMore,
  isLoading,
  hasError,
  onLoadMore,
  onRetry,
}: GalleryContinuationProps) {
  if (!hasMore) return null;

  return (
    <div className="gallery-feed__continuation" aria-busy={isLoading}>
      <p className="gallery-feed__continuation-status" role="status" aria-live="polite">
        {isLoading ? GALLERY_COPY.continuation.loading : ''}
      </p>

      {hasError ? (
        <div className="gallery-feed__continuation-error" role="alert">
          <p className="gallery-feed__continuation-message">{GALLERY_COPY.continuation.error}</p>
          <button type="button" className="gallery-feed__action" onClick={onRetry}>
            {GALLERY_COPY.continuation.retry}
          </button>
        </div>
      ) : (
        <button type="button" className="gallery-feed__action" onClick={onLoadMore}>
          {GALLERY_COPY.continuation.loadMore}
        </button>
      )}
    </div>
  );
}
