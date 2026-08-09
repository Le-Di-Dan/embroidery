/**
 * The durable half of published Template asset delivery, in SQL (`APP3-B05A`).
 *
 * One statement, one row. Template publication, current-Version selection, the
 * durable Template↔Asset association, the Asset's lane and status, and the
 * derivative's readiness, watermark flag and canonical quartet are all expressed
 * as the joins and `WHERE` of a single query, so PostgreSQL evaluates them
 * against one consistent snapshot. Asking in sequence — find the Template, then
 * its Version, then the association — would open windows in which an unpublish or
 * a new publication could commit, and the earlier answers would have proved
 * nothing about the row finally served.
 *
 * ## Current public Version, not published history
 *
 * The requested Version must both carry a publication timestamp **and** be the
 * highest Version that does. The `NOT EXISTS` below is what makes the second half
 * true, and it is the only thing standing between this route and an accidental
 * public Version-history API: `published_at` is never cleared when a newer
 * Version is published, so a Version that was once public stays *marked* public
 * forever. Historical publication is a fact about the past, not a grant.
 *
 * `current_version` is never consulted, for the reason `APP3-B05` gives: in every
 * state the delivered lifecycle can reach it coincides with the highest published
 * Version, and that is exactly why a public read must not lean on it — a row that
 * predates the lifecycle, or one restored from a backup, must not be able to
 * publish a Version nobody published.
 *
 * ## No transaction, deliberately
 *
 * An ordinary read needs none (`DEC-DB7-006`), and this one must not hold one:
 * the caller opens an object stream afterwards, and a transaction spanning that
 * would pin a database connection for the length of a client's download.
 *
 * There is no `insert`, `update`, `delete` or `for('update')` in this file, and
 * the absence is the guarantee rather than an accident of what the route needed.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq, exists, gt, isNotNull, isNull, not } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type {
  PublicDesignTemplateAssetRepository,
  PublicTemplateAssetCandidate,
  PublicTemplateAssetLookup,
} from '../../domain/repositories/public-design-template-asset.repository';
import {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  TEMPLATE_ARTWORK_ASSET_CLASSIFICATION,
  TEMPLATE_ARTWORK_ASSET_KIND,
  TEMPLATE_ARTWORK_ASSET_STATUS,
  isDeliverableTemplateAssetMediaType,
} from '../../domain/public-design-template-asset.policy';

const { designTemplates, designTemplateVersions, designTemplateAssets, assets, assetDerivatives } =
  schema;

/** The one lifecycle state a public caller may observe (`IMP-D042` LC-24). */
const PUBLIC_TEMPLATE_STATE = 'PUBLISHED' as const;

/**
 * A second, **aliased** handle on `design_template_versions`.
 *
 * The newer-Version test compares the version table against itself, and Drizzle
 * emits the same relation name for both sides of a self-reference unless one is
 * aliased. Without this the correlated predicate degenerates to `version >
 * version` on a single row — always false, so `NOT EXISTS` was always true and
 * every historical published Version stayed addressable. The integration proof
 * caught it: publishing v2 left v1's asset address serving.
 */
const newerVersions = alias(designTemplateVersions, 'newer_version');

