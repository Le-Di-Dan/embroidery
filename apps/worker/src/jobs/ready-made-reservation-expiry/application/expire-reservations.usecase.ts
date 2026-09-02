/**
 * One expiry pass: release lapsed Ready-Made stock and cancel the order that
 * was holding it (`BR-026`).
 *
 * ```text
 * reservation expires
 * → reservation  RESERVED → EXPIRED, ledger RESERVATION_EXPIRED, stock returns
 * → order        AWAITING_SHIPPING_FEE | AWAITING_PAYMENT → CANCELLED, with a reason
 * ```
 *
 * ## Why a sweep, and why here
 *
 * Expiry produces no event — that is the whole reason a timestamp needs a
 * consumer at all — so there is nothing for `JobHandlerRegistry` to route. This
 * is a second, much smaller loop beside the outbox runtime, exactly as
 * `IntakeCleanupUseCase` is. The `APP12` pre-implementation audit assigned the
 * sweeper to "the existing worker", owned by `APP12-DB01` (state) and
 * `APP12-B02` (write path); this is that sweeper.
 *
 * ## One transaction per reservation, not one per pass
 *
 * A batch-wide transaction would hold an `orders` row lock and a
 * `sku_stocks` anchor lock for every candidate at once — locks the public
 * checkout path needs — and one unexpected failure would roll back fifty
 * legitimate releases. Per-candidate transactions cost more round trips and buy
 * independence: a candidate that turns out not to be due, or whose order moved
 * under it, affects nothing else in the pass.
 *
 * ## Every decision is re-taken under a lock
 *
 * The candidate list is an unlocked read and is treated as a suggestion. Inside
 * each transaction, in this order:
 *
 * 1. `loadReadyMadeForUpdate` — the `orders` row lock, **first**, which is the
 *    delivered `orders` → `inventory_reservations` → `sku_stocks` direction
 *    (`DB8_LOCK_ORDER_MATRIX.md`). The status is read under it, so an order
 *    that reached `READY_FOR_DELIVERY` while the sweep was reading its
 *    candidates is skipped rather than cancelled;
 * 2. `expireReservationIfDue` — the reservation row lock, then the three checks
 *    that make a double-release, an early expiry and a custom-reservation
 *    expiry all impossible;
 * 3. only if step 2 actually expired something, the order is cancelled.
 *
 * Step 3 depending on step 2 is what stops the two halves diverging: an order
 * is never cancelled for an expiry that did not happen, and stock is never
 * released without the order that held it being closed.
 *
 * ## The payment window, and the obligation it belongs to
 *
 * `APP12-B03` gave the second expirable state its money. An order that reached
 * `AWAITING_PAYMENT` carries one live `FULL` obligation (`BR-029`), and letting
 * its window lapse must close that too:
 *
 * ```text
 * AWAITING_SHIPPING_FEE   reservation EXPIRED → order CANCELLED
 *                         payment obligations: none exist (§25)
 *
 * AWAITING_PAYMENT        reservation EXPIRED → FULL CANCELLED → order CANCELLED
 * ```
 *
 * The obligation is cancelled through the delivered `cancel` writer, which
 * moves `PENDING → CANCELLED` and nothing else. A `SATISFIED` `FULL` is
 * therefore untouched by construction rather than by a branch: `cancel`
 * refuses it, and this use case never reaches it anyway, because an order whose
 * payment succeeded is no longer expirable — `APP12-B05` owns making that true
 * when it verifies the payment.
 *
 * The **first** window keeps needing no obligation at all (§25). Requiring one
 * would break every order that lapsed before it was ever priced, which is the
 * ordinary case for an abandoned checkout.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  READY_MADE_ORDER_REPOSITORY,
  SKU_STOCK_REPOSITORY,
  TransactionManager,
  type OrderId,
  type PaymentObligationRepository,
  type ReadyMadeOrderRepository,
  type ReservationId,
  type SkuStockRepository,
} from '@embroidery/persistence';
import { newId } from '@embroidery/database';

import { WORKER_CLOCK, type WorkerClock } from '../../../runtime/clock/worker-clock';
import {
  RESERVATION_EXPIRY_BATCH_SIZE,
  RESERVATION_EXPIRY_JOB_KEY,
  RESERVATION_EXPIRY_ORDER_REASON,
} from '../domain/reservation-expiry.policy';
import {
  DUE_RESERVATION_REPOSITORY,
  type DueReservation,
  type DueReservationRepository,
} from '../domain/repositories/due-reservation.repository';

/** `BR-029` — the one obligation kind a Ready-Made order ever carries. */
const FULL = 'FULL';

