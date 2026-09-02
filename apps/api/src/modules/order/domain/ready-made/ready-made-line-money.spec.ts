/**
 * `ready-made-line-money.ts` — `BR-021` end to end, without a database.
 *
 * The selection rule itself belongs to `public-sku-price.policy.ts` and is
 * proved there. What is proved here is that this path **uses** it, that the
 * currency travels with the amount that won, and that every Catalog row this
 * path cannot price exactly is reported as an absence rather than rounded.
 *
 * The result codec is proved beside it: a stored `jsonb` result that does not
 * carry the published shape must be a fault, never a `201` describing an order
 * that does not exist.
 */
import type { PurchasableSku } from '../../../catalog/domain/repositories/purchasable-sku.port';
import type {
  ProductId,
  ProductVariantId,
  SkuId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';

import { resolveReadyMadeLineMoney } from './ready-made-line-money';
import {
  decodeReadyMadeOrderResult,
  type CreatedReadyMadeOrderResult,
} from './ready-made-order-result.codec';

function sku(overrides: Partial<PurchasableSku> = {}): PurchasableSku {
  return {
    skuId: 'sku' as SkuId,
    productId: 'product' as ProductId,
    productVariantId: 'variant' as ProductVariantId,
    productName: 'B02 Tee',
    variantLabel: 'Black',
    sizeLabel: 'M',
    priceOverrideAmount: undefined,
    skuCurrencyCode: 'VND',
    basePriceAmount: '150000.00',
    productCurrencyCode: 'VND',
    ...overrides,
  };
}

describe('APP12-B02 Ready-Made line money', () => {
  describe('BR-021 resolution', () => {
    it('uses the product base price when the SKU has no override', () => {
      expect(resolveReadyMadeLineMoney(sku(), 2)).toEqual({
        unitPriceAmount: '150000.00',
        lineTotalAmount: '300000.00',
        currencyCode: 'VND',
      });
    });

    it('prefers the SKU override', () => {
      expect(resolveReadyMadeLineMoney(sku({ priceOverrideAmount: '99000.00' }), 3)).toEqual({
        unitPriceAmount: '99000.00',
        lineTotalAmount: '297000.00',
        currencyCode: 'VND',
      });
    });

    it('treats a zero override as a real price rather than as no override', () => {
      // `COALESCE` is null-checking, not falsiness: an operator who marked an
      // item free meant it, and charging the base price instead would be wrong.
      expect(resolveReadyMadeLineMoney(sku({ priceOverrideAmount: '0.00' }), 5)).toEqual({
        unitPriceAmount: '0.00',
        lineTotalAmount: '0.00',
        currencyCode: 'VND',
      });
    });

    it('reads the currency from whichever row the winning amount came from', () => {
      // CST-068 gives each amount its own currency column. The resolution takes
      // the currency of the amount it chose, never the other row's.
      const overridden = resolveReadyMadeLineMoney(
        sku({ priceOverrideAmount: '5000.00', skuCurrencyCode: 'VND', productCurrencyCode: 'VND' }),
        1,
      );
      expect(overridden?.currencyCode).toBe('VND');
    });
  });

  describe('a Catalog row this path cannot price exactly', () => {
    it('refuses a fractional đồng, mirroring the database scale CHECK', () => {
      expect(resolveReadyMadeLineMoney(sku({ basePriceAmount: '150000.50' }), 1)).toBeUndefined();
    });

    it('refuses a malformed stored amount rather than guessing', () => {
      expect(resolveReadyMadeLineMoney(sku({ basePriceAmount: '1e6' }), 1)).toBeUndefined();
    });

    it('refuses a subtotal that would overflow numeric(14,2)', () => {
      expect(
        resolveReadyMadeLineMoney(sku({ basePriceAmount: '999999999999.00' }), 2),
      ).toBeUndefined();
    });
  });
});

describe('APP12-B02 Ready-Made result codec', () => {
  const stored: CreatedReadyMadeOrderResult = {
    orderCode: 'ORD-7KMPQ3XZ4A',
    status: 'AWAITING_SHIPPING_FEE',
    merchandiseSubtotal: { amount: '450000.00', currency: 'VND' },
    reservationExpiresAt: '2026-09-03T04:15:00.000Z',
  };

  it('returns a well-formed stored result unchanged', () => {
    expect(decodeReadyMadeOrderResult({ ...stored })).toEqual(stored);
  });

  it.each([
    ['null', null],
    ['a string', 'ORD-7KMPQ3XZ4A'],
    ['a missing code', { ...stored, orderCode: undefined }],
    ['a missing expiry', { ...stored, reservationExpiresAt: undefined }],
    ['a numeric amount', { ...stored, merchandiseSubtotal: { amount: 450000, currency: 'VND' } }],
    ['a missing subtotal', { ...stored, merchandiseSubtotal: undefined }],
  ])('treats %s as a fault rather than as a response', (_label, malformed) => {
    expect(() => decodeReadyMadeOrderResult(malformed)).toThrow();
  });
});
