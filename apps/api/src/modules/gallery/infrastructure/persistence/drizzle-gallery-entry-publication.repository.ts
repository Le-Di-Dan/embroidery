/**
 * Drizzle implementation of the Gallery media-selection and publication
 * contract (`APP11-B02`, TBL-064 / TBL-065).
 *
 * The adapter opens no transaction of its own (DEC-DB7-006); the use case owns
 * that through `TransactionManager`, and every method that takes a lock asserts
 * it is inside one — a `FOR UPDATE`/`FOR SHARE` taken outside a transaction is
 * released immediately and would promise a guarantee it cannot keep.
 */
import { Injectable } from '@nestjs/common';
import { newId, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq, inArray, ne } from 'drizzle-orm';

import {
  GALLERY_ENTRY_ASSET_CLASSIFICATION,
  GALLERY_ENTRY_ASSET_DELETED_STATE,
} from '../../domain/admin-gallery-entry.policy';
import type {
  GalleryEntryGuardedMiss,
  GalleryEntryGuardedWriteInput,
  GalleryEntryPublicationRepository,
  GalleryEntryTransitionInput,
} from '../../domain/repositories/gallery-entry-publication.repository';
import type {
  AdminGalleryEntry,
  GalleryEntryId,
} from '../../domain/repositories/gallery-entry.repository';
import { toAdminEntry } from './gallery-entry-row.mapper';
import {
  nextUpdatedAt,
  publishedUpdatedAt,
  updatedAtMatches,
} from './gallery-entry-concurrency-token';

const { galleryEntries, galleryEntryAssets, assets } = schema;

/**
 * The gallery public-media boundary, as one predicate.
 *
 * Stated once and applied to both the selection check and the readiness count,
 * so "may this image be published" cannot have two answers inside one
 * transaction. No FK expresses it: without this predicate a customer's private
 * artwork would be publishable on a public page.
 */
const eligibleAsset = and(
  eq(assets.classification, GALLERY_ENTRY_ASSET_CLASSIFICATION),
  ne(assets.status, GALLERY_ENTRY_ASSET_DELETED_STATE),
);

@Injectable()
export class DrizzleGalleryEntryPublicationRepository
  extends DrizzleRepository
  implements GalleryEntryPublicationRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async lockAuthoringById(id: GalleryEntryId): Promise<AdminGalleryEntry | undefined> {
    return this.run('lockAuthoringById', async () => {
      const tx = this.requireTransaction('lockAuthoringById');
      const [row] = await tx
        .select()
        .from(galleryEntries)
        .where(eq(galleryEntries.id, id))
        .limit(1)
        .for('update');
      return row === undefined ? undefined : toAdminEntry(row);
    });
  }

  async lockEligibleAssetIds(assetIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (assetIds.length === 0) {
      return new Set<string>();
    }
    return this.run('lockEligibleAssetIds', async () => {
      const tx = this.requireTransaction('lockEligibleAssetIds');
      // One statement for the whole selection: twenty images cost one round
      // trip, not twenty.
      const rows = await tx
        .select({ id: assets.id })
        .from(assets)
        .where(and(inArray(assets.id, [...new Set(assetIds)]), eligibleAsset))
        .for('share');
      return new Set(rows.map((row) => row.id));
    });
  }

  async countEligibleAttachedAssets(id: GalleryEntryId): Promise<number> {
    return this.run('countEligibleAttachedAssets', async () => {
      const tx = this.requireTransaction('countEligibleAttachedAssets');
      // The join is the point: readiness asks about the entry's *stored*
      // associations, evaluated against the asset rows as they stand under this
      // transaction's locks — never against anything the caller sent.
      const rows = await tx
        .select({ id: assets.id })
        .from(galleryEntryAssets)
        .innerJoin(assets, eq(assets.id, galleryEntryAssets.assetId))
        .where(and(eq(galleryEntryAssets.galleryEntryId, id), eligibleAsset))
        .for('share', { of: assets });
      return rows.length;
    });
  }

  async replaceAssetLinks(id: GalleryEntryId, assetIds: readonly string[]): Promise<void> {
    return this.run('replaceAssetLinks', async () => {
      this.requireTransaction('replaceAssetLinks');
      // Associations only. The Assets and their derivatives are untouched —
      // this table holds the association, never the media.
      await this.db.delete(galleryEntryAssets).where(eq(galleryEntryAssets.galleryEntryId, id));
      if (assetIds.length === 0) {
        return;
      }
      // Position is the zero-based request index, so position 0 is the cover and
      // the stored order is exactly the order the operator arranged.
      await this.db.insert(galleryEntryAssets).values(
        assetIds.map((assetId, position) => ({
          id: newId(),
          galleryEntryId: id,
          assetId,
          displayOrder: position,
        })),
      );
    });
  }

  async touchGuarded(input: GalleryEntryGuardedWriteInput): Promise<AdminGalleryEntry | undefined> {
    return this.run('touchGuarded', async () => {
      const [row] = await this.db
        .update(galleryEntries)
        .set({ updatedAt: nextUpdatedAt() })
        .where(this.guard(input))
        .returning();
      return row === undefined ? undefined : toAdminEntry(row);
    });
  }

  async transitionGuarded(
    input: GalleryEntryTransitionInput,
  ): Promise<AdminGalleryEntry | undefined> {
    return this.run('transitionGuarded', async () => {
      const [row] = await this.db
        .update(galleryEntries)
        // Status and the token, and deliberately nothing else. `archived_at` is
        // never touched here: unpublish is not archive, and publish does not
        // clear an archive fact it did not create.
        .set({ status: input.toState, updatedAt: nextUpdatedAt() })
        .where(this.guard(input))
        .returning();
      return row === undefined ? undefined : toAdminEntry(row);
    });
  }

  async explainGuardedMiss(input: GalleryEntryGuardedWriteInput): Promise<GalleryEntryGuardedMiss> {
    return this.run('explainGuardedMiss', async () => {
      const [row] = await this.db
        .select({ status: galleryEntries.status, updatedAt: publishedUpdatedAt() })
        .from(galleryEntries)
        .where(eq(galleryEntries.id, input.id))
        .limit(1);

      if (row === undefined) {
        return 'NOT_FOUND';
      }
      if (!(input.fromStates as readonly string[]).includes(row.status)) {
        return 'STATE';
      }
      return row.updatedAt.getTime() === input.expectedUpdatedAt.getTime() ? 'NOT_FOUND' : 'STALE';
    });
  }

  /**
   * Identity, allowed source states and the exact token, in the one statement
   * that writes — so the state a pre-flight check saw is the state the write
   * tests, with no window in between.
   */
  private guard(input: GalleryEntryGuardedWriteInput) {
    return and(
      eq(galleryEntries.id, input.id),
      inArray(galleryEntries.status, [...input.fromStates]),
      updatedAtMatches(input.expectedUpdatedAt),
    );
  }
}
