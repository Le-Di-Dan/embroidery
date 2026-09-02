/**
 * The bounds of the Ready-Made reservation-expiry sweep (`BR-026`).
 *
 * Constants rather than worker policy rows, on the reasoning
 * `intake-cleanup.policy.ts` records for the other sweep: the nine values
 * `WorkerPolicyService` publishes describe the **claim** runtime — lease
 * duration, batch size, retry curve — and this sweep claims nothing, so
 * borrowing that policy would attach meaning to values sized for a different
 * mechanism.
 *
 * Nothing here is a business rule either. The business rule is
 * `inventory_reservations.expires_at`, which `APP12-B02`'s order-creation
 * command wrote as `created_at + 24h` (`BR-025`). A sweep interval only decides
 * how soon after that instant the stock actually returns to availability.
 */

/**
 * How often the sweep runs.
 *
 * One minute. Shorter than the APP5 intake sweep's five, because what is being
 * released here is **sellable stock**: every minute a lapsed reservation is not
 * released is a minute another customer is told an in-stock item is
 * unavailable. The query is a range scan over
 * `ix_inventory_reservations__expires_id__reserved`, whose partial predicate is
 * exactly the rows this reads, so a pass that finds nothing costs an index
 * probe.
 */
export const RESERVATION_EXPIRY_INTERVAL_MS = 60_000;

/**
 * How many reservations one pass terminalizes.
 *
 * Bounded so a backlog is drained across passes instead of in one long
 * transaction holding `orders` and `sku_stocks` locks that the checkout path
 * needs. Each candidate gets its **own** transaction, so this is a bound on the
 * pass rather than on a single unit of work. A pass that fills its batch simply
 * leaves the rest for the next one — a minute later.
 */
export const RESERVATION_EXPIRY_BATCH_SIZE = 50;

/**
 * The recorded reason on the cancelled order (`BR-026`).
 *
 * `ck_orders__cancelled_reason_required` makes it mandatory, and an order
 * cancelled for no recorded reason is a customer conversation with no evidence
 * behind it. It names the rule rather than the order, because that is the only
 * question an operator reading a cancelled Ready-Made order actually has.
 *
 * The reservation row itself needs none:
 * `ck_inventory_reservations__released_reason_required` demands a reason for
 * `RELEASED` and demands none for `EXPIRED`, because the elapsed window **is**
 * the reason.
 */
export const RESERVATION_EXPIRY_ORDER_REASON =
  'Reservation window expired before payment was completed.';

/** The actor every ledger row and transition this sweep writes is attributed to. */
export const RESERVATION_EXPIRY_JOB_KEY = 'inventory.readyMade.reservationExpiry';
