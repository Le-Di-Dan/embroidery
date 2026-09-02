/**
 * `BR-021` unit-price resolution (`APP12-B01`).
 *
 * The test values are chosen so an accidental fallback is visible rather than
 * plausible: the override and the base price are never the same number, so a
 * resolution that took the wrong operand produces a wrong answer instead of a
 * coincidentally right one.
 */
import { resolvePublicSkuUnitPrice } from './public-sku-price.policy';

const PRODUCT = { basePriceAmount: '250000.00', currencyCode: 'VND' } as const;

describe('APP12-B01 public SKU unit price', () => {
  it('falls back to the product base price when the SKU has no override', () => {
    expect(
      resolvePublicSkuUnitPrice({ priceOverrideAmount: undefined, currencyCode: 'VND' }, PRODUCT),
    ).toEqual({ amount: '250000.00', currencyCode: 'VND' });
  });

  it('prefers the SKU override over the base price', () => {
    expect(
      resolvePublicSkuUnitPrice({ priceOverrideAmount: '199000.00', currencyCode: 'VND' }, PRODUCT),
    ).toEqual({ amount: '199000.00', currencyCode: 'VND' });
  });

  it('treats an override of zero as a price, not as an absent override', () => {
    // `ck_skus__price_override_non_negative` admits zero and `COALESCE` is
    // null-checking, not falsiness. Reading `'0.00'` as "no override" would
    // silently charge 250000 for an item an operator marked free.
    expect(
      resolvePublicSkuUnitPrice({ priceOverrideAmount: '0.00', currencyCode: 'VND' }, PRODUCT),
    ).toEqual({ amount: '0.00', currencyCode: 'VND' });
  });

  it('returns the amount byte-for-byte, parsing nothing', () => {
    // The whole reason `numeric(14,2)` crosses the driver as a string (INV-11).
    // A resolution that parsed either operand would put a VND amount through an
    // IEEE-754 double for no gain — there is nothing here to compute.
    const large = { priceOverrideAmount: '999999999999.00', currencyCode: 'VND' };
    const resolved = resolvePublicSkuUnitPrice(large, PRODUCT);
    expect(resolved.amount).toBe('999999999999.00');
    expect(typeof resolved.amount).toBe('string');
  });

  it('takes the currency from whichever row supplied the amount', () => {
    // Both columns are CHECK-locked to VND today, so this is asserted with a
    // value the closed set does not contain: the point is that the currency is
    // *read* rather than assumed, so the function is already correct on the day
    // a second currency is allowed.
    expect(
      resolvePublicSkuUnitPrice({ priceOverrideAmount: '12.34', currencyCode: 'XTS' }, PRODUCT)
        .currencyCode,
    ).toBe('XTS');
    expect(
      resolvePublicSkuUnitPrice({ priceOverrideAmount: undefined, currencyCode: 'XTS' }, PRODUCT)
        .currencyCode,
    ).toBe('VND');
  });
});
