/**
 * @jest-environment node
 *
 * The `Chưa xét` presentation rule (`APP12-N02.A01`, `D01` §J.4).
 *
 * The delivered evaluator marks a dependent commerce criterion **vacuously
 * satisfied** when its prerequisite is missing — `HAS_ORDER_ELIGIBLE_SKU` is
 * `true` for a product with no variant at all, because "every eligible SKU is
 * priced" holds when none is. That is correct as logic and misleading as
 * advice, and this is the one place the difference is resolved.
 *
 * Two properties are proved here and are the reason the rule is safe:
 *
 * 1. **`satisfied` is never rewritten.** The server's verdict survives on every
 *    row, so nothing downstream — including the publish gate, which reads
 *    `eligible` from the report — can be moved by how a row reads.
 * 2. **Each of states A, B and C names exactly one thing to do.** That is the
 *    evaluator's philosophy, preserved rather than fought.
 */
import { AdminProductRequirementResponseCode } from '@embroidery/api-client';

import { toRequirementRows } from '../../src/features/products/model/product-publication';

const CODES = AdminProductRequirementResponseCode;

/** The seven non-commerce criteria, all met, so only the commerce chain varies. */
const FOUNDATION = [
  CODES.PRODUCT_NAME_READY,
  CODES.PRODUCT_DESCRIPTION_READY,
  CODES.PRODUCT_CATEGORY_READY,
  CODES.PRODUCT_PRICE_READY,
  CODES.PRODUCT_MEDIA_READY,
  CODES.PRODUCT_MEDIA_ASSETS_READY,
  CODES.PRODUCT_MEDIA_DERIVATIVES_READY,
].map((code) => ({ code, satisfied: true }));

function report(commerce: {
  hasActiveVariant: boolean;
  hasOrderEligibleSku: boolean;
  skuPriceResolvable: boolean;
}) {
  return [
    ...FOUNDATION,
    { code: CODES.HAS_ACTIVE_VARIANT, satisfied: commerce.hasActiveVariant },
    { code: CODES.HAS_ORDER_ELIGIBLE_SKU, satisfied: commerce.hasOrderEligibleSku },
    { code: CODES.SKU_PRICE_RESOLVABLE, satisfied: commerce.skuPriceResolvable },
  ];
}

function presentationOf(rows: readonly { code: string; presentation: string }[], code: string) {
  return rows.find((row) => row.code === code)?.presentation;
}

describe('dependent-criterion presentation', () => {
  it('state A — no active variant: the two dependants read as not evaluated', () => {
    // The evaluator reports both dependants as vacuously satisfied here.
    const rows = toRequirementRows(
      report({ hasActiveVariant: false, hasOrderEligibleSku: true, skuPriceResolvable: true }),
    );
    expect(presentationOf(rows, CODES.HAS_ACTIVE_VARIANT)).toBe('unsatisfied');
    expect(presentationOf(rows, CODES.HAS_ORDER_ELIGIBLE_SKU)).toBe('pending');
    expect(presentationOf(rows, CODES.SKU_PRICE_RESOLVABLE)).toBe('pending');
    // Exactly one actionable failure, which is the whole point of the rule.
    expect(rows.filter((row) => row.presentation === 'unsatisfied')).toHaveLength(1);
  });

  it('state B — active variant, no eligible SKU: only the price row is deferred', () => {
    const rows = toRequirementRows(
      report({ hasActiveVariant: true, hasOrderEligibleSku: false, skuPriceResolvable: true }),
    );
    expect(presentationOf(rows, CODES.HAS_ACTIVE_VARIANT)).toBe('satisfied');
    expect(presentationOf(rows, CODES.HAS_ORDER_ELIGIBLE_SKU)).toBe('unsatisfied');
    expect(presentationOf(rows, CODES.SKU_PRICE_RESOLVABLE)).toBe('pending');
    expect(rows.filter((row) => row.presentation === 'unsatisfied')).toHaveLength(1);
  });

  it('state C — eligible SKU, unusable price: the price row is a real failure', () => {
    const rows = toRequirementRows(
      report({ hasActiveVariant: true, hasOrderEligibleSku: true, skuPriceResolvable: false }),
    );
    expect(presentationOf(rows, CODES.SKU_PRICE_RESOLVABLE)).toBe('unsatisfied');
    // The base-price criterion stays green: `977:413` is the override-"0" case,
    // where sending the operator to the product's price would find nothing wrong.
    expect(presentationOf(rows, CODES.PRODUCT_PRICE_READY)).toBe('satisfied');
    expect(rows.filter((row) => row.presentation === 'unsatisfied')).toHaveLength(1);
  });

  it('states D and E — a valid structure reads 10/10 whatever the stock is', () => {
    const rows = toRequirementRows(
      report({ hasActiveVariant: true, hasOrderEligibleSku: true, skuPriceResolvable: true }),
    );
    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.presentation === 'satisfied')).toBe(true);
    // Stock has no row here and no row is derived from one: sold-out and
    // structurally unsellable stay different facts.
    expect(rows.map((row) => row.code)).not.toContain('PRODUCT_STOCK_READY');
  });

  it('never rewrites the server verdict it presents differently', () => {
    const rows = toRequirementRows(
      report({ hasActiveVariant: false, hasOrderEligibleSku: true, skuPriceResolvable: true }),
    );
    const dependant = rows.find((row) => row.code === CODES.HAS_ORDER_ELIGIBLE_SKU);
    expect(dependant?.satisfied).toBe(true);
    expect(dependant?.presentation).toBe('pending');
  });

  it('does not grey the chain when an older report omits the commerce criteria', () => {
    // A criterion the report did not carry cannot block one that follows it: a
    // server without the chain must not turn the whole checklist grey.
    const rows = toRequirementRows(FOUNDATION);
    expect(rows.every((row) => row.presentation === 'satisfied')).toBe(true);
  });

  it('leaves an unrecognised code visibly unmet and never pending', () => {
    const rows = toRequirementRows([
      ...FOUNDATION,
      { code: 'SOMETHING_THIS_BUILD_HAS_NEVER_SEEN', satisfied: true } as never,
    ]);
    const unknown = rows[rows.length - 1];
    expect(unknown?.satisfied).toBe(false);
    expect(unknown?.presentation).toBe('unsatisfied');
    expect(unknown?.unknown).toBe(true);
  });
});
