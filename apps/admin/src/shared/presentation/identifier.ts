/**
 * Shortening an internal identifier for display (`732:3`, `734:3`, `743:35`).
 *
 * The APP7 Admin frames render a customer, quotation, approval-snapshot or
 * operator id as `7c19…8b41` — the head and tail joined by an ellipsis. The
 * operator needs *a* handle for these values because `APP7-B02` and `APP7-B04`
 * publish no display name for any of them, and a full 36-character UUID in a
 * table cell is noise that pushes every other column out of the way.
 *
 * This is display shortening and nothing else. The shortened form is never sent
 * anywhere, never used as a lookup key, and never treated as an identity: the
 * full value stays in the caller's data and, where the design offers it, in the
 * cell's `title`. A value too short to shorten is returned unchanged rather than
 * padded into something that looks like an id it is not.
 *
 * Admin shared scope: the order queue and the order detail both need it, which
 * is the narrowest scope that serves both (CLAUDE.md §5).
 */

const HEAD_LENGTH = 4;
const TAIL_LENGTH = 4;
const ELLIPSIS = '…';

/** The minimum length worth shortening — below it the ellipsis saves nothing. */
const SHORTEN_THRESHOLD = HEAD_LENGTH + TAIL_LENGTH + ELLIPSIS.length;

export function truncateIdentifier(value: string): string {
  if (value.length <= SHORTEN_THRESHOLD) {
    return value;
  }
  return `${value.slice(0, HEAD_LENGTH)}${ELLIPSIS}${value.slice(-TAIL_LENGTH)}`;
}
