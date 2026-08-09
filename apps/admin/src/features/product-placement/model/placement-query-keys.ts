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
  /**
   * One Side's authorized background bytes (`APP3-B02A`).
   *
   * Keyed by the pair the route is addressed with, so switching Side addresses a
   * different entry rather than reusing the previous one — which is what makes
   * "never show the previous Side's image under the new Side's areas" a property
   * of the cache rather than a rule a component has to remember.
   *
   * Deliberately **not** keyed by `backgroundAssetId`: the route serves whatever
   * background the *persisted* Side association currently names, so an id from
   * an unsaved draft in the key would address bytes the server would not return.
   */
  sideBackground: (productId: string, sideId: string) =>
    [...ROOT, 'side-background', productId, sideId] as const,
} as const;
