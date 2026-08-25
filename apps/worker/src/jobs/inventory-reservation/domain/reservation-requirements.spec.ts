/**
 * The aggregation rule, proved without a database (`APP8-W01` §6, §8, §11, §12).
 *
 * These are the properties `CST-016` and `PO-APP8-001` turn on, and they are
 * pure functions of the frozen items — so they are asserted here rather than
 * inferred from a row count in the integration suite, which proves the same
 * outcomes end-to-end but cannot show *why* they hold.
 */
import { aggregateCatalogRequirements } from '@embroidery/persistence';
import type { OrderItem, SkuId } from '@embroidery/persistence';

import { canonicalReservePreimage, reserveFingerprint } from './order-reserve-idempotency';

function catalogItem(position: number, skuId: string, quantity: number): OrderItem {
  return {
    position,
    skuId,
    customerOwnedProductId: undefined,
    productName: 'Tee',
    variantLabel: 'Black',
    sizeLabel: 'M',
    quantity,
    unitPriceAmount: '150000.00',
    lineTotalAmount: `${150000 * quantity}.00`,
  };
}

function copItem(position: number, quantity: number): OrderItem {
  return {
    position,
    skuId: undefined,
    customerOwnedProductId: `cop-${position}`,
    productName: 'Customer jacket',
    variantLabel: undefined,
    sizeLabel: undefined,
    quantity,
    unitPriceAmount: '0.00',
    lineTotalAmount: '0.00',
  };
}

describe('aggregateCatalogRequirements', () => {
  it('reserves the frozen quantity of a single Catalog item', () => {
    expect(aggregateCatalogRequirements([catalogItem(1, 'sku-a', 4)])).toEqual([
      { skuId: 'sku-a', quantity: 4 },
    ]);
  });

  it('sums two items resolving to the same SKU into ONE requirement', () => {
    // `CST-016` allows one active RESERVED row per (order, stock). Per-item
    // reservations would collide with that index on the second insert; this is
    // the rule that means the second insert never happens (`APP8-G01` §1.5).
    const requirements = aggregateCatalogRequirements([
      catalogItem(1, 'sku-x', 2),
      catalogItem(2, 'sku-x', 3),
    ]);

    expect(requirements).toEqual([{ skuId: 'sku-x', quantity: 5 }]);
  });

  it('reproduces the checkpoint worked example exactly', () => {
    // `APP8-W01` §6: SKU-X 2 + SKU-X 3, SKU-Y 1, one COP item -> X=5, Y=1, none.
    const requirements = aggregateCatalogRequirements([
      catalogItem(1, 'sku-x', 2),
      catalogItem(2, 'sku-x', 3),
      catalogItem(3, 'sku-y', 1),
      copItem(4, 1),
    ]);

    expect(requirements).toEqual([
      { skuId: 'sku-x', quantity: 5 },
      { skuId: 'sku-y', quantity: 1 },
    ]);
  });

  it('gives a COP item no inventory identity at all', () => {
    // Not a zero-quantity entry and not a placeholder SKU: absent
    // (`PO-APP8-001`, COP_FAKE_INVENTORY_PATH = FORBIDDEN).
    expect(aggregateCatalogRequirements([copItem(1, 3), copItem(2, 1)])).toEqual([]);
  });

  it('orders requirements by SKU id, whatever order the items arrive in', () => {
    // The lock order. Two workers whose orders overlap on {a, b} must take the
    // two anchors in the same direction, or they can deadlock on each other.
    const forwards = aggregateCatalogRequirements([
      catalogItem(1, 'sku-a', 1),
      catalogItem(2, 'sku-b', 1),
      catalogItem(3, 'sku-c', 1),
    ]);
    const backwards = aggregateCatalogRequirements([
      catalogItem(1, 'sku-c', 1),
      catalogItem(2, 'sku-b', 1),
      catalogItem(3, 'sku-a', 1),
    ]);

    expect(forwards.map((requirement) => requirement.skuId)).toEqual(['sku-a', 'sku-b', 'sku-c']);
    expect(backwards).toEqual(forwards);
  });
});

describe('the inventory.reserve fingerprint', () => {
  const orderId = 'order-1';
  const requirements = [
    { skuId: 'sku-a' as SkuId, quantity: 2 },
    { skuId: 'sku-b' as SkuId, quantity: 3 },
  ];

  it('is stable across executions of the same frozen set', () => {
    expect(reserveFingerprint(orderId, requirements)).toBe(
      reserveFingerprint(orderId, [...requirements]),
    );
  });

  it('distinguishes a different quantity for the same SKU set', () => {
    expect(reserveFingerprint(orderId, requirements)).not.toBe(
      reserveFingerprint(orderId, [
        { skuId: 'sku-a' as SkuId, quantity: 2 },
        { skuId: 'sku-b' as SkuId, quantity: 4 },
      ]),
    );
  });

  it('length-prefixes every field, so no two field sequences share a pre-image', () => {
    expect(canonicalReservePreimage('ab', [{ skuId: 'c' as SkuId, quantity: 1 }])).not.toBe(
      canonicalReservePreimage('a', [{ skuId: 'bc' as SkuId, quantity: 1 }]),
    );
  });
});
