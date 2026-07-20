/**
 * Drizzle implementation of the AGG-18 Gallery Entry contract
 * (TBL-064, TBL-065).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import type { GalleryEntryState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { asc, eq } from 'drizzle-orm';

import type {
  CreateGalleryEntryInput,
  GalleryEntry,
  GalleryEntryId,
  GalleryEntryRepository,
} from '../../domain/repositories/gallery-entry.repository';

const { galleryEntries, galleryEntryAssets, assets } = schema;

type EntryRow = typeof galleryEntries.$inferSelect;

function toEntry(row: EntryRow): GalleryEntry {
  return {
    id: row.id as GalleryEntryId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status as GalleryEntryState,
    linkedProductId: row.linkedProductId ?? undefined,
  };
}

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
          isIndexable: true,
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
}
