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
 * A Product whose category slug is **outside the published contract**, as the
 * running API demonstrably returns (`APP11-S04-C1`).
 *
 * `PublicCategoryResponse.slug` is declared in the committed OpenAPI artifact as
 * a closed enum — `thu-bong`, `khan`, `quan-ao`, `khac` — so the generated type
 * says this response cannot exist. It does: `categories.slug` is an
 * unconstrained `text` column, the dev database holds a fifth row `ao-thun`, and
 * `GET /api/public/products/ao-thun-cotton` returns
 * `"category": { "slug": "ao-thun", "name": "Áo thun" }`.
 *
 * The single cast lives here rather than at each call site, because the
 * divergence is one fact about the system and deserves one place that says so.
 * It is not a convenience: the whole point of the Product Detail breadcrumb rule
 * is that a *runtime* value can fall outside the Discover filter set, and a test
 * that could only express in-contract values could never reach the branch that
 * matters. The divergence itself is a backend/persistence concern this
 * checkpoint may not touch (`FU-APP11-S04-C1-02`).
 */
export function makePublicDetailWithUncontractedCategory(
  overrides: Partial<PublicProductDetailResponse> = {},
): PublicProductDetailResponse {
  return {
    ...makePublicDetail({
      slug: 'ao-thun-cotton',
      name: 'Áo thun cotton',
      media: [],
      ...overrides,
    }),
    // This used to need a two-step `as unknown as` conversion, because the
    // generated `category.slug` was a closed four-value enum and `ao-thun`
    // could not be assigned to it — a fixture fighting a type that contradicted
    // the running database. `APP12-C01` made the slug a string and the cast
    // became dead code; its absence is the clearest evidence the ceiling is
    // gone.
    //
    // Overridable, so a caller can also exercise a *malformed* slug — the one
    // case the breadcrumb still refuses to turn into a URL.
    category: overrides.category ?? { slug: 'ao-thun', name: 'Áo thun' },
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
