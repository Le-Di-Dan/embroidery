/**
 * The one query-key factory for the Admin category capability (`APP12-A01`).
 *
 * A single unparameterised key, because the read is a single unparameterised
 * read: `adminCategory_list` answers the whole taxonomy in every state, with no
 * page, no cursor and no filter. A screen wanting a subset filters the cached
 * rows on `status` itself, so a status in the key would fragment one answer
 * into several caches of the same data.
 *
 * The Admin category inventory is deliberately **not** the product feature's
 * `productQueryKeys.categories()`. That key now addresses the same operation,
 * and both are invalidated after a category write — see the mutation hook.
 */
const ROOT = ['admin', 'categories'] as const;

export const categoryQueryKeys = {
  all: ROOT,
  /** The complete taxonomy: draft, published and archived alike. */
  inventory: () => [...ROOT, 'inventory'] as const,
} as const;
