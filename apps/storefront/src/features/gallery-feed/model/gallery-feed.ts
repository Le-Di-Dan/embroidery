import type {
  PublicGalleryEntryListResponse,
  PublicGalleryEntrySummaryResponse,
} from '@embroidery/api-client';

import {
  toMediaIntrinsicSize,
  type MediaIntrinsicSize,
} from '../../../shared/media/intrinsic-size';

/**
 * Projection of one `APP11-B03` list item onto what a UI05 feed card may render.
 *
 * A narrowing, not a rename — the same boundary discipline `toDiscoverCard`
 * applies. `PublicGalleryEntrySummaryResponse` also carries `galleryEntryId`,
 * `displayOrder`, `isIndexable`, `coverAssetId` and `assetCount`; none of them
 * belongs on an editorial card, so all five are dropped **here** rather than
 * carried into the component tree and merely left unrendered. A field a
 * component cannot see is a field it cannot leak.
 *
 * Each dropped field, and why:
 *
 * - `galleryEntryId` / `coverAssetId` — opaque server identities. The card
 *   addresses nothing by id: the cover already arrives as a path.
 * - `displayOrder` — the editorial position is expressed by *where the card is*,
 *   not by a number printed on it.
 * - `isIndexable` — an SEO directive, and explicitly not a visibility flag. A
 *   `false` entry renders exactly like any other; showing the flag would leak an
 *   operator's SEO decision to a visitor.
 * - `assetCount` — a count of images the feed does not show. The approved card
 *   is cover + title + description; a "12 ảnh" line would be a fact about the
 *   detail page, which is `APP11-S03`'s.
 *
 * `slug` is kept because it is the entry's immutable server-owned identity: it
 * is what dedupe and the React key are built on, and — since `APP11-S03` built
 * `/bo-suu-tap/[slug]` — what the card's one detail action addresses. It is
 * still never rendered as text.
 */
export interface GalleryFeedCard {
  /** Immutable server-owned identity; the React key and the dedupe key. */
  readonly slug: string;
  readonly title: string;
  /** Short editorial copy. `NOT NULL` on the entity, so always a string. */
  readonly description: string;
  /**
   * Relative, same-origin cover path exactly as the API returned it — the
   * publication-gated delivery route at its `thumbnail` rendition, composed
   * API-side. Never rewritten, never composed locally, and never persisted
   * beyond the current query result: the route re-checks publication and asset
   * eligibility on every request, so a stored path can outlive what it names.
   *
   * Always present. `APP11-B03` omits an entry with no currently deliverable
   * image from the feed entirely rather than advertising a broken card, so the
   * card never has to invent a cover — it only has to survive one that stops
   * resolving mid-session.
   */
  readonly coverUrl: string;
  /**
   * Intrinsic size of the derivative `coverUrl` addresses, or `undefined` when
   * the API published none (`APP12-H05-C1`). Carried so the masonry can reserve
   * each cover's box before its bytes arrive; never fabricated, so the card
   * heights stay genuinely variable.
   */
  readonly coverSize?: MediaIntrinsicSize;
}

export function toGalleryFeedCard(item: PublicGalleryEntrySummaryResponse): GalleryFeedCard {
  const coverSize = toMediaIntrinsicSize(item.coverWidth, item.coverHeight);
  return {
    slug: item.slug,
    title: item.title,
    description: item.description,
    coverUrl: item.coverUrl,
    ...(coverSize === undefined ? {} : { coverSize }),
  };
}

/**
 * Flattens keyset pages into one feed in server order, dropping any entry that
 * has already appeared.
 *
 * Order is never recomputed here. `APP11-B03` orders by `display_order ASC,
 * id ASC` and that ordering *is* the curation, so the feed appends pages in
 * arrival order and does nothing else — no sort, no height-balancing, no
 * regrouping.
 *
 * Keeping the **first** occurrence is what preserves that order: an entry whose
 * `display_order` an operator changes between two page requests can legitimately
 * surface again under a later cursor, and re-appending it would both duplicate
 * the card and shift the visitor's reading position.
 */
export function flattenGalleryPages(
  pages: readonly PublicGalleryEntryListResponse[],
): GalleryFeedCard[] {
  const seen = new Set<string>();
  const cards: GalleryFeedCard[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.slug)) continue;
      seen.add(item.slug);
      cards.push(toGalleryFeedCard(item));
    }
  }
  return cards;
}

/**
 * The cursor for the next request, or `undefined` when the feed is exhausted.
 *
 * Both conditions are required. `hasNext` alone would let a malformed page
 * (`hasNext: true`, `nextCursor: null`) drive an endless request with no cursor,
 * and a non-null cursor alone would keep requesting past the final page.
 *
 * `nextCursor` is `string | null` on this contract, unlike the Discover feed's
 * optional field — hence the explicit null check rather than an `undefined` one.
 */
export function nextGalleryCursorOf(
  page: PublicGalleryEntryListResponse | undefined,
): string | undefined {
  if (page === undefined) return undefined;
  if (!page.hasNext) return undefined;
  return page.nextCursor === null || page.nextCursor === '' ? undefined : page.nextCursor;
}
