/**
 * Persistence contract for the Ready-Made reservation-expiry sweep (`BR-026`).
 *
 * One operation: *which reservations look due right now*. Everything the sweep
 * then **does** — locking the order, locking the reservation, writing the
 * terminal state, appending the ledger entry, cancelling the order — is already
 * implemented by the delivered writers in `@embroidery/persistence`
 * (`SkuStockRepository.expireReservationIfDue`,
 * `ReadyMadeOrderRepository.transitionReadyMade`). This repository deliberately
 * offers none of them: a second implementation of a terminal inventory write is
 * exactly the duplication `PO-APP8-006` and `IMP-D054` exist to prevent, and it
 * would be free to disagree with the one the API calls.
 *
 * ## The candidate read is unlocked, and that is safe
 *
 * The rows it returns are a **suggestion**, not a decision. Between this read
 * and the transaction that acts on one, the reservation may have been consumed,
 * released, or had its window extended by `APP12-B03`. Every one of those is
 * re-checked under the reservation's own row lock by `expireReservationIfDue`,
 * which returns nothing when the candidate is no longer due. So a stale
 * candidate costs one wasted transaction and changes nothing — whereas holding
 * locks across the whole batch would put a sweep in front of the checkout path.
 *
 * ## Why the order's origin and status are in the query
 *
 * Not as an optimisation. A `CUSTOM` reservation is no-expiry by `PO-APP8-002`
 * and has no `expires_at` at all, so it could not match anyway — but stating
 * `origin = 'READY_MADE'` means a future change to that policy cannot silently
 * bring custom reservations into this sweep's scope. The status predicate is
 * `BR-026`'s own: only the two **pre-payment** states expire. A reservation on
 * an order that has reached `READY_FOR_DELIVERY` is stock that has been paid
 * for, and releasing it would sell goods out from under a paying customer.
 */

export const DUE_RESERVATION_REPOSITORY = Symbol('DUE_RESERVATION_REPOSITORY');

/** One candidate: the reservation to expire, and the order to cancel with it. */
export interface DueReservation {
  readonly reservationId: string;
  readonly orderId: string;
}

export interface DueReservationRepository {
  /**
   * Reservations that appear due at `now`, oldest first, at most `limit`.
   *
   * Ordered by `(expires_at, id)` — the partial index's own key order, so the
   * batch is a range scan rather than a sort, and the oldest lapse is always
   * the one drained first.
   */
  listDue(now: Date, limit: number): Promise<readonly DueReservation[]>;
}
