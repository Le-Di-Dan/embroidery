import type {
  PublicProductVariantListResponse,
  ReadyMadeOrderCreatedResponse,
} from '@embroidery/api-client';

import type { ReadyMadeCheckoutView } from '../../src/features/ready-made-checkout';
import { resolveCheckoutSelection } from '../../src/features/ready-made-checkout';
import { toReadyMadePurchaseView } from '../../src/features/ready-made-purchase/model/purchase-projection';
import {
  makeSku,
  makeVariant,
  makeVariantList,
  makeVariantMatrix,
} from './ready-made-purchase-fixture';

/**
 * Fixtures for the `APP12-S02` checkout.
 *
 * Built on the `APP12-S01` purchase fixtures rather than beside them: the
 * checkout consumes the same projection the panel does, and a second shape of
 * the same contract is exactly how the two screens would start disagreeing about
 * what a buyable SKU is.
 *
 * One thing is added — an **ambiguous** variant, two order-eligible SKUs under
 * one customer-visible label. The write side forbids it
 * (`MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT = 1`) and no application path produces
 * it, which is precisely why it has to be written by hand: the fail-closed rule
 * is only provable against the state it exists for.
 */

/** The two SKU ids the ambiguous variant publishes, in the server's own order. */
export const AMBIGUOUS_SKU_IDS = ['sku-xanh-m-a', 'sku-xanh-m-b'] as const;

/** The plainly buyable SKU every happy-path checkout resolves to. */
export const BUYABLE_SKU_ID = 'sku-trang-m';

/** The one SKU published with zero availability. */
export const SOLD_OUT_SKU_ID = 'sku-trang-l';

/** The S01 matrix, plus the invalid state the read side must survive. */
export function makeCheckoutVariantList(): PublicProductVariantListResponse {
  return makeVariantList([
    ...makeVariantMatrix(),
    makeVariant({
      productVariantId: 'v-xanh-m',
      colorName: 'Xanh rêu',
      sizeLabel: 'M',
      skus: [
        makeSku({
          skuId: AMBIGUOUS_SKU_IDS[0],
          unitPrice: { amount: '100000', currency: 'VND' },
          availableQuantity: 9,
        }),
        makeSku({ skuId: AMBIGUOUS_SKU_IDS[1], availableQuantity: 1 }),
      ],
    }),
  ]);
}

/**
 * The view the route resolves on the server and hands to the island.
 *
 * Composed through the **real** `resolveCheckoutSelection` rather than by
 * writing a selection literal, so a component test can never be given a
 * selection the resolver would have refused.
 */
export function makeCheckoutView(
  overrides: {
    readonly skuHint?: string;
    readonly quantityHint?: string;
    readonly thumbnailUrl?: string;
  } = {},
): ReadyMadeCheckoutView {
  const view = toReadyMadePurchaseView(makeCheckoutVariantList());
  return {
    slug: 'ao-thun-theu-tay',
    name: 'Áo thun thêu tay',
    ...(overrides.thumbnailUrl === undefined ? {} : { thumbnailUrl: overrides.thumbnailUrl }),
    selection: resolveCheckoutSelection({
      view,
      skuHint: overrides.skuHint ?? BUYABLE_SKU_ID,
      quantityHint: overrides.quantityHint ?? '2',
    }),
  };
}

/**
 * A created order, shaped exactly as `APP12-B02` publishes it.
 *
 * `access` carries `delivered`, `expiresAt` and `scopeKind` and **no token** —
 * the contract has no field for one, which is what makes "the checkout cannot
 * expose it" a property of the shape rather than of the component's discretion.
 */
export function makeCreatedOrder(
  overrides: Partial<ReadyMadeOrderCreatedResponse> = {},
): ReadyMadeOrderCreatedResponse {
  return {
    orderCode: 'DH-2026-0042',
    status: 'AWAITING_SHIPPING_FEE',
    merchandiseSubtotal: { amount: '798000', currency: 'VND' },
    reservationExpiresAt: '2026-09-03T09:30:00.000Z',
    access: {
      delivered: true,
      expiresAt: '2026-09-09T09:30:00.000Z',
      scopeKind: 'ORDER_ACCESS',
    },
    ...overrides,
  };
}
