/**
 * The zero-write customer Ready-Made order read (`APP12-B04` §11–§14, §36).
 *
 * ```text
 * secure token -> ORDER_ACCESS grant -> order -> line, delivery, live FULL,
 *                                                reservation deadline
 * ```
 *
 * The one operation `/truy-cap/don-hang` is built on, and the only place in the
 * Ready-Made surface where a customer sees their order rather than their
 * payment.
 *
 * ### Admission is the delivered one
 *
 * `AuthorizeSecureLink` — the same published policy, the same abuse budget and
 * the same digest every other secure-token surface uses, so a caller cannot
 * escape `secure_link.resolve`'s budget by spreading token guesses across the
 * order read and the payment reads. `orderSubjectOf` then narrows the resolved
 * grant to `ORDER_ACCESS`, refusing a custom `REQUEST_ACCESS` link with the one
 * indistinguishable `SECURE_LINK_UNAVAILABLE`.
 *
 * No order id, order code, customer id or obligation id is accepted, because
 * the command has nowhere to put one. The order is read **from the grant row**,
 * which is what makes cross-order access structurally impossible rather than
 * checked: there is no field a caller could put another order in.
 *
 * ### It works before the shipping fee, and says so honestly (§14)
 *
 * A Ready-Made order at `AWAITING_SHIPPING_FEE` has no `FULL` obligation at all
 * — `APP12-B03` creates it with the fee — so `payment` is `undefined` here and
 * the delivery fee is `undefined` too. Neither is defaulted: `BR-027` forbids
 * presenting an unpriced shipment as free and forbids presenting the
 * merchandise subtotal as a payable total, and the two absences are what the
 * customer's screen renders as "available once the fee is confirmed". No
 * provisional obligation is created to have something to show.
 *
 * ### The payable total is the obligation's, never a sum taken here
 *
 * When a live `FULL` exists, `payableTotal` is **its** amount. This query
 * performs no arithmetic at all — it holds no adder, and the subtotal and the
 * fee travel as separate fields precisely so a reader can display the
 * composition without this code having to reproduce it. After a fee correction
 * the live obligation is the successor, so the corrected total appears with no
 * special case.
 *
 * ### The deadline is read, never recomputed (§36)
 *
 * From the order's own `RESERVED` reservation row. Nothing here computes
 * `now + 24h`: that window is `APP12-B02`'s at creation and `APP12-B03`'s on
 * the first fee confirmation, and a third computation would be a third answer.
 * Once nothing `RESERVED` stands — expired, released, or consumed at dispatch —
 * the field is absent, which is what stops a countdown being shown for an order
 * that is no longer payment-eligible.
 *
 * ### One payability rule, imported rather than copied (§27)
 *
 * `isFullPaymentPayable` is CTX-PAY's own predicate, and it is imported here
 * rather than restated. A second copy in Ordering would be a second definition
 * of when money may be collected, and the two would disagree the first time
 * either lifecycle moved — which is exactly the divergence §27 forbids. What is
 * imported is a pure function over two enums: this module gains no payment
 * repository, no obligation writer and no way to move an obligation, and the
 * dependency is the mirror of the one CTX-PAY already has on Ordering's
 * read-only order port.
 *
 * ### Why a terminal order ends, machine-readably (`APP12-B04-C1`)
 *
 * `APP12-D01` §I renders `CANCELLED` and `EXPIRED` as distinct customer
 * states, and `APP12-S03` must select between them from a value rather than by
 * parsing prose or inferring from a missing field. The order's lifecycle keeps
 * its single terminal state; the cause travels beside it.
 *
 * The classification is taken from two committed facts — the order's own
 * status, and Inventory's answer to whether this order's stock hold ended by
 * expiry. `orders.cancelled_reason` is **never** read here; this query holds no
 * reference to it and the projection repository does not select it, so the
 * prose cannot reach a customer classification even by accident.
 *
 * The reservation read is issued **only for a terminal order**. A live order
 * has nothing to classify, and the deadline read above already answers the
 * question a live order asks — so the ordinary path costs exactly what it did
 * before this correction.
 *
 * ### Zero write
 *
 * No transaction, no lock, no transition, no fee, no address and no
 * cancellation. This module holds no writer at all (see
 * `ReadyMadeOrderAccessModule`), so §35 is a property of the wiring rather than
 * of the code written today.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { OrderState } from '@embroidery/database';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  SKU_STOCK_REPOSITORY,
  type PaymentObligationRepository,
  type SkuStockRepository,
} from '@embroidery/persistence';

import {
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../../customer/application/authorize-secure-link.service';
import { orderSubjectOf } from '../../../customer/domain/grant/grant-subject';
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import type { NetworkReadableRequest } from '../../../customer/infrastructure/rate-limit/public-network-key.service';
import {
  READY_MADE_ORDER_ACCESS_REPOSITORY,
  type ReadyMadeOrderAccessRepository,
} from '../../domain/repositories/ready-made-order-access.repository';
import { isFullPaymentPayable } from '../../../payment/domain/full-payment/full-payment.policy';
import { terminationReasonOf } from '../../domain/ready-made/order-termination-reason';
import type { ReadyMadeOrderView } from './ready-made-order.view';

/** `BR-029` — a Ready-Made order has exactly one obligation, of this kind. */
const FULL = 'FULL' as const;

