import type {
  AdminProductDetailResponse,
  AdminProductListResponse,
  AdminProductMediaResponse,
  AdminProductSummaryResponse,
} from '@embroidery/api-client';

/**
 * Product summaries shaped exactly like the B02 contract — including the fields
 * the read-only list must never render (`basePriceAmount`, `slug`, `updatedAt`,
 * `primaryMedia`), so a leak of any of them is visible in the tests rather than
 * invisible.
 */
export function makeProduct(
  overrides: Partial<AdminProductSummaryResponse> = {},
): AdminProductSummaryResponse {
  return {
    basePriceAmount: '1250000',
    category: { name: 'Thú bông', slug: 'thu-bong' },
    createdAt: '2026-07-28T09:15:00.000Z',
    currencyCode: 'VND',
    name: 'Gấu bông thêu tay',
    productId: '01920000-0000-7000-8000-000000000001',
    slug: 'gau-bong-theu-tay',
    status: 'DRAFT',
    updatedAt: '2026-07-28T09:16:00.000Z',
    ...overrides,
  };
}

export function makeProductPage(
  items: AdminProductSummaryResponse[],
  next?: string,
): AdminProductListResponse {
  return next === undefined
    ? { hasNext: false, items }
    : { hasNext: true, items, nextCursor: next };
}

/** The success envelope the generated operation resolves with. */
export function productEnvelope(page: AdminProductListResponse) {
  return {
    success: true,
    code: 'PRODUCT_LIST_READ',
    message: 'ok',
    data: page,
    meta: { requestId: 'req-1', timestamp: '2026-07-31T00:00:00.000Z' },
  } as never;
}

/**
 * A product detail record shaped exactly like the B02 contract — including the
 * fields the form must never expose (`currencyCode` beyond display, `slug` as
 * an editable value, `updatedAt` outside the request) so a leak is visible.
 */
export function makeProductDetail(
  overrides: Partial<AdminProductDetailResponse> = {},
): AdminProductDetailResponse {
  return {
    basePriceAmount: '450000',
    category: { name: 'Khăn', slug: 'khan' },
    createdAt: '2026-07-28T09:15:00.000Z',
    currencyCode: 'VND',
    description: 'Khăn tay lụa thêu tay hoạ tiết sen đỏ.',
    media: [],
    name: 'Khăn tay thêu sen đỏ',
    productId: '01920000-0000-7000-8000-000000000001',
    slug: 'khan-tay-theu-sen-do',
    status: 'DRAFT',
    updatedAt: '2026-07-28T09:16:00.000Z',
    ...overrides,
  };
}

/** One ordered media entry; `role` mirrors the server's position derivation. */
export function makeProductMedia(
  position: number,
  overrides: Partial<AdminProductMediaResponse> = {},
): AdminProductMediaResponse {
  return {
    assetId: `01920000-0000-7000-8000-00000000000${position + 1}`,
    byteSize: 2_516_582,
    createdAt: '2026-07-27T14:35:00.000Z',
    mediaType: 'image/png',
    position,
    role: position === 0 ? 'THUMBNAIL' : 'GALLERY',
    status: 'ACCEPTED',
    ...overrides,
  };
}

/** The success envelope the generated detail/create/update operations resolve with. */
export function productDetailEnvelope(product: AdminProductDetailResponse) {
  return {
    success: true,
    code: 'PRODUCT_READ',
    message: 'ok',
    data: product,
    meta: { requestId: 'req-1', timestamp: '2026-07-31T00:00:00.000Z' },
  } as never;
}
