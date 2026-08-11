/**
 * The read-only port Design Session asset delivery resolves through
 * (`APP3-B06C`).
 *
 * One method, and it is a read. That is the structural form of `APP3-B06C`'s
 * zero-write guarantee: the delivery module binds *this* port and not
 * `DESIGN_SESSION_REPOSITORY`, so `attachAsset`, `saveDocument`,
 * `advanceRevision`, `rotateSecret`, `submit` and `expire` are not merely unused
 * on this path — they are unreachable from it. `APP3-B05A` learned the same
 * lesson: a delivery route that holds a writable repository is one refactor away
 * from writing.
 *
 * Deliberately absent: any method taking only an `assetId`. There is no
 * "find asset by id" on this port at all, so the generic `GET /assets/{id}`
 * `IMP-D044` PO-06 forbids has nothing to be built on.
 */
import type { DesignSessionId } from './design-session.repository';

export const DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY = Symbol(
  'DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY',
);

/**
 * The pair that addresses one deliverable object.
 *
 * `sessionId` is branded, which is a small compile-time echo of the runtime rule:
 * the value must come from the *authorized* Session context, never from the raw
 * path parameter, because the guard proved ownership of that exact id.
 */
export interface SessionAssetLookup {
  readonly sessionId: DesignSessionId;
  readonly assetId: string;
  /**
   * The instant the Session was authorized.
   *
   * Passed in rather than read from the database clock so the liveness this
   * statement re-checks is the same liveness the guard decided, measured by the
   * same clock. Two clocks would make the two answers disagree at the margin for
   * no benefit.
   */
  readonly at: Date;
}

/**
 * The safe descriptor of one deliverable object.
 *
 * Carries the persisted storage key — which never leaves the API — plus the two
 * transport facts the response needs. Deliberately no bucket, no checksum, no
 * provider ETag, no derivative id, no parent-Asset metadata and no dimensions:
 * the Studio already read width and height from the Design Document, and a
 * delivery route that restated them would be a second authority for the same
 * numbers.
 */
export interface SessionAssetCandidate {
  readonly storageKey: string;
  readonly mediaType: string;
  readonly byteSize: number;
}

/**
 * How far one of this Session's Assets has got, as the Studio is allowed to
 * know it (`APP3-S06` §11).
 *
 * Three states, and the boundary between them is a *terminal verdict*, not a
 * pipeline stage. `PROCESSING` means "no verdict yet, or no editor-safe output
 * yet" and deliberately does not distinguish inspection from normalization: the
 * Studio shows one "đang xử lý" state for both, and naming the internal stage
 * would publish the shape of the worker pipeline to an anonymous caller for no
 * behaviour it could take.
 *
 * `READY` carries exactly the `APP3-P01` image-media fields and the quartet that
 * proves the derivative is completely described. Nothing else: no storage key,
 * bucket, provider, checksum, source filename, inspection detail, job id, lease
 * or retry count.
 */
export type SessionAssetStatus =
  | { readonly state: 'PROCESSING' }
  | {
      readonly state: 'READY';
      readonly derivativeId: string;
      readonly widthPx: number;
      readonly heightPx: number;
      readonly mediaType: string;
      readonly byteSize: number;
    }
  | { readonly state: 'REJECTED' };

export interface DesignSessionAssetDeliveryRepository {
  /**
   * The one deliverable object for this exact (Session, Asset) pair, or nothing.
   *
   * Every term — the grant, the Session's own liveness, the Asset lane,
   * classification, inspection verdict and tombstone, and the derivative's kind,
   * status, watermark flag and canonical quartet — is decided inside this call
   * against one consistent snapshot. Returning `undefined` is the *only* failure
   * shape: the caller cannot learn which term failed, because it is never told.
   */
  findDeliverableCandidate(lookup: SessionAssetLookup): Promise<SessionAssetCandidate | undefined>;

  /**
   * How far this Session's own Asset has got, or nothing when the Session has no
   * claim on it at all.
   *
   * `undefined` is the same non-enumerating refusal `findDeliverableCandidate`
   * gives: an unknown Asset, one belonging to another Session and one this
   * Session never uploaded are indistinguishable from each other. What this adds
   * over the delivery route is only the ability to distinguish *the states of an
   * Asset the caller already owns* — which is the whole reason `APP3-B06C`'s 404
   * must never be used as a status protocol.
   */
  findAssetStatus(lookup: SessionAssetLookup): Promise<SessionAssetStatus | undefined>;
}
