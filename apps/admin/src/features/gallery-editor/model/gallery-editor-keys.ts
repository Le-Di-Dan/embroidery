/**
 * The query-key factory for the Admin gallery editor.
 *
 * A key carries an identity and, where a collection is paged, its page size —
 * and nothing else. Keys are serialized into the cache, so a credential, an
 * `AbortSignal`, a cursor or a raw error would outlive the request that
 * produced it and must never appear here. The cursor in particular: a key that
 * contained it would make every page its own cache entry and defeat the
 * accumulation `useInfiniteQuery` provides.
 *
 * The **list** root is not defined here. `APP11-A01` owns it, and the editor
 * invalidates that exact root through `galleryListKeys.lists()` after every
 * write: creating, editing, publishing or unpublishing an entry changes which
 * entries belong in a status-filtered list and where they sit in
 * `display_order`. Two spellings of one cache key is how an invalidation
 * silently stops matching and an operator returns to a list still showing the
 * entry they just published.
 */

/** Client request size for one page of either asset picker; the contract allows 1–100. */
export const GALLERY_ASSET_PAGE_SIZE = 24;

/** Client request size for one page of the linked-product picker. */
export const GALLERY_PRODUCT_PAGE_SIZE = 20;

const ROOT = ['admin', 'gallery'] as const;

export const galleryEditorKeys = {
  all: ROOT,
  /**
   * One authoritative entry. Keyed by the server's id alone: the form values,
   * the dirty flags and the concurrency token all derive from the cached
   * record, so none of them belongs in the key.
   */
  detail: (entryId: string) => [...ROOT, 'detail', entryId] as const,
  /**
   * One asset lane's pages.
   *
   * The scope is part of the key because the two lanes are different
   * collections, not two filters over one: `GALLERY` returns the public images
   * an entry may show, `CATALOG` returns the production-sensitive product
   * images one may be prepared *from*. Merging their pages under a single key
   * would let a source appear where an attachable image was meant.
   */
  assets: (scope: string, pageSize: number = GALLERY_ASSET_PAGE_SIZE) =>
    [...ROOT, 'assets', { pageSize, scope }] as const,
  /**
   * One asset rendition's bytes. Keyed on the asset and the rendition, not on
   * the entry: two entries that share an image share one cache entry, and the
   * `thumbnail` bytes are not the `catalog-preview` bytes.
   */
  assetPreview: (assetId: string, rendition: string) =>
    [...ROOT, 'asset-preview', assetId, rendition] as const,
  /** The linked-product picker's pages. */
  products: (pageSize: number = GALLERY_PRODUCT_PAGE_SIZE) =>
    [...ROOT, 'linkable-products', { pageSize }] as const,
  /**
   * The label for one already-linked product.
   *
   * A single read on a single screen, never one per row: the list deliberately
   * renders a linked/unlinked signal precisely because resolving a label per
   * row would be an N+1. Here there is exactly one linked product, and its name
   * is the only thing that can honestly stand in for it on screen.
   */
  product: (productId: string) => [...ROOT, 'linked-product', productId] as const,
} as const;
