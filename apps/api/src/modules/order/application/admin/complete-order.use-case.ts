/**
 * `TR-LC14-08` — the Admin command that completes a delivered order
 * (`APP9-B05` §11).
 *
 * ```text
 * DELIVERED -> COMPLETED
 *   actor:    ADMIN
 *   guard:    GRD-018 (delivered first)
 *   effect:   the order reaches its terminal state — and nothing else
 * ```
 *
 * ### Why it is a second command rather than the tail of the dispatch
 *
 * Because `DELIVERED` is a state the business sits in. Dispatch records that the
 * parcel left; completion records that the operator considers the order closed,
 * and those are separated by however long delivery takes. Collapsing them would
 * make `DELIVERED` unobservable and would move an order to a **terminal** state
 * on the strength of a decision nobody made — `COMPLETED` has no successor in
 * LC-14, so there is no way back from a completion that happened too early.
 *
 * ### GRD-018 is the source state, asserted under the row's own lock
 *
 * "Delivered first" (REQ-ORD-005). LC-14 legality alone cannot express it: the
 * `ALLOWED` map has `DELIVERED → COMPLETED` as the only move out of `DELIVERED`,
 * which makes legality *necessary* but says nothing about an order still in
 * `READY_FOR_DELIVERY` — a legality check there would refuse for the right
 * reason by accident. So the source state is asserted explicitly against the
 * locked row, the same shape `APP9-B01` established, and `loadForUpdate` is the
 * delivered seam for a caller that must decide from committed state rather than
 * only move it.
 *
 * ### The transaction and the lock (§12)
 *
 * ```text
 * 1. orders  FOR UPDATE   loadForUpdate — the decision's own lock
 * 2. orders + order_transitions   transition — the move and its evidence
 * ```
 *
 * One `runInTransaction` wraps the guard read and the move. Two concurrent
 * commands serialise on the order row: the second reads `COMPLETED`, fails the
 * source-state assertion and commits nothing.
 *
 * ### Replay (§12)
 *
 * Deterministic refusal. `TR-LC14-08` is legal from one state; after the first
 * command commits the order is `COMPLETED`, so a retry appends no second
 * `order_transitions` row. No idempotency store is added.
 *
 * ### What it must not do, and does not (§11)
 *
 * It writes to `orders` and `order_transitions` and to nothing else. It does not
 * freeze shipping again — the detail is already `FROZEN` and its S24 trigger
 * would reject the attempt anyway. It creates no second snapshot: the snapshot
 * belongs to the dispatch transaction, and `uq_shipping_snapshots__order`
 * permits exactly one per order. It touches no payment obligation, no attempt
 * and no reconciliation; no inventory; no carrier; and no notification intent
 * (`APP9-G01` §8 — APP10 owns customer communication).
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import type { OrderState } from '@embroidery/database';
import {
  ORDER_REPOSITORY,
  TransactionManager,
  type OrderId,
  type OrderRepository,
} from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { orderDeliveryError } from '../../domain/lifecycle/order-delivery.errors';
import { requireOrderLifecycleAdminId } from './order-lifecycle-actor';

/** The one source state `TR-LC14-08` is legal from (GRD-018). */
export const COMPLETION_SOURCE_STATE = 'DELIVERED' satisfies OrderState;

/** The one target state `TR-LC14-08` moves to — terminal in LC-14. */
export const COMPLETION_TARGET_STATE = 'COMPLETED' satisfies OrderState;

export interface CompleteOrderResult {
  readonly orderId: string;
  readonly code: string;
  readonly fromStatus: OrderState;
  readonly status: OrderState;
}

@Injectable()
export class CompleteOrderUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async complete(orderId: string): Promise<CompleteOrderResult> {
    // Before the transaction opens: an actor fault must not hold a connection.
    const adminId = requireOrderLifecycleAdminId(this.requestContext);
    const correlationId = this.requestContext.requireRequestId();
    const id = orderId as OrderId;

    try {
      return await this.transactions.runInTransaction(async () => {
        const order = await this.orders.loadForUpdate(id);
        if (order === undefined) {
          throw orderDeliveryError('ORDER_NOT_FOUND');
        }
        if (order.status !== COMPLETION_SOURCE_STATE) {
          throw orderDeliveryError('ORDER_INVALID_TRANSITION');
        }

        const moved = await this.orders.transition({
          id: order.id,
          to: COMPLETION_TARGET_STATE,
          actor: { kind: 'ADMIN', adminId },
          correlationId,
        });

        return {
          orderId: moved.id,
          code: moved.code,
          fromStatus: order.status,
          status: moved.status,
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
   */
  private translate(error: unknown): unknown {
    if (isPersistenceError(error) && error.code === 'INVALID_TRANSITION') {
      return orderDeliveryError('ORDER_INVALID_TRANSITION');
    }
    return error;
  }
}
