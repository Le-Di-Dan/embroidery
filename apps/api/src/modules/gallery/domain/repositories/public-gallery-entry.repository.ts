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
}

export interface PublicGalleryEntryDetail {
  readonly entry: PublicGalleryEntryDetailRow;
  readonly assets: readonly PublicGalleryEntryAssetRow[];
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
}

export const PUBLIC_GALLERY_ENTRY_REPOSITORY = Symbol('PUBLIC_GALLERY_ENTRY_REPOSITORY');
