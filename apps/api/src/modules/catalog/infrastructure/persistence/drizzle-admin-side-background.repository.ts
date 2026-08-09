/**
 * Drizzle implementation of the Admin Side-background delivery read
 * (`APP3-B02A` §3).
 *
 * One statement, one row. Membership, the background association, the Asset lane
 * and the derivative's readiness and quartet are expressed as the join and WHERE
 * of a single query, so PostgreSQL evaluates them against one consistent
 * snapshot. Splitting it into "find the product, then the side, then the
 * derivative" would open windows in which a background replacement could commit
 * between the checks, and the earlier checks would have proved nothing about the
 * row finally served.
 *
 * ## What this deliberately does NOT check, and why
 *
 * `products.status`, `products.archived_at`, `categories.status` and
 * `categories.archived_at` are all absent. The public route exists to decide
 * what a stranger may see; this one serves an authenticated operator the
 * background of a Product they are configuring, and `APP3-A01` authors placement
 * while the Product is still `DRAFT`. Requiring publication would make the
 * authoring screen work only for products that no longer need setting up.
 *
 * `product_sides.retired_at` is absent for the same family of reason: Admin
 * keeps retired rows visible as history (`IMP-D041` PO-07), so a retired Side's
 * background stays inspectable rather than becoming a broken frame.
 *
 * Everything that decides *which bytes an object contains* is unchanged from
 * `APP3-B02`, and imported from the shared policy rather than re-declared.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';

import type {
  AdminSideBackgroundDescriptor,
  AdminSideBackgroundLookup,
  AdminSideBackgroundRepository,
} from '../../domain/repositories/admin-side-background.repository';
import {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  SIDE_BACKGROUND_ASSET_CLASSIFICATION,
  SIDE_BACKGROUND_ASSET_KIND,
  SIDE_BACKGROUND_ASSET_STATUS,
  isDeliverableSideBackgroundMediaType,
} from '../../domain/admin-side-background.policy';

const { products, productSides, assets, assetDerivatives } = schema;

@Injectable()
export class DrizzleAdminSideBackgroundRepository
  extends DrizzleRepository
  implements AdminSideBackgroundRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findDeliverable(
    lookup: AdminSideBackgroundLookup,
  ): Promise<AdminSideBackgroundDescriptor | undefined> {
    const [row] = await this.db
      .select({
        storageKey: assetDerivatives.storageKey,
        mediaType: assetDerivatives.mediaType,
        widthPx: assetDerivatives.widthPx,
        heightPx: assetDerivatives.heightPx,
        byteSize: assetDerivatives.byteSize,
      })
      .from(products)
      // Joined on the Product id, so a Side of another Product cannot resolve
      // even when both ids are real. This single join is the membership proof
      // the route's safe 404 depends on.
      .innerJoin(productSides, eq(productSides.productId, products.id))
      // The Asset is reached **through** `background_asset_id`, so the join is
      // the association: an Asset that is no longer this Side's background
      // cannot be selected, and a replacement takes effect on the next request
      // without anything having to be invalidated.
      .innerJoin(assets, eq(assets.id, productSides.backgroundAssetId))
      .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
      .where(
        and(
          eq(products.id, lookup.productId),
          eq(productSides.id, lookup.sideId),
          // The Asset lane is re-checked rather than trusted from the placement
          // write that created the link — an image can be rejected or
          // tombstoned after it was attached.
          eq(assets.kind, SIDE_BACKGROUND_ASSET_KIND),
          eq(assets.classification, SIDE_BACKGROUND_ASSET_CLASSIFICATION),
          eq(assets.status, SIDE_BACKGROUND_ASSET_STATUS),
          isNull(assets.deletedAt),
          // The one editor-safe derivative, in the only serveable state.
          eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND),
          eq(assetDerivatives.status, EDITOR_SAFE_DERIVATIVE_STATE),
          // INV-22: a watermarked artifact is the customer/design preview, never
          // an editor background — including in the editor that authors it.
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
 * the read path, and it decides what a browser is told the object is. A row that
 * somehow carried a zero dimension or an unapproved type is refused here rather
 * than turned into a misleading response.
 */
function toDescriptor(row: DeliverableRow): AdminSideBackgroundDescriptor | undefined {
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
