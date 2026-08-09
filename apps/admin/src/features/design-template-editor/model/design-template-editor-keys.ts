/**
 * Query keys for the Admin Design Template editor.
 *
 * Three server facts, three roots. The Template detail is rooted under the
 * design-template capability so a list invalidation and a detail invalidation
 * are deliberate, separate acts; the placement context and the Side background
 * are rooted under their own capabilities because they belong to the Product,
 * not to the Template that happens to point at them.
 *
 * The **editable document is not here**. A draft under edit is client state that
 * has never been sent anywhere; putting it in the query cache would let a
 * background refetch replace the operator's unsaved work with the server's copy
 * and call it a cache update.
 */
const TEMPLATE_ROOT = ['admin', 'design-templates'] as const;
const PLACEMENT_ROOT = ['admin', 'product-placement'] as const;

export const designTemplateEditorKeys = {
  /** One Template header + its current version's canonical document. */
  detail: (templateId: string) => [...TEMPLATE_ROOT, 'detail', templateId] as const,
  /** The Product's authoritative placement, the source of Side and Area truth. */
  placement: (productId: string) => [...PLACEMENT_ROOT, 'detail', productId] as const,
  /**
   * One Side's authorized background bytes.
   *
   * Keyed by the pair the route is addressed with so switching scope addresses a
   * different entry rather than reusing the previous one — which is what makes
   * "never draw the previous Side's artwork under this document" a property of
   * the cache rather than a rule a component must remember.
   */
  sideBackground: (productId: string, sideId: string) =>
    [...PLACEMENT_ROOT, 'side-background', productId, sideId] as const,
  /**
   * The Products offered by the initial scope selector (`APP3-A03-C1`).
   *
   * Rooted under the Product capability, not the Template one: it is the same
   * `adminProduct_list` page the rest of the Admin reads, and rooting it here
   * would make a Template invalidation discard a list that has nothing to do
   * with Templates.
   */
  productOptions: () => ['admin', 'products', 'scope-options'] as const,
} as const;
