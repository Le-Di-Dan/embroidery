import {
  AdminProductRequirementResponseCode,
  type AdminProductDetailResponse,
  type AdminProductListResponse,
  type AdminProductMediaResponse,
  type AdminProductPublicationReadinessResponse,
  type AdminProductPublicationResponse,
  type AdminProductSummaryResponse,
  type AdminCategoryListItemResponse,
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

/**
 * The seven publication requirement codes in the order `APP2-B03` returns them.
 *
 * Read from the generated enum rather than written out, so a contract change
 * reaches the fixtures instead of leaving them asserting a stale set. The
 * order the enum declares is the order the server documents.
 */
export const REQUIREMENT_CODES = Object.values(AdminProductRequirementResponseCode);

/**
 * A readiness report. `satisfied` defaults to true for every code; pass
 * `unsatisfied` to fail a subset, which is how the blocked states are built.
 */
export function makeReadiness(
  overrides: {
    readonly status?: AdminProductPublicationReadinessResponse['status'];
    readonly updatedAt?: string;
    readonly productId?: string;
    readonly unsatisfied?: readonly string[];
    /** Replaces the whole list — for unknown-code and ordering tests. */
    readonly requirements?: AdminProductPublicationReadinessResponse['requirements'];
  } = {},
): AdminProductPublicationReadinessResponse {
  const unsatisfied = new Set(overrides.unsatisfied ?? []);
  const requirements =
    overrides.requirements ??
    REQUIREMENT_CODES.map((code) => ({ code, satisfied: !unsatisfied.has(code) }));

  return {
    eligible: requirements.every((requirement) => requirement.satisfied),
    productId: overrides.productId ?? '01920000-0000-7000-8000-000000000001',
    requirements,
    status: overrides.status ?? 'DRAFT',
    updatedAt: overrides.updatedAt ?? '2026-07-28T09:16:00.000Z',
  };
}

export function readinessEnvelope(readiness: AdminProductPublicationReadinessResponse) {
  return {
    success: true,
    code: 'PRODUCT_PUBLICATION_READINESS_READ',
    message: 'ok',
    data: readiness,
    meta: { requestId: 'req-1', timestamp: '2026-07-31T00:00:00.000Z' },
  } as never;
}

/** The narrow command response: id, slug, status and the advanced token. */
export function makePublicationResult(
  overrides: Partial<AdminProductPublicationResponse> = {},
): AdminProductPublicationResponse {
  return {
    productId: '01920000-0000-7000-8000-000000000001',
    slug: 'khan-tay-theu-sen-do',
    status: 'PUBLISHED',
    updatedAt: '2026-07-28T10:00:00.000Z',
    ...overrides,
  };
}

export function publicationEnvelope(result: AdminProductPublicationResponse) {
  return {
    success: true,
    code: 'PRODUCT_PUBLISHED',
    message: 'ok',
    data: result,
    meta: { requestId: 'req-1', timestamp: '2026-07-31T00:00:00.000Z' },
  } as never;
}

/**
 * The category inventory the Admin product screens read (`APP12-A01`).
 *
 * Now the **Admin** shape: `adminCategory_list` is the single inventory for
 * both the authoring options and the list filter, so every row carries its
 * lifecycle state, its published-product count and its concurrency token.
 *
 * Arbitrary fixture values, deliberately **not** the four categories migration
 * `0033` seeded. A test that asserted those would make this file a second
 * place the store's taxonomy is declared, which is the defect `APP12-C01-C1`
 * removed.
 *
 * One published, one archived — the two states the repoint is actually about:
 * the form must offer only the first, and the filter must offer both.
 */
export const CATEGORY_FIXTURES: readonly AdminCategoryListItemResponse[] = [
  makeCategory(),
  makeCategory({
    id: '019c0000-0000-7000-8000-0000000022b2',
    slug: 'tui-vai',
    name: 'Túi vải',
    status: 'ARCHIVED',
    isIndexable: false,
    displayOrder: 8,
    archivedAt: '2026-09-02T00:00:00.000Z',
  }),
];

export function makeCategory(
  overrides: Partial<AdminCategoryListItemResponse> = {},
): AdminCategoryListItemResponse {
  return {
    id: '019c0000-0000-7000-8000-0000000022b1',
    slug: 'mu-luoi-trai',
    name: 'Mũ lưỡi trai',
    status: 'PUBLISHED',
    isIndexable: true,
    displayOrder: 7,
    publishedProductCount: 0,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function categoryEnvelope(
  items: readonly AdminCategoryListItemResponse[] = CATEGORY_FIXTURES,
) {
  return {
    success: true,
    code: 'ADMIN_CATEGORY_LIST_READ',
    message: 'ok',
    data: { items: [...items] },
    meta: { requestId: 'req-1', timestamp: '2026-09-01T00:00:00.000Z' },
  } as never;
}
