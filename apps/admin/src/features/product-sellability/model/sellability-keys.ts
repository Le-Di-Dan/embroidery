/**
 * The query-key factory for the Admin sellability authoring section.
 *
 * One entry, because the section has exactly one read: `adminProductVariant_list`
 * returns every variant of the product and every SKU under each of them, active
 * and inactive, in one response. There is no per-variant SKU read to key
 * separately and none to invent — the contract publishes none.
 *
 * Keyed by product id alone. No filter, no page size and no expansion state:
 * the response is the whole authoring truth for one product, and which variant
 * happens to be expanded is a fact about the operator's screen, not about the
 * data. Putting it in the key would address a different cache entry per click
 * and re-fetch the identical list.
 *
 * The root is deliberately its own, not a child of `['admin', 'products']`.
 * A variant mutation must not be able to invalidate the product detail record
 * or the list page by prefix, because it changes neither — it changes the
 * variant list and the readiness report, and those two are invalidated by name.
 */
const ROOT = ['admin', 'product-sellability'] as const;

export const sellabilityKeys = {
  all: ROOT,
  /** Every variant and SKU of one product — the authoring and history source. */
  variants: (productId: string) => [...ROOT, productId, 'variants'] as const,
} as const;
