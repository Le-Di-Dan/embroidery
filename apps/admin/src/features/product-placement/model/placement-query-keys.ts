/**
 * The query-key factory for Admin placement authoring.
 *
 * One authoritative entry per product, keyed by the product UUID alone. The
 * draft, the dirty flag and the concurrency token all derive from the cached
 * snapshot, so none of them belongs in the key — a token in a key would make
 * every successful save address a different cache entry and orphan the previous
 * one.
 *
 * Rooted separately from `admin/products` on purpose. Placement is a different
 * capability with a different backend operation, and a shared root would let an
 * invalidation aimed at the product list silently discard placement state the
 * operator is still editing.
 */
const ROOT = ['admin', 'product-placement'] as const;

export const placementQueryKeys = {
  all: ROOT,
  /** The complete authoring model for one product, retired rows included. */
  detail: (productId: string) => [...ROOT, 'detail', productId] as const,
} as const;
