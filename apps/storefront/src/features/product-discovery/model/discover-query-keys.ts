/**
 * TanStack Query keys and the page size for the Discover feed.
 *
 * The category is part of the key, which is what makes a category change start a
 * **new** cursor sequence rather than appending pages from one filter onto
 * another. That is not a caching nicety: `APP2-B04` binds each cursor to the
 * filter it was issued under (IMP-D037) and rejects a cursor replayed under a
 * different `categorySlug`, so a shared key would eventually send a cursor the
 * server refuses.
 */

/**
 * Page size for the feed. The API's own default is 20 and its maximum is 100;
 * requesting explicitly keeps the client's window independent of a future
 * server-side default change.
 */
export const DISCOVER_PAGE_SIZE = 20;

export const discoverQueryKeys = {
  all: ['public-products'] as const,
  list: (categorySlug: string | undefined) =>
    [...discoverQueryKeys.all, 'list', categorySlug ?? 'all'] as const,
} as const;
