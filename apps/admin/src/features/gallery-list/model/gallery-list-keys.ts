/**
 * The query-key factory for the Admin gallery list.
 *
 * A key carries the page size and the one filter, and nothing else. It is
 * serialized into the cache, so a credential, an `AbortSignal`, a cursor or a
 * raw error would outlive the request that produced it and must never appear
 * here. The cursor in particular: a key that contained it would make every page
 * its own cache entry and defeat the accumulation `useInfiniteQuery` provides.
 *
 * The filter is part of the key on purpose — changing it addresses a different
 * entry, which is what makes "reset the cursor chain, fetch a fresh first page,
 * never merge pages across filters" structural rather than a rule a component
 * has to remember.
 *
 * `lists()` is the root `APP11-A02` invalidates: creating, editing, publishing
 * or archiving an entry changes which entries belong in a status-filtered list
 * and where they sit in `display_order`, so the editor must invalidate the same
 * root this feature reads under — not a literal of its own. Two spellings of
 * one cache key is how an invalidation silently stops matching and an operator
 * returns to a list still showing the entry they just archived.
 */
import type { GalleryListFilters } from './gallery-list-filters';

/** Client request size for one page; the contract allows 1–100. */
export const GALLERY_LIST_PAGE_SIZE = 20;

const ROOT = ['admin', 'gallery'] as const;

export const galleryListKeys = {
  all: ROOT,
  /** The root every list page lives under — what `APP11-A02` invalidates. */
  lists: () => [...ROOT, 'list'] as const,
  list: (filters: GalleryListFilters, pageSize: number = GALLERY_LIST_PAGE_SIZE) =>
    [...ROOT, 'list', { pageSize, status: filters.status }] as const,
  /**
   * One cover rendition's bytes. Keyed on the asset and the rendition, not on
   * the entry: two entries that share an image share one cache entry, and the
   * `thumbnail` bytes are not the `catalog-preview` bytes.
   */
  cover: (assetId: string, rendition: string) => [...ROOT, 'cover', assetId, rendition] as const,
} as const;
