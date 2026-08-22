/**
 * The Admin SKU-authoring policy (`APP7-B01`, IMP-D052 / `APP7-G01` §11).
 *
 * One module holds every SKU value the service, the repository, the DTOs and
 * the tests read, so the order-eligibility rule cannot quietly become two
 * rules. Nothing here is new business authority: the terminology is the
 * delivered schema's (`skus.is_active`, "sellable flag (definition side)",
 * COL-TBL014-05) and the invariant is the one `APP7-R00` §5 and the `APP7-G01`
 * authority package already locked.
 *
 * ```text
 * exactly one order-eligible SKU  -> APP7-W01 may convert the Catalog branch
 * zero order-eligible SKUs        -> later conversion refuses safely
 * more than one                   -> later conversion refuses safely
 * ```
 *
 * `APP7-B01` implements the **write** half of that rule: it makes the valid
 * state reachable and refuses any Admin mutation that would leave a variant
 * with an ambiguous order-eligible set. It resolves nothing for an order, and
 * it never selects a SKU by recency, id order or any other tie-break — there is
 * no tie to break, because an ambiguous set is never allowed to exist.
 */
import type { ProductState } from '@embroidery/database';

/** The only currency DB6 permits (`ck_skus__currency_allowed`). */
export const SKU_CURRENCY = 'VND' as const;

/**
 * "Order-eligible" is exactly `is_active = true`.
 *
 * Stated once, as a named constant rather than a bare boolean at four call
 * sites, because the whole checkpoint turns on the two words meaning the same
 * thing everywhere. `APP7-R00` and `APP7-G01` call this state ACTIVE; the
 * column is `is_active`; there is no third concept and none is invented here.
 */
export const SKU_ORDER_ELIGIBLE_IS_ACTIVE = true;

/**
 * How many order-eligible SKUs one variant may carry.
 *
 * One. Zero is legal and reachable — a variant whose only SKU has been
 * deactivated — and it is not this checkpoint's business to prevent it: the
 * locked rule says later conversion refuses safely on zero, so refusing the
 * deactivation here would make a legitimate Admin action impossible in order to
 * pre-empt a refusal that is already correct.
 */
export const MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT = 1;

/**
 * Product states in which a variant may gain or change a SKU.
 *
 * Deliberately **not** the `DRAFT`-only rule `APP2-B02` applies to draft field
 * edits. A Catalog variant only reaches an APP6 approval — and therefore an
 * APP7 order — while its product is `PUBLISHED`, so a `DRAFT`-only restriction
 * would make the very state this checkpoint exists to reach unreachable
 * (`APP7-B01` §9). `ARCHIVED` is excluded: an archived product is withdrawn
 * from sale, and authoring a new sellable definition on one would contradict
 * the archive rather than extend the catalog. Nothing about the LC-04
 * publication lifecycle itself is reopened or changed.
 */
export const SKU_AUTHORABLE_PRODUCT_STATES = [
  'DRAFT',
  'PUBLISHED',
] as const satisfies readonly ProductState[];

export function isSkuAuthorableProductState(status: string): boolean {
  return (SKU_AUTHORABLE_PRODUCT_STATES as readonly string[]).includes(status);
}

/**
 * The business SKU code.
 *
 * `CST-012` / `IDX-014` make the code globally unique and **bytewise** exact
 * (`ADR-DB5-002` R2, `DB5_INDEXES_CATALOG_GALLERY_CONTENT.md`), so nothing here
 * normalizes it: no case folding, no trimming into a different value, no
 * alphabet of this checkpoint's invention. The pattern only refuses shapes the
 * exactness rule would otherwise make dangerous — whitespace and invisible
 * characters, which produce two codes a human reads as one — and the stored
 * value is byte-for-byte what the Admin sent.
 */
export const SKU_CODE_MAX_LENGTH = 64;
export const SKU_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The largest SKU price override `numeric(14,2)` can hold under the VND
 * whole-number CHECK: twelve integer digits, the same bound `APP2-B02` applies
 * to the product base price it overrides.
 */
export const MAX_SKU_PRICE_OVERRIDE_AMOUNT = 999_999_999_999n;

/** The minimum a SKU-level fact must carry to be counted. */
export interface SkuEligibilityFact {
  readonly id: string;
  readonly isActive: boolean;
}

export interface OrderEligibility {
  /** How many SKUs of the variant are order-eligible after the mutation. */
  readonly eligibleCount: number;
  /** True when no order could ever resolve one SKU without guessing. */
  readonly ambiguous: boolean;
}

/**
 * Counts the order-eligible set — the whole decision, as one pure function.
 *
 * Takes the SKUs of **one** variant, which the caller has already read inside
 * the transaction that holds the owning variant's lock. It has no opinion about
 * which SKU is "the" one: it reports how many are eligible, and ambiguity is a
 * property of the set, never of a chosen member.
 */
export function evaluateOrderEligibility(skus: readonly SkuEligibilityFact[]): OrderEligibility {
  const eligibleCount = skus.filter((sku) => sku.isActive === SKU_ORDER_ELIGIBLE_IS_ACTIVE).length;
  return {
    eligibleCount,
    ambiguous: eligibleCount > MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT,
  };
}
