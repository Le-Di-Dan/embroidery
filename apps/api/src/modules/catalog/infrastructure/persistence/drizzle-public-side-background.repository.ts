/**
 * Drizzle implementation of the public Side-background delivery read
 * (`APP3-B02` §4).
 *
 * One statement, one row. The entire contextual decision — Product publication,
 * Category publication, the Side's membership and activity, the background
 * association, the Asset lane and the derivative's readiness and quartet — is
 * expressed as the join and WHERE of a single query, so PostgreSQL evaluates it
 * against one consistent snapshot. Splitting it into "find the product, then the
 * side, then the derivative" would open windows between the checks in which an
 * unpublish or a background replacement could commit, and the earlier checks
 * would have proved nothing about the row finally served.
 *
 * The repository opens no transaction (DEC-DB7-006). An ordinary read needs
 * none, and this one must not hold one: the caller streams the object
 * afterwards, and a transaction spanning that would pin a connection for the
 * duration of a client's download.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';

import type {
  PublicSideBackgroundDescriptor,
  PublicSideBackgroundLookup,
  PublicSideBackgroundRepository,
} from '../../domain/repositories/public-side-background.repository';
import {
  APP2_CATEGORY_STATUS,
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
  SIDE_BACKGROUND_ASSET_CLASSIFICATION,
  SIDE_BACKGROUND_ASSET_KIND,
  SIDE_BACKGROUND_ASSET_STATUS,
  isDeliverableSideBackgroundMediaType,
} from '../../domain/public-side-background.policy';

const { products, categories, productSides, assets, assetDerivatives } = schema;

@Injectable()
export class DrizzlePublicSideBackgroundRepository
  extends DrizzleRepository
  implements PublicSideBackgroundRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findDeliverable(
    lookup: PublicSideBackgroundLookup,
  ): Promise<PublicSideBackgroundDescriptor | undefined> {
    const [row] = await this.db
      .select({
        storageKey: assetDerivatives.storageKey,
        mediaType: assetDerivatives.mediaType,
        widthPx: assetDerivatives.widthPx,
        heightPx: assetDerivatives.heightPx,
        byteSize: assetDerivatives.byteSize,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(productSides, eq(productSides.productId, products.id))
      // The Asset is reached **through** `background_asset_id`, so the join is
      // the association: an Asset that is no longer this Side's background
      // cannot be selected, and a replacement takes effect on the next request
      // without anything having to be invalidated.
      .innerJoin(assets, eq(assets.id, productSides.backgroundAssetId))
      .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
      .where(
        and(
          // Product identity and publication (LC-04). `status = 'PUBLISHED'` is
          // the only visibility predicate there is, and unpublish is a real
          // transition back to DRAFT (TR-LC04-05), so this comparison is what
          // makes an unpublished Product disappear here.
          eq(products.slug, lookup.slug),
          eq(products.status, PRODUCT_PUBLISHED_STATE),
          isNull(products.archivedAt),
          // A published Product inside a withdrawn Category has no coherent
          // public placement, so it is not served.
          eq(categories.status, APP2_CATEGORY_STATUS),
          isNull(categories.archivedAt),
          // The Side, bound to *this* Product: a code belonging to another
          // Product must not resolve just because it exists.
          eq(productSides.code, lookup.sideCode),
          // Retired Sides are absent from the manifest and must be absent here
          // too, or an address captured before retirement would keep working.
          isNull(productSides.retiredAt),
          // The Asset is re-checked rather than trusted from the placement write
          // that created the link — an image can be rejected or tombstoned after
          // it was attached, and serving history would put a withdrawn
          // background under a customer's design.
          eq(assets.kind, SIDE_BACKGROUND_ASSET_KIND),
          eq(assets.classification, SIDE_BACKGROUND_ASSET_CLASSIFICATION),
          eq(assets.status, SIDE_BACKGROUND_ASSET_STATUS),
          isNull(assets.deletedAt),
          // The one editor-safe derivative, in the only serveable state.
          eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND),
          eq(assetDerivatives.status, EDITOR_SAFE_DERIVATIVE_STATE),
          // INV-22: a watermarked artifact is the customer/design preview, never
          // an editor background.
          eq(assetDerivatives.isWatermarked, false),
          // READY NORMALIZED implies the key and the whole quartet by CHECK, but
          // the delivery path reads every one of these values, so it asserts the
          // facts it depends on instead of trusting the constraints.
          isNotNull(assetDerivatives.storageKey),
          isNotNull(assetDerivatives.mediaType),
          isNotNull(assetDerivatives.widthPx),
          isNotNull(assetDerivatives.heightPx),
          isNotNull(assetDerivatives.byteSize),
        ),
      )
      .limit(1);

    return row === undefined ? undefined : toDescriptor(row);
  }
}

interface DeliverableRow {
  readonly storageKey: string | null;
  readonly mediaType: string | null;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly byteSize: bigint | null;
}

/**
 * Narrows the row into a descriptor, or refuses it.
 *
 * The columns are nullable in the schema even though the predicate excludes
 * NULL, so the narrowing is explicit rather than asserted. The positivity and
 * media-type checks are **not** redundant with the CHECK constraints: this is
 * the read path, and it decides what a customer's browser is told the object is.
 * A row that somehow carried a zero dimension or an unapproved type is refused
 * here rather than turned into a misleading response.
 */
function toDescriptor(row: DeliverableRow): PublicSideBackgroundDescriptor | undefined {
  const { storageKey, mediaType, widthPx, heightPx, byteSize } = row;
  if (storageKey === null || mediaType === null) return undefined;
  if (widthPx === null || heightPx === null || byteSize === null) return undefined;
  if (widthPx <= 0 || heightPx <= 0 || byteSize <= 0n) return undefined;
  if (!isDeliverableSideBackgroundMediaType(mediaType)) return undefined;
  // `byte_size` is a bigint column. A background larger than 2^53 bytes cannot
  // exist under the 10 MiB source policy, but converting without the guard would
  // be the kind of silent precision loss that only appears in production.
  if (byteSize > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;

  return { storageKey, mediaType, widthPx, heightPx, byteSize: Number(byteSize) };
}
