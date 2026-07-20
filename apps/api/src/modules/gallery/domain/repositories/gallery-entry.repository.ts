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
}
