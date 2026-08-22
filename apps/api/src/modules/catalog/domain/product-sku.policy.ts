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
 * The business SKU code has **no policy constant here, deliberately**
 * (`APP7-B01-C1`, finalised by `APP7-B01-FD1`).
 *
 * The accepted authority for `skus.code` is exactly this, and nothing more —
 * verified against the physical DDL, `0007_create_catalog_tables.sql:59,66`,
 * which declares `"code" text NOT NULL` with `uq_skus__code` and no CHECK, and
 * which no later migration alters:
 *
 * ```text
 * type          text NOT NULL          (COL-TBL014-02, catalog/skus.ts)
 * comparison    bytewise, `C`          (ADR-DB5-002 R1 Population A, R2)
 * uniqueness    global, uq_skus__code  (CST-012 / IDX-014)
 * alphabet      NONE
 * max length    NONE
 * nonblank      NONE  (no CHECK on this column, or on any `code` column)
 * normalization NONE  (ADR-DB5-002 R3 names lowercase email, E.164 phone and
 *                      slugified paths as the normalized columns; a SKU code
 *                      is not among them)
 * ```
 *
 * Two rules therefore live nowhere in this module, and their absence is the
 * point:
 *
 * - **No alphabet.** `APP7-B01` shipped `^[A-Za-z0-9][A-Za-z0-9._-]*$`. No
 *   accepted source supports it: `text` restricts no character, and bytewise
 *   comparison is a statement about *equality*, not about which bytes may be
 *   stored. A Vietnamese code such as `ÁO-THUN-ĐEN-M` is a legal identifier the
 *   regex silently refused. `APP7-B01-C1` removed it rather than replacing it.
 * - **No length or nonblank bound.** `APP7-B01-C1` kept `min(1)`/`max(64)` and
 *   argued they were payload limits rather than identifier rules. The Product
 *   Owner ruled otherwise in `APP7-B01-FD1`: a field-specific rule that rejects
 *   an otherwise authority-valid database value is a domain/API contract
 *   constraint whatever the comment calls it, and transport abuse belongs to
 *   the delivered body-size controls, not to a SKU-shaped number invented here.
 *   `SKU_CODE_MAX_LENGTH` is deleted rather than lowered or raised.
 *
 * Nothing normalizes the code either: no case folding, no trimming, no Unicode
 * normalization, no character replacement. The stored value is byte-for-byte
 * what the Admin sent, which is what makes `uq_skus__code` genuine business
 * uniqueness rather than an approximation of it.
 *
 * A business-level SKU-code policy — if the Product Owner ever wants one — needs
 * explicit authority of its own. `APP7-B01` may not invent it.
 */

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
