import Link from 'next/link';

import { DISCOVER_COPY } from '../model/discover-copy';
import { DISCOVER_ROUTE } from '../model/discover-route';

/**
 * Published work exists, but none in the selected category.
 *
 * The recovery is a real link back to the unfiltered feed rather than a
 * dead-end message, and it is the same `/kham-pha` URL the "Tất cả" chip uses —
 * one route for the unfiltered feed, never a second spelling of it.
 */
export function DiscoverEmptyFiltered() {
  const { emptyFiltered } = DISCOVER_COPY;
  return (
    <div className="discover__notice">
      <p className="discover__notice-heading">{emptyFiltered.heading}</p>
      <p className="discover__notice-body">{emptyFiltered.body}</p>
      <Link href={DISCOVER_ROUTE} className="discover__action">
        {emptyFiltered.action}
      </Link>
    </div>
  );
}
