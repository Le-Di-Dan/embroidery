/**
 * `TR-LC14-05` — the Admin command that opens final payment (`APP9-B01`).
 *
 * ```text
 * PRODUCTION_COMPLETED -> AWAITING_FINAL_PAYMENT
 *   actor:       ADMIN
 *   requires:    a live REMAINING obligation on the order
 *   effect:      the order enters AWAITING_FINAL_PAYMENT, and the obligation
 *                that already existed becomes payable by lifecycle state
 * ```
 *
 * ### What it deliberately does not do
 *
 * It does not create the `REMAINING` obligation, change its amount, satisfy it,
 * open an attempt against it, or set any flag on it. The obligation has existed
 * in `PENDING` since the order was converted, with its amount copied verbatim
 * from the accepted quotation version (`APP7-W01`, `APP9-G01` §4). **The order's
 * lifecycle state is what opens the window** — there is no `payable` column and
 * none is invented, which is why this command writes to `orders` and
 * `order_transitions` and to nothing else.
 *
 * It also derives no amount. No `total - deposit`, no quotation read, no sum
 * over the frozen lines: an amount recomputed here could disagree with the one
 * the customer is about to be asked for, and `APP9-G01` §4 leaves the obligation
 * row the single authority.
 *
 * ### The transaction and the lock (§8)
 *
 * ```text
 * 1. orders  FOR UPDATE   — loadForUpdate, the decision's own lock
 * 2. orders                — transition, re-checking LC-14 legality under it
 * ```
 *
 * One `runInTransaction` wraps the guard reads and the move. `loadForUpdate` is
 * the delivered `APP8-B04` seam and exists for exactly this shape of command: a
 * caller that must **decide** from the order's committed state, not only move
 * it. LC-14 legality alone cannot express this guard — `ON_HOLD →
 * AWAITING_FINAL_PAYMENT` is a *legal* move (it is the resume path), so a
 * legality check would let a held order open final payment — so the source state
 * is asserted explicitly against the locked row.
 *
 * Two concurrent commands therefore serialise on the order row: the second reads
 * `AWAITING_FINAL_PAYMENT`, fails the source-state assertion and commits
 * nothing. No partial write can survive either, because there is only one write
 * and it is inside the transaction the guards hold.
 *
 * ### Replay
 *
 * Deterministic refusal, not a second receipt. `TR-LC14-05` is legal from one
 * state; after the first command commits, the order is no longer in it, so a
 * retry meets `ORDER_INVALID_TRANSITION` and appends no second
 * `order_transitions` row. That is the repository's existing transition
 * semantics, and B01 adds no idempotency store of its own to override it.
 *
 * ### Side effects
 *
 * The canonical `order_transitions` row the repository already appends —
 * `STATE_CHANGE`, the ADMIN actor, the request correlation id — and nothing
 * else. No notification intent (`APP9-G01` §8, APP10 owns customer
 * communication), no email, no SMS, no provider call and no webhook
 * (`PAYMENT_MVP = MANUAL_BANK_TRANSFER`). The customer payment surface begins in
 * `APP9-B02`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import type { OrderState, PaymentObligationState } from '@embroidery/database';
import {
  ORDER_REPOSITORY,
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type OrderId,
  type OrderRepository,
  type PaymentObligationRepository,
} from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { orderFinalPaymentError } from '../../domain/lifecycle/order-final-payment.errors';
import { requireOrderLifecycleAdminId } from './order-lifecycle-actor';

/** The one source state `TR-LC14-05` is legal from. */
export const FINAL_PAYMENT_SOURCE_STATE = 'PRODUCTION_COMPLETED' satisfies OrderState;

/** The one target state `TR-LC14-05` moves to. */
export const FINAL_PAYMENT_TARGET_STATE = 'AWAITING_FINAL_PAYMENT' satisfies OrderState;

export interface OpenFinalPaymentResult {
  readonly orderId: string;
  readonly code: string;
  readonly fromStatus: OrderState;
  readonly status: OrderState;
  readonly remainingObligationId: string;
  readonly remainingObligationStatus: PaymentObligationState;
}

@Injectable()
export class OpenFinalPaymentUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async open(orderId: string): Promise<OpenFinalPaymentResult> {
    // Before the transaction opens: an actor fault must not hold a connection.
    const adminId = requireOrderLifecycleAdminId(this.requestContext);
    const correlationId = this.requestContext.requireRequestId();
    const id = orderId as OrderId;

    try {
      return await this.transactions.runInTransaction(async () => {
        const order = await this.orders.loadForUpdate(id);
        if (order === undefined) {
          throw orderFinalPaymentError('ORDER_NOT_FOUND');
        }
        if (order.status !== FINAL_PAYMENT_SOURCE_STATE) {
          throw orderFinalPaymentError('ORDER_INVALID_TRANSITION');
        }

        // Kind-aware, and read through the one AGG-16 authority. `DEPOSIT`
        // cannot answer this question: `findLiveForOrder` filters on the kind
        // *and* on the live statuses `uq_payment_obligations__order_kind__live`
        // arbitrates, so a superseded or cancelled REMAINING row, and any other
        // order's obligation, are all invisible to it. Nothing is created when
        // the answer is empty (§7).
        const remaining = await this.obligations.findLiveForOrder(order.id, 'REMAINING');
        if (remaining === undefined) {
          throw orderFinalPaymentError('ORDER_REMAINING_PAYMENT_MISSING');
        }

        const moved = await this.orders.transition({
          id: order.id,
          to: FINAL_PAYMENT_TARGET_STATE,
          actor: { kind: 'ADMIN', adminId },
          correlationId,
        });

        return {
          orderId: moved.id,
          code: moved.code,
          fromStatus: order.status,
          status: moved.status,
          remainingObligationId: remaining.id,
          remainingObligationStatus: remaining.status,
        };
      });
    } catch (error: unknown) {
      throw this.translate(error);
    }
  }

  /**
   * Translates the one persistence guard code this command can provoke.
   *
   * The source-state assertion above already refuses every illegal move this
   * route can be asked for, so `INVALID_TRANSITION` from the repository is the
   * belt-and-braces case: a state that changed between the locked read and the
   * write cannot happen while this transaction holds the row, but the repository
   * re-checks anyway and its answer must not reach a client as an unmapped 500.
   *
   * Anything else — a SQLSTATE, a constraint name, a retryable `40001`/`40P01`
   * conflict — travels untouched to the platform filter, which already maps and
   * sanitises it. Re-deciding those here would duplicate a delivered mapper.
   */
  private translate(error: unknown): unknown {
    if (isPersistenceError(error) && error.code === 'INVALID_TRANSITION') {
      return orderFinalPaymentError('ORDER_INVALID_TRANSITION');
    }
    return error;
  }
}
