/**
 * Admin gallery **editor** fixtures, shaped exactly like the `APP11-B01`,
 * `APP11-B02` and `APP11-B03A` contracts.
 *
 * The optional fields are **omitted by default**, because that is what the
 * server actually sends: an entry with no linked product has no
 * `linkedProductId` at all, an entry with no SEO text has neither field, and an
 * entry that was never archived has no `archivedAt`. A fixture that always
 * supplied them would let the editor pass tests the real API could never
 * satisfy — which is exactly what the "clear" semantics and the unresolved
 * product label exist to handle.
 *
 * There is deliberately no `altText` on any shape here, because
 * `AdminGalleryEntryAssetResponse` publishes none:
 * `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`. A fixture carrying one would let a
 * per-image alt control compile.
 *
 * All values are synthetic UUIDs and synthetic instants; no real gallery,
 * product or asset identifier appears anywhere.
 */
import type {
  AdminAssetDetailResponse,
  AdminAssetListResponse,
  AdminGalleryAssetResponse,
  AdminGalleryEntryDetailResponse,
  AdminProductDetailResponse,
  AdminProductListResponse,
} from '@embroidery/api-client';

export const EDITOR_ENTRY_ID = '019b0000-0000-7000-8000-000000001101';
export const GALLERY_ASSET_ID = '019b0000-0000-7000-8000-000000002201';
export const GALLERY_ASSET_ID_2 = '019b0000-0000-7000-8000-000000002202';
export const GALLERY_ASSET_ID_3 = '019b0000-0000-7000-8000-000000002203';
export const CATALOG_ASSET_ID = '019b0000-0000-7000-8000-000000002901';
export const PRODUCT_ID = '019b0000-0000-7000-8000-000000003301';
export const PRODUCT_ID_2 = '019b0000-0000-7000-8000-000000003302';

/** The concurrency token the guarded operations echo back. */
export const UPDATED_AT = '2026-08-31T03:00:00.000Z';
/** The token a successful guarded write advances to. */
export const UPDATED_AT_NEXT = '2026-08-31T03:05:00.000Z';
export const SOURCE_UPDATED_AT = '2026-08-20T09:00:00.000Z';

/**
 * A `DRAFT` entry with a description, no images, no linked product and no SEO
 * text — publishable in every respect except the one image it lacks.
 */
export function makeDetail(
  overrides: Partial<AdminGalleryEntryDetailResponse> = {},
): AdminGalleryEntryDetailResponse {
  return {
    galleryEntryId: EDITOR_ENTRY_ID,
    title: 'Áo thun thêu hoa sen',
    slug: 'ao-thun-theu-hoa-sen',
    description: 'Mẫu thêu hoa sen trên áo thun cotton.',
    displayOrder: 10,
    isIndexable: true,
    status: 'DRAFT',
    assets: [],
    assetCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

/** The same entry with an ordered image selection; position 0 is the cover. */
export function withAssets(
  assetIds: readonly string[],
  overrides: Partial<AdminGalleryEntryDetailResponse> = {},
): AdminGalleryEntryDetailResponse {
  const assets = assetIds.map((assetId, position) => ({ assetId, position }));
  return makeDetail({
    assets,
    assetCount: assets.length,
    ...(assetIds.length === 0 ? {} : { coverAssetId: assetIds[0] as string }),
    ...overrides,
  });
}

/** An asset row as either scoped lane returns it. */
export function makeAsset(
  overrides: Partial<AdminAssetDetailResponse> = {},
): AdminAssetDetailResponse {
  return {
    assetId: GALLERY_ASSET_ID,
    byteSize: 204_800,
    checksum: 'a'.repeat(64),
    classification: 'PUBLIC',
    kind: 'GALLERY_MEDIA',
    mediaType: 'image/jpeg',
    status: 'ACCEPTED',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: SOURCE_UPDATED_AT,
    ...overrides,
  };
}

/** A catalog source: the lane an image may be *prepared from*, never attached. */
export function makeSourceAsset(
  overrides: Partial<AdminAssetDetailResponse> = {},
): AdminAssetDetailResponse {
  return makeAsset({
    assetId: CATALOG_ASSET_ID,
    classification: 'PRODUCTION_SENSITIVE',
    kind: 'CATALOG_MEDIA',
    ...overrides,
  });
}

export function makeAssetPage(
  items: AdminAssetDetailResponse[],
  options: { next?: string } = {},
): AdminAssetListResponse {
  const { next } = options;
  return {
    items,
    ...(next === undefined ? { hasNext: false } : { hasNext: true, nextCursor: next }),
  };
}

/** The prepared copy: a **new** id, never the source's. */
export function makePreparedAsset(
  overrides: Partial<AdminGalleryAssetResponse> = {},
): AdminGalleryAssetResponse {
  return {
    assetId: GALLERY_ASSET_ID_3,
    byteSize: 204_800,
    checksum: 'a'.repeat(64),
    classification: 'PUBLIC',
    kind: 'GALLERY_MEDIA',
    mediaType: 'image/jpeg',
    renditions: [],
    status: 'ACCEPTED',
    createdAt: '2026-08-31T03:01:00.000Z',
    updatedAt: '2026-08-31T03:01:00.000Z',
    ...overrides,
  };
}

function makeProduct(productId: string, name: string): AdminProductDetailResponse {
  return {
    productId,
    name,
    slug: 'san-pham-mau',
    description: 'Mô tả sản phẩm.',
    basePriceAmount: '150000',
    currencyCode: 'VND',
    category: { slug: 'quan-ao', name: 'Quần áo' },
    status: 'DRAFT',
    media: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

export const LINKED_PRODUCT = makeProduct(PRODUCT_ID, 'Áo thun cotton trắng');
export const OTHER_PRODUCT = makeProduct(PRODUCT_ID_2, 'Khăn tay thêu tay');

export function makeProductPage(): AdminProductListResponse {
  // The list row is a summary, not a detail; the two share every field the
  // picker reads, so one shape serves both without a second fixture.
  return { items: [LINKED_PRODUCT, OTHER_PRODUCT], hasNext: false };
}

/** The standard success envelope every Admin read and write arrives in. */
export function envelope<TData>(data: TData) {
  return {
    success: true,
    code: 'OK',
    message: 'ok',
    data,
    meta: { requestId: 'req-app11-a02', timestamp: '2026-08-31T03:00:00.000Z' },
  } as never;
}
