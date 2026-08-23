/**
 * The chain a customer deposit operation is authorized along (`APP7-B03` §6).
 *
 * ```text
 * secure token (resolved by the caller — admission for a read, the row-locked
 *               re-authorization for the write)
 *   → grant.customRequestId          the grant row, never the caller
 *   → orders.custom_request_id        uq_orders__request — exactly one order
 *   → payment_obligations(kind = DEPOSIT, live)
 * ```
 *
 * ### Nothing about the target is accepted from the caller
 *
 * There is no order id, no order code, no obligation id, no attempt id and no
 * customer id in any command on this surface. "Grant A cannot reach order B's
 * deposit" is therefore not a comparison that could be removed: there is no
 * second identifier for it to disagree with, and the resolver's only input is a
 * request id the grant produced.
 *
 * That is also why the QR operation takes no `attemptId`. `APP7-B03` §8 allows a
 * QR route without one provided the server still derives the exact DEPOSIT
 * context — which is what this does — and the payload (`APP7-B03` §16) is built
 * from the merchant configuration, the obligation amount and the derived
 * reference, none of which varies by attempt. An `attemptId` parameter would add
 * an enumeration surface to buy nothing.
 *
 * ### The DEPOSIT obligation, and only it
 *
 * `findLiveForOrder(orderId, 'DEPOSIT')` matches
 * `uq_payment_obligations__order_kind__live`, so at most one row can qualify and
 * there is no "current obligation" heuristic here to get wrong. The REMAINING
 * obligation is never read, never projected and never made payable: APP9 owns
 * it, and this resolver has no parameter that could ask for it.
 *
 * ### One answer for every definitive absence
 *
 * A request with no order, an order with no live DEPOSIT obligation, an
 * obligation that resolves but belongs to another order — all leave here as the
 * same `SECURE_LINK_UNAVAILABLE` a stranger's token produces. Publishing a
 * distinct "this order has not been created yet" would tell a probe holding a
 * leaked link how far the workshop has got with someone's order.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { PaymentObligation, PaymentObligationRepository } from '@embroidery/persistence';
import { PAYMENT_OBLIGATION_REPOSITORY } from '@embroidery/persistence';

import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import {
  ORDER_DEPOSIT_CONTEXT_PORT,
  type OrderDepositContext,
  type OrderDepositContextPort,
} from '../../../order/domain/repositories/order-deposit-context.port';

/** The obligation kind this whole surface is about. There is no parameter. */
const DEPOSIT = 'DEPOSIT' as const;

/** What a deposit operation is about, once the chain has been proved. */
export interface DepositTarget {
  readonly order: OrderDepositContext;
  readonly obligation: PaymentObligation;
}

@Injectable()
export class DepositTargetResolver {
  constructor(
    @Inject(ORDER_DEPOSIT_CONTEXT_PORT) private readonly orders: OrderDepositContextPort,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
  ) {}

  /**
   * Walks request → order → DEPOSIT obligation, or refuses.
   *
   * Joins the caller's transaction when there is one, which is what the write
   * path needs: the obligation it reads is the obligation that was live at the
   * instant the attempt committed.
   */
  async resolve(requestId: CustomRequestId): Promise<DepositTarget> {
    const order = await this.orders.findOrderForRequest(requestId);
    if (order === undefined) {
      throw secureLinkUnavailable();
    }

    const obligation = await this.obligations.findLiveForOrder(order.id, DEPOSIT);
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
