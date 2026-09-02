/**
 * The contradicted-transfer branch of a verification (`APP7-B04` §18).
 *
 * A mismatch is a **successful** operation with a committed outcome, not a
 * refusal: the amount or the reference the operator observed contradicts what
 * the obligation says is owed, and the accepted lifecycle owns a durable review.
 * So the attempt moves to `REQUIRES_REVIEW` with its mandatory reason and the
 * reconciliation records what was observed. The obligation is **not** satisfied,
 * the order does **not** move, and no `payment.verified` is emitted.
 *
 * `review_reason` is the operator's own note verbatim. No sentence is composed
 * from the mismatch — `APP7-B04` §18 forbids fabricating a review vocabulary,
 * and the reconciliation row already carries the observed amount, the observed
 * reference and `resolved_status` as evidence of exactly what contradicted.
 *
 * ### Why it is its own collaborator
 *
 * It was a private method on `VerifyPaymentAttemptUseCase` until `APP9-B03`,
 * whose kind-aware guard and second LC-14 target pushed that file past the
 * 400-line limit. Split by responsibility rather than by line count: this is
 * "record a contradicted transfer", the use case that remains is "decide and
 * settle a verification", and the seam is the one place the two already met.
 * Behaviour is byte-for-byte what `APP7-B04` delivered, plus the two `APP9-B03`
 * corrections noted inline.
 *
 * @requiresTransaction — every write below belongs to the caller's transaction,
 * which is what makes a mismatch's settlement and its reconciliation atomic.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { OrderState } from '@embroidery/database';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  type AttemptId,
  type ObligationId,
  type PaymentObligationRepository,
} from '@embroidery/persistence';

import {
  ORDER_REPOSITORY,
  type OrderId,
  type OrderRepository,
} from '../../../order/domain/repositories/order.repository';
import type { ObservedTransferFacts } from '../../domain/verification/payment-verification.policy';
import { reconciliationActionFor } from '../../domain/verification/reconciliation-evidence';
import type { VerifiableObligationKind } from '../../domain/verification/verified-payment-transition';
import type { PaymentDecisionView } from './admin-payment.view';
import { PaymentDecisionRecorder } from './payment-decision.recorder';

export interface RouteAttemptToReviewInput {
  readonly attemptId: AttemptId;
  readonly obligationId: ObligationId;
  readonly orderId: string;
  /** As the decision chain observed it. This branch must report it unmoved. */
  readonly orderStatus: OrderState;
  readonly kind: VerifiableObligationKind;
  readonly observed: ObservedTransferFacts;
  readonly note: string;
  readonly action: ReturnType<typeof reconciliationActionFor>;
  readonly statusBefore: string;
  readonly adminId: string;
  readonly now: Date;
}

@Injectable()
export class RouteAttemptToReview {
  constructor(
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly recorder: PaymentDecisionRecorder,
  ) {}

  async route(input: RouteAttemptToReviewInput): Promise<PaymentDecisionView> {
    await this.obligations.settleAttempt(input.attemptId, 'REQUIRES_REVIEW', input.now, input.note);
    await this.obligations.appendReconciliation({
      paymentAttemptId: input.attemptId,
      paymentObligationId: input.obligationId,
      action: input.action,
      reason: input.note,
      adminId: input.adminId,
      amount: input.observed.amount,
      resolvedStatus: 'REQUIRES_REVIEW',
      bankReference: input.observed.transferReference,
    });
    await this.recorder.recordReviewRequired(
      {
        attemptId: input.attemptId,
        obligationId: input.obligationId,
        orderId: input.orderId,
        observedAmount: input.observed.amount,
        observedTransferReference: input.observed.transferReference,
        fromStatus: input.statusBefore,
        toStatus: 'REQUIRES_REVIEW',
        obligationKind: input.kind,
      },
      input.adminId,
      input.note,
    );

    // Origin-neutral, because this branch now runs for a Ready-Made order too
    // and `findById` maps the custom aggregate — it would throw here rather
    // than fall back, turning a committed review into a 500 (`APP12-B05`).
    const order = await this.orders.findLifecycleById(input.orderId as OrderId);
    return {
      attemptId: input.attemptId,
      attemptStatus: 'REQUIRES_REVIEW',
      depositObligationId: input.obligationId,
      // Unchanged, and stated rather than read back: this branch never touches
      // the obligation, and reporting it as still awaiting payment is the whole
      // point of the response.
      depositStatus: 'PENDING',
      orderId: input.orderId,
      // Read back rather than assumed, and falling back to what the chain saw
      // rather than to a deposit literal: `APP9-B03` made this branch run for
      // either custom kind and `APP12-B05` for `FULL`, so an order genuinely at
      // `AWAITING_FINAL_PAYMENT` or `AWAITING_PAYMENT` must not be reported as
      // `AWAITING_DEPOSIT` because a re-read raced.
      orderStatus: order?.status ?? input.orderStatus,
      reconciliationAction: input.action,
      replayed: false,
    };
  }
}
