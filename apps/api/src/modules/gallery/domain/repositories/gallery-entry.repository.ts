/**
 * AGG-18 Gallery Entry persistence contract (TBL-064, TBL-065).
 *
 * A gallery entry publishes **public derivatives only** (REQ-GAL-001,
 * INV-21/22): the original customer artwork and any production file stay
 * internal. The database cannot express that rule — `gallery_entry_assets`
 * has a plain FK to `assets` — so the application enforces it here.
 */
import type { GalleryEntryState } from '@embroidery/database';

export type GalleryEntryId = string & { readonly __brand: 'GalleryEntryId' };

export interface GalleryEntry {
  readonly id: GalleryEntryId;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly status: GalleryEntryState;
  readonly linkedProductId: string | undefined;
}

export interface CreateGalleryEntryInput {
  readonly id: GalleryEntryId;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly displayOrder: number;
  readonly linkedProductId?: string | undefined;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
  /** Omitted means indexable — the column has no default, the repository does. */
  readonly isIndexable?: boolean | undefined;
}

/**
 * The whole authoring row, as the Admin surface reads and writes it
 * (`APP11-B01`).
 *
 * A wider projection than {@link GalleryEntry}, which carries only what the
 * showcase itself needs. Kept as a second type rather than widening the first:
 * every existing consumer of `GalleryEntry` would otherwise start compiling
 * against SEO and lifecycle-evidence columns it has no use for.
 */
export interface AdminGalleryEntry {
  readonly id: GalleryEntryId;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly status: GalleryEntryState;
  readonly displayOrder: number;
  readonly linkedProductId: string | undefined;
  readonly seoTitle: string | undefined;
  readonly seoDescription: string | undefined;
  readonly isIndexable: boolean;
  /** Lifecycle evidence only — never a filter (TBL-064 header, LC-04). */
  readonly archivedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * One keyset page of the Admin list.
 *
 * Ordered `display_order ASC, id ASC` — the curated order the operator arranges
 * entries in, with the tie-breaker DB5 requires because `display_order` is not
 * unique. Deliberately **not** `IDX-066`'s order: that index is the published
 * public listing and its partial predicate excludes DRAFT and ARCHIVED, which
 * are exactly the rows an operator opens this list to find.
 */
export interface AdminGalleryEntryListQuery {
  readonly status?: GalleryEntryState | undefined;
  /** Resume position from the previous page; absent for the first page. */
  readonly after?: { readonly displayOrder: number; readonly id: string } | undefined;
  /** The repository fetches `limit + 1` so the caller can detect a next page. */
  readonly limit: number;
}

/**
 * The fields an entry may change in `APP11-B01`; `undefined` means "not in this
 * patch", and `null` on a nullable field is an explicit clear.
 *
 * `slug`, `status` and `archivedAt` are absent by construction, so no patch can
 * express a rename, a publication or an archival — those are not merely
 * unimplemented here, they are unrepresentable.
 */
export interface UpdateGalleryEntryFields {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly displayOrder?: number | undefined;
  readonly linkedProductId?: string | null | undefined;
  readonly seoTitle?: string | null | undefined;
  readonly seoDescription?: string | null | undefined;
  readonly isIndexable?: boolean | undefined;
}

export interface UpdateGalleryEntryInput {
  readonly id: GalleryEntryId;
  readonly fields: UpdateGalleryEntryFields;
}

/** One ordered association. Identity and position only — never a storage key. */
export interface GalleryEntryAssetLink {
  readonly assetId: string;
  readonly displayOrder: number;
}

/**
 * The list-row media projection: how many images an entry has and which one
 * leads.
 *
 * A projection, not a mutation seam — `APP11-B02` owns every write to
 * `gallery_entry_assets`. The cover is the first association in the same
 * `(display_order, id)` order {@link GalleryEntryRepository.listAssetIds}
 * already publishes, so the list and the detail can never disagree about which
 * image leads.
 */
export interface GalleryEntryAssetSummary {
  readonly assetCount: number;
  readonly coverAssetId: string | undefined;
}

export const GALLERY_ENTRY_REPOSITORY = Symbol('GALLERY_ENTRY_REPOSITORY');

export interface GalleryEntryRepository {
  /** @requiresTransaction */
  create(input: CreateGalleryEntryInput): Promise<GalleryEntry>;

  /**
   * Attaches an asset to the entry.
   *
   * Rejects anything not classified `PUBLIC`: a gallery is public by
   * definition, and attaching a `CUSTOMER_PRIVATE` or `PRODUCTION_SENSITIVE`
   * asset would publish it. No FK can express that, so this check is the only
   * thing standing between the two.
   *
   * @requiresTransaction
   */
  attachAsset(entryId: GalleryEntryId, assetId: string, displayOrder: number): Promise<void>;

  /** @requiresTransaction */
  changeStatus(id: GalleryEntryId, status: GalleryEntryState): Promise<GalleryEntry>;

  findBySlug(slug: string): Promise<GalleryEntry | undefined>;
  findById(id: GalleryEntryId): Promise<GalleryEntry | undefined>;
  listAssetIds(id: GalleryEntryId): Promise<string[]>;

  // --- `APP11-B01` Admin authoring ------------------------------------------

  /** The whole authoring row, or nothing. */
  findAuthoringById(id: GalleryEntryId): Promise<AdminGalleryEntry | undefined>;

  /** One keyset page ordered `display_order ASC, id ASC`; fetches `limit + 1`. */
  listAuthoring(query: AdminGalleryEntryListQuery): Promise<AdminGalleryEntry[]>;

  /**
   * Partial field update.
   *
   * Touches only the columns the patch names, and no lifecycle column: there is
   * no argument by which it could set `status` or `archived_at`, so publication
   * cannot be reached from this method even by mistake. `undefined` means the
   * entry does not exist.
   *
   * @requiresTransaction
   */
  updateAuthoring(input: UpdateGalleryEntryInput): Promise<AdminGalleryEntry | undefined>;

  /** Ordered associations for one entry — the detail media summary. */
  listAssetLinks(id: GalleryEntryId): Promise<GalleryEntryAssetLink[]>;

  /**
   * Cover and count for a whole page of entries in one round trip, never one
   * query per row.
   */
  summarizeAssets(
    ids: readonly GalleryEntryId[],
  ): Promise<ReadonlyMap<string, GalleryEntryAssetSummary>>;
}
