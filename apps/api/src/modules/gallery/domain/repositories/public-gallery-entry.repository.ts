/**
 * The narrow read port behind the two public gallery queries (`APP11-B03` §12).
 *
 * A **third** Gallery port rather than a widening of the two that exist. The
 * authoring port (`GALLERY_ENTRY_REPOSITORY`) returns lifecycle evidence and
 * the concurrency token, neither of which a public caller may see; the
 * publication port (`GALLERY_ENTRY_PUBLICATION_REPOSITORY`) takes `FOR UPDATE`
 * and `FOR SHARE` locks, which an anonymous GET must never do — a public read
 * that locks rows lets unauthenticated traffic block an operator's write.
 *
 * Rows crossing this boundary are already narrowed to what a public caller may
 * see: the repository applies the publication predicate *and* the media
 * deliverability predicate, so no caller can forget either. The shapes below
 * are still *internal* — they carry `gallery_entries.id` because keyset
 * pagination needs a tie-breaker and `linked_product_id` because the projection
 * has to ask Catalog whether that product is itself public. The projection layer
 * decides which of these ever reach the wire.
 */

/** One row of the public feed, before projection. */
import type { PublicMediaIntrinsicSize } from '../../../catalog/domain/public-media-dimensions';

export interface PublicGalleryEntryListRow {
  /** Also the keyset tie-breaker. */
  readonly id: string;
  /** Internal. Keyset sort value only — never projected. */
  readonly displayOrder: number;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly isIndexable: boolean;
  /**
   * The first association whose list rendition would genuinely stream, in
   * stored gallery order. Resolved in the same statement, so a page of N
   * entries costs one query rather than N+1.
   *
   * Never `undefined` in practice: the same predicate is the feed's own WHERE
   * term (§10 — an entry with no deliverable image is omitted). Typed as
   * possibly absent anyway so the projection proves it rather than asserting it.
   */
  readonly coverAssetId: string | undefined;
  /**
   * Intrinsic size of that cover's **list-rendition** derivative, or
   * `undefined` when it carries none (`APP12-H05-C1`). Selected from the same
   * correlated source, order and `limit 1` as the id above.
   */
  readonly coverSize: PublicMediaIntrinsicSize | undefined;
  /** How many of the entry's associations are currently deliverable. */
  readonly assetCount: number;
}

/** The entry half of the public detail, before projection. */
export interface PublicGalleryEntryDetailRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly displayOrder: number;
  readonly isIndexable: boolean;
  readonly seoTitle: string | undefined;
  readonly seoDescription: string | undefined;
  /**
   * Internal. The link `APP11-B01` stored, whatever the Product's own lifecycle
   * — it is **not** projected. Whether it may be shown is decided against the
   * Catalog public authority, and a non-public product yields no link at all.
   */
  readonly linkedProductId: string | undefined;
}

/** One currently deliverable image of the public detail, in stored order. */
export interface PublicGalleryEntryAssetRow {
  readonly assetId: string;
  readonly displayOrder: number;
  /**
   * Intrinsic size of the **detail-rendition** derivative this row was selected
   * by, or `undefined` when it carries none (`APP12-H05-C1`).
   */
  readonly size: PublicMediaIntrinsicSize | undefined;
}

export interface PublicGalleryEntryDetail {
  readonly entry: PublicGalleryEntryDetailRow;
  readonly assets: readonly PublicGalleryEntryAssetRow[];
}

/**
 * One indexable public Gallery entry, as the SEO inventory needs it
 * (`APP11-B04`).
 *
 * Two fields and no more: an address and a freshness stamp. No title, no
 * description, no cover, no count — a sitemap consumer needs none of them, and
 * a wider shape here would put editorial text on a wire that must stay minimal.
 */
export interface PublicIndexableGalleryEntryRow {
  readonly slug: string;
  readonly updatedAt: Date;
}

export interface PublicGalleryEntryListQuery {
  readonly limit: number;
  readonly after: { readonly displayOrder: number; readonly id: string } | undefined;
}

export interface PublicGalleryEntryRepository {
  /**
   * Fetches at most `limit` published entries that have at least one currently
   * deliverable image, in `(display_order, id)` order. The caller over-fetches
   * by one to answer "is there a next page" without a COUNT.
   */
  listPublished(query: PublicGalleryEntryListQuery): Promise<readonly PublicGalleryEntryListRow[]>;

  /**
   * Resolves one published entry and its currently deliverable images by exact
   * slug, or nothing.
   *
   * Returns the entry even when every image has been withdrawn — the caller
   * decides that an image-led page with no image is a 404 (§10), and keeping
   * that rule in one application place beats hiding it inside two SQL
   * statements that would then disagree about what "absent" means.
   */
  findPublishedBySlug(slug: string): Promise<PublicGalleryEntryDetail | undefined>;

  /**
   * Every published, indexable entry whose **detail** page would currently
   * render, in `slug` order (`APP11-B04`).
   *
   * Three terms, and the third is the reason this method exists on *this* port
   * rather than in an SEO module: `status = 'PUBLISHED'` and "has at least one
   * currently deliverable detail image" are exactly what decides whether
   * `GET /api/public/gallery-entries/{slug}` answers 200 or 404, taken from the
   * one eligibility definition both already use. A sitemap that advertised a
   * slug the detail refuses would be a broken index entry the API could have
   * prevented. `is_indexable` is the third, and is the only term the browsing
   * reads deliberately never apply.
   *
   * Keyed on the detail rendition, not the feed's: the sitemap advertises
   * detail pages, so it must agree with the read that serves them — an entry
   * whose thumbnail is gone but whose detail still renders belongs in the
   * index, and it is the detail's 404 that has to be aligned with.
   *
   * `limit` is a safety bound the caller sets one above its own cap, so an
   * inventory too large to honour is detectable rather than silently truncated.
   */
  listIndexable(limit: number): Promise<readonly PublicIndexableGalleryEntryRow[]>;
}

export const PUBLIC_GALLERY_ENTRY_REPOSITORY = Symbol('PUBLIC_GALLERY_ENTRY_REPOSITORY');
