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
 * ## The grant is correlated to the Session, not supplied by the caller
 *
 * The statement starts from the *authorized* Session row and every grant branch
 * is correlated to it (`design-session-media-grant.sql.ts`). An Asset this
 * Session neither uploaded nor already places in its own document is therefore
 * unreachable rather than fetched and then rejected — there is no ordering of
 * these predicates in which a foreign row is a candidate. `session_id` comes from
 * the authorized Session context, so a caller holding Session A's cookie cannot
 * address Session B's media no matter what it puts in the path.
 *
 * `APP3-S06` added the second branch. `APP3-B06C` shipped with the upload
 * association alone, which meant a `CLONE_TEMPLATE` Session could not render the
 * artwork its own document was created with.
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
import { and, eq, gt, isNotNull, isNull, type SQL } from 'drizzle-orm';

import type {
  DesignSessionAssetDeliveryRepository,
  SessionAssetCandidate,
  SessionAssetLookup,
  SessionAssetStatus,
} from '../../domain/repositories/design-session-asset-delivery.repository';
import {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  SESSION_ASSET_DELIVERABLE_STATUS,
  isDeliverableSessionAssetMediaType,
} from '../../domain/design-session-asset-delivery.policy';
import { sessionMediaGrant, uploadGrant } from './design-session-media-grant.sql';

const { designSessions, assets, assetDerivatives } = schema;

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
        derivativeId: assetDerivatives.id,
        storageKey: assetDerivatives.storageKey,
        mediaType: assetDerivatives.mediaType,
        widthPx: assetDerivatives.widthPx,
        heightPx: assetDerivatives.heightPx,
        byteSize: assetDerivatives.byteSize,
      })
      // The authorized Session is the first relation, so every grant branch
      // below is correlated to *this* Session and nothing downstream can widen
      // it.
      .from(designSessions)
      .innerJoin(assets, eq(assets.id, lookup.assetId))
      .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
      .where(
        and(
          eq(designSessions.id, lookup.sessionId),
          // Liveness, in the same snapshot as the grant.
          eq(designSessions.status, LIVE_SESSION_STATE),
          gt(designSessions.expiresAt, lookup.at),
          // The Session's claim: its own upload, or an image its own persisted
          // document already places. The upload branch carries the
          // `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE` lane check with it.
          sessionMediaGrant(),
          // The parent's inspection verdict, asserted independently of the
          // derivative's readiness. A derivative can be written while the Asset is
          // still `INSPECTING` (`APP2-DB01`), so a route that only checked the
          // derivative would serve an image inspection had not yet cleared — and
          // would keep serving one it later `REJECTED`.
          eq(assets.status, SESSION_ASSET_DELIVERABLE_STATUS),
          isNull(assets.deletedAt),
          eligibleDerivative(),
        ),
      )
      .limit(1);

    return row === undefined ? undefined : toCandidate(row);
  }

  /**
   * How far one of this Session's Assets has got (`APP3-S06` §11).
   *
   * Scoped to the **upload** grant alone, and that narrowing is deliberate. A
   * status projection answers "how is the image I just uploaded progressing";
   * an image a `CLONE_TEMPLATE` Session already places has no progression to
   * report, because `APP3-B07` proved it a `READY NORMALIZED` derivative through
   * `validateDesignDocumentContext` before the Session existed. Admitting the
   * document branch here would let a caller enumerate the processing state of
   * media through a second, wider door for no capability the Studio needs.
   *
   * The derivative is a **left** join: its absence is the answer for an Asset
   * that has been accepted but not yet normalized, and an inner join would have
   * collapsed that into the same silent miss as "you do not own this Asset".
   * Distinguishing those two is the entire reason this operation exists —
   * `APP3-B06C` correctly refuses to tell them apart, which is why its 404 is not
   * a status protocol.
   */
  async findAssetStatus(lookup: SessionAssetLookup): Promise<SessionAssetStatus | undefined> {
    const [row] = await this.db
      .select({
        assetStatus: assets.status,
        derivativeId: assetDerivatives.id,
        mediaType: assetDerivatives.mediaType,
        widthPx: assetDerivatives.widthPx,
        heightPx: assetDerivatives.heightPx,
        byteSize: assetDerivatives.byteSize,
      })
      .from(designSessions)
      .innerJoin(assets, eq(assets.id, lookup.assetId))
      .leftJoin(
        assetDerivatives,
        and(eq(assetDerivatives.assetId, assets.id), eligibleDerivative()),
      )
      .where(
        and(
          eq(designSessions.id, lookup.sessionId),
          eq(designSessions.status, LIVE_SESSION_STATE),
          gt(designSessions.expiresAt, lookup.at),
          uploadGrant(),
          isNull(assets.deletedAt),
        ),
      )
      .limit(1);

    return row === undefined ? undefined : toStatus(row);
  }
}

