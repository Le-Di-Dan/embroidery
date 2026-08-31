import type {
  ApiSuccessResponse,
  PublicGalleryAssetResponse,
  PublicGalleryEntryDetailResponse,
  PublicGalleryEntryListResponse,
  PublicGalleryEntrySummaryResponse,
} from '@embroidery/api-client';

/** The envelope the generated operation resolves to (standard API envelope). */
type PublicGalleryListEnvelope = ApiSuccessResponse & { data: PublicGalleryEntryListResponse };

/**
 * Fixtures for the public gallery feed tests.
 *
 * Every entry carries the full `APP11-B03` summary — `galleryEntryId`,
 * `coverAssetId`, `displayOrder`, `isIndexable` and `assetCount` — on purpose:
 * the API really does return all five, so the tests can only prove the feed
 * drops them at the projection boundary if the data it is given contains them.
 *
 * `isIndexable` defaults to `true` and a `noindex` entry is built by overriding
 * it. That flag is an SEO directive, never a visibility one: `APP11-B03` lists a
 * `false` entry exactly like any other, and the feed must too.
 */
export function makeGalleryEntry(
  overrides: Partial<PublicGalleryEntrySummaryResponse> = {},
): PublicGalleryEntrySummaryResponse {
  const slug = overrides.slug ?? 'ky-niem-duoc-giu-lai';
  return {
    galleryEntryId: '0199c0de-0000-7000-8000-000000000001',
    slug,
    title: 'Kỷ niệm được giữ lại',
    description: 'Những tấm khăn thêu tay ghi lại một mốc thời gian của gia đình.',
    displayOrder: 0,
    isIndexable: true,
    coverAssetId: '0199c0de-0000-7000-8000-0000000000a1',
    coverUrl: `/api/public/gallery-entries/${slug}/assets/0199c0de-0000-7000-8000-0000000000a1/thumbnail`,
    assetCount: 6,
    ...overrides,
  };
}

export function makeGalleryPage(
  items: PublicGalleryEntrySummaryResponse[],
  nextCursor: string | null = null,
): PublicGalleryEntryListResponse {
  return { items, hasNext: nextCursor !== null, nextCursor };
}

export function galleryEnvelope(data: PublicGalleryEntryListResponse): PublicGalleryListEnvelope {
  return {
    success: true,
    code: 'OK',
    message: 'Danh sách mục bộ sưu tập đã xuất bản.',
    data,
    meta: {
      requestId: '00000000-0000-0000-0000-000000000000',
      timestamp: '2026-08-31T00:00:00.000Z',
    },
  };
}

/** The envelope the detail operation resolves to (standard API envelope). */
type PublicGalleryDetailEnvelope = ApiSuccessResponse & {
  data: PublicGalleryEntryDetailResponse;
};

/** The entry slug every detail fixture below uses unless overridden. */
export const GALLERY_DETAIL_SLUG = 'ky-niem-duoc-giu-lai';

/**
 * One deliverable image, addressed exactly as `APP11-B03` composes it: the
 * publication-gated delivery route at the **detail** rendition
 * (`catalog-preview`). The tests assert against these strings rather than
 * rebuilding them, so a page that composed its own path would fail.
 */
export function makeGalleryAsset(
  index: number,
  slug: string = GALLERY_DETAIL_SLUG,
): PublicGalleryAssetResponse {
  const assetId = `0199c0de-0000-7000-8000-0000000000${`a${index + 1}`.padStart(2, '0')}`;
  return {
    assetId,
    position: index,
    url: `/api/public/gallery-entries/${slug}/assets/${assetId}/catalog-preview`,
  };
}

/**
 * A published gallery entry detail.
 *
 * It carries the full `APP11-B03` payload — `galleryEntryId`, `displayOrder`,
 * every asset's `assetId` and `position`, and the whole `seo` object — on
 * purpose: the API really does return all of them, so the tests can only prove
 * the page drops them at the projection boundary if the data it is given
 * contains them.
 *
 * `assetCount` has no analogue here: the detail returns the assets themselves,
 * and `APP11-B03` never returns an empty array on a 200 — a published entry
 * with no currently deliverable image answers the safe 404 instead. There is
 * therefore deliberately no "detail with zero media" builder: that response
 * does not exist, and providing a way to fake it would let a test certify a
 * state the backend has made unreachable.
 */
export function makeGalleryDetail(
  overrides: Partial<PublicGalleryEntryDetailResponse> = {},
): PublicGalleryEntryDetailResponse {
  const slug = overrides.slug ?? GALLERY_DETAIL_SLUG;
  return {
    galleryEntryId: '0199c0de-0000-7000-8000-000000000001',
    slug,
    title: 'Kỷ niệm được giữ lại',
    description:
      'Những tấm khăn thêu tay ghi lại một mốc thời gian của gia đình, khâu trong sáu tuần mùa hè.',
    displayOrder: 0,
    assets: [makeGalleryAsset(0, slug), makeGalleryAsset(1, slug), makeGalleryAsset(2, slug)],
    seo: { isIndexable: true },
    linkedProduct: null,
    ...overrides,
  };
}

/** The one-image state: no thumbnail strip, no prev/next, no position line. */
export function makeSingleImageGalleryDetail(
  overrides: Partial<PublicGalleryEntryDetailResponse> = {},
): PublicGalleryEntryDetailResponse {
  const base = makeGalleryDetail(overrides);
  return { ...base, assets: [makeGalleryAsset(0, base.slug)] };
}

export function galleryDetailEnvelope(
  data: PublicGalleryEntryDetailResponse,
): PublicGalleryDetailEnvelope {
  return {
    success: true,
    code: 'OK',
    message: 'Mục bộ sưu tập đã xuất bản.',
    data,
    meta: {
      requestId: '00000000-0000-0000-0000-000000000000',
      timestamp: '2026-08-31T00:00:00.000Z',
    },
  };
}

/**
 * The one safe refusal `APP11-B03` publishes.
 *
 * An unknown slug, a `DRAFT`, an `ARCHIVED` entry and a published entry with
 * no currently deliverable image are all *this* — byte for byte. There is
 * deliberately no per-cause builder, because a test that could tell them apart
 * would be testing a distinction the contract refuses to make.
 */
export function galleryNotFoundError(): Error & {
  isAxiosError: true;
  response: { status: number };
} {
  const error = new Error('Request failed with status code 404') as Error & {
    isAxiosError: true;
    response: { status: number };
  };
  error.isAxiosError = true;
  error.response = { status: 404 };
  return error;
}

/** A server-side failure that must never be reported as "not found". */
export function galleryServerError(status = 500): Error & {
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
