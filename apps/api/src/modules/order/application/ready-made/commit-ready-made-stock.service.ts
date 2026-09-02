/**
 * The inventory half of a verified Ready-Made payment (`APP12-B05` §5, §6,
 * §11, §12).
 *
 * ```text
 * 1. orders                  loadLifecycleForUpdate   FOR UPDATE
 * 2. inventory_reservations  lockActiveOrderReservation FOR UPDATE
 * 3. inventory_reservations  consumeReservation       RESERVED -> CONSUMED
 * 4. sku_stocks              (inside the consume)     on-hand -= quantity
 *                            + one CONSUMED ledger entry
 * ```
 *
 * ### It performs no inventory arithmetic of its own
 *
 * Steps 3 and 4 are `APP8-B02`'s delivered consume writer, unmodified. There is
 * no `UPDATE inventory_reservations SET status = 'CONSUMED'` here, no on-hand
 * subtraction and no ledger insert: `APP12-B05` §5 forbids a state-only
 * reservation edit, and a second on-hand arithmetic is exactly how two
 * implementations of "committed stock" come to disagree. What this service adds
 * is the *authority* to consume — which order, in which state, on whose behalf.
 *
 * ### Why the order lock is taken here, first
 *
 * `DB8_LOCK_ORDER_MATRIX.md` and both delivered Ready-Made writers —
 * `APP12-B03`'s fee command and the reservation-expiry sweep — take `orders`
 * before ever touching a reservation or an anchor. The verification transaction
 * that calls this holds only the `payment_attempts` lock when it arrives, and
 * the sweep never touches that table, so taking `orders` here keeps the whole
 * Ready-Made family on one direction and adds no edge to the matrix.
 *
 * It is also what makes the verify-versus-expiry race arbitrate rather than
 * interleave. Both flows queue on the same `orders` row, so exactly one gets
 * past it first:
 *
 * ```text
 * verify first   order stays AWAITING_PAYMENT until this transaction commits,
 *                the reservation becomes CONSUMED, and the sweep — which only
 *                expires a RESERVED row and only from a pre-payment state —
 *                later finds neither and skips
 *
 * expiry first   the order is CANCELLED and the reservation EXPIRED by the time
 *                this lock is granted, so `ORDER_MOVED` refuses and the entire
 *                verification rolls back: no settled attempt, no SATISFIED
 *                obligation, no consumed stock
 * ```
 *
 * ### Exactly once, from the row lock rather than from a flag
 *
 * `consumeReservation` locks the reservation with `lockReservedReservationById`,
 * which refuses anything that is not `RESERVED`. A replayed verification never
 * reaches this service at all — the use case answers a committed verification
 * from its own state — and a concurrent one queues on the `orders` lock and then
 * finds the order already moved. Two independent arbiters, both rows, no
 * in-memory guard and no idempotency key (`APP12-B05` §6, §15).
 *
 * ### Origin is checked, and it is not decoration
 *
 * `ck_payment_obligations__kind_by_origin` already makes a `FULL` obligation
 * impossible on a custom order, so a mis-routed call is unreachable through the
 * delivered chain. It is refused anyway: this service can permanently deduct
 * stock, and "unreachable" is a property of today's callers, not of the writer.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  SKU_STOCK_REPOSITORY,
  type OrderId,
  type OrderRepository,
  type SkuStockRepository,
} from '@embroidery/persistence';

import type {
  StockCommitmentOutcome,
  VerifiedPaymentSettlementPort,
} from '../../../payment/domain/verification/verified-payment-settlement';

/** `BR-031` — the only origin whose stock is committed by a payment. */
const READY_MADE = 'READY_MADE';

@Injectable()
export class CommitReadyMadeStockService implements VerifiedPaymentSettlementPort {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stock: SkuStockRepository,
  ) {}

  /** @requiresTransaction — joins the caller's verification transaction. */
  async commitReservedStock(input: {
    readonly orderId: string;
    readonly expectedOrderStatus: string;
    readonly adminId: string;
  }): Promise<StockCommitmentOutcome> {
    const order = await this.orders.loadLifecycleForUpdate(input.orderId as OrderId);
    if (order === undefined || order.origin !== READY_MADE) {
      return 'ORDER_MOVED';
    }
    if (order.status !== input.expectedOrderStatus) {
      // Cancelled by the expiry sweep, or already moved by a verification that
      // committed first. Either way the payment this was called for is not the
      // one this order is collecting, and the caller rolls everything back.
      return 'ORDER_MOVED';
    }

    // A Ready-Made order holds exactly one reservation (`APP12-P01` — one SKU
    // per checkout), reached through the order alone because that is all the
    // caller knows. `undefined` means expired, released or already consumed.
    const reservation = await this.stock.lockActiveOrderReservation(input.orderId);
    if (reservation === undefined) {
      return 'NO_ACTIVE_RESERVATION';
    }

    await this.stock.consumeReservation(reservation.id, {
      kind: 'ADMIN',
      adminId: input.adminId,
    });
    return 'COMMITTED';
  }
}
