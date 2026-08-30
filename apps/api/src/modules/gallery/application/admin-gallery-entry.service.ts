/**
 * The two Admin gallery write operations (`APP11-B01` §9, §11).
 *
 * The service owns orchestration and every authoring decision; the repository
 * owns persistence and opens no transaction of its own (DEC-DB7-006). Each
 * operation is one transaction, and nothing inside it touches object storage or
 * the network.
 *
 * Three rules shape both:
 *
 * - **Creation is DRAFT.** The status is not accepted, not defaulted from the
 *   body and not derived from anything the caller sent — the repository writes
 *   the constant. `APP11-B02` owns publication, through `changeStatus`, which
 *   nothing here calls.
 * - **The address is create-time.** A slug is accepted once and there is no
 *   field that moves it, because it is the public URL an entry will be reached
 *   at.
 * - **No asset is touched.** `attachAsset` is not called from this file. B01
 *   reads associations and never writes one.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { adminGalleryEntryError } from '../domain/admin-gallery-entry.errors';
import {
  GALLERY_ENTRY_REPOSITORY,
  type GalleryEntryId,
  type GalleryEntryRepository,
  type UpdateGalleryEntryFields,
} from '../domain/repositories/gallery-entry.repository';
import { LinkedProductResolver } from './linked-product.resolver';
import { toDetailView, type AdminGalleryEntryDetailView } from './admin-gallery-entry.projection';

export interface CreateAdminGalleryEntryCommand {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly displayOrder: number;
  readonly isIndexable: boolean;
  readonly linkedProductId?: string | undefined;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
}

export interface UpdateAdminGalleryEntryCommand {
  readonly galleryEntryId: string;
  readonly fields: UpdateGalleryEntryFields;
}

@Injectable()
export class AdminGalleryEntryService {
  constructor(
    @Inject(GALLERY_ENTRY_REPOSITORY) private readonly entries: GalleryEntryRepository,
    private readonly linkedProducts: LinkedProductResolver,
    private readonly transactions: TransactionManager,
  ) {}

  /**
   * Creates the canonical DRAFT.
   *
   * No association is written: `gallery_entry_assets` is `APP11-B02`'s, and
   * accepting media in two places would mean two code paths that must agree
   * about ordering forever.
   */
  async create(command: CreateAdminGalleryEntryCommand): Promise<AdminGalleryEntryDetailView> {
    return this.transactions.runInTransaction(async () => {
      await this.linkedProducts.requireLinkable(command.linkedProductId);
      // A pre-check rather than catching the unique violation, because the
      // insert happens later in the same transaction and a caught constraint
      // error there would already have aborted it. The caller chose this
      // address, so there is no server-side fallback to try: a taken slug is
      // reported, never silently rewritten.
      if ((await this.entries.findBySlug(command.slug)) !== undefined) {
        throw adminGalleryEntryError('GALLERY_ENTRY_SLUG_CONFLICT');
      }

      const id = newId() as GalleryEntryId;
      await this.entries.create({
        id,
        title: command.title,
        slug: command.slug,
        description: command.description,
        displayOrder: command.displayOrder,
        isIndexable: command.isIndexable,
        ...(command.linkedProductId === undefined
          ? {}
          : { linkedProductId: command.linkedProductId }),
        ...(command.seoTitle === undefined ? {} : { seoTitle: command.seoTitle }),
        ...(command.seoDescription === undefined ? {} : { seoDescription: command.seoDescription }),
      });

      const created = await this.entries.findAuthoringById(id);
      if (created === undefined) {
        throw adminGalleryEntryError('GALLERY_ENTRY_NOT_FOUND');
      }
      // No associations, so no second read: a new entry's media set is empty.
      return toDetailView(created, []);
    });
  }

  async update(command: UpdateAdminGalleryEntryCommand): Promise<AdminGalleryEntryDetailView> {
    return this.transactions.runInTransaction(async () => {
      // Validated before the write so an unusable product costs nothing and
      // leaves the stored entry untouched.
      await this.linkedProducts.requireLinkable(command.fields.linkedProductId);

      const updated = await this.entries.updateAuthoring({
        id: command.galleryEntryId as GalleryEntryId,
        fields: command.fields,
      });
      if (updated === undefined) {
        throw adminGalleryEntryError('GALLERY_ENTRY_NOT_FOUND');
      }

      const links = await this.entries.listAssetLinks(updated.id);
      return toDetailView(updated, links);
    });
  }
}
