import type {
  ApiSuccessResponse,
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
