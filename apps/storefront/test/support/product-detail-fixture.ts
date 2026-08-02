import type { ApiSuccessResponse, PublicProductDetailResponse } from '@embroidery/api-client';

/** The envelope the generated detail operation resolves to. */
type PublicDetailEnvelope = ApiSuccessResponse & { data: PublicProductDetailResponse };

/**
 * Fixtures for the Product Detail tests.
 *
 * Every Product carries `price` and `isDisplayOutOfStock` on purpose: the API
 * really does return them, so the tests can only prove the page drops shopping
 * chrome if the data it is given contains some.
 */
export function makePublicDetail(
  overrides: Partial<PublicProductDetailResponse> = {},
): PublicProductDetailResponse {
  return {
    slug: 'gau-bong-theu-tay',
    name: 'Gấu bông thêu tay',
    description: 'Một buổi sáng tháng Ba, khu vườn nhỏ sau nhà bà ngoại nở rộ những khóm cúc.',
    category: { slug: 'thu-bong', name: 'Thú bông' },
    price: { amount: '450000', currency: 'VND' },
    isDisplayOutOfStock: false,
    media: [
      { role: 'GALLERY', url: '/api/public/products/gau-bong-theu-tay/media/m-1/catalog-preview' },
      { role: 'GALLERY', url: '/api/public/products/gau-bong-theu-tay/media/m-2/catalog-preview' },
      { role: 'GALLERY', url: '/api/public/products/gau-bong-theu-tay/media/m-3/catalog-preview' },
    ],
    seo: { isIndexable: true },
    ...overrides,
  };
}

/**
 * A Product with no description. The key is **omitted** rather than set to
 * `undefined`, which is what the API does and what the repository's
 * `exactOptionalPropertyTypes` setting requires.
 */
export function makePublicDetailWithoutDescription(
  overrides: Partial<PublicProductDetailResponse> = {},
): PublicProductDetailResponse {
  const { description: _description, ...rest } = makePublicDetail(overrides);
  return rest;
}

/** Wrap a detail payload in the standard success envelope. */
export function publicDetailEnvelope(data: PublicProductDetailResponse): PublicDetailEnvelope {
  return {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    meta: { requestId: 'test-request', timestamp: '2026-08-02T00:00:00.000Z' },
  };
}

/** The exact safe 404 the API returns for unknown / DRAFT / ARCHIVED / non-public. */
export function safeNotFoundError(): Error & { isAxiosError: true; response: { status: number } } {
  const error = new Error('Request failed with status code 404') as Error & {
    isAxiosError: true;
    response: { status: number };
  };
  error.isAxiosError = true;
  error.response = { status: 404 };
  return error;
}

/** A server-side failure that must never be reported as "not found". */
export function serverError(status = 500): Error & {
  isAxiosError: true;
  response: { status: number };
} {
  const error = new Error(`Request failed with status code ${status}`) as Error & {
    isAxiosError: true;
    response: { status: number };
  };
  error.isAxiosError = true;
  error.response = { status };
  return error;
}
