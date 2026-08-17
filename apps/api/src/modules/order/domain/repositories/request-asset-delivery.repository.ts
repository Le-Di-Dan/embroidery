/**
 * The read-only port Admin request-asset delivery resolves its *association*
 * through (`APP5-B06` §5, §8).
 *
 * One method, and it is a read. That is the structural form of B06's zero-write
 * guarantee: the delivery module binds *this* port and neither
 * `CUSTOM_REQUEST_REPOSITORY` nor `CUSTOM_REQUEST_ADMIN_REPOSITORY`, so
 * `transition()`, `appendNote()` and the whole moderation surface are not merely
 * unused on this path — they are unreachable from it. `APP3-B06C` learned the
 * same lesson: a delivery route that holds a writable repository is one refactor
 * away from writing.
 *
 * It is a **fourth** Ordering read contract beside the AGG-13 write repository,
 * `APP5-B03`'s customer projection and `APP5-B04`'s Admin read model, and the
 * split is by what it may answer rather than by convenience. B04's port can list
 * every association of a request, name its customer, read its moderation notes
 * and enumerate its history; this one can answer exactly one question about
 * exactly one pair, and its absences are therefore a property of its own
 * signature rather than of a caller's restraint.
 *
 * ## Why the method takes both ids
 *
 * Deliberately absent: any method taking only an `assetId`. There is no
 * "find asset by id" on this port at all, so the generic
 * `GET /api/admin/assets/{assetId}` §1 forbids has nothing to be built on, and
 * no refactor can accidentally drop the request half of the authorization while
 * leaving a compiling call site behind.
 *
 * ## Why it returns only a role
 *
 * Ordering owns the association and nothing else. `assets` is Asset's table:
 * joining it from here would put a customer's storage key in an Ordering
 * statement and make the module that owns request evidence a second authority on
 * asset metadata — the boundary `APP5-B04` §12 already refused to cross for the
 * detail read. The role is the only fact this side owns that the delivery
 * decision needs.
 */
import type { App5RequestAssetRole } from '../delivery/request-asset-delivery.policy';
import type { CustomRequestId } from './custom-request.repository';

export const REQUEST_ASSET_DELIVERY_REPOSITORY = Symbol('REQUEST_ASSET_DELIVERY_REPOSITORY');

/** The pair that addresses one deliverable object. Neither half is optional. */
export interface RequestAssetLookup {
  readonly requestId: CustomRequestId;
  readonly assetId: string;
}

export interface RequestAssetDeliveryRepository {
  /**
   * The deliverable role binding this exact request to this exact asset, or
   * nothing.
   *
   * `undefined` is the only failure shape and it covers four distinct causes: no
   * such request, no such asset, an association to a *different* request, and an
   * association whose role is `ATTACHMENT`. The caller cannot learn which,
   * because it is never told — and the role filter lives in the statement rather
   * than in a caller's `if`, so an `ATTACHMENT` row is not merely rejected
   * afterwards but never selected.
   *
   * No lock and no transaction: reading evidence changes nothing, and a lock
   * taken by a viewer is a lock a moderation transaction would wait on.
   */
  findDeliverableRole(lookup: RequestAssetLookup): Promise<App5RequestAssetRole | undefined>;
}
