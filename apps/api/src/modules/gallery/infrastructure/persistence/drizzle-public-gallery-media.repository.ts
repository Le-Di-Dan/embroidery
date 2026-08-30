/**
 * Drizzle implementation of the public gallery-media delivery read
 * (`APP11-B03` §9).
 *
 * One statement, one row, one column. The entire visibility decision — the
 * entry's publication, the association to *this* entry, the asset lane and the
 * derivative's readiness — is expressed as the join and WHERE of a single
 * query, so PostgreSQL evaluates it against one consistent snapshot. Splitting
 * it into "find the entry, then find the association, then find the derivative"
 * would open windows between the checks in which an unpublish could commit, and
 * the earlier checks would have proved nothing about the row finally served.
 *
 * The repository opens no transaction and takes no lock (DEC-DB7-006). An
 * ordinary read needs none, and this one must not hold one: the caller streams
 * from object storage afterwards, and a transaction spanning that would pin a
 * connection for the duration of a client's download.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, eq } from 'drizzle-orm';

import { PUBLIC_GALLERY_ENTRY_VISIBLE_STATE } from '../../domain/public-gallery-entry.policy';
import type {
  PublicGalleryMediaDescriptor,
  PublicGalleryMediaLookup,
  PublicGalleryMediaRepository,
} from '../../domain/repositories/public-gallery-media.repository';
import { allOf, deliverableAssetConditions } from './gallery-public-media-eligibility';

const { galleryEntries, galleryEntryAssets, assets, assetDerivatives } = schema;

@Injectable()
export class DrizzlePublicGalleryMediaRepository
  extends DrizzleRepository
  implements PublicGalleryMediaRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findDeliverable(
    lookup: PublicGalleryMediaLookup,
  ): Promise<PublicGalleryMediaDescriptor | undefined> {
    const [row] = await this.db
      .select({ storageKey: assetDerivatives.storageKey })
      .from(galleryEntries)
      .innerJoin(galleryEntryAssets, eq(galleryEntryAssets.galleryEntryId, galleryEntries.id))
      .innerJoin(assets, eq(assets.id, galleryEntryAssets.assetId))
      .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
      .where(
        and(
          // Entry identity and publication (LC-04). `status = 'PUBLISHED'` is
          // the only visibility predicate there is, and `APP11-B02`'s unpublish
          // is a real transition back to DRAFT — so this comparison is what
          // makes a withdrawn entry's images stop being served on the very next
          // request, even for a caller that already knows the address.
          eq(galleryEntries.slug, lookup.slug),
          eq(galleryEntries.status, PUBLIC_GALLERY_ENTRY_VISIBLE_STATE),
          // The association, bound to *this* entry: an asset attached to some
          // other gallery entry must not resolve just because it exists.
          eq(galleryEntryAssets.assetId, lookup.assetId),
          // The asset is re-checked rather than trusted from the B02 write that
          // created the link — an image can be reclassified, rejected or
          // tombstoned after it was attached, and serving history would put a
          // withdrawn image on a public page.
          allOf(deliverableAssetConditions(lookup.derivativeKind)),
        ),
      )
      .limit(1);

    // `storage_key` is nullable in the column type even though the predicate
    // above excludes NULL, so the narrowing is explicit rather than asserted.
    if (row === undefined || row.storageKey === null) {
      return undefined;
    }
    return { storageKey: row.storageKey };
  }
}
