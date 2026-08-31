/**
 * Admin gallery list fixtures shaped exactly like the `APP11-B01` list contract.
 *
 * The optional fields are **omitted by default**, because that is what the
 * server actually sends: an entry with no images has no `coverAssetId` at all,
 * and an unlinked entry has no `linkedProductId`. A fixture that always
 * supplied them would let the list pass a test the real API could never
 * satisfy — which is exactly the defect the cover placeholder and the
 * linked-product signal exist to handle.
 *
 * The response carries a title, a slug, a status, a display order, an image
 * count and two optional ids, and nothing else. There is deliberately no
 * category, no style or need taxonomy, no description, no SEO field, no
 * timestamp and — the one this phase is defined by — no `altText`, because
 * `AdminGalleryEntrySummaryResponse` publishes none of them. A screen that
 * rendered one would be caught by the type, not merely by a reviewer.
 *
 * All values are synthetic UUIDs; no real gallery, product or asset identifier
 * appears anywhere.
 */
import type {
  AdminGalleryEntryListResponse,
  AdminGalleryEntrySummaryResponse,
} from '@embroidery/api-client';

export const ENTRY_ID = '019b0000-0000-7000-8000-000000001101';
export const ENTRY_ID_PUBLISHED = '019b0000-0000-7000-8000-000000001102';
export const ENTRY_ID_ARCHIVED = '019b0000-0000-7000-8000-000000001103';
export const COVER_ASSET_ID = '019b0000-0000-7000-8000-000000002201';
export const LINKED_PRODUCT_ID = '019b0000-0000-7000-8000-000000003301';

/** A `DRAFT` entry with no cover and no linked product — the leanest real row. */
export function makeEntry(
  overrides: Partial<AdminGalleryEntrySummaryResponse> = {},
): AdminGalleryEntrySummaryResponse {
  return {
    galleryEntryId: ENTRY_ID,
    title: 'Áo thun thêu hoa sen',
    slug: 'ao-thun-theu-hoa-sen',
    status: 'DRAFT',
    displayOrder: 10,
    assetCount: 0,
    isIndexable: true,
    ...overrides,
  };
}

export function makeListPage(
  items: AdminGalleryEntrySummaryResponse[],
  options: { next?: string } = {},
): AdminGalleryEntryListResponse {
  const { next } = options;
  return {
    items,
    ...(next === undefined ? { hasNext: false } : { hasNext: true, nextCursor: next }),
  };
}

/** The standard success envelope every Admin read arrives in. */
export function envelope<TData>(data: TData) {
  return {
    success: true,
    code: 'OK',
    message: 'ok',
    data,
    meta: { requestId: 'req-app11-a01', timestamp: '2026-08-30T03:00:00.000Z' },
  } as never;
}