export interface ReservationExpiryOutcome {
  /** Candidates the unlocked read offered this pass. */
  readonly examined: number;
  /** Reservations actually moved `RESERVED → EXPIRED`, with their order cancelled. */
  readonly expired: number;
  /** Candidates that were no longer due once locked. An ordinary outcome. */
  readonly skipped: number;
}

@Injectable()
export class ExpireReadyMadeReservationsUseCase {
  private readonly logger = new Logger(ExpireReadyMadeReservationsUseCase.name);

  constructor(
    private readonly transactions: TransactionManager,
    @Inject(DUE_RESERVATION_REPOSITORY) private readonly due: DueReservationRepository,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stock: SkuStockRepository,
    @Inject(READY_MADE_ORDER_REPOSITORY) private readonly orders: ReadyMadeOrderRepository,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    @Inject(WORKER_CLOCK) private readonly clock: WorkerClock,
  ) {}

  async run(batchSize = RESERVATION_EXPIRY_BATCH_SIZE): Promise<ReservationExpiryOutcome> {
    const candidates = await this.due.listDue(new Date(this.clock.now()), batchSize);

    let expired = 0;
    for (const candidate of candidates) {
      if (await this.expireOne(candidate)) {
        expired += 1;
      }
    }

    if (expired > 0) {
      this.logger.log(
        `Ready-Made reservation expiry: examined ${String(candidates.length)}, ` +
          `expired ${String(expired)}.`,
      );
    }
    return { examined: candidates.length, expired, skipped: candidates.length - expired };
  }

  /** One candidate, one transaction. `false` when it was no longer due. */
  private async expireOne(candidate: DueReservation): Promise<boolean> {
    return this.transactions.runInTransaction(async () => {
      const now = new Date(this.clock.now());

      const order = await this.orders.loadReadyMadeForUpdate(candidate.orderId as OrderId);
      if (order === undefined || !isExpirable(order.status)) {
        // Gone, custom, or already past the pre-payment window — decided under
        // the order's own row lock, not from the candidate read.
        return false;
      }

      const reservation = await this.stock.expireReservationIfDue({
        id: candidate.reservationId as ReservationId,
        now,
        actor: { kind: 'SYSTEM', systemJobKey: RESERVATION_EXPIRY_JOB_KEY },
      });
      if (reservation === undefined) {
        // Consumed, released, no-expiry, or its window was extended between the
        // candidate read and this lock — which is exactly what a fee
        // confirmation does (`APP12-B03` §16). Nothing to cancel an order for.
        return false;
      }

      // The money, before the lifecycle move that makes it unpayable. Only the
      // live `FULL` is touched, and only while it is `PENDING`: an order still
      // at `AWAITING_SHIPPING_FEE` has none at all (§25), and a `SATISFIED` one
      // is not a balance to withdraw.
      const live = await this.obligations.findLiveForOrder(order.id, FULL);
      if (live !== undefined && live.status === 'PENDING') {
        await this.obligations.cancel(live.id);
      }

      // `STATE_CHANGE` — the default, and the only honest one:
      // `ORDER_TRANSITION_EVENT_KINDS` is a closed set of six and none of them
      // names an expiry. The *reason* column is where the cause is recorded, and
      // `ck_orders__cancelled_reason_required` is what makes it mandatory. A
      // seventh kind would be a schema change, and `APP12-B02` §6 has none.
      await this.orders.transitionReadyMade({
        id: order.id,
        to: 'CANCELLED',
        actor: { kind: 'SYSTEM', systemJobKey: RESERVATION_EXPIRY_JOB_KEY },
        reason: RESERVATION_EXPIRY_ORDER_REASON,
        correlationId: newId(),
      });
      return true;
    });
  }
}

/** `BR-026` — only the two pre-payment states expire. */
function isExpirable(status: string): boolean {
  return status === 'AWAITING_SHIPPING_FEE' || status === 'AWAITING_PAYMENT';
}
