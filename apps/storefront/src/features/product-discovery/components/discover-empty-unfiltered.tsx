import { DISCOVER_COPY } from '../model/discover-copy';

/**
 * Nothing is published at all.
 *
 * The copy explains why without inventing a number, a date or a commission call
 * to action: an empty catalogue is a fact about the workshop's progress, not a
 * sales opportunity.
 */
export function DiscoverEmptyUnfiltered() {
  const { emptyUnfiltered } = DISCOVER_COPY;
  return (
    <div className="discover__notice">
      <p className="discover__notice-heading">{emptyUnfiltered.heading}</p>
      <p className="discover__notice-body">{emptyUnfiltered.body}</p>
    </div>
  );
}
