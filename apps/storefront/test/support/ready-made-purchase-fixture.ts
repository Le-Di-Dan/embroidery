import type {
  ApiSuccessResponse,
  PublicProductSkuResponse,
  PublicProductVariantListResponse,
  PublicProductVariantResponse,
} from '@embroidery/api-client';

/**
 * Fixtures for the `APP12-S01` Ready-Made purchase panel.
 *
 * Shaped exactly as `APP12-B01` publishes: every variant carries a `skus` array
 * that may be empty, may hold one order-eligible SKU, or — the case the write
 * side forbids and the read side must still survive — more than one. Prices are
 * decimal **strings** with their currency beside them, because that is what
 * crosses the wire and a fixture that used numbers would let a `Number()` slip
 * into the panel unnoticed.
 *
 * Values are deliberately distinct (`450000` base, `399000` and `1250000`
 * overrides; availability 8, 3, 0) so a component that read the wrong SKU fails
 * rather than coincidentally passes.
 */
type PublicVariantEnvelope = ApiSuccessResponse & { data: PublicProductVariantListResponse };

export function makeSku(
  overrides: Partial<PublicProductSkuResponse> = {},
): PublicProductSkuResponse {
  return {
    skuId: '11111111-1111-4111-8111-111111111111',
    unitPrice: { amount: '450000', currency: 'VND' },
    availableQuantity: 8,
    ...overrides,
  };
}

export function makeVariant(
  overrides: Partial<PublicProductVariantResponse> = {},
): PublicProductVariantResponse {
  return {
    productVariantId: '22222222-2222-4222-8222-222222222222',
    colorName: 'Trắng',
    sizeLabel: 'M',
    skus: [makeSku()],
    ...overrides,
  };
}

/**
 * Two colours × two sizes, with every purchase state represented once:
 *
 * ```text
 * Trắng · M   one SKU, 8 available, price override 399000  → buyable
 * Trắng · L   one SKU, 0 available                          → sold out (`· hết`)
 * Đen   · M   one SKU, 3 available, no override             → buyable
 * Đen   · L   no SKU at all                                 → never sellable
 * ```
 */
export function makeVariantMatrix(): readonly PublicProductVariantResponse[] {
  return [
    makeVariant({
      productVariantId: 'v-trang-m',
      colorName: 'Trắng',
      sizeLabel: 'M',
      skus: [
        makeSku({
          skuId: 'sku-trang-m',
          unitPrice: { amount: '399000', currency: 'VND' },
          availableQuantity: 8,
        }),
      ],
    }),
    makeVariant({
      productVariantId: 'v-trang-l',
      colorName: 'Trắng',
      sizeLabel: 'L',
      skus: [makeSku({ skuId: 'sku-trang-l', availableQuantity: 0 })],
    }),
    makeVariant({
      productVariantId: 'v-den-m',
      colorName: 'Đen',
      sizeLabel: 'M',
      skus: [
        makeSku({
          skuId: 'sku-den-m',
          unitPrice: { amount: '1250000', currency: 'VND' },
          availableQuantity: 3,
        }),
      ],
    }),
    makeVariant({
      productVariantId: 'v-den-l',
      colorName: 'Đen',
      sizeLabel: 'L',
      skus: [],
    }),
  ];
}

export function makeVariantList(
  variants: readonly PublicProductVariantResponse[] = [makeVariant()],
): PublicProductVariantListResponse {
  return {
    productId: '33333333-3333-4333-8333-333333333333',
    variants: [...variants],
  };
}

/** Wrap a variant payload in the standard success envelope. */
export function publicVariantEnvelope(
  data: PublicProductVariantListResponse,
): PublicVariantEnvelope {
  return {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    meta: { requestId: 'test-request', timestamp: '2026-09-02T00:00:00.000Z' },
  };
}
