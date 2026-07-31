import type { AdminProductListResponse, AdminProductSummaryResponse } from '@embroidery/api-client';

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