/**
 * The one terminal state a Ready-Made order can be classified in.
 *
 * `DELIVERED` and `COMPLETED` are ends of the *successful* path and carry no
 * termination cause to publish; `CANCELLED` is the only one a customer would
 * ask "why" about.
 */
function isTerminal(status: OrderState): boolean {
  return status === 'CANCELLED';
}

export interface ReadReadyMadeOrderCommand {
  readonly token: string;
}

export type ReadyMadeOrderReadOutcome =
  | { readonly outcome: 'READ'; readonly view: ReadyMadeOrderView }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class ReadReadyMadeOrder {
  constructor(
    private readonly links: AuthorizeSecureLink,
    @Inject(READY_MADE_ORDER_ACCESS_REPOSITORY)
    private readonly orders: ReadyMadeOrderAccessRepository,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stock: SkuStockRepository,
  ) {}

  async read(
    request: NetworkReadableRequest,
    command: ReadReadyMadeOrderCommand,
  ): Promise<ReadyMadeOrderReadOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const orderId = orderSubjectOf(admission.link);

    const order = await this.orders.findForCustomer(orderId);
    if (order === undefined) {
      // A grant whose order has vanished, or whose order is somehow custom.
      // Refused with the one answer every other miss gives: a caller must not
      // learn that their token was real and only its subject was wrong.
      throw secureLinkUnavailable();
    }

    // Kind-aware *and* live-aware: `findLiveForOrder` filters on the statuses
    // `uq_payment_obligations__order_kind__live` arbitrates, so a superseded
    // predecessor is invisible here and the amount published is always the one
    // the customer currently owes.
    const obligation = await this.obligations.findLiveForOrder(order.id, FULL);
    const reservation = await this.stock.findActiveOrderReservation(order.id);

    // Only a terminal order has anything to classify, and only Inventory can
    // say why its stock hold ended. A boolean crosses the seam, so no
    // reservation id reaches a projection that must never publish one.
    const terminationReason = terminationReasonOf({
      orderStatus: order.status,
      stockEndedByExpiry: isTerminal(order.status)
        ? await this.stock.orderStockEndedByExpiry(order.id)
        : false,
    });

    return {
      outcome: 'READ',
      view: {
        orderCode: order.code,
        status: order.status,
        terminationReason,
        currencyCode: order.currencyCode,
        placedAt: order.createdAt,
        item: order.line,
        merchandiseSubtotal: order.merchandiseSubtotal,
        delivery: order.delivery,
        // Absent before the fee, and absent for good afterwards only if the
        // obligation is cancelled with the order. Never a fabricated zero.
        payment:
          obligation === undefined
            ? undefined
            : {
                status: obligation.status,
                // The obligation's own frozen figure. No subtotal is added to a
                // fee here, and no total is read off `orders.total_amount`.
                payableTotal: obligation.amount,
                payable: isFullPaymentPayable({
                  orderStatus: order.status,
                  obligationStatus: obligation.status,
                }),
              },
        // The reservation's own committed deadline, or nothing at all.
        paymentDeadline: reservation?.expiresAt ?? undefined,
        accessExpiresAt: admission.link.expiresAt,
      },
    };
  }
}
