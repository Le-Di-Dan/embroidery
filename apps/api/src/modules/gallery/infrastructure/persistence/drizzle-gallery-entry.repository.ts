/**
 * Drizzle implementation of the AGG-18 Gallery Entry contract
 * (TBL-064, TBL-065).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import type { GalleryEntryState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';

import type {
  AdminGalleryEntry,
  AdminGalleryEntryListQuery,
  CreateGalleryEntryInput,
  GalleryEntry,
  GalleryEntryAssetLink,
  GalleryEntryAssetSummary,
  GalleryEntryId,
  GalleryEntryRepository,
  UpdateGalleryEntryInput,
} from '../../domain/repositories/gallery-entry.repository';
import { toAdminEntry, toEntry } from './gallery-entry-row.mapper';

const { galleryEntries, galleryEntryAssets, assets } = schema;

@Injectable()
export class DrizzleGalleryEntryRepository
  extends DrizzleRepository
  implements GalleryEntryRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async create(input: CreateGalleryEntryInput): Promise<GalleryEntry> {
    return this.run('create', async () => {
      const [row] = await this.db
        .insert(galleryEntries)
        .values({
          id: input.id,
          title: input.title,
          slug: input.slug,
          description: input.description,
          status: 'DRAFT',
          displayOrder: input.displayOrder,
          linkedProductId: input.linkedProductId ?? null,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          // The column carries no default, so the repository states the one
          // that has always applied: a new entry is indexable.
          isIndexable: input.isIndexable ?? true,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'GalleryEntryRepository.create',
          'GALLERY_ENTRY_NOT_CREATED',
          'Could not create the gallery entry.',
        );
      }
      return toEntry(row);
    });
  }

  async attachAsset(entryId: GalleryEntryId, assetId: string, displayOrder: number): Promise<void> {
    return this.run('attachAsset', async () => {
      const tx = this.requireTransaction('attachAsset');

      // The classification check has no FK behind it, so this read is the only
      // thing preventing a private original from being published. Done inside
      // the transaction that writes the association, so it cannot be bypassed
      // by an interleaving reclassification.
      const [asset] = await tx
        .select({ classification: assets.classification, status: assets.status })
        .from(assets)
        .where(eq(assets.id, assetId))
        .limit(1);

      if (asset === undefined) {
        throw notFoundError('GalleryEntryRepository.attachAsset', 'That asset does not exist.');
      }
      if (asset.classification !== 'PUBLIC') {
        throw guardViolationError(
          'GalleryEntryRepository.attachAsset',
          'ASSET_NOT_PUBLIC',
          'Only a public asset can appear in the gallery.',
        );
      }
      if (asset.status === 'DELETED') {
        throw guardViolationError(
          'GalleryEntryRepository.attachAsset',
          'ASSET_DELETED',
          'That asset has been deleted.',
        );
      }

      await tx.insert(galleryEntryAssets).values({
        id: newId(),
        galleryEntryId: entryId,
        assetId,
        displayOrder,
      });
    });
  }

  async changeStatus(id: GalleryEntryId, status: GalleryEntryState): Promise<GalleryEntry> {
    return this.run('changeStatus', async () => {
      const [row] = await this.db
        .update(galleryEntries)
        .set({
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(galleryEntries.id, id))
        .returning();

      if (row === undefined) {
        throw notFoundError(
          'GalleryEntryRepository.changeStatus',
          'That gallery entry does not exist.',
        );
      }
      return toEntry(row);
    });
  }

  async findBySlug(slug: string): Promise<GalleryEntry | undefined> {
    return this.run('findBySlug', async () => {
      const [row] = await this.db
        .select()
        .from(galleryEntries)
        .where(eq(galleryEntries.slug, slug))
        .limit(1);
      return row === undefined ? undefined : toEntry(row);
    });
  }

  async findById(id: GalleryEntryId): Promise<GalleryEntry | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(galleryEntries)
        .where(eq(galleryEntries.id, id))
        .limit(1);
      return row === undefined ? undefined : toEntry(row);
    });
  }

  async listAssetIds(id: GalleryEntryId): Promise<string[]> {
    return this.run('listAssetIds', async () => {
      const rows = await this.db
        .select({ assetId: galleryEntryAssets.assetId })
        .from(galleryEntryAssets)
        .where(eq(galleryEntryAssets.galleryEntryId, id))
        .orderBy(asc(galleryEntryAssets.displayOrder));
      return rows.map((row) => row.assetId);
    });
  }
  // --- `APP11-B01` Admin authoring ------------------------------------------

  async findAuthoringById(id: GalleryEntryId): Promise<AdminGalleryEntry | undefined> {
    return this.run('findAuthoringById', async () => {
      const [row] = await this.db
        .select()
        .from(galleryEntries)
        .where(eq(galleryEntries.id, id))
        .limit(1);
      return row === undefined ? undefined : toAdminEntry(row);
    });
  }

  async listAuthoring(query: AdminGalleryEntryListQuery): Promise<AdminGalleryEntry[]> {
    return this.run('listAuthoring', async () => {
      const conditions = [];
      if (query.status !== undefined) {
        conditions.push(eq(galleryEntries.status, query.status));
      }
      if (query.after !== undefined) {
        // Keyset resume on the exact (display_order, id) pair the last page
        // ended at — DB5 requires a tie-breaker, because `display_order` is not
        // unique and a curator may give two entries the same position.
        conditions.push(
          or(
            gt(galleryEntries.displayOrder, query.after.displayOrder),
            and(
              eq(galleryEntries.displayOrder, query.after.displayOrder),
              gt(galleryEntries.id, query.after.id),
            ),
          ),
        );
      }

      const rows = await this.db
        .select()
        .from(galleryEntries)
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(asc(galleryEntries.displayOrder), asc(galleryEntries.id))
        .limit(query.limit + 1);

      return rows.map(toAdminEntry);
    });
  }

  /**
   * Updates only the columns the patch names.
   *
   * An empty patch never reaches here — the DTO rejects it — but a `set({})`
   * would be a syntax error rather than a no-op, so every call carries at
   * least the token below. `updated_at` always advances: a change to any
   * authoring field is a change to the entry, and a row whose token did not
   * move would let a later reader believe it had not changed.
   *
   * No argument of this method can reach `status` or `archived_at`, so a
   * publication is unrepresentable here rather than merely unimplemented.
   */
  async updateAuthoring(input: UpdateGalleryEntryInput): Promise<AdminGalleryEntry | undefined> {
    return this.run('updateAuthoring', async () => {
      const patch: Record<string, unknown> = {
        updatedAt: sql`date_trunc('milliseconds', clock_timestamp())`,
      };
      const { fields } = input;
      if (fields.title !== undefined) patch['title'] = fields.title;
      if (fields.description !== undefined) patch['description'] = fields.description;
      if (fields.displayOrder !== undefined) patch['displayOrder'] = fields.displayOrder;
      if (fields.isIndexable !== undefined) patch['isIndexable'] = fields.isIndexable;
      // `null` is an explicit clear; `undefined` means the patch omitted it.
      if (fields.linkedProductId !== undefined) patch['linkedProductId'] = fields.linkedProductId;
      if (fields.seoTitle !== undefined) patch['seoTitle'] = fields.seoTitle;
      if (fields.seoDescription !== undefined) patch['seoDescription'] = fields.seoDescription;

      const [row] = await this.db
        .update(galleryEntries)
        .set(patch)
        .where(eq(galleryEntries.id, input.id))
        .returning();

      return row === undefined ? undefined : toAdminEntry(row);
    });
  }

  async listAssetLinks(id: GalleryEntryId): Promise<GalleryEntryAssetLink[]> {
    return this.run('listAssetLinks', async () => {
      return this.db
        .select({
          assetId: galleryEntryAssets.assetId,
          displayOrder: galleryEntryAssets.displayOrder,
        })
        .from(galleryEntryAssets)
        .where(eq(galleryEntryAssets.galleryEntryId, id))
        .orderBy(asc(galleryEntryAssets.displayOrder), asc(galleryEntryAssets.id));
    });
  }

  /**
   * Cover and count for a whole page in one statement.
   *
   * The rows come back in the same `(display_order, id)` order the detail read
   * publishes, so "the first association" means the same thing in both and the
   * first row seen per entry is its cover.
   */
  async summarizeAssets(
    ids: readonly GalleryEntryId[],
  ): Promise<ReadonlyMap<string, GalleryEntryAssetSummary>> {
    const result = new Map<string, GalleryEntryAssetSummary>();
    if (ids.length === 0) {
      return result;
    }
    return this.run('summarizeAssets', async () => {
      const rows = await this.db
        .select({
          galleryEntryId: galleryEntryAssets.galleryEntryId,
          assetId: galleryEntryAssets.assetId,
        })
        .from(galleryEntryAssets)
        .where(inArray(galleryEntryAssets.galleryEntryId, [...new Set(ids)]))
        .orderBy(
          asc(galleryEntryAssets.galleryEntryId),
          asc(galleryEntryAssets.displayOrder),
          asc(galleryEntryAssets.id),
        );

      for (const row of rows) {
        const existing = result.get(row.galleryEntryId);
        result.set(row.galleryEntryId, {
          assetCount: (existing?.assetCount ?? 0) + 1,
          coverAssetId: existing?.coverAssetId ?? row.assetId,
        });
      }
      return result;
    });
  }
}
