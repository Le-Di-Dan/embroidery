/**
 * The durable half of Design Session asset delivery, in SQL (`APP3-B06C`).
 *
 * One statement, one row. The `design_session_assets` association, the Session's
 * own liveness, the Asset's lane, classification, inspection verdict and
 * tombstone, and the derivative's kind, status, watermark flag and canonical
 * quartet are all expressed as the joins and `WHERE` of a single query, so
 * PostgreSQL evaluates them against one consistent snapshot. Asking in
 * sequence — find the association, then the Asset, then the derivative — would
 * open windows in which an expiry or a tombstone could commit, and the earlier
 * answers would have proved nothing about the row finally served.
 *
 * ## The association is a join, not a filter
 *
 * The Asset is reached **through** `design_session_assets`, and the join carries
 * both halves of the pair. An Asset that was never associated with this Session,
 * or associated with a different one, is therefore *unreachable* rather than
 * fetched and then rejected — there is no ordering of these predicates in which a
 * foreign row is ever a candidate. `session_id` comes from the authorized Session
 * context, so a caller holding Session A's cookie cannot address Session B's
 * uploads no matter what it puts in the path.
 *
 * ## Session liveness, re-checked
 *
 * The guard already proved the Session `ACTIVE` and unexpired a few microseconds
 * earlier, and this asserts it again inside the same snapshot as the association.
 * That is not redundancy for its own sake: it closes the window between the two,
 * and it makes this statement self-sufficient — a future caller cannot reach it
 * through a path that forgot to authorize.
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
import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm';

import type {
  DesignSessionAssetDeliveryRepository,
  SessionAssetCandidate,
  SessionAssetLookup,
} from '../../domain/repositories/design-session-asset-delivery.repository';
import {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  SESSION_ASSET_DELIVERABLE_STATUS,
  SESSION_INTAKE_ASSET_KIND,
  SESSION_INTAKE_CLASSIFICATION,
  isDeliverableSessionAssetMediaType,
} from '../../domain/design-session-asset-delivery.policy';

const { designSessions, designSessionAssets, assets, assetDerivatives } = schema;

/** The one Session state that may be read from at all (`IMP-D043`). */
const LIVE_SESSION_STATE = 'ACTIVE' as const;

@Injectable()
export class DrizzleDesignSessionAssetDeliveryRepository
  extends DrizzleRepository
  implements DesignSessionAssetDeliveryRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findDeliverableCandidate(
    lookup: SessionAssetLookup,
  ): Promise<SessionAssetCandidate | undefined> {
    const [row] = await this.db
      .select({
        storageKey: assetDerivatives.storageKey,
        mediaType: assetDerivatives.mediaType,
        widthPx: assetDerivatives.widthPx,
        heightPx: assetDerivatives.heightPx,
        byteSize: assetDerivatives.byteSize,
      })
      .from(designSessionAssets)
      // Both halves of the pair are on the association itself, so the very first
      // relation in the statement already encodes "this Asset belongs to this
      // Session". Nothing downstream can widen that.
      .innerJoin(designSessions, eq(designSessions.id, designSessionAssets.sessionId))
      .innerJoin(assets, eq(assets.id, designSessionAssets.assetId))
      .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
      .where(
        and(
          eq(designSessionAssets.sessionId, lookup.sessionId),
          eq(designSessionAssets.assetId, lookup.assetId),
          // Liveness, in the same snapshot as the association.
          eq(designSessions.status, LIVE_SESSION_STATE),
          gt(designSessions.expiresAt, lookup.at),
          // The anonymous upload lane, re-checked rather than trusted from the
          // intake that created the association: `APP3-B06B` writes exactly this
          // pair, so anything else on this route is a row no delivered checkpoint
          // can produce — catalog media, Template artwork and production-sensitive
          // assets are all excluded by these two comparisons alone.
          eq(assets.kind, SESSION_INTAKE_ASSET_KIND),
          eq(assets.classification, SESSION_INTAKE_CLASSIFICATION),
          // The parent's inspection verdict, asserted independently of the
          // derivative's readiness. A derivative can be written while the Asset is
          // still `INSPECTING` (`APP2-DB01`), so a route that only checked the
          // derivative would serve an image inspection had not yet cleared — and
          // would keep serving one it later `REJECTED`.
          eq(assets.status, SESSION_ASSET_DELIVERABLE_STATUS),
          isNull(assets.deletedAt),
          // The one editor-safe derivative, in the only serveable state. The
          // private `ORIGINAL` is not a candidate here and has no branch that
          // could select it; neither has `THUMBNAIL`, `CATALOG_PREVIEW`,
          // `PREVIEW_WATERMARKED` or `MOCKUP`.
          eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND),
          eq(assetDerivatives.status, EDITOR_SAFE_DERIVATIVE_STATE),
          // INV-22: a watermarked artifact is a customer-facing preview, never an
          // editor-safe asset.
          eq(assetDerivatives.isWatermarked, false),
          // `READY` `NORMALIZED` implies the key and the whole quartet by CHECK,
          // but this path *reads* every one of those values, so it asserts the
          // facts it depends on instead of trusting a constraint from a distance.
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
}

interface CandidateRow {
  readonly storageKey: string | null;
  readonly mediaType: string | null;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly byteSize: bigint | null;
}

/**
 * Narrows the row into a candidate, or refuses it.
 *
 * The columns are nullable in the schema even though the predicate excludes
 * NULL, so the narrowing is explicit rather than asserted. None of these checks
 * is redundant with a CHECK constraint: this is the path that decides what a
 * browser is *told* the object is, and a row that somehow carried a zero
 * dimension or an unapproved media type is refused here rather than turned into a
 * misleading response.
 *
 * The dimensions are required in full but not returned. They are part of the
 * `APP3-DB01` quartet that makes a derivative *completely described*, and an
 * incompletely described row is not deliverable — but the Studio reads geometry
 * from the Design Document, so restating it in a transport header would create a
 * second authority for the same numbers.
 */
function toCandidate(row: CandidateRow): SessionAssetCandidate | undefined {
  const { storageKey, mediaType, widthPx, heightPx, byteSize } = row;
  if (storageKey === null || mediaType === null) return undefined;
  if (widthPx === null || heightPx === null || byteSize === null) return undefined;
  if (widthPx <= 0 || heightPx <= 0 || byteSize <= 0n) return undefined;
  if (!isDeliverableSessionAssetMediaType(mediaType)) return undefined;
  // `byte_size` is a bigint column. A Session upload above 2^53 bytes cannot
  // exist under the 10 MiB intake ceiling, but converting without the guard would
  // be the kind of silent precision loss that only ever appears in production.
  if (byteSize > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;

  return { storageKey, mediaType, byteSize: Number(byteSize) };
}
