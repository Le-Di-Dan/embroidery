/**
 * Placement-hierarchy validation port — **G-DB7-10..13**.
 *
 * Product, Variant, Side and Area each carry a foreign key proving the row they
 * name exists. Nothing in the schema proves those rows form one chain: a design
 * version could reference product A, a variant of product B and an area of a
 * side of product C, and every FK would be satisfied. `DB6_DB7_DB10_HANDOFF.md`
 * §1 assigns that check to DB7.
 *
 * A **port**, deliberately. Design, Approval and Production all need it, and
 * `BACKEND_CONVENTIONS.md` §10 forbids them from calling the catalog module's
 * concrete repository or reading its tables. They depend on this interface;
 * catalog provides the implementation.
 *
 * One named service, not repeated ad-hoc checks at each call site
 * (DB7 §13.1).
 */

export type ProductId = string & { readonly __brand: 'ProductId' };
export type ProductVariantId = string & { readonly __brand: 'ProductVariantId' };
export type ProductSideId = string & { readonly __brand: 'ProductSideId' };
export type EmbroideryAreaId = string & { readonly __brand: 'EmbroideryAreaId' };
export type SkuId = string & { readonly __brand: 'SkuId' };

/**
 * A placement reference to validate.
 *
 * Every part except the product is optional, because the callers differ: a
 * design session may name only a product and a side, while an approval
 * snapshot names the whole chain.
 */
export interface PlacementReference {
  readonly productId: ProductId;
  readonly productVariantId?: ProductVariantId | undefined;
  readonly productSideId?: ProductSideId | undefined;
  readonly embroideryAreaId?: EmbroideryAreaId | undefined;
}

export const PLACEMENT_HIERARCHY_PORT = Symbol('PLACEMENT_HIERARCHY_PORT');

export interface PlacementHierarchyPort {
  /**
   * Throws unless every supplied reference resolves into one valid chain:
   * the variant belongs to the product (G-DB7-10), the side belongs to the
   * product (G-DB7-11), and the area belongs to that side (G-DB7-12).
   *
   * Callers run this inside their own transaction, before the insert whose
   * columns it validates (G-DB7-13).
   */
  assertValidPlacement(reference: PlacementReference): Promise<void>;
}