/**
 * The one editor-safe derivative, in the only serveable state.
 *
 * Shared by both reads so "eligible" cannot mean two things. The private
 * `ORIGINAL` is not a candidate and has no branch that could select it; neither
 * has `THUMBNAIL`, `CATALOG_PREVIEW`, `PREVIEW_WATERMARKED` or `MOCKUP`.
 *
 * `READY` `NORMALIZED` implies the key and the whole quartet by CHECK, but these
 * paths *read* every one of those values, so they assert the facts they depend
 * on instead of trusting a constraint from a distance.
 */
function eligibleDerivative(): SQL {
  return and(
    eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND),
    eq(assetDerivatives.status, EDITOR_SAFE_DERIVATIVE_STATE),
    // INV-22: a watermarked artifact is a customer-facing preview, never an
    // editor-safe asset.
    eq(assetDerivatives.isWatermarked, false),
    isNotNull(assetDerivatives.storageKey),
    isNotNull(assetDerivatives.mediaType),
    isNotNull(assetDerivatives.widthPx),
    isNotNull(assetDerivatives.heightPx),
    isNotNull(assetDerivatives.byteSize),
  ) as SQL;
}

interface StatusRow {
  readonly assetStatus: string;
  readonly derivativeId: string | null;
  readonly mediaType: string | null;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly byteSize: bigint | null;
}

/**
 * The Asset's own state, narrowed to what the Studio may be told.
 *
 * `READY` requires the *whole* description, not merely a derivative row: a
 * measurement missing here would become an `APP3-P01` image element built from a
 * number nobody measured. Anything short of complete is `PROCESSING`, which is
 * the truthful answer — the derivative is not usable yet — rather than a `READY`
 * the Studio would act on.
 *
 * Only `REJECTED` is terminal-negative. `DELETION_PENDING`/`DELETED` cannot be
 * reached here because the tombstone predicate excludes them, and `UPLOADED`
 * cannot survive the intake transaction, so `PROCESSING` is the correct residue.
 */
function toStatus(row: StatusRow): SessionAssetStatus {
  if (row.assetStatus === 'REJECTED') return { state: 'REJECTED' };
  if (row.assetStatus !== SESSION_ASSET_DELIVERABLE_STATUS) return { state: 'PROCESSING' };

  const { derivativeId, mediaType, widthPx, heightPx, byteSize } = row;
  if (derivativeId === null || mediaType === null) return { state: 'PROCESSING' };
  if (widthPx === null || heightPx === null || byteSize === null) return { state: 'PROCESSING' };
  if (widthPx <= 0 || heightPx <= 0 || byteSize <= 0n) return { state: 'PROCESSING' };
  if (!isDeliverableSessionAssetMediaType(mediaType)) return { state: 'PROCESSING' };
  if (byteSize > BigInt(Number.MAX_SAFE_INTEGER)) return { state: 'PROCESSING' };

  return {
    state: 'READY',
    derivativeId,
    widthPx,
    heightPx,
    mediaType,
    byteSize: Number(byteSize),
  };
}

interface CandidateRow {
  readonly derivativeId: string;
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
