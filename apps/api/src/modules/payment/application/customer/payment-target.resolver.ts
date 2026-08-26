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

  async resolve(requestId: CustomRequestId, kind: PaymentObligationKind): Promise<PaymentTarget> {
    const order = await this.resolveOrder(requestId);

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
