/**
 * The customer payment target: grant → request → order → live obligation.
 *
 * ```text
 * REQUEST_ACCESS grant
 *   → custom_requests(id)
 *   → orders(custom_request_id)                     OrderDepositContextPort
 *   → payment_obligations(order_id, kind, live)     AGG-16
 * ```
 *
 * ### The `ORDER_ACCESS` walk (`APP12-B04`)
 *
 * ```text
 * ORDER_ACCESS grant
 *   -> orders(id)                                 OrderDepositContextPort
 *   -> payment_obligations(order_id, FULL, live)  AGG-16
 * ```
 *
 * One hop shorter, because an order grant names its order directly. The port's
 * `findOrderById` already existed for the Admin payment read (`APP7-B04` §7),
 * so no new Ordering read is introduced; the containment assertion below is
 * the same one, and is what makes a foreign obligation id unreachable on both
 * walks.
 *
 * ### Why the kind is a parameter (`APP9-B02`)
 *
 * `APP7-B03` delivered this walk closed to `DEPOSIT`, which was correct while
 * `DEPOSIT` was the only obligation APP7 made payable. `APP9-B02` composes the
 * sibling `REMAINING` surface over the *same* three hops, so the kind became the
 * one thing that differs and is now stated by the caller. Nothing else moved:
 * the two refusals, their reasons and their single indistinguishable answer are
 * the delivered ones.
 *
 * This is deliberately **not** the same generalisation as the transfer
 * reference. `APP7-G01` §4 forbids a kind parameter there, because a reference
 * builder that can derive `RM` would let APP7 address an obligation it does not
 * make payable. Here the kind selects a *lookup*, and every caller is already
 * the surface for the kind it names.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { PaymentObligationKind } from '@embroidery/database';
import type { PaymentObligation, PaymentObligationRepository } from '@embroidery/persistence';
import { PAYMENT_OBLIGATION_REPOSITORY } from '@embroidery/persistence';

import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import {
  ORDER_DEPOSIT_CONTEXT_PORT,
  type OrderDepositContext,
  type OrderDepositContextPort,
} from '../../../order/domain/repositories/order-deposit-context.port';

export interface PaymentTarget {
  readonly order: OrderDepositContext;
  readonly obligation: PaymentObligation;
}

@Injectable()
export class PaymentTargetResolver {
  constructor(
    @Inject(ORDER_DEPOSIT_CONTEXT_PORT) private readonly orders: OrderDepositContextPort,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
  ) {}

  /**
   * The first two hops alone, for a caller that reaches its obligation by
   * another route.
   *
   * The evidence lane is that caller: `APP9-B02` made it attempt-scoped rather
   * than kind-scoped, so it locks the attempt first and needs the order to
   * contain it against, not an obligation to compare it to.
   */
  async resolveOrder(requestId: CustomRequestId): Promise<OrderDepositContext> {
    const order = await this.orders.findOrderForRequest(requestId);
    if (order === undefined) {
      throw secureLinkUnavailable();
    }
    return order;
  }

  /**
   * The order an `ORDER_ACCESS` grant names (`APP12-B04`).
   *
   * The `orderId` is read off the grant row by the caller and is never a body
   * field, so this method cannot be reached with an order the caller chose.
   * Refuses identically to {@link resolveOrder}: an order that does not exist
   * and one the grant does not open have to look the same from outside.
   */
  async resolveOrderById(orderId: string): Promise<OrderDepositContext> {
    const order = await this.orders.findOrderById(orderId);
    if (order === undefined) {
      throw secureLinkUnavailable();
    }
    return order;
  }

  async resolve(requestId: CustomRequestId, kind: PaymentObligationKind): Promise<PaymentTarget> {
    return this.liveFor(await this.resolveOrder(requestId), kind);
  }

  /**
   * The `ORDER_ACCESS` sibling of {@link resolve} (`APP12-B04`).
   *
   * Same second hop, different first one. Both end in {@link liveFor}, so the
   * liveness rule and the containment check exist once: a divergence between
   * them would be a Ready-Made surface admitting an obligation the custom one
   * refuses, or the reverse, discovered only in production.
   */
  async resolveForOrder(orderId: string, kind: PaymentObligationKind): Promise<PaymentTarget> {
    return this.liveFor(await this.resolveOrderById(orderId), kind);
  }

  /** The order's one live obligation of this kind, proved to belong to it. */
  private async liveFor(
    order: OrderDepositContext,
    kind: PaymentObligationKind,
  ): Promise<PaymentTarget> {
    // Kind-aware *and* live-aware: `findLiveForOrder` filters on the statuses
    // `uq_payment_obligations__order_kind__live` arbitrates, so a SUPERSEDED or
    // CANCELLED row is invisible here and can never become a payment target.
    const obligation = await this.obligations.findLiveForOrder(order.id, kind);
    // The second clause is containment checked rather than assumed:
    // `findLiveForOrder` addresses its table by order id, so it cannot return a
    // foreign row today — but a repository that later grew a different lookup
    // must not be able to make one order's obligation payable from another
    // order's link without failing here first.
    if (obligation === undefined || obligation.orderId !== order.id) {
      throw secureLinkUnavailable();
    }

    return { order, obligation };
  }
}
