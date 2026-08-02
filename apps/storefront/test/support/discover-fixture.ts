import type {
  ApiSuccessResponse,
  PublicProductListResponse,
  PublicProductSummaryResponse,
} from '@embroidery/api-client';

/** The envelope the generated operation resolves to (standard API envelope). */
type PublicListEnvelope = ApiSuccessResponse & { data: PublicProductListResponse };

/**
 * Fixtures for the Discover feed tests.
 *
 * Every product carries `price` and `isDisplayOutOfStock` on purpose: the API
 * really does return them, so the tests can only prove the feed drops shopping
 * chrome if the data it is given contains some.
 */
export function makePublicProduct(
  overrides: Partial<PublicProductSummaryResponse> = {},
): PublicProductSummaryResponse {
  return {
    slug: 'gau-bong-theu-tay',
    name: 'Gấu bông thêu tay',
    category: { slug: 'thu-bong', name: 'Thú bông' },
    price: { amount: '450000', currency: 'VND' },
    isDisplayOutOfStock: false,
    thumbnail: {
      role: 'THUMBNAIL',
      url: '/api/public/products/gau-bong-theu-tay/media/m-1/thumbnail',
    },
    ...overrides,
  };
}

/**
 * A product with no deliverable thumbnail. The key is **omitted** rather than
 * set to `undefined`, which is what the API does and what the repository's
 * `exactOptionalPropertyTypes` setting requires.
 */
export function makePublicProductWithoutThumbnail(
  overrides: Partial<PublicProductSummaryResponse> = {},
): PublicProductSummaryResponse {
  const { thumbnail: _thumbnail, ...rest } = makePublicProduct(overrides);
  return rest;
}

export function makePublicPage(
  items: PublicProductSummaryResponse[],
  nextCursor: string | null = null,
): PublicProductListResponse {
  return { items, hasNext: nextCursor !== null, nextCursor };
}

export function publicEnvelope(data: PublicProductListResponse): PublicListEnvelope {
  return {
    success: true,
    code: 'OK',
    message: 'Danh sách sản phẩm đã xuất bản.',
    data,
    meta: {
      requestId: '00000000-0000-0000-0000-000000000000',
      timestamp: '2026-08-02T00:00:00.000Z',
    },
  };
}