@Injectable()
export class DrizzlePublicDesignTemplateAssetRepository
  extends DrizzleRepository
  implements PublicDesignTemplateAssetRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findDeliverableCandidate(
    lookup: PublicTemplateAssetLookup,
  ): Promise<PublicTemplateAssetCandidate | undefined> {
    const [row] = await this.db
      .select({
        storageKey: assetDerivatives.storageKey,
        mediaType: assetDerivatives.mediaType,
        widthPx: assetDerivatives.widthPx,
        heightPx: assetDerivatives.heightPx,
        byteSize: assetDerivatives.byteSize,
        document: designTemplateVersions.designDocument,
        productId: designTemplates.productId,
        productSideId: designTemplates.productSideId,
        embroideryAreaId: designTemplates.embroideryAreaId,
      })
      .from(designTemplates)
      .innerJoin(
        designTemplateVersions,
        and(
          eq(designTemplateVersions.designTemplateId, designTemplates.id),
          eq(designTemplateVersions.version, lookup.version),
        ),
      )
      // The Asset is reached **through** the association row, so the join *is*
      // the durable Template↔Asset edge: an Asset that was never associated with
      // this Template, or associated with a different one, cannot be selected at
      // all — it is not reachable rather than filtered out afterwards.
      .innerJoin(
        designTemplateAssets,
        and(
          eq(designTemplateAssets.designTemplateId, designTemplates.id),
          eq(designTemplateAssets.assetId, lookup.assetId),
        ),
      )
      .innerJoin(assets, eq(assets.id, designTemplateAssets.assetId))
      .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
      .where(
        and(
          eq(designTemplates.slug, lookup.slug),
          // Publication, and only publication. Unpublish is a real transition
          // back to `DRAFT` (`TR-LC24-03`) and archive sets a timestamp
          // (`TR-LC24-04`), so these two comparisons are what make a withdrawn
          // Template's addresses stop working on the very next request.
          eq(designTemplates.status, PUBLIC_TEMPLATE_STATE),
          isNull(designTemplates.archivedAt),
          // The addressed Version was published…
          isNotNull(designTemplateVersions.publishedAt),
          // …and no *higher* published Version exists, which is what makes this
          // the Version `APP3-B05` exposes right now rather than one that used
          // to be public. Without it, publishing v2 would leave every v1 asset
          // address alive forever.
          not(this.hasNewerPublishedVersion()),
          // The Template artwork lane, re-checked rather than trusted from the
          // save that created the association: an original can be rejected or
          // tombstoned long after an Admin placed it, and serving history would
          // put withdrawn artwork under a customer's design.
          eq(assets.kind, TEMPLATE_ARTWORK_ASSET_KIND),
          eq(assets.classification, TEMPLATE_ARTWORK_ASSET_CLASSIFICATION),
          eq(assets.status, TEMPLATE_ARTWORK_ASSET_STATUS),
          isNull(assets.deletedAt),
          // The one editor-safe derivative, in the only serveable state. The
          // private ORIGINAL is not a candidate here and has no branch that
          // could select it.
          eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND),
          eq(assetDerivatives.status, EDITOR_SAFE_DERIVATIVE_STATE),
          // INV-22: a watermarked artifact is the customer-facing preview, never
          // an editor-safe asset.
          eq(assetDerivatives.isWatermarked, false),
          // READY NORMALIZED implies the key and the whole quartet by CHECK, but
          // this path *reads* every one of those values, so it asserts the facts
          // it depends on instead of trusting a constraint from a distance.
          isNotNull(assetDerivatives.storageKey),
          isNotNull(assetDerivatives.mediaType),
          isNotNull(assetDerivatives.widthPx),
          isNotNull(assetDerivatives.heightPx),
          isNotNull(assetDerivatives.byteSize),
        ),
      )
      .limit(1);

    return row === undefined ? undefined : toCandidate(row);
  }

  /**
   * `EXISTS (… version > requested AND published_at IS NOT NULL)`, correlated to
   * the Template row.
   *
   * Correlated rather than parameterised with a second lookup so the newer-Version
   * test and the addressed-Version test see the same snapshot: a publication
   * committing between two separate statements would be invisible to both.
   */
  private hasNewerPublishedVersion() {
    return exists(
      this.db
        .select({ one: newerVersions.id })
        .from(newerVersions)
        .where(
          and(
            eq(newerVersions.designTemplateId, designTemplates.id),
            gt(newerVersions.version, designTemplateVersions.version),
            isNotNull(newerVersions.publishedAt),
          ),
        ),
    );
  }
}

interface CandidateRow {
  readonly storageKey: string | null;
  readonly mediaType: string | null;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly byteSize: bigint | null;
  readonly document: unknown;
  readonly productId: string | null;
  readonly productSideId: string | null;
  readonly embroideryAreaId: string | null;
}

/**
 * Narrows the row into a candidate, or refuses it.
 *
 * The columns are nullable in the schema even though the predicate excludes
 * NULL, so the narrowing is explicit rather than asserted. None of these checks
 * is redundant with a CHECK constraint: this is the path that decides what an
 * anonymous browser is *told* the object is, and a row that somehow carried a
 * zero dimension, an unapproved media type or an incomplete scope is refused
 * here rather than turned into a misleading response.
 *
 * The scope triple is required in full. `GRD-T01` cannot publish a Template
 * without one, so an incomplete scope is a row no delivered checkpoint can
 * produce — and a public read meeting an impossible state hides it rather than
 * answering around it.
 */
function toCandidate(row: CandidateRow): PublicTemplateAssetCandidate | undefined {
  const { storageKey, mediaType, widthPx, heightPx, byteSize } = row;
  const { productId, productSideId, embroideryAreaId } = row;
  if (storageKey === null || mediaType === null) return undefined;
  if (widthPx === null || heightPx === null || byteSize === null) return undefined;
  if (widthPx <= 0 || heightPx <= 0 || byteSize <= 0n) return undefined;
  if (!isDeliverableTemplateAssetMediaType(mediaType)) return undefined;
  if (productId === null || productSideId === null || embroideryAreaId === null) return undefined;
  // `byte_size` is a bigint column. A Template asset above 2^53 bytes cannot
  // exist under the 10 MiB source policy, but converting without the guard would
  // be the kind of silent precision loss that only ever appears in production.
  if (byteSize > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;

  return {
    storageKey,
    mediaType,
    byteSize: Number(byteSize),
    document: row.document,
    productId,
    productSideId,
    embroideryAreaId,
  };
}
