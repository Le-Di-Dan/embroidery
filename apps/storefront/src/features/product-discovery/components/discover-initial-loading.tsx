import { DISCOVER_COPY } from '../model/discover-copy';

/**
 * The first page is in flight and nothing is on screen yet.
 *
 * Announced politely rather than assertively: it is progress, not an event the
 * visitor must act on.
 */
export function DiscoverInitialLoading() {
  return (
    <p className="discover__notice" role="status" aria-live="polite">
      {DISCOVER_COPY.initialLoading}
    </p>
  );
}
