/**
 * The non-money half of a verified payment, for the kinds that have one
 * (`APP12-B05` §5, §11, §12).
 *
 * ### One table, read the way the other two are
 *
 * The verification use case already reads two closed tables keyed on the
 * obligation kind the database reported — the LC-14 pair and the transfer-memo
 * builder. This is the third. `DEPOSIT` and `REMAINING` take the `NONE` row and
 * reach nothing at all, so their delivered behaviour is unchanged by
 * construction rather than by a regression test alone; only `FULL` has an
 * effect, and the kind that selects it can only have come from a locked
 * `payment_obligations` row.
 *
 * ### Why it is called before `settleAttempt`, not after
 *
 * A lock-order decision. The effect takes the `orders` row lock and then the
 * reservation's, which is the direction `APP12-B03`'s fee command and the
 * reservation-expiry sweep already take (`DB8_LOCK_ORDER_MATRIX.md`). Running it
 * after `satisfy()` would hold a `payment_obligations` lock while asking for
 * `orders`, against a sweep that holds `orders` and asks for
 * `payment_obligations` — a cycle, and a `40P01` under load rather than the
 * clean arbitration `APP12-B05` §13 requires.
 *
 * Ordering it first costs nothing in atomicity: everything it writes belongs to
 * the caller's transaction, so a refusal further along still rolls the
 * commitment back. There is no committed state in which stock is consumed and
 * the payment is not verified.
 *
 * ### Why both refusals map to one code
 *
 * `ORDER_MOVED` and `NO_ACTIVE_RESERVATION` are the same event seen from two
 * rows: the expiry sweep, or a cancellation, won the race for this order. An
 * operator acts on them identically — re-read the order, tell the customer the
 * hold lapsed — and a second code would ask them to distinguish two situations
 * with one response. So both become the delivered source-state refusal, which
 * already means "this order is not collecting that payment".
 */
import { Inject, Injectable } from '@nestjs/common';
import type { OrderState } from '@embroidery/database';

import { paymentVerificationError } from '../../domain/verification/payment-verification.errors';
import {
  VERIFIED_PAYMENT_SETTLEMENT_PORT,
  verifiedPaymentSettlementFor,
  type VerifiedPaymentSettlementPort,
} from '../../domain/verification/verified-payment-settlement';
import type { VerifiableObligationKind } from '../../domain/verification/verified-payment-transition';

@Injectable()
export class ApplyVerifiedSettlement {
  constructor(
    @Inject(VERIFIED_PAYMENT_SETTLEMENT_PORT)
    private readonly settlement: VerifiedPaymentSettlementPort,
  ) {}

  /** @requiresTransaction — joins the caller's verification transaction. */
  async apply(
    kind: VerifiableObligationKind,
    orderId: string,
    expectedOrderStatus: OrderState,
    adminId: string,
  ): Promise<void> {
    if (verifiedPaymentSettlementFor(kind) !== 'COMMIT_RESERVED_STOCK') {
      return;
    }

    const outcome = await this.settlement.commitReservedStock({
      orderId,
      expectedOrderStatus,
      adminId,
    });
    if (outcome !== 'COMMITTED') {
      throw paymentVerificationError('PAYMENT_ORDER_NOT_AWAITING_PAYMENT');
    }
  }
}
