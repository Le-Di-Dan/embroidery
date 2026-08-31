/**
 * The list row view model, and pure page accumulation around it.
 *
 * The row components never see the raw response.
 *
 * ### The list's facts, and only the list's facts
 *
 * `AdminGalleryEntrySummaryResponse` publishes a title, a slug, a status, a
 * `display_order`, an image count, an optional `coverAssetId` and an optional
 * `linkedProductId`. There is no category, style or need taxonomy on this row,
 * no description, no SEO field and no timestamp, because the contract carries
 * none of them — and `gallery_entries` has no category column at all, which is
 * why `APP11-D01` removed the category filter from the approved frame.
 *
 * ### The linked product is a signal, never an identifier
 *
 * `linkedProductId` is a UUID with no public-safe label beside it. Rendering it
 * would put an internal identifier on screen; resolving it would open one
 * Catalog read per row — the N+1 the design package refused. So the row carries
 * a boolean and the copy catalog names it, and `APP11-A02`'s editor owns the
 * actual product selector and label.
 *
 * ### `display_order` is read, not edited
 *
 * The value is rendered as the number it is. There is no edit control, no drag
 * handle, no sort menu and no bulk reorder on this screen: the editor owns the
 * `display_order` field, which is where `FU-APP11-B01-03` is routed, and
 * changing it here would mean reordering rows underneath the very cursor that
 * pages them.
 *
 * ### The row's destination
 *
 * `href` is the editor address for this entry, built from the id. It is the one
 * place the row's UUID is used, and it is used as an address rather than
 * rendered as text.
 *
 * ### Page accumulation
 *
 * The list is cursor-paginated, so a concurrent create or reorder can shift the
 * keyset window and put one entry on two pages. Rendering it twice would be a
 * lie about the gallery and re-sorting would move rows under the operator's
 * cursor — so the first occurrence wins and the server's curated
 * `display_order` order is never disturbed.
 */
import type {
  AdminGalleryEntryListResponse,
  AdminGalleryEntrySummaryResponse,
} from '@embroidery/api-client';

import { GALLERY_LIST_COPY } from './gallery-list-copy';
import { adminGalleryEntryRoute } from './gallery-list-route';
import {
  presentGalleryStatus,
  type GalleryStatusPresentation,
} from '../../../shared/presentation/gallery-status';

export interface GalleryListRow {
  /** Stable render identity. Not rendered as text. */
  readonly key: string;
  /** The editor address for this entry. Never displayed, only linked. */
  readonly href: string;
  readonly title: string;
  /** The public address, rendered with a leading slash. Never a full URL. */
  readonly slug: string;
  readonly status: GalleryStatusPresentation;
  readonly displayOrder: number;
  readonly assetCount: number;
  /**
   * The cover image's identity, or `undefined` when the entry has none. It is
   * an id and not an address: the only way to turn it into pixels is the
   * authenticated `APP11-B03A` preview operation.
   */
  readonly coverAssetId: string | undefined;
  /**
   * Whether a product is linked. Deliberately a boolean and not the id: see the
   * module note above.
   */
  readonly hasLinkedProduct: boolean;
  /** Derived, never persisted — the contract publishes no `altText`. */
  readonly coverAlt: string;
}

export function toGalleryListRow(item: AdminGalleryEntrySummaryResponse): GalleryListRow {
  return {
    key: item.galleryEntryId,
    href: adminGalleryEntryRoute(item.galleryEntryId),
    title: item.title,
    slug: item.slug,
    status: presentGalleryStatus(item.status),
    displayOrder: item.displayOrder,
    assetCount: item.assetCount,
    coverAssetId: item.coverAssetId,
    hasLinkedProduct: item.linkedProductId !== undefined,
    coverAlt: GALLERY_LIST_COPY.cover.alt(item.title),
  };
}

/** Flattens accumulated pages in server order, first occurrence winning. */
export function flattenGalleryListPages(
  pages: readonly AdminGalleryEntryListResponse[],
): readonly GalleryListRow[] {
  const seen = new Set<string>();
  const rows: GalleryListRow[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.galleryEntryId)) {
        continue;
      }
      seen.add(item.galleryEntryId);
      rows.push(toGalleryListRow(item));
    }
  }
  return rows;
}

/**
 * The cursor for the next request, or `undefined` when the list is exhausted.
 *
 * Both parts of the contract must hold: `hasNext` alone is not a cursor, and a
 * stale `nextCursor` on a last page is not a continuation. The value is opaque —
 * it is passed back exactly as issued and never parsed into a page number.
 */
export function resolveGalleryNextCursor(
  page: AdminGalleryEntryListResponse | undefined,
): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}
