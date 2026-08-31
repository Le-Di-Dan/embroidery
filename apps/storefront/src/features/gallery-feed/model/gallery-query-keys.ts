/**
 * TanStack Query keys and the page size for the public gallery feed.
 *
 * The feed takes no filter. `APP11-B03` publishes exactly two request
 * parameters — `limit` and `cursor` — and no status, search, category, style,
 * need, sort, offset or page selector exists to key on. So unlike the Discover
 * feed, whose key carries its category because `APP2-B04` binds a cursor to the
 * filter it was issued under, this key is constant: there is only ever one
 * cursor sequence.
 */

/**
 * Page size for the feed. `APP11-B03` accepts 1–100 and defaults to its own
 * value; requesting explicitly keeps the window the visitor sees independent of
 * a future server-side default change.
 *
 * Twelve rather than Discover's twenty: UI05's cards are 410px editorial tiles
 * carrying a title and a short description, so twelve already fills four rows of
 * the desktop three-column masonry.
 */
export const GALLERY_PAGE_SIZE = 12;

export const galleryQueryKeys = {
  all: ['storefront', 'gallery'] as const,
  feed: () => [...galleryQueryKeys.all, 'feed'] as const,
} as const;
